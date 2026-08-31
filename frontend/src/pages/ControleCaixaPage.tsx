import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { usePersistedPageState } from '../hooks/usePersistedPageState';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '../app/Topbar';
import { useMonthYear } from '../context/MonthYearContext';
import {
  getControleCaixa,
  getDespesasResumo,
  getEntradasResumo,
  postControleCaixaSincronizarEntradas,
  putControleCaixa,
  type ControleCaixaBloco,
  type ControleCaixaLinha,
  type ControleCaixaResponse,
  type ControleModo,
} from '../services/backendApi';
import { useToast } from '../context/ToastContext';
import { ApiErrorPanel } from '../components/ui/ApiErrorPanel';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  ControleLinhaComposicaoModal,
  type ControleLinhaComposicaoTarget,
} from '../components/ControleLinhaComposicaoModal';
import { ControleCaixaComparacaoPanel } from '../components/ControleCaixaComparacaoPanel';
import { Link } from 'react-router-dom';
import { FilterBar } from '../components/finance/FilterBar';
import {
  formatDeltaBrl,
  formatPctChange,
  labelMesAno,
  mesExtenso,
  previousMonth,
} from '../logic/overviewDashboard';
import { mesPermiteSincronizarEntradasRepasses } from '../lib/syncEntradasRepassesEligible';

type DraftState = {
  abaRef: string;
  totais: ControleCaixaResponse['totais'];
  blocos: ControleCaixaBloco[];
};

function cloneState(data: ControleCaixaResponse): DraftState {
  return {
    abaRef: data.abaRef ?? '',
    totais: { ...data.totais },
    blocos: data.blocos.map((b) => ({
      ...b,
      isDefault: b.isDefault ?? false,
      isCustom: b.isCustom ?? !(b.isDefault ?? false),
      lockedLevel: b.lockedLevel ?? 'none',
      linhas: b.linhas.map((l) => ({ ...l })),
    })),
  };
}

function parseNullableNumber(raw: string): number | null {
  const v = raw
    .trim()
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatNullableCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return BRL_FORMATTER.format(value);
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();
}

function sumBloco(bloco: ControleCaixaBloco): number {
  return bloco.linhas.reduce((acc, linha) => acc + (linha.valor ?? 0), 0);
}

function linhaValorSomenteLeitura(
  bloco: ControleCaixaBloco,
  linha: ControleCaixaLinha,
  modoOficial = false,
): boolean {
  if (modoOficial) return true;
  if (bloco.templateKey === 'saida_parceiros') return true;
  if (linha.valorTexto === 'calculado_repasse') return true;
  if (bloco.templateKey === 'entrada_parceiros' && linha.valorTexto === 'extrato_classificado') return true;
  return false;
}

function linhaValorHint(_bloco: ControleCaixaBloco, linha: ControleCaixaLinha): string | undefined {
  if (linha.valorTexto === 'calculado_repasse') {
    return 'Repasse calculado automaticamente a partir da entrada do parceiro no mês. Clique para ver a fórmula.';
  }
  if (linha.valorTexto === 'extrato_classificado') {
    return 'Total sincronizado do extrato classificado (e dinheiro do Fluxo, quando houver). Clique para ver a composição.';
  }
  return 'Clique em Composição para ver o detalhe da linha.';
}

function chaveBlocoComposicao(bloco: ControleCaixaBloco): string {
  return (bloco.templateKey ?? '').trim() || bloco.titulo;
}

function chaveLinhaComposicao(linha: ControleCaixaLinha): string {
  const tk = (linha.templateKey ?? '').trim();
  if (tk) return tk;
  if (linha.id) return `linha:${linha.id}`;
  return linha.label;
}

function trendFromDelta(current: number | null, prev: number | null): 'up' | 'down' | 'neutral' {
  if (current == null || prev == null) return 'neutral';
  if (current > prev) return 'up';
  if (current < prev) return 'down';
  return 'neutral';
}

function pctHelperClass(trend: 'up' | 'down' | 'neutral', invert = false): string {
  if (trend === 'neutral') return 'text-slate-500 dark:text-slate-400';
  const good = invert ? trend === 'down' : trend === 'up';
  return good ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300';
}

