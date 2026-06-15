import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '../app/Topbar';
import { useMonthYear } from '../context/MonthYearContext';
import { useToast } from '../context/ToastContext';
import { FilterBar } from '../components/finance/FilterBar';
import { KpiStrip } from '../components/finance/KpiStrip';
import { ErrorPanel, EmptyState } from '../components/finance/StateBlocks';
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
  resolveTemplateKeyInCategorias,
  type CategoriaOpcao,
} from '../components/finance/classificacao/utils';
import {
  getEntradasCategoriaTransacoes,
  getEntradasCategorias,
  getEntradasGrupoTransacoes,
  getEntradasGrupos,
  getEntradasResumo,
  patchEntradasMapeamento,
  patchEntradasTransacaoCompetencia,
  putEntradasMapeamento,
  deleteEntradasMapeamento,
  type EntradaCategoriaLinha,
  type EntradaGrupo,
  type EntradaTransacaoClassificada,
  type VisaoControle,
} from '../services/backendApi';
import { mesPermiteSincronizarEntradasRepasses } from '../lib/syncEntradasRepassesEligible';

type TabId = 'pendentes' | 'classificados' | 'categorias';
type SegmentoEntrada = 'mensalidades' | 'aluguel_coworking';

function categoriaNoSegmento(c: EntradaCategoriaLinha, segmento: SegmentoEntrada): boolean {
  const titulo = c.blocoTitulo.toLowerCase();
  if (segmento === 'mensalidades') {
    return titulo.includes('parceir') || c.blocoTemplateKey === 'entrada_parceiros';
  }
  return titulo.includes('aluguel') || titulo.includes('coworking') || c.blocoTemplateKey === 'entrada_aluguel_coworking';
}

function grupoVisivelNoSegmento(g: EntradaGrupo, segmento: SegmentoEntrada): boolean {
  return (g.segmento ?? 'mensalidades') === segmento;
}

