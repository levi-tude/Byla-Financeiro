import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePersistedPageState } from '../hooks/usePersistedPageState';
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

function segmentoDaCategoria(c: Pick<EntradaCategoriaLinha, 'blocoTitulo' | 'blocoTemplateKey'>): SegmentoEntrada {
  return categoriaNoSegmento(c as EntradaCategoriaLinha, 'aluguel_coworking')
    ? 'aluguel_coworking'
    : 'mensalidades';
}

function grupoVisivelNoSegmento(g: EntradaGrupo, segmento: SegmentoEntrada): boolean {
  return (g.segmento ?? 'mensalidades') === segmento;
}

function sugestaoConfirmavel(g: EntradaGrupo): { template_key: string; label: string | null; mapeamento_id?: string } | null {
  if (g.sugestao_fluxo?.template_key) {
    return {
      template_key: g.sugestao_fluxo.template_key,
      label: g.sugestao_fluxo.label,
      mapeamento_id: g.sugestao_fluxo.mapeamento_id || undefined,
    };
  }
  const s = g.sugestao;
  if (
    s?.template_key &&
    (s.confianca === 'alta' || s.confianca === 'media') &&
    (s.origem === 'validacao_fluxo' ||
      s.origem === 'fluxo_operacional' ||
      s.origem === 'cadastro_mensalidade' ||
      s.origem === 'aluguel_nome_valor')
  ) {
    return { template_key: s.template_key, label: s.label };
  }
  return null;
}