function createDefaultDraft(): DraftState {
  const mkLinha = (label: string, ordem: number): ControleCaixaLinha => ({
    label,
    valor: null,
    valorTexto: null,
    ordem,
    templateKey: null,
    isDefault: false,
    isCustom: true,
    lockedLevel: 'warn',
  });

  const blocos: ControleCaixaBloco[] = [
    {
      tipo: 'entrada',
      titulo: 'ENTRADAS PARCEIROS',
      ordem: 0,
      templateKey: 'entrada_parceiros',
      isDefault: true,
      isCustom: false,
      lockedLevel: 'strong',
      linhas: ['Dança', 'Yoga', 'Pilates Mari', 'Teatro', 'Bruna GR'].map(mkLinha),
    },
    {
      tipo: 'entrada',
      titulo: 'ENTRADAS ALUGUEL / COWORKING',
      ordem: 1,
      templateKey: 'entrada_aluguel_coworking',
      isDefault: true,
      isCustom: false,
      lockedLevel: 'strong',
      linhas: ['Neto (SBA)', 'Pholha (Funcional)', 'Forró e Alma', 'Pilates Fabi', 'Loja (Everaldo)'].map(mkLinha),
    },
    {
      tipo: 'saida',
      titulo: 'Saídas Parceiros',
      ordem: 2,
      templateKey: 'saida_parceiros',
      isDefault: true,
      isCustom: false,
      lockedLevel: 'strong',
      linhas: ['Dança', 'Yoga', 'Pilates Mari', 'Teatro', 'Teatro Infantil', 'Bruna GR'].map(mkLinha),
    },
    {
      tipo: 'saida',
      titulo: 'Saídas Fixas',
      ordem: 3,
      templateKey: 'saida_gastos_fixos',
      isDefault: true,
      isCustom: false,
      lockedLevel: 'strong',
      linhas: [
        'Energia',
        'Água',
        'Net',
        'Materiais',
        'Energia Solar',
        'Contadora',
        'Parcela Pilates',
        'Eli Ar Condicionado',
        'Impostos',
        'IPTU',
        'Samuel',
        'Luciana',
        'Funcionários',
        'Transporte',
      ].map(mkLinha),
    },
  ];
  return {
    abaRef: '',
    totais: {
      entradaTotal: null,
      saidaTotal: null,
      lucroTotal: null,
      saidaParceirosTotal: null,
      saidaFixasTotal: null,
      saidaSomaSecoesPrincipais: null,
    },
    blocos,
  };
}

type DeleteTarget =
  | null
  | { kind: 'bloco'; blocoIdx: number; titulo: string; strong: boolean }
  | { kind: 'linha'; blocoIdx: number; linhaIdx: number; label: string; strong: boolean };

type DefaultEditDecision =
  | null
  | {
      kind: 'bloco' | 'linha';
      blocoIdx: number;
      linhaIdx?: number;
      title: string;
      description: string;
    };

type ControleCaixaNavPersisted = {
  modo: ControleModo;
};

const CONTROLE_CAIXA_NAV_INITIAL: ControleCaixaNavPersisted = {
  modo: 'oficial',
};

function patchControleCaixaNav<K extends keyof ControleCaixaNavPersisted>(
  setNav: Dispatch<SetStateAction<ControleCaixaNavPersisted>>,
  key: K,
  value: SetStateAction<ControleCaixaNavPersisted[K]>,
) {
  setNav((prev) => ({
    ...prev,
    [key]: typeof value === 'function'
      ? (value as (prev: ControleCaixaNavPersisted[K]) => ControleCaixaNavPersisted[K])(prev[key])
      : value,
  }));
}

