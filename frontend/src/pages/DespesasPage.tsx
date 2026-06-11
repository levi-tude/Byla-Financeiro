import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '../app/Topbar';
import { useMonthYear } from '../context/MonthYearContext';
import { useToast } from '../context/ToastContext';
import { FilterBar } from '../components/finance/FilterBar';
import { KpiStrip } from '../components/finance/KpiStrip';
import { EmptyState, ErrorPanel } from '../components/finance/StateBlocks';
import { ClassificacaoGrupoCard } from '../components/finance/classificacao/ClassificacaoGrupoCard';
import { ClassificacaoLoadingBlock } from '../components/finance/classificacao/ClassificacaoLoadingBlock';
import { ClassificacaoModal } from '../components/finance/classificacao/ClassificacaoModal';
import { ClassificacaoTabBar } from '../components/finance/classificacao/ClassificacaoTabBar';
import { ControleCaixaMesLink } from '../components/finance/classificacao/ControleCaixaMesLink';
import {
  CATEGORIA_PENDENTE_KEY,
  PorCategoriaSection,
} from '../components/finance/classificacao/PorCategoriaSection';
import { FiltroTipoCategoria } from '../components/finance/classificacao/FiltroTipoCategoria';
import { CompetenciaTransacaoEditor } from '../components/finance/classificacao/CompetenciaTransacaoEditor';
import {
  filtrarPorCategoriaBlocos,
  formatBrl,
  formatDate,
  FILTRO_TIPO_PENDENTE,
  grupoPassaFiltroTipo,
  resolveGrupoTemplateKey,
  resolveGrupoBlocoTemplateKey,
  type CategoriaOpcao,
} from '../components/finance/classificacao/utils';
import {
  getDespesasCategoriaTransacoes,
  getDespesasCategorias,
  getDespesasGrupoTransacoes,
  getDespesasGrupos,
  getDespesasResumo,
  patchDespesasMapeamento,
  patchDespesasTransacaoCompetencia,
  putDespesasMapeamento,
  deleteDespesasMapeamento,
  type DespesaCategoriaLinha,
  type DespesaGrupo,
  type DespesaTransacaoClassificada,
  type VisaoControle,
} from '../services/backendApi';

type TabId = 'pendentes' | 'classificados' | 'categorias';