function EntradasClassificarModal({
  grupo,
  mes,
  ano,
  categorias,
  onClose,
  onSaved,
}: {
  grupo: EntradaGrupo;
  mes: number;
  ano: number;
  /** Catálogo completo (parceiros + aluguel/coworking) — permite reclassificar entre blocos. */
  categorias: EntradaCategoriaLinha[];
  onClose: () => void;
  onSaved: (segmentoEscolhido?: SegmentoEntrada) => void;
}) {
  const { showToast } = useToast();
  const categoriasTodas = useMemo(
    () =>
      categorias.map((c) => ({
        templateKey: c.templateKey,
        label: c.label,
        blocoTitulo: c.blocoTitulo,
        blocoTemplateKey: c.blocoTemplateKey,
      })),
    [categorias],
  );
  const initialTemplateKey = useMemo(
    () =>
      resolveTemplateKeyInCategorias(
        grupo.template_key ??
          grupo.sugestao_fluxo?.template_key ??
          grupo.match_aluguel?.template_key ??
          grupo.sugestao?.template_key,
        categoriasTodas,
        grupo.categoria_label ??
          grupo.sugestao_fluxo?.label ??
          grupo.match_aluguel?.label ??
          grupo.sugestao?.label,
      ),
    [grupo, categoriasTodas],
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
    mutationFn: () => {
      const cat = categorias.find((c) => c.templateKey === templateKey);
      return putEntradasMapeamento(mes, ano, {
        pessoa_normalizada: grupo.pessoa_normalizada,
        template_key: templateKey,
        categoria_label: cat?.label ?? grupo.categoria_label ?? undefined,
        subcategoria:
          grupo.modalidade && grupo.aba_fluxo
            ? `${grupo.aba_fluxo} · ${grupo.modalidade}`
            : grupo.modalidade ?? undefined,
      });
    },
    onSuccess: () => {
      const cat = categorias.find((c) => c.templateKey === templateKey);
      showToast('Categoria salva. Regra vale para meses futuros.', 'success');
      onSaved(cat ? segmentoDaCategoria(cat) : undefined);
      onClose();
    },
  });

  return (
    <ClassificacaoModal
      title="Classificar entrada"
      subtitle={grupo.titulo_card}
      subtitleExtra={`PIX: ${grupo.pessoa_exibida}`}
      categoriaLabel="Categoria (Controle de Caixa)"
      categoriaHint="Parceiros (mensalidades) e Aluguel/Coworking — pode mover entre os dois blocos."
      emptyCatalogHint="Abra o Controle de Caixa deste mês para carregar as linhas de entrada."
      categorias={categoriasTodas}
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
        grupo.sugestao_fluxo && !templateKey ? (
          <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">
            Indicado pela Validação / Fluxo: {grupo.sugestao_fluxo.label}
            {grupo.sugestao_fluxo.detalhe ? ` (${grupo.sugestao_fluxo.detalhe})` : ''}
            . Confirme ou escolha outra linha abaixo.
          </p>
        ) : grupo.match_aluguel && !templateKey ? (
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

type EntradasNavPersisted = {
  tab: TabId;
  segmento: SegmentoEntrada;
  filtroTipo: string;
  visaoResumo: VisaoControle;
};

const ENTRADAS_NAV_INITIAL: EntradasNavPersisted = {
  tab: 'pendentes',
  segmento: 'mensalidades',
  filtroTipo: '',
  visaoResumo: 'caixa',
};

function patchEntradasNav<K extends keyof EntradasNavPersisted>(
  setNav: Dispatch<SetStateAction<EntradasNavPersisted>>,
  key: K,
  value: SetStateAction<EntradasNavPersisted[K]>,
) {
  setNav((prev) => ({
    ...prev,
    [key]: typeof value === 'function'
      ? (value as (prev: EntradasNavPersisted[K]) => EntradasNavPersisted[K])(prev[key])
      : value,
  }));
}

export function EntradasPage() {
  const { monthYear } = useMonthYear();
  const { mes, ano } = monthYear;
  const { showToast } = useToast();
  const [nav, setNav] = usePersistedPageState('entradas', ENTRADAS_NAV_INITIAL);
  const { tab, segmento, filtroTipo, visaoResumo } = nav;

  const setTab = useCallback(
    (value: SetStateAction<TabId>) => patchEntradasNav(setNav, 'tab', value),
    [setNav],
  );
  const setSegmento = useCallback(
    (value: SetStateAction<SegmentoEntrada>) => patchEntradasNav(setNav, 'segmento', value),
    [setNav],
  );
  const setFiltroTipo = useCallback(
    (value: SetStateAction<string>) => patchEntradasNav(setNav, 'filtroTipo', value),
    [setNav],
  );
  const setVisaoResumo = useCallback(
    (value: SetStateAction<VisaoControle>) => patchEntradasNav(setNav, 'visaoResumo', value),
    [setNav],
  );

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('foco') !== 'pendentes') return;
    setTab('pendentes');
    const next = new URLSearchParams(searchParams);
    next.delete('foco');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, setTab]);

  const [modalGrupo, setModalGrupo] = useState<EntradaGrupo | null>(null);
  const qc = useQueryClient();

  const invalidate = (segmentoEscolhido?: SegmentoEntrada) => {
    void qc.invalidateQueries({ queryKey: ['entradas-resumo', mes, ano] });
    void qc.invalidateQueries({ queryKey: ['entradas-grupos', mes, ano] });
    void qc.invalidateQueries({ queryKey: ['entradas-categorias', mes, ano] });
    void qc.invalidateQueries({ queryKey: ['controle-caixa', mes, ano] });
    if (segmentoEscolhido) setSegmento(segmentoEscolhido);
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
      const sug = sugestaoConfirmavel(g);
      if (sug?.mapeamento_id) {
        return patchEntradasMapeamento(mes, ano, sug.mapeamento_id, { confirmado: true });
      }
      if (sug?.template_key) {
        return putEntradasMapeamento(mes, ano, {
          pessoa_normalizada: g.pessoa_normalizada,
          template_key: sug.template_key,
          categoria_label: sug.label ?? g.categoria_label ?? undefined,
          subcategoria:
            g.modalidade && g.aba_fluxo ? `${g.aba_fluxo} · ${g.modalidade}` : g.modalidade ?? undefined,
        });
      }
      throw new Error('Sem sugestão para confirmar');
    },
    onSuccess: (_data, g) => {
      const sug = sugestaoConfirmavel(g);
      const cat = (categoriasQuery.data?.categorias ?? []).find((c) => c.templateKey === sug?.template_key);
      showToast('Sugestão confirmada. A regra passa a valer para fechamento e Controle.', 'success');
      invalidate(cat ? segmentoDaCategoria(cat) : undefined);
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
      return grupoPassaFiltroTipo(key, filtroTipo, bloco, categoriasOpcoes);
    });
  }, [gruposQuery.data?.grupos, segmento, filtroTipo, categoriasOpcoes]);

  const pendentesPorSegmento = useMemo(() => {
    const lista = gruposQuery.data?.grupos ?? [];
    if (tab !== 'pendentes') return { mensalidades: 0, aluguel_coworking: 0 };
    let mensalidades = 0;
    let aluguel_coworking = 0;
    for (const g of lista) {
      if ((g.segmento ?? 'mensalidades') === 'aluguel_coworking') aluguel_coworking += 1;
      else mensalidades += 1;
    }
    return { mensalidades, aluguel_coworking };
  }, [gruposQuery.data?.grupos, tab]);

  const outroSegmento: SegmentoEntrada =
    segmento === 'mensalidades' ? 'aluguel_coworking' : 'mensalidades';
  const pendentesOutroSegmento = pendentesPorSegmento[outroSegmento];

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
    return filtrarPorCategoriaBlocos(blocos, filtroTipo, categoriasOpcoes);
  }, [resumoQuery.data?.por_bloco, filtroTipo, categoriasOpcoes]);

  const filtroTipoAtivo = Boolean(filtroTipo);
  const mostrarPendentePorCategoria =
    tab === 'categorias' && (!filtroTipo || filtroTipo === FILTRO_TIPO_PENDENTE);

  const segmentoBtn = (id: SegmentoEntrada, label: string, hint: string) => {
    const count = tab === 'pendentes' ? pendentesPorSegmento[id] : null;
    return (
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
        {count != null && count > 0 ? (
          <span
            className={`ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 text-xs font-semibold ${
              segmento === id ? 'bg-white/20 text-white' : 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100'
            }`}
          >
            {count}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <Topbar
        title="Entradas"
        subtitle="Classifique PIX no Controle: mensalidades (parceiros) e aluguel/coworking"
      />

      <div className="mt-4">
        <FilterBar
          title="Classificação de entradas"
          subtitle="Validação liga banco ↔ aluno do Fluxo; aqui você confirma a linha contábil do Controle (ou corrige)."
        >
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {syncControlePermitido
              ? 'Ao classificar ou desvincular, o Controle Sistema atualiza sozinho (parceiros, aluguel e repasses). Pendente abaixo ainda não entra no fechamento.'
              : 'Neste mês o Controle permanece manual (até mai/2026). Você ainda pode classificar entradas e criar regras para os meses seguintes.'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Vínculo na Validação sugere a categoria pela aba/modalidade do Fluxo (ex.: Pilates → Pilates Mari).
            Isso não é a classificação contábil até confirmar ou até a regra sticky já existir.
          </p>
          {kpis && (kpis.qtd_grupos_pendentes ?? 0) > 0 ? (
            <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-200">
              {kpis.qtd_grupos_pendentes} grupo{kpis.qtd_grupos_pendentes === 1 ? '' : 's'} ainda sem
              categoria neste mês
              {kpis.valor_pendente > 0
                ? ` (${formatBrl(kpis.valor_pendente)})`
                : ''}
              .{' '}
              <button
                type="button"
                className="underline font-semibold"
                onClick={() => setTab('pendentes')}
              >
                Ver pendentes
              </button>
              {' · '}
              <Link to="/controle-caixa" className="underline font-semibold">
                Ir ao Controle
              </Link>
            </p>
          ) : null}
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

      {tab === 'pendentes' && pendentesOutroSegmento > 0 && gruposFiltrados.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Há {pendentesOutroSegmento} pendente{pendentesOutroSegmento === 1 ? '' : 's'} em{' '}
          {outroSegmento === 'mensalidades' ? 'Mensalidades' : 'Aluguel / Coworking'}.{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              setSegmento(outroSegmento);
              setFiltroTipo('');
            }}
          >
            Ver lá
          </button>
        </p>
      )}

      {tab === 'pendentes' && pendentesOutroSegmento > 0 && gruposFiltrados.length > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Também há {pendentesOutroSegmento} em{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setSegmento(outroSegmento);
              setFiltroTipo('');
            }}
          >
            {outroSegmento === 'mensalidades' ? 'Mensalidades' : 'Aluguel / Coworking'}
          </button>
          .
        </p>
      )}

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
                    ? pendentesOutroSegmento > 0
                      ? `Nenhum pendente aqui — há ${pendentesOutroSegmento} em ${outroSegmento === 'mensalidades' ? 'Mensalidades' : 'Aluguel / Coworking'}.`
                      : segmento === 'mensalidades'
                        ? 'Nenhuma mensalidade pendente neste mês.'
                        : 'Nenhum PIX de aluguel/coworking pendente neste mês.'
                    : segmento === 'mensalidades'
                      ? 'Nenhum pagador de mensalidade classificado neste mês.'
                      : 'Nenhum pagador de aluguel/coworking classificado neste mês.'
              }
            />
          )}
          {gruposFiltrados.map((g) => {
            const sugConf = sugestaoConfirmavel(g);
            const labelSugerida =
              g.regra_pendente_confirmacao || sugConf
                ? g.sugestao_fluxo?.label ?? g.sugestao?.label ?? g.categoria_label
                : g.categoria_label;
            const fromValidacao =
              g.origem_grupo === 'pix_vinculo' ||
              g.origem_grupo === 'cartao_vinculo' ||
              g.origem_grupo === 'cartao_match';
            return (
            <ClassificacaoGrupoCard
              key={g.grupo_key}
              titulo={g.titulo_card}
              resumo={`${g.qtd_mes} lançamento(s) · ${formatBrl(g.total_mes)}`}
              meta={`${g.pessoa_exibida} · ${g.datas.map(formatDate).join(', ')}`}
              estado={g.estado}
              categoriaLabel={labelSugerida}
              scoreRepeticao={g.score_repeticao}
              regraDesativada={g.regra_desativada}
              sugestaoFluxoBadge={Boolean(sugConf && g.estado === 'pendente')}
              cartaoDetalhe={
                fromValidacao
                  ? g.cartao_detalhe ??
                    (g.origem_grupo === 'pix_vinculo'
                      ? 'Vinculado na Validação · indica categoria pelo Fluxo'
                      : g.cartao_detalhe)
                  : g.origem_grupo?.startsWith('cartao')
                    ? g.cartao_detalhe
                    : null
              }
              origemBadgeLabel={
                g.origem_grupo === 'pix_vinculo'
                  ? 'Validação'
                  : g.origem_grupo === 'cartao_vinculo' || g.origem_grupo === 'cartao_match'
                    ? 'Cartão'
                    : null
              }
              sugestaoHint={
                g.sugestao_fluxo
                  ? `Indicação Fluxo/Validação: ${g.sugestao_fluxo.label}${g.sugestao_fluxo.detalhe ? ` · ${g.sugestao_fluxo.detalhe}` : ''} (ainda não é classificação confirmada)`
                  : g.match_aluguel
                    ? `${g.match_aluguel.label} · ${g.match_aluguel.motivo}`
                    : g.sugestao
                      ? `Sugestão: ${g.sugestao.label}${g.sugestao.aluno_nome ? ` · ${g.sugestao.aluno_nome}` : ''} (${g.sugestao.origem})`
                      : null
              }
              onConfirmarSugestao={sugConf ? () => confirmarSugestaoMut.mutate(g) : undefined}
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
            );
          })}
        </section>
      )}

      {modalGrupo && categoriasQuery.data && (
        <EntradasClassificarModal
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