export function ControleCaixaPage() {
  const { monthYear } = useMonthYear();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [nav, setNav] = usePersistedPageState('controle-caixa', CONTROLE_CAIXA_NAV_INITIAL);
  const { modo } = nav;
  const [mostrarPendentesClassificacao, setMostrarPendentesClassificacao] = useState(false);

  const setModo = useCallback(
    (value: SetStateAction<ControleModo>) => patchControleCaixaNav(setNav, 'modo', value),
    [setNav],
  );

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [defaultEditDecision, setDefaultEditDecision] = useState<DefaultEditDecision>(null);
  const [modoEscolhidoManual, setModoEscolhidoManual] = useState(false);
  const [composicaoTarget, setComposicaoTarget] = useState<ControleLinhaComposicaoTarget | null>(null);

  const abrirComposicao = useCallback((bloco: ControleCaixaBloco, linha: ControleCaixaLinha) => {
    setComposicaoTarget({
      blocoTemplateKey: chaveBlocoComposicao(bloco),
      linhaTemplateKey: chaveLinhaComposicao(linha),
      linhaLabel: linha.label,
      blocoTitulo: bloco.titulo,
    });
  }, []);

  const mesAnterior = useMemo(
    () => previousMonth(monthYear.mes, monthYear.ano),
    [monthYear.mes, monthYear.ano],
  );
  const prevLabel = labelMesAno(mesAnterior.mes, mesAnterior.ano);
  const relatorioMesHref = `/relatorios-ia?tipo=mensal_operacional&mes=${monthYear.mes}&ano=${monthYear.ano}`;

  useEffect(() => {
    setModo('oficial');
    setModoEscolhidoManual(false);
    setDraft(null);
  }, [monthYear.mes, monthYear.ano]);

  const controleQuery = useQuery({
    queryKey: ['controle-caixa', monthYear.mes, monthYear.ano, modo],
    queryFn: () => getControleCaixa(monthYear.mes, monthYear.ano, modo),
  });

  const controlePrevQuery = useQuery({
    queryKey: ['controle-caixa', mesAnterior.mes, mesAnterior.ano, modo],
    queryFn: () => getControleCaixa(mesAnterior.mes, mesAnterior.ano, modo),
    staleTime: 5 * 60 * 1000,
  });

  const modoOutro: ControleModo = modo === 'oficial' ? 'sistema' : 'oficial';
  const controleOutroQuery = useQuery({
    queryKey: ['controle-caixa', monthYear.mes, monthYear.ano, modoOutro],
    queryFn: () => getControleCaixa(monthYear.mes, monthYear.ano, modoOutro),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!controleQuery.data || modoEscolhidoManual) return;
    if (modo === 'oficial' && controleQuery.data.existe === false) {
      setModo('sistema');
    }
  }, [controleQuery.data, modo, modoEscolhidoManual]);

  useEffect(() => {
    if (controleQuery.data) {
      setDraft(cloneState(controleQuery.data));
    }
  }, [controleQuery.data]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [monthYear.mes, monthYear.ano]);

  const somenteLeitura = modo === 'oficial' || controleQuery.data?.somenteLeitura === true;

  function escolherModo(next: ControleModo) {
    setModoEscolhidoManual(true);
    setModo(next);
  }

  const saveMutation = useMutation({
    mutationFn: (state: DraftState) =>
      putControleCaixa(
        monthYear.mes,
        monthYear.ano,
        {
          abaRef: state.abaRef.trim() || null,
          totais: totaisCalculados,
          blocos: state.blocos,
        },
        'sistema',
      ),
    onSuccess: async (data) => {
      setDraft(cloneState(data));
      showToast('Alterações salvas no Supabase (modo Sistema).', 'success');
      await queryClient.invalidateQueries({ queryKey: ['controle-caixa', monthYear.mes, monthYear.ano] });
      await queryClient.invalidateQueries({ queryKey: ['fluxo-completo', monthYear.mes, monthYear.ano] });
    },
    onError: (e) => {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    },
  });

  const syncEntradasPermitido = mesPermiteSincronizarEntradasRepasses(monthYear.mes, monthYear.ano);

  const entradasPendQuery = useQuery({
    queryKey: ['entradas-resumo', monthYear.mes, monthYear.ano, 'competencia', 'controle-banner'],
    queryFn: () => getEntradasResumo(monthYear.mes, monthYear.ano, 'competencia'),
    enabled: syncEntradasPermitido,
    staleTime: 60_000,
  });

  const despesasPendQuery = useQuery({
    queryKey: ['despesas-resumo', monthYear.mes, monthYear.ano, 'competencia', 'controle-banner'],
    queryFn: () => getDespesasResumo(monthYear.mes, monthYear.ano, 'competencia'),
    enabled: syncEntradasPermitido,
    staleTime: 60_000,
  });

  const pendenciasClassificacao = useMemo(() => {
    const ent = entradasPendQuery.data?.kpis;
    const desp = despesasPendQuery.data?.kpis;
    const entradasQtd = ent?.qtd_grupos_pendentes ?? 0;
    const entradasValor = ent?.valor_pendente ?? 0;
    const entradasTx = entradasPendQuery.data?.pendente?.qtd_transacoes ?? 0;
    const despesasQtd = desp?.qtd_destinatarios_pendentes ?? 0;
    const despesasValor = desp?.valor_pendente ?? 0;
    const despesasTx = despesasPendQuery.data?.pendente?.qtd_transacoes ?? 0;
    return {
      entradasQtd,
      entradasValor,
      entradasTx,
      despesasQtd,
      despesasValor,
      despesasTx,
      totalGrupos: entradasQtd + despesasQtd,
      totalTx: entradasTx + despesasTx,
    };
  }, [entradasPendQuery.data, despesasPendQuery.data]);

  const syncEntradasMutation = useMutation({
    mutationFn: () => postControleCaixaSincronizarEntradas(monthYear.mes, monthYear.ano, 'competencia'),
    onSuccess: async (data) => {
      setModoEscolhidoManual(true);
      setModo('sistema');
      setDraft(cloneState(data.controle));
      showToast('Controle Sistema sincronizado (entradas, despesas e repasses). Planilha intacta.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['controle-caixa', monthYear.mes, monthYear.ano] });
      await queryClient.invalidateQueries({ queryKey: ['entradas-resumo', monthYear.mes, monthYear.ano] });
      await queryClient.invalidateQueries({ queryKey: ['despesas-resumo', monthYear.mes, monthYear.ano] });
    },
    onError: (e) => {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    },
  });

  const isDirty = useMemo(() => {
    if (!draft || !controleQuery.data) return false;
    return JSON.stringify(draft) !== JSON.stringify(cloneState(controleQuery.data));
  }, [draft, controleQuery.data]);

  const stats = useMemo(() => {
    if (!draft) {
      return { totalBlocos: 0, totalLinhas: 0, defaultBlocos: 0, defaultLinhas: 0, customLinhas: 0, percentPreservado: 0 };
    }
    const totalBlocos = draft.blocos.length;
    let totalLinhas = 0;
    let defaultLinhas = 0;
    let customLinhas = 0;
    const defaultBlocos = draft.blocos.filter((b) => b.isDefault).length;
    for (const b of draft.blocos) {
      totalLinhas += b.linhas.length;
      defaultLinhas += b.linhas.filter((l) => l.isDefault).length;
      customLinhas += b.linhas.filter((l) => l.isCustom).length;
    }
    const percentPreservado = totalLinhas === 0 ? 0 : Math.round((defaultLinhas / totalLinhas) * 100);
    return { totalBlocos, totalLinhas, defaultBlocos, defaultLinhas, customLinhas, percentPreservado };
  }, [draft]);

  const totaisCalculados = useMemo(() => {
    if (!draft) {
      return {
        entradaTotal: null,
        saidaTotal: null,
        lucroTotal: null,
        saidaParceirosTotal: null,
        saidaFixasTotal: null,
        saidaSomaSecoesPrincipais: null,
      };
    }

    let entradaTotal = 0;
    let saidaTotal = 0;
    let saidaParceirosTotal = 0;
    let saidaFixasTotal = 0;

    for (const bloco of draft.blocos) {
      const totalBloco = sumBloco(bloco);
      const titulo = normalizeText(bloco.titulo ?? '');
      if (bloco.tipo === 'entrada') {
        entradaTotal += totalBloco;
      } else {
        saidaTotal += totalBloco;
        if (titulo.includes('PARCEIR')) saidaParceirosTotal += totalBloco;
        if (titulo.includes('FIXA') || titulo.includes('GASTOS FIXOS')) saidaFixasTotal += totalBloco;
      }
    }

    const lucroTotal = entradaTotal - saidaTotal;
    const saidaSomaSecoesPrincipais = saidaParceirosTotal + saidaFixasTotal;

    return {
      entradaTotal,
      saidaTotal,
      lucroTotal,
      saidaParceirosTotal: saidaParceirosTotal || null,
      saidaFixasTotal: saidaFixasTotal || null,
      saidaSomaSecoesPrincipais: saidaSomaSecoesPrincipais || null,
    };
  }, [draft]);

  const oficialExiste =
    (modo === 'oficial' ? controleQuery.data : controleOutroQuery.data)?.existe === true;
  const sistemaExiste =
    (modo === 'sistema' ? controleQuery.data : controleOutroQuery.data)?.existe === true;

  const oficialParaComparacao = useMemo(() => {
    if (modo === 'oficial' && draft) {
      return { totais: totaisCalculados, blocos: draft.blocos };
    }
    return modo === 'oficial' ? controleQuery.data : controleOutroQuery.data;
  }, [modo, draft, totaisCalculados, controleQuery.data, controleOutroQuery.data]);

  const sistemaParaComparacao = useMemo(() => {
    if (modo === 'sistema' && draft) {
      return { totais: totaisCalculados, blocos: draft.blocos };
    }
    return modo === 'sistema' ? controleQuery.data : controleOutroQuery.data;
  }, [modo, draft, totaisCalculados, controleQuery.data, controleOutroQuery.data]);

  const totaisPorBloco = useMemo(() => {
    if (!draft) return { entradas: [] as Array<{ titulo: string; total: number }>, saidas: [] as Array<{ titulo: string; total: number }> };
    const entradas = draft.blocos
      .filter((b) => b.tipo === 'entrada')
      .map((b) => ({ titulo: b.titulo, total: sumBloco(b) }));
    const saidas = draft.blocos
      .filter((b) => b.tipo === 'saida')
      .map((b) => ({ titulo: b.titulo, total: sumBloco(b) }));
    return { entradas, saidas };
  }, [draft]);

  const lastUpdateLabel = useMemo(() => {
    const raw = controleQuery.data?.updatedAt;
    if (!raw) return 'Ainda não salvo';
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? 'Ainda não salvo' : d.toLocaleString('pt-BR');
  }, [controleQuery.data?.updatedAt]);

  const totaisMesAnterior = controlePrevQuery.data?.totais;
  const entradaPrev = totaisMesAnterior?.entradaTotal ?? null;
  const saidaPrev = totaisMesAnterior?.saidaTotal ?? null;
  const lucroPrev = totaisMesAnterior?.lucroTotal ?? null;
  const temComparacaoMesAnterior = controlePrevQuery.isSuccess && totaisMesAnterior != null;

  function applyDefaultDecisionConvertToCustom() {
    if (!defaultEditDecision) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const blocos = [...prev.blocos];
      if (defaultEditDecision.kind === 'bloco') {
        const b = blocos[defaultEditDecision.blocoIdx];
        if (!b) return prev;
        blocos[defaultEditDecision.blocoIdx] = {
          ...b,
          isDefault: false,
          isCustom: true,
          lockedLevel: 'none',
        };
      } else {
        const b = blocos[defaultEditDecision.blocoIdx];
        if (!b) return prev;
        const linhas = [...b.linhas];
        const l = linhas[defaultEditDecision.linhaIdx ?? -1];
        if (!l) return prev;
        linhas[defaultEditDecision.linhaIdx ?? -1] = {
          ...l,
          isDefault: false,
          isCustom: true,
          lockedLevel: 'none',
        };
        blocos[defaultEditDecision.blocoIdx] = { ...b, linhas };
      }
      return { ...prev, blocos };
    });
    setDefaultEditDecision(null);
  }

  function removeConfirmedTarget() {
    if (!deleteTarget) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const blocos = [...prev.blocos];
      if (deleteTarget.kind === 'bloco') {
        return { ...prev, blocos: blocos.filter((_, i) => i !== deleteTarget.blocoIdx) };
      }
      const b = blocos[deleteTarget.blocoIdx];
      if (!b) return prev;
      blocos[deleteTarget.blocoIdx] = { ...b, linhas: b.linhas.filter((_, i) => i !== deleteTarget.linhaIdx) };
      return { ...prev, blocos };
    });
    setDeleteTarget(null);
  }

  return (
    <div className="max-w-full overflow-x-hidden p-6 space-y-5">
      <Topbar
        title="Controle de Caixa"
        subtitle="Fechamento do mês — comece pelo resumo no topo; expanda os blocos abaixo para lançar valores."
      />

      <FilterBar
        title="Fechamento do mês"
        subtitle="Comece pelo resumo fixo abaixo; expanda os blocos para lançar valores linha a linha."
        periodLabel={mesExtenso(monthYear.mes, monthYear.ano)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Fonte:</span>
          {(
            [
              { id: 'oficial' as const, label: 'Planilha' },
              { id: 'sistema' as const, label: 'Sistema' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => escolherModo(opt.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                modo === opt.id
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          {modo === 'oficial'
            ? 'Modo Planilha: valores migrados do CONTROLE DE CAIXA. Somente leitura — não mistura com a sincronização do extrato.'
            : 'Modo Sistema: valores do extrato classificado e edições manuais. Totais deste modo não somam com a Planilha.'}
        </p>
        {modo === 'sistema' && syncEntradasPermitido ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-100"
              disabled={syncEntradasMutation.isPending}
              onClick={() => syncEntradasMutation.mutate()}
            >
              {syncEntradasMutation.isPending ? 'Sincronizando…' : 'Sincronizar tudo'}
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Totais do mês (competência): só lançamentos classificados deste mês → Controle Sistema.
            </span>
          </div>
        ) : null}
        {modo === 'sistema' && !syncEntradasPermitido ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Sincronização automática a partir de junho/2026. Meses anteriores usam os valores manuais já
            lançados no Controle (modo Sistema).
          </p>
        ) : null}
      </FilterBar>

      {modo === 'sistema' && syncEntradasPermitido && pendenciasClassificacao.totalTx > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            Ainda falta classificar no extrato
          </h2>
          <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">
            {pendenciasClassificacao.totalTx} lançamento
            {pendenciasClassificacao.totalTx === 1 ? '' : 's'} deste mês ainda sem categoria
            {pendenciasClassificacao.totalGrupos > 0
              ? ` (${pendenciasClassificacao.entradasQtd} em Entradas · ${pendenciasClassificacao.despesasQtd} em Despesas)`
              : ''}
            . O sincronizar só leva o que já estiver classificado — o resto fica zerado na linha.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100"
              onClick={() => setMostrarPendentesClassificacao((v) => !v)}
            >
              {mostrarPendentesClassificacao ? 'Ocultar detalhes' : 'Ver o que falta'}
            </button>
            {pendenciasClassificacao.entradasTx > 0 ? (
              <Link
                to="/entradas?foco=pendentes"
                className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900 dark:bg-amber-600 dark:hover:bg-amber-500"
              >
                Classificar entradas →
              </Link>
            ) : null}
            {pendenciasClassificacao.despesasTx > 0 ? (
              <Link
                to="/despesas?foco=pendentes"
                className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900 dark:bg-amber-600 dark:hover:bg-amber-500"
              >
                Classificar despesas →
              </Link>
            ) : null}
          </div>
          {mostrarPendentesClassificacao ? (
            <ul className="mt-3 space-y-1.5 text-sm text-amber-950 dark:text-amber-100">
              <li>
                Entradas: {pendenciasClassificacao.entradasTx} lançamento
                {pendenciasClassificacao.entradasTx === 1 ? '' : 's'} sem categoria
                {pendenciasClassificacao.entradasValor > 0
                  ? ` · ${pendenciasClassificacao.entradasValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                  : ''}
              </li>
              <li>
                Despesas: {pendenciasClassificacao.despesasTx} lançamento
                {pendenciasClassificacao.despesasTx === 1 ? '' : 's'} sem categoria
                {pendenciasClassificacao.despesasValor > 0
                  ? ` · ${pendenciasClassificacao.despesasValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                  : ''}
              </li>
            </ul>
          ) : null}
        </div>
      ) : null}

      {modo === 'sistema' && syncEntradasPermitido && pendenciasClassificacao.totalTx === 0 && (entradasPendQuery.isSuccess || despesasPendQuery.isSuccess) ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          Extrato deste mês: tudo classificado para Entradas e Despesas (competência). Pode sincronizar o Controle Sistema com segurança.
        </p>
      ) : null}
      {controleQuery.isLoading && <div className="text-sm text-gray-500">Carregando dados do mês...</div>}
      {controleQuery.error && (
        <ApiErrorPanel
          message={controleQuery.error instanceof Error ? controleQuery.error.message : 'Erro ao carregar controle.'}
          onRetry={() => controleQuery.refetch()}
        />
      )}

      {draft && modo === 'oficial' && controleQuery.data?.existe === false ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-5 dark:border-sky-800 dark:bg-sky-950/30">
          <h2 className="text-sm font-semibold text-sky-950 dark:text-sky-100">Sem fechamento da planilha neste mês</h2>
          <p className="mt-1 text-sm text-sky-900/80 dark:text-sky-200/80">
            Ainda não há dados migrados da planilha CONTROLE DE CAIXA para{' '}
            {mesExtenso(monthYear.mes, monthYear.ano)}. O modo Sistema continua disponível com a
            sincronização do extrato — os dois modos não se misturam.
          </p>
          <button
            type="button"
            onClick={() => escolherModo('sistema')}
            className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Abrir modo Sistema
          </button>
        </div>
      ) : null}

      {draft && !(modo === 'oficial' && controleQuery.data?.existe === false) && (
        <>
          <section
            className="sticky top-0 z-20 -mx-1 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-md backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95"
            aria-label="Resumo do fechamento"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Resumo do fechamento</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">{mesExtenso(monthYear.mes, monthYear.ano)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                    modo === 'oficial'
                      ? 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200'
                      : 'bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200'
                  }`}
                >
                  {modo === 'oficial' ? 'Planilha' : 'Sistema'}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                    somenteLeitura
                      ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      : isDirty
                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                  }`}
                >
                  {somenteLeitura ? 'Somente leitura' : isDirty ? 'Rascunho não salvo' : 'Salvo'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{lastUpdateLabel}</span>
                <Link
                  to={relatorioMesHref}
                  className="rounded-lg border border-rose-300 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  Ir para relatório do mês →
                </Link>
              </div>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/30">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                  Entradas
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-emerald-950 dark:text-emerald-50">
                  {formatNullableCurrency(totaisCalculados.entradaTotal) || 'R$ 0,00'}
                </p>
                {temComparacaoMesAnterior ? (
                  <p
                    className={`mt-0.5 text-[11px] font-medium ${pctHelperClass(
                      trendFromDelta(totaisCalculados.entradaTotal, entradaPrev),
                    )}`}
                  >
                    vs {prevLabel}: {formatPctChange(totaisCalculados.entradaTotal, entradaPrev) ?? '—'}
                  </p>
                ) : controlePrevQuery.isLoading ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">Comparando com mês anterior…</p>
                ) : null}
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 dark:border-rose-800 dark:bg-rose-950/30">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-800 dark:text-rose-200">Saídas</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-rose-950 dark:text-rose-50">
                  {formatNullableCurrency(totaisCalculados.saidaTotal) || 'R$ 0,00'}
                </p>
                {temComparacaoMesAnterior ? (
                  <p
                    className={`mt-0.5 text-[11px] font-medium ${pctHelperClass(
                      trendFromDelta(totaisCalculados.saidaTotal, saidaPrev),
                      true,
                    )}`}
                  >
                    vs {prevLabel}: {formatPctChange(totaisCalculados.saidaTotal, saidaPrev) ?? '—'}
                  </p>
                ) : controlePrevQuery.isLoading ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">Comparando com mês anterior…</p>
                ) : null}
              </div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2 dark:border-indigo-800 dark:bg-indigo-950/30">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-200">
                  Lucro
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-indigo-950 dark:text-indigo-50">
                  {formatNullableCurrency(totaisCalculados.lucroTotal) || 'R$ 0,00'}
                </p>
                {temComparacaoMesAnterior ? (
                  <p
                    className={`mt-0.5 text-[11px] font-medium ${pctHelperClass(
                      trendFromDelta(totaisCalculados.lucroTotal, lucroPrev),
                    )}`}
                  >
                    vs {prevLabel}: {formatDeltaBrl(totaisCalculados.lucroTotal, lucroPrev) ?? '—'}
                  </p>
                ) : controlePrevQuery.isLoading ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">Comparando com mês anterior…</p>
                ) : null}
              </div>
            </div>

            <details className="mt-2 rounded-lg border border-slate-200/80 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40">
              <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Detalhar por bloco (opcional)
              </summary>
              <div className="grid gap-2 border-t border-slate-200/80 p-2 lg:grid-cols-2 dark:border-slate-700">
                <ul className="space-y-0.5 text-xs text-emerald-900 dark:text-emerald-100">
                  {totaisPorBloco.entradas.map((b) => (
                    <li key={`ent-${b.titulo}`} className="flex justify-between gap-2">
                      <span className="truncate">{b.titulo}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{formatNullableCurrency(b.total) || '—'}</span>
                    </li>
                  ))}
                </ul>
                <ul className="space-y-0.5 text-xs text-rose-900 dark:text-rose-100">
                  {totaisPorBloco.saidas.map((b) => (
                    <li key={`sai-${b.titulo}`} className="flex justify-between gap-2">
                      <span className="truncate">{b.titulo}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{formatNullableCurrency(b.total) || '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </section>

          <ControleCaixaComparacaoPanel
            modoAtivo={modo}
            oficial={oficialParaComparacao}
            sistema={sistemaParaComparacao}
            oficialExiste={oficialExiste}
            sistemaExiste={sistemaExiste}
            loadingOutro={controleOutroQuery.isLoading}
            mostrarPendencias={syncEntradasPermitido}
            pendencias={{
              entradasValor: pendenciasClassificacao.entradasValor,
              despesasValor: pendenciasClassificacao.despesasValor,
              entradasTx: pendenciasClassificacao.entradasTx,
              despesasTx: pendenciasClassificacao.despesasTx,
            }}
          />

          <details className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200">
              Saúde da estrutura e aba de referência
            </summary>
            <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3 dark:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span>
                  Blocos: {stats.totalBlocos} ({stats.defaultBlocos} padrão) · Linhas: {stats.totalLinhas} · Customizadas:{' '}
                  {stats.customLinhas}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">Padrão: {stats.percentPreservado}%</span>
              </div>
              <label className="block text-sm text-slate-700 dark:text-slate-300">
                Aba de referência
                <input
                  value={draft.abaRef}
                  readOnly={somenteLeitura}
                  onChange={(e) => {
                    if (somenteLeitura) return;
                    setDraft((prev) => (prev ? { ...prev, abaRef: e.target.value } : prev));
                  }}
                  className="mt-1 w-full max-w-md rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800 read-only:bg-slate-50 dark:read-only:bg-slate-800/60"
                />
              </label>
            </div>
          </details>

          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Lançamentos do mês</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {draft.blocos.length} bloco(s) — todos começam recolhidos. Expanda o bloco desejado e edite o <strong>valor</strong> na linha.
                </p>
              </div>
              <div className="flex gap-2">
                {somenteLeitura ? (
                  <span className="text-xs text-slate-500">Consulta do fechamento da planilha — sem edição.</span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                blocos: [
                                  ...prev.blocos,
                                  {
                                    tipo: 'entrada',
                                    titulo: 'Novo bloco de entrada',
                                    ordem: prev.blocos.length,
                                    templateKey: null,
                                    isDefault: false,
                                    isCustom: true,
                                    lockedLevel: 'none',
                                    linhas: [],
                                  },
                                ],
                              }
                            : prev
                        )
                      }
                      className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm text-blue-700"
                    >
                      + Bloco entrada
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                blocos: [
                                  ...prev.blocos,
                                  {
                                    tipo: 'saida',
                                    titulo: 'Novo bloco de saída',
                                    ordem: prev.blocos.length,
                                    templateKey: null,
                                    isDefault: false,
                                    isCustom: true,
                                    lockedLevel: 'none',
                                    linhas: [],
                                  },
                                ],
                              }
                            : prev
                        )
                      }
                      className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-700"
                    >
                      + Bloco saída
                    </button>
                  </>
                )}
              </div>
            </div>

            {draft.blocos.length === 0 && (
              <p className="text-sm text-slate-500">Sem blocos ainda para este mês. Use os botões acima para criar.</p>
            )}

            {draft.blocos.map((bloco, blocoIdx) => (
              <details
                key={`${bloco.tipo}-${blocoIdx}`}
                className={`rounded-lg border ${
                  bloco.tipo === 'entrada' ? 'border-emerald-200 bg-emerald-50/30' : 'border-rose-200 bg-rose-50/30'
                }`}
              >
                <summary className="cursor-pointer list-none px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {bloco.titulo || 'Sem título'}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        ({bloco.tipo === 'entrada' ? 'entrada' : 'saída'} · {bloco.linhas.length} linha(s))
                      </span>
                    </span>
                    <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-50">
                      {formatNullableCurrency(sumBloco(bloco)) || 'R$ 0,00'}
                    </span>
                  </div>
                </summary>
                <div className="space-y-3 border-t border-slate-200/80 p-3 dark:border-slate-600">
                <div className="flex flex-wrap items-center gap-2">
                  {bloco.isDefault ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Padrão</span>
                  ) : null}
                  {bloco.isCustom ? (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900">Customizado</span>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="text-sm text-slate-700">
                    Tipo
                    <select
                      value={bloco.tipo}
                      onChange={(e) =>
                        setDraft((prev) => {
                          if (!prev) return prev;
                          const blocos = [...prev.blocos];
                          blocos[blocoIdx] = { ...blocos[blocoIdx], tipo: e.target.value as 'entrada' | 'saida' };
                          return { ...prev, blocos };
                        })
                      }
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                    >
                      <option value="entrada">entrada</option>
                      <option value="saida">saida</option>
                    </select>
                  </label>
                  <label className="text-sm text-slate-700 md:col-span-2">
                    Título
                    <input
                      value={bloco.titulo}
                      onBlur={(e) => {
                        const valor = e.target.value.trim();
                        if (bloco.isDefault && valor && valor !== (controleQuery.data?.blocos[blocoIdx]?.titulo ?? '')) {
                          setDefaultEditDecision({
                            kind: 'bloco',
                            blocoIdx,
                            title: 'Alterar bloco padrão',
                            description: `Você alterou o título do bloco padrão "${bloco.titulo}". Deseja manter como padrão no mês ou converter para customizado?`,
                          });
                        }
                      }}
                      onChange={(e) =>
                        setDraft((prev) => {
                          if (!prev) return prev;
                          const blocos = [...prev.blocos];
                          blocos[blocoIdx] = { ...blocos[blocoIdx], titulo: e.target.value };
                          return { ...prev, blocos };
                        })
                      }
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  {bloco.linhas.map((linha, linhaIdx) => (
                    <div
                      key={`${blocoIdx}-${linhaIdx}`}
                      className="flex flex-col gap-2 rounded-md border border-slate-200/80 bg-white/80 p-2 sm:flex-row sm:items-center dark:border-slate-600 dark:bg-slate-900/40"
                    >
                      <div className="flex shrink-0 items-center gap-1 sm:w-8 sm:justify-center">
                        {linha.isDefault ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">P</span>
                        ) : linha.isCustom ? (
                          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-900">C</span>
                        ) : null}
                      </div>
                      <input
                        value={linha.label}
                        onChange={(e) =>
                          setDraft((prev) => {
                            if (!prev) return prev;
                            const blocos = [...prev.blocos];
                            const linhas = [...blocos[blocoIdx].linhas];
                            linhas[linhaIdx] = { ...linhas[linhaIdx], label: e.target.value };
                            blocos[blocoIdx] = { ...blocos[blocoIdx], linhas };
                            return { ...prev, blocos };
                          })
                        }
                        className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                        onBlur={(e) => {
                          const valor = e.target.value.trim();
                          if (linha.isDefault && valor && valor !== (controleQuery.data?.blocos[blocoIdx]?.linhas[linhaIdx]?.label ?? '')) {
                            setDefaultEditDecision({
                              kind: 'linha',
                              blocoIdx,
                              linhaIdx,
                              title: 'Alterar linha padrão',
                              description: `Você alterou a linha padrão "${linha.label}". Deseja manter como padrão no mês ou converter para customizada?`,
                            });
                          }
                        }}
                        placeholder="Descrição"
                        aria-label="Descrição da linha"
                      />
                      <input
                        value={formatNullableCurrency(linha.valor)}
                        readOnly={linhaValorSomenteLeitura(bloco, linha, somenteLeitura)}
                        title={linhaValorHint(bloco, linha)}
                        onClick={() => {
                          if (linhaValorSomenteLeitura(bloco, linha, somenteLeitura)) {
                            abrirComposicao(bloco, linha);
                          }
                        }}
                        onChange={(e) => {
                          if (linhaValorSomenteLeitura(bloco, linha, somenteLeitura)) return;
                          setDraft((prev) => {
                            if (!prev) return prev;
                            const blocos = [...prev.blocos];
                            const linhas = [...blocos[blocoIdx].linhas];
                            linhas[linhaIdx] = {
                              ...linhas[linhaIdx],
                              valor: parseNullableNumber(e.target.value),
                              valorTexto: null,
                            };
                            blocos[blocoIdx] = { ...blocos[blocoIdx], linhas };
                            return { ...prev, blocos };
                          });
                        }}
                        className={`w-full shrink-0 rounded border px-2 py-1.5 text-sm tabular-nums sm:w-40 dark:border-slate-600 ${
                          linhaValorSomenteLeitura(bloco, linha, somenteLeitura)
                            ? 'cursor-pointer border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80'
                            : 'border-slate-300 bg-white dark:bg-slate-800'
                        }`}
                        placeholder="R$ 0,00"
                        inputMode="decimal"
                        aria-label={`Valor — ${linha.label}`}
                      />
                      <button
                        type="button"
                        onClick={() => abrirComposicao(bloco, linha)}
                        className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                        title="Ver transações ou fórmula que formam este valor"
                      >
                        Composição
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({
                            kind: 'linha',
                            blocoIdx,
                            linhaIdx,
                            label: linha.label,
                            strong: linha.lockedLevel === 'strong' || linha.isDefault === true,
                          })
                        }
                        className="shrink-0 rounded border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) => {
                        if (!prev) return prev;
                        const blocos = [...prev.blocos];
                        const linhas = [...blocos[blocoIdx].linhas];
                        linhas.push({
                          label: 'Nova linha',
                          valor: null,
                          valorTexto: null,
                          ordem: linhas.length,
                          templateKey: null,
                          isDefault: false,
                          isCustom: true,
                          lockedLevel: 'none',
                        });
                        blocos[blocoIdx] = { ...blocos[blocoIdx], linhas };
                        return { ...prev, blocos };
                      })
                    }
                    className="rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-700"
                  >
                    + Linha
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteTarget({
                        kind: 'bloco',
                        blocoIdx,
                        titulo: bloco.titulo,
                        strong: bloco.lockedLevel === 'strong' || bloco.isDefault === true,
                      })
                    }
                    className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-700"
                  >
                    Excluir bloco
                  </button>
                </div>
                </div>
              </details>
            ))}
          </section>

          {!somenteLeitura ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDraft(createDefaultDraft())}
                className="rounded border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Restaurar estrutura padrão
              </button>
              <button
                type="button"
                onClick={() => setDraft(controleQuery.data ? cloneState(controleQuery.data) : null)}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
              >
                Descartar rascunho
              </button>
              <button
                type="button"
                disabled={!isDirty || saveMutation.isPending}
                onClick={() => draft && saveMutation.mutate(draft)}
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Salvando...' : 'Salvar no Supabase'}
              </button>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={deleteTarget != null}
        title={deleteTarget?.kind === 'bloco' ? 'Excluir bloco?' : 'Excluir linha?'}
        message={
          deleteTarget?.kind === 'bloco'
            ? `${deleteTarget.strong ? 'Este bloco é padrão e protegido.' : ''} Excluir o bloco "${deleteTarget.titulo}"?`
            : `${deleteTarget?.strong ? 'Esta linha é padrão e protegida.' : ''} Excluir a linha "${deleteTarget?.label ?? ''}"?`
        }
        confirmLabel={deleteTarget?.strong ? 'Excluir mesmo assim' : 'Excluir'}
        danger={deleteTarget?.strong}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={removeConfirmedTarget}
      />

      {defaultEditDecision ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">{defaultEditDecision.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{defaultEditDecision.description}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDefaultEditDecision(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
              >
                Manter padrão no mês
              </button>
              <button
                type="button"
                onClick={applyDefaultDecisionConvertToCustom}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white"
              >
                Converter para customizado
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ControleLinhaComposicaoModal
        open={!!composicaoTarget}
        onClose={() => setComposicaoTarget(null)}
        mes={monthYear.mes}
        ano={monthYear.ano}
        modo={modo}
        target={composicaoTarget}
      />
    </div>
  );
}