function EntradasClassificarModal({
  grupo,
  mes,
  ano,
  categorias,
  segmento,
  onClose,
  onSaved,
}: {
  grupo: EntradaGrupo;
  mes: number;
  ano: number;
  categorias: EntradaCategoriaLinha[];
  segmento: SegmentoEntrada;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const categoriasSegmento = useMemo(
    () => categorias.filter((c) => categoriaNoSegmento(c, segmento)),
    [categorias, segmento],
  );
  const initialTemplateKey = useMemo(
    () =>
      resolveTemplateKeyInCategorias(
        grupo.template_key ??
          grupo.sugestao_fluxo?.template_key ??
          grupo.match_aluguel?.template_key ??
          grupo.sugestao?.template_key,
        categoriasSegmento.map((c) => ({
          templateKey: c.templateKey,
          label: c.label,
          blocoTitulo: c.blocoTitulo,
          blocoTemplateKey: c.blocoTemplateKey,
        })),
        grupo.sugestao_fluxo?.label ?? grupo.match_aluguel?.label ?? grupo.sugestao?.label,
      ),
    [grupo, categoriasSegmento],
  );
  const [templateKey, setTemplateKey] = useState(initialTemplateKey);

  useEffect(() => {
    setTemplateKey(initialTemplateKey);
  }, [initialTemplateKey, grupo.grupo_key]);
  const detalheQuery = useQuery({
    queryKey: ['entradas-grupo-transacoes', grupo.grupo_key, mes, ano],
    queryFn: () => getEntradasGrupoTransacoes(grupo.grupo_key, mes, ano),
  });

  const competenciaMut = useMutation({
    mutationFn: (args: {
      id: string;
      patch: { mes_competencia: number; ano_competencia: number; confirmada: boolean };
    }) => patchEntradasTransacaoCompetencia(mes, ano, args.id, args.patch),
    onSuccess: () => {
      showToast('Competência atualizada.', 'success');
      void detalheQuery.refetch();
      onSaved();
    },
    onError: () => showToast('Não foi possível salvar a competência.', 'error'),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      putEntradasMapeamento(mes, ano, {
        pessoa_normalizada: grupo.pessoa_normalizada,
        template_key: templateKey,
        subcategoria:
          grupo.modalidade && grupo.aba_fluxo
            ? `${grupo.aba_fluxo} · ${grupo.modalidade}`
            : grupo.modalidade ?? undefined,
      }),
    onSuccess: () => {
      showToast('Categoria salva. Regra vale para meses futuros.', 'success');
      onSaved();
      onClose();
    },
  });

  const segmentoLabel =
    segmento === 'mensalidades' ? 'Entradas Parceiros (mensalidades)' : 'Entradas Aluguel / Coworking';

  return (
    <ClassificacaoModal
      title="Classificar entrada"
      subtitle={grupo.titulo_card}
      subtitleExtra={`PIX: ${grupo.pessoa_exibida}`}
      categoriaLabel={`Categoria — ${segmentoLabel}`}
      categoriaHint={
        segmento === 'aluguel_coworking'
          ? 'Escolha o locatário cadastrado no Controle (ex.: Pholha, Neto).'
          : undefined
      }
      emptyCatalogHint={`Abra o Controle de Caixa deste mês para carregar as linhas de ${segmentoLabel.toLowerCase()}.`}
      categorias={categoriasSegmento}
      templateKey={templateKey}
      onTemplateKeyChange={setTemplateKey}
      transacoes={detalheQuery.data?.transacoes ?? []}
      transacoesLoading={detalheQuery.isLoading}
      renderTransacaoExtra={(t) => {
        const full = detalheQuery.data?.transacoes.find((x) => x.id === t.id) as
          | EntradaTransacaoClassificada
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
        grupo.sugestao_fluxo && segmento === 'mensalidades' && !templateKey ? (
          <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">
            Sugerido pelo Pagamento dia a dia: {grupo.sugestao_fluxo.label}
            {grupo.sugestao_fluxo.detalhe ? ` (${grupo.sugestao_fluxo.detalhe})` : ''}
          </p>
        ) : grupo.match_aluguel && segmento === 'aluguel_coworking' && !templateKey ? (
          <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">
            Sugestão aluguel/coworking: {grupo.match_aluguel.label} ({grupo.match_aluguel.motivo},{' '}
            {grupo.match_aluguel.confianca})
          </p>
        ) : grupo.sugestao && !templateKey ? (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
            Sugestão: {grupo.sugestao.label ?? grupo.sugestao.template_key} ({grupo.sugestao.origem},{' '}
            {grupo.sugestao.confianca})
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

export function EntradasPage() {
  const { monthYear } = useMonthYear();
  const { mes, ano } = monthYear;
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabId>('pendentes');
  const [segmento, setSegmento] = useState<SegmentoEntrada>('mensalidades');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [modalGrupo, setModalGrupo] = useState<EntradaGrupo | null>(null);
  const [visaoResumo, setVisaoResumo] = useState<VisaoControle>('caixa');
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['entradas-resumo', mes, ano] });
    void qc.invalidateQueries({ queryKey: ['entradas-grupos', mes, ano] });
    void qc.invalidateQueries({ queryKey: ['controle-caixa', mes, ano] });
  };

  const syncControlePermitido = mesPermiteSincronizarEntradasRepasses(mes, ano);

  const resumoQuery = useQuery({
    queryKey: ['entradas-resumo', mes, ano, visaoResumo],
    queryFn: () => getEntradasResumo(mes, ano, visaoResumo),
  });

  const categoriasQuery = useQuery({
    queryKey: ['entradas-categorias', mes, ano],
    queryFn: () => getEntradasCategorias(mes, ano),
  });

  // Na aba "Por categoria" carrega os grupos classificados para permitir reclassificar dali.
  const gruposQuery = useQuery({
    queryKey: ['entradas-grupos', mes, ano, tab === 'pendentes' ? 'pendentes' : 'classificados'],
    queryFn: () =>
      getEntradasGrupos(mes, ano, tab === 'pendentes' ? 'pendente' : 'classificado', 0, 100),
  });

  const desativarMut = useMutation({
    mutationFn: (id: string) => patchEntradasMapeamento(mes, ano, id, { ativo: false }),
    onSuccess: () => {
      showToast('Regra desativada para meses futuros.', 'success');
      invalidate();
    },
  });

  const desvincularMut = useMutation({
    mutationFn: (id: string) => deleteEntradasMapeamento(mes, ano, id),
    onSuccess: () => {
      showToast('Vínculo removido. Os lançamentos voltaram para pendentes.', 'success');
      invalidate();
    },
    onError: () => {
      showToast('Não foi possível desvincular.', 'error');
    },
  });

  const confirmarSugestaoMut = useMutation({
    mutationFn: async (g: EntradaGrupo) => {
      if (g.sugestao_fluxo?.mapeamento_id) {
        return patchEntradasMapeamento(mes, ano, g.sugestao_fluxo.mapeamento_id, { confirmado: true });
      }
      if (g.sugestao_fluxo?.template_key) {
        return putEntradasMapeamento(mes, ano, {
          pessoa_normalizada: g.pessoa_normalizada,
          template_key: g.sugestao_fluxo.template_key,
          subcategoria:
            g.modalidade && g.aba_fluxo ? `${g.aba_fluxo} · ${g.modalidade}` : g.modalidade ?? undefined,
        });
      }
      throw new Error('Sem sugestão para confirmar');
    },
    onSuccess: () => {
      showToast('Sugestão confirmada. A regra passa a valer para fechamento e Controle.', 'success');
      invalidate();
    },
    onError: () => {
      showToast('Não foi possível confirmar a sugestão.', 'error');
    },
  });

  const competenciaCategoriaMut = useMutation({
    mutationFn: (args: {
      id: string;
      patch: { mes_competencia: number; ano_competencia: number; confirmada: boolean };
    }) => patchEntradasTransacaoCompetencia(mes, ano, args.id, args.patch),
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
      setSegmento(grupo.segmento ?? 'mensalidades');
      setModalGrupo(grupo);
    } else {
      showToast('Grupo deste pagador não encontrado neste mês. Use a aba Classificados.', 'error');
    }
  };

  const kpis = resumoQuery.data?.kpis;
  const kpiItems = [
    { label: 'Total entradas', value: kpis ? formatBrl(kpis.total_entradas) : '—', isLoading: resumoQuery.isLoading },
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
      label: 'Grupos pendentes',
      value: kpis ? String(kpis.qtd_grupos_pendentes) : '—',
      isLoading: resumoQuery.isLoading,
    },
  ];

  const categoriasOpcoes = useMemo((): CategoriaOpcao[] => {
    const cats = categoriasQuery.data?.categorias ?? [];
    return cats
      .filter((c) => categoriaNoSegmento(c, segmento))
      .map((c) => ({
        templateKey: c.templateKey,
        label: c.label,
        blocoTitulo: c.blocoTitulo,
        blocoTemplateKey: c.blocoTemplateKey,
      }));
  }, [categoriasQuery.data?.categorias, segmento]);

  const gruposFiltrados = useMemo(() => {
    const lista = gruposQuery.data?.grupos ?? [];
    return lista.filter((g) => {
      if (!grupoVisivelNoSegmento(g, segmento)) return false;
      const key = resolveGrupoTemplateKey(g, categoriasOpcoes);
      const bloco = resolveGrupoBlocoTemplateKey(g, key, categoriasOpcoes);
      return grupoPassaFiltroTipo(key, filtroTipo, bloco);
    });
  }, [gruposQuery.data?.grupos, segmento, filtroTipo, categoriasOpcoes]);

  const porCategoriaBlocos = useMemo(() => {
    const blocos = (resumoQuery.data?.por_bloco ?? []).map((bloco) => ({
      bloco_titulo: bloco.bloco_titulo,
      bloco_template_key: bloco.linhas[0]?.bloco_template_key,
      linhas: bloco.linhas.map((row) => ({
        template_key: row.template_key,
        label: row.label,
        total: row.total,
        qtd_transacoes: row.qtd_transacoes,
        meta: `${row.qtd_transacoes} lanç. · ${row.qtd_pagadores} pagador(es)`,
      })),
    }));
    return filtrarPorCategoriaBlocos(blocos, filtroTipo);
  }, [resumoQuery.data?.por_bloco, filtroTipo]);

  const filtroTipoAtivo = Boolean(filtroTipo);
  const mostrarPendentePorCategoria =
    tab === 'categorias' && (!filtroTipo || filtroTipo === FILTRO_TIPO_PENDENTE);

  const segmentoBtn = (id: SegmentoEntrada, label: string, hint: string) => (
    <button
      type="button"
      key={id}
      onClick={() => {
        setSegmento(id);
        setFiltroTipo('');
      }}
      title={hint}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        segmento === id
          ? 'bg-indigo-600 text-white'
          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <Topbar
        title="Entradas"
        subtitle="Classifique PIX de mensalidades (parceiros) e de aluguel/coworking no Controle de Caixa"
      />

      <div className="mt-4">
        <FilterBar
          title="Classificação de entradas"
          subtitle="Duas famílias no Controle: Entradas Parceiros (mensalidades) e Entradas Aluguel / Coworking (locação direta)"
        >
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {syncControlePermitido
              ? 'Mensalidades classificadas em Entradas Parceiros sincronizam o Controle e calculam repasses. Aluguel/coworking vai para o bloco próprio (sem repasse automático).'
              : 'Neste mês o Controle permanece manual (até mai/2026). Você ainda pode classificar entradas e criar regras para os meses seguintes.'}
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

      <div className="mt-4 flex flex-wrap gap-2">
        {segmentoBtn(
          'mensalidades',
          'Mensalidades (parceiros)',
          'PIX de alunos — soma em Entradas Parceiros no Controle',
        )}
        {segmentoBtn(
          'aluguel_coworking',
          'Aluguel / Coworking',
          'PIX de quem aluga sala ou faz coworking — bloco Entradas Aluguel / Coworking',
        )}
      </div>

      <ClassificacaoTabBar
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
          label="Tipo de entrada"
        />
      )}

      {tab === 'categorias' && (
        <PorCategoriaSection
          isLoading={resumoQuery.isLoading}
          blocos={porCategoriaBlocos}
          pendenteTotal={mostrarPendentePorCategoria ? (resumoQuery.data?.pendente.total ?? 0) : 0}
          pendenteQtd={mostrarPendentePorCategoria ? (resumoQuery.data?.pendente.qtd_transacoes ?? 0) : 0}
          emptyMessage="Abra o Controle de Caixa deste mês para carregar as linhas de entrada."
          valorTone="entrada"
          mes={mes}
          ano={ano}
          loadTransacoes={async (templateKey) => {
            const res = await getEntradasCategoriaTransacoes(templateKey, mes, ano);
            return res.transacoes;
          }}
          renderTransacaoExtra={(t, templateKey) => {
            const full = t as EntradaTransacaoClassificada;
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
                  ? 'Nenhum grupo corresponde ao tipo selecionado nesta aba.'
                  : tab === 'pendentes'
                    ? segmento === 'mensalidades'
                      ? 'Nenhuma mensalidade pendente neste mês (ou classifique na aba Aluguel / Coworking).'
                      : 'Nenhum PIX de aluguel/coworking pendente neste mês.'
                    : segmento === 'mensalidades'
                      ? 'Nenhum pagador de mensalidade classificado neste mês.'
                      : 'Nenhum pagador de aluguel/coworking classificado neste mês.'
              }
            />
          )}
          {gruposFiltrados.map((g) => (
            <ClassificacaoGrupoCard
              key={g.grupo_key}
              titulo={g.titulo_card}
              resumo={`${g.qtd_mes} lançamento(s) · ${formatBrl(g.total_mes)}`}
              meta={`${g.pessoa_exibida} · ${g.datas.map(formatDate).join(', ')}`}
              estado={g.estado}
              categoriaLabel={g.regra_pendente_confirmacao ? g.sugestao_fluxo?.label ?? null : g.categoria_label}
              scoreRepeticao={g.score_repeticao}
              regraDesativada={g.regra_desativada}
              sugestaoFluxoBadge={Boolean(
                g.regra_pendente_confirmacao &&
                  g.sugestao_fluxo &&
                  (g.origem_grupo === 'pix_vinculo' ||
                    g.origem_grupo === 'cartao_vinculo' ||
                    g.origem_grupo === 'cartao_match'),
              )}
              cartaoDetalhe={g.cartao_detalhe ?? null}
              sugestaoHint={
                g.sugestao_fluxo
                  ? `${g.sugestao_fluxo.label}${g.sugestao_fluxo.detalhe ? ` · ${g.sugestao_fluxo.detalhe}` : ''}`
                  : g.match_aluguel
                    ? `${g.match_aluguel.label} · ${g.match_aluguel.motivo}`
                    : g.sugestao
                      ? `Sugestão: ${g.sugestao.label}${g.sugestao.aluno_nome ? ` · ${g.sugestao.aluno_nome}` : ''}`
                      : null
              }
              onConfirmarSugestao={
                g.regra_pendente_confirmacao && g.sugestao_fluxo
                  ? () => confirmarSugestaoMut.mutate(g)
                  : undefined
              }
              confirmarPending={confirmarSugestaoMut.isPending}
              classificarDesabilitado={g.origem_grupo === 'cartao_avulso'}
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
                      const msg =
                        g.estado === 'pendente' && g.regra_pendente_confirmacao
                          ? 'Recusar a sugestão de categoria? O pagador voltará a pendente.'
                          : 'Desvincular apaga a regra e remove a classificação deste mês. Os lançamentos voltam para pendentes. Continuar?';
                      if (window.confirm(msg)) {
                        desvincularMut.mutate(g.mapeamento_id!);
                      }
                    }
                  : undefined
              }
              podeDesvincular={Boolean(g.mapeamento_id)}
              desvincularLabel={
                g.estado === 'pendente' && g.regra_pendente_confirmacao ? 'Recusar sugestão' : 'Desvincular'
              }
            />
          ))}
        </section>
      )}

      {modalGrupo && categoriasQuery.data && (
        <EntradasClassificarModal
          grupo={modalGrupo}
          mes={mes}
          ano={ano}
          categorias={categoriasQuery.data.categorias}
          segmento={segmento}
          onClose={() => setModalGrupo(null)}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}