function DespesasClassificarModal({
  grupo,
  mes,
  ano,
  categorias,
  onClose,
  onSaved,
}: {
  grupo: DespesaGrupo;
  mes: number;
  ano: number;
  categorias: DespesaCategoriaLinha[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [templateKey, setTemplateKey] = useState(grupo.template_key ?? '');
  const detalheQuery = useQuery({
    queryKey: ['despesas-grupo-transacoes', grupo.pessoa_normalizada, mes, ano],
    queryFn: () => getDespesasGrupoTransacoes(grupo.pessoa_normalizada, mes, ano),
  });

  const competenciaMut = useMutation({
    mutationFn: (args: {
  id: string;
      patch: { mes_competencia: number; ano_competencia: number; confirmada: boolean };
    }) => patchDespesasTransacaoCompetencia(mes, ano, args.id, args.patch),
    onSuccess: () => {
      showToast('Competência atualizada.', 'success');
      void detalheQuery.refetch();
      onSaved();
    },
    onError: () => showToast('Não foi possível salvar a competência.', 'error'),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      putDespesasMapeamento(mes, ano, {
        pessoa_normalizada: grupo.pessoa_normalizada,
        template_key: templateKey,
      }),
    onSuccess: () => {
      showToast('Categoria salva. Regra vale para meses futuros.', 'success');
      onSaved();
      onClose();
    },
  });

  return (
    <ClassificacaoModal
      title="Classificar destinatário"
      subtitle={grupo.pessoa_exibida}
      categoriaLabel="Categoria (Controle de Caixa)"
      categoriaHint="Linhas de Saídas Parceiros ou Saídas Fixas — iguais ao Controle deste mês."
      emptyCatalogHint="Abra o Controle de Caixa deste mês para carregar as linhas de saída."
      categorias={categorias}
      templateKey={templateKey}
      onTemplateKeyChange={setTemplateKey}
      transacoes={detalheQuery.data?.transacoes ?? []}
      transacoesLoading={detalheQuery.isLoading}
      renderTransacaoExtra={(t) => {
        const full = detalheQuery.data?.transacoes.find((x) => x.id === t.id) as
          | DespesaTransacaoClassificada
          | undefined;
        if (!full) return null;
        return (
          <CompetenciaTransacaoEditor
            transacao={full}
            mesRef={mes}
            anoRef={ano}
            saving={competenciaMut.isPending && competenciaMut.variables?.id === t.id}
            onSave={(patch) => competenciaMut.mutate({ id: t.id, patch })}
          />
        );
      }}
      sugestao={
        grupo.sugestao_heuristica && !templateKey ? (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
            Sugestão: {grupo.sugestao_heuristica.label} ({grupo.sugestao_heuristica.confianca})
          </p>
        ) : undefined
      }
      saveError={saveMut.error instanceof Error ? saveMut.error.message : saveMut.error ? 'Erro ao salvar' : null}
      savePending={saveMut.isPending}
      onClose={onClose}
      onSave={() => saveMut.mutate()}
    />
  );
}

export function DespesasPage() {
  const { monthYear } = useMonthYear();
  const { mes, ano } = monthYear;
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabId>('pendentes');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [modalGrupo, setModalGrupo] = useState<DespesaGrupo | null>(null);
  const [visaoResumo, setVisaoResumo] = useState<VisaoControle>('caixa');
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['despesas-resumo', mes, ano] });
    void qc.invalidateQueries({ queryKey: ['despesas-grupos', mes, ano] });
    void qc.invalidateQueries({ queryKey: ['overview-despesas-categorias', mes, ano] });
  };

  const resumoQuery = useQuery({
    queryKey: ['despesas-resumo', mes, ano, visaoResumo],
    queryFn: () => getDespesasResumo(mes, ano, visaoResumo),
  });

  const categoriasQuery = useQuery({
    queryKey: ['despesas-categorias', mes, ano],
    queryFn: () => getDespesasCategorias(mes, ano),
  });

  // Na aba "Por categoria" carrega os grupos classificados para permitir reclassificar dali.
  const gruposQuery = useQuery({
    queryKey: ['despesas-grupos', mes, ano, tab === 'pendentes' ? 'pendentes' : 'classificados'],
    queryFn: () =>
      getDespesasGrupos(mes, ano, tab === 'pendentes' ? 'pendente' : 'classificado', 0, 100),
  });

  const desativarMut = useMutation({
    mutationFn: (id: string) => patchDespesasMapeamento(mes, ano, id, { ativo: false }),
    onSuccess: () => {
      showToast('Regra desativada para meses futuros.', 'success');
      invalidate();
    },
  });

  const desvincularMut = useMutation({
    mutationFn: (id: string) => deleteDespesasMapeamento(mes, ano, id),
    onSuccess: () => {
      showToast('Vínculo removido. Os lançamentos voltaram para pendentes.', 'success');
      invalidate();
    },
    onError: () => {
      showToast('Não foi possível desvincular.', 'error');
    },
  });

  const competenciaCategoriaMut = useMutation({
    mutationFn: (args: {
      id: string;
      patch: { mes_competencia: number; ano_competencia: number; confirmada: boolean };
    }) => patchDespesasTransacaoCompetencia(mes, ano, args.id, args.patch),
    onSuccess: () => {
      showToast('Competência atualizada.', 'success');
      invalidate();
      void qc.invalidateQueries({ queryKey: ['categoria-transacoes'] });
      void qc.invalidateQueries({ queryKey: ['transacoes-unificadas'] });
    },
    onError: () => showToast('Não foi possível salvar a competência.', 'error'),
  });

  const reclassificarPorPessoa = (pessoaNormalizada: string) => {
    const grupo = (gruposQuery.data?.grupos ?? []).find(
      (g) => g.pessoa_normalizada === pessoaNormalizada,
    );
    if (grupo) {
      setModalGrupo(grupo);
    } else {
      showToast('Grupo deste destinatário não encontrado neste mês. Use a aba Classificados.', 'error');
    }
  };

  const kpis = resumoQuery.data?.kpis;
  const kpiItems = [
    { label: 'Total saídas', value: kpis ? formatBrl(kpis.total_saidas) : '—', isLoading: resumoQuery.isLoading },
    {
      label: '% classificado',
      value: kpis ? `${kpis.pct_classificado}%` : '—',
      isLoading: resumoQuery.isLoading,
      accentColor: 'success' as const,
    },
    {
      label: 'Valor pendente',
      value: kpis ? formatBrl(kpis.valor_pendente) : '—',
      isLoading: resumoQuery.isLoading,
      accentColor: 'danger' as const,
    },
    {
      label: 'Destinatários pendentes',
      value: kpis ? String(kpis.qtd_destinatarios_pendentes) : '—',
      isLoading: resumoQuery.isLoading,
    },
  ];

  const categoriasOpcoes = useMemo((): CategoriaOpcao[] => {
    const cats = categoriasQuery.data?.categorias ?? [];
    return cats.map((c) => ({
      templateKey: c.templateKey,
      label: c.label,
      blocoTitulo: c.blocoTitulo,
      blocoTemplateKey: c.blocoTemplateKey,
    }));
  }, [categoriasQuery.data?.categorias]);

  const gruposFiltrados = useMemo(() => {
    const lista = gruposQuery.data?.grupos ?? [];
    return lista.filter((g) => {
      const key = resolveGrupoTemplateKey(g, categoriasOpcoes);
      const bloco = resolveGrupoBlocoTemplateKey(g, key, categoriasOpcoes);
      return grupoPassaFiltroTipo(key, filtroTipo, bloco);
    });
  }, [gruposQuery.data?.grupos, filtroTipo, categoriasOpcoes]);

  const porCategoriaBlocos = useMemo(() => {
    const blocos = (resumoQuery.data?.por_bloco ?? []).map((bloco) => ({
      bloco_titulo: bloco.bloco_titulo,
      bloco_template_key: bloco.linhas[0]?.bloco_template_key,
      linhas: bloco.linhas.map((row) => ({
        template_key: row.template_key,
        label: row.label,
        total: row.total,
        qtd_transacoes: row.qtd_transacoes,
        meta: `${row.qtd_transacoes} lanç. no extrato${
          row.qtd_destinatarios > 0 ? ` · ${row.qtd_destinatarios} destinatário(s)` : ''
        }`,
      })),
    }));
    return filtrarPorCategoriaBlocos(blocos, filtroTipo);
  }, [resumoQuery.data?.por_bloco, filtroTipo]);

  const filtroTipoAtivo = Boolean(filtroTipo);
  const mostrarPendentePorCategoria =
    tab === 'categorias' && (!filtroTipo || filtroTipo === FILTRO_TIPO_PENDENTE);

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <Topbar title="Despesas" subtitle="Classifique saídas do extrato por destinatário" />

      <div className="mt-4">
        <FilterBar
          title="Classificação"
          subtitle="Categorias = linhas de saída do Controle de Caixa deste mês (inclui linhas custom)"
        >
          <p className="text-sm text-slate-600 dark:text-slate-400">
            O que aparece no dropdown é o mesmo que você vê em Controle de Caixa. Se renomear ou criar uma linha lá,
            ela aparece aqui após recarregar o mês.
          </p>
          <ControleCaixaMesLink />
        </FilterBar>
              </div>

      {resumoQuery.error && (
        <div className="mt-4">
          <ErrorPanel message="Não foi possível carregar o resumo." />
        </div>
      )}

      <KpiStrip items={kpiItems} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Visão do resumo:</span>
        {(['caixa', 'competencia'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVisaoResumo(v)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
              visaoResumo === v
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300'
            }`}
          >
            {v === 'caixa' ? 'Caixa (data PIX)' : 'Competência'}
          </button>
        ))}
          </div>

      <ClassificacaoTabBar
        className="mt-6"
        tabs={[
          { id: 'pendentes' as const, label: 'Pendentes' },
          { id: 'classificados' as const, label: 'Classificados' },
          { id: 'categorias' as const, label: 'Por categoria' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {categoriasOpcoes.length > 0 && (
        <FiltroTipoCategoria
          value={filtroTipo}
          onChange={setFiltroTipo}
          categorias={categoriasOpcoes}
          label="Tipo de saída"
        />
      )}

      {tab === 'categorias' && (
        <PorCategoriaSection
          isLoading={resumoQuery.isLoading}
          blocos={porCategoriaBlocos}
          pendenteTotal={mostrarPendentePorCategoria ? (resumoQuery.data?.pendente.total ?? 0) : 0}
          pendenteQtd={mostrarPendentePorCategoria ? (resumoQuery.data?.pendente.qtd_transacoes ?? 0) : 0}
          emptyMessage="Abra o Controle de Caixa deste mês para carregar as linhas de saída."
          valorTone="saida"
          mes={mes}
          ano={ano}
          loadTransacoes={async (templateKey) => {
            const res = await getDespesasCategoriaTransacoes(templateKey, mes, ano);
            return res.transacoes;
          }}
          renderTransacaoExtra={(t, templateKey) => {
            const full = t as DespesaTransacaoClassificada;
            const pendente = templateKey === CATEGORIA_PENDENTE_KEY;
                    return (
              <div className="mt-1">
                <CompetenciaTransacaoEditor
                  transacao={full}
                  mesRef={mes}
                  anoRef={ano}
                  saving={competenciaCategoriaMut.isPending && competenciaCategoriaMut.variables?.id === t.id}
                  onSave={(patch) => competenciaCategoriaMut.mutate({ id: t.id, patch })}
                />
                <div className="mt-1.5">
                  {pendente ? (
                          <button
                            type="button"
                      onClick={() => setTab('pendentes')}
                      className="rounded-lg border border-indigo-300 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
                          >
                      Classificar na aba Pendentes
                          </button>
                  ) : (
                              <button
                                type="button"
                      onClick={() => reclassificarPorPessoa(full.pessoa_normalizada)}
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                      Reclassificar categoria…
                              </button>
                  )}
                          </div>
            </div>
            );
          }}
        />
      )}

      {tab !== 'categorias' && (
        <section className="mt-4 space-y-3">
          {gruposQuery.isLoading && <ClassificacaoLoadingBlock />}
          {gruposQuery.error && <ErrorPanel message="Erro ao carregar grupos." />}
          {!gruposQuery.isLoading && !gruposQuery.error && gruposFiltrados.length === 0 && (
            <EmptyState
              message={
                filtroTipoAtivo
                  ? 'Nenhum destinatário corresponde ao tipo selecionado nesta aba.'
                  : tab === 'pendentes'
                    ? 'Todas as saídas deste mês estão classificadas.'
                    : 'Nenhum destinatário classificado neste mês.'
              }
            />
          )}
          {gruposFiltrados.map((g) => (
            <ClassificacaoGrupoCard
              key={g.pessoa_normalizada}
              titulo={g.pessoa_exibida}
              resumo={`${g.qtd_mes} lançamento(s) · ${formatBrl(g.total_mes)}`}
              meta={g.datas.map(formatDate).join(', ')}
              estado={g.estado}
              categoriaLabel={g.categoria_label}
              scoreRepeticao={g.score_repeticao}
              regraDesativada={g.regra_desativada}
              sugestaoHint={
                g.sugestao_heuristica ? `Sugestão: ${g.sugestao_heuristica.label}` : null
              }
              onClassificar={() => setModalGrupo(g)}
              onDesativar={
                g.estado === 'classificado' && g.mapeamento_id
                  ? () => {
                      if (window.confirm('Desativar regra para meses futuros? Este mês permanece classificado.')) {
                        desativarMut.mutate(g.mapeamento_id!);
                      }
                    }
                  : undefined
              }
              podeDesativar={g.estado === 'classificado' && Boolean(g.mapeamento_id)}
              onDesvincular={
                g.mapeamento_id
                  ? () => {
                      if (
                        window.confirm(
                          'Desvincular apaga a regra e remove a classificação deste mês. Os lançamentos voltam para pendentes. Continuar?',
                        )
                      ) {
                        desvincularMut.mutate(g.mapeamento_id!);
                      }
                    }
                  : undefined
              }
              podeDesvincular={Boolean(g.mapeamento_id)}
            />
          ))}
        </section>
      )}

      {modalGrupo && categoriasQuery.data && (
        <DespesasClassificarModal
          grupo={modalGrupo}
          mes={mes}
          ano={ano}
          categorias={categoriasQuery.data.categorias}
          onClose={() => setModalGrupo(null)}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}
