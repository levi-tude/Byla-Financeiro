import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PeriodoMesCalendarioPopover } from '../components/transacoes/PeriodoMesCalendarioPopover';
import { ResumoDiaValorHover, type ResumoDiaLinhaDetalhe } from '../components/transacoes/ResumoDiaValorHover';
import { TransacoesDailyFlowChart } from '../components/charts/TransacoesDailyFlowChart';
import { Topbar } from '../app/Topbar';
import { useMonthYear } from '../context/MonthYearContext';
import { getTransacoesPorMes, type TransacaoItem } from '../services/backendApi';
import { FilterBar } from '../components/finance/FilterBar';
import { KpiStrip } from '../components/finance/KpiStrip';
import { DataTable } from '../components/finance/DataTable';
import { StatusBadge } from '../components/finance/StatusBadge';
import { EmptyState, ErrorPanel, LoadingRow } from '../components/finance/StateBlocks';

const METODOS: Array<TransacaoItem['metodo']> = [
  'PIX',
  'Crédito',
  'Débito',
  'Transferência',
  'Boleto',
  'Dinheiro',
  'Outros',
];

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(s: string): string {
  if (!s) return '–';
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('pt-BR');
}

/** Mês por extenso + ano, ex.: "Março de 2026" */
function formatCompetenciaTitulo(mes: number, ano: number): string {
  const d = new Date(ano, mes - 1, 1);
  const s = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ordenarDatasIso(a: string, b: string): { min: string; max: string } {
  return a <= b ? { min: a, max: b } : { min: b, max: a };
}

type SavedView = {
  id: string;
  nome: string;
  fixa?: boolean;
  filtros: {
    tipo: 'todos' | 'entrada' | 'saida';
    metodo: string;
    busca: string;
    periodoModo: 'mes' | 'periodo';
    periodoInicio: string;
    periodoFim: string;
  };
};

const SAVED_VIEWS_KEY = 'byla.transacoes.savedViews.v1';
const DEFAULT_SAVED_VIEWS: SavedView[] = [
  {
    id: 'view-mes-completo',
    nome: 'Mês completo',
    fixa: true,
    filtros: {
      tipo: 'todos',
      metodo: '',
      busca: '',
      periodoModo: 'mes',
      periodoInicio: '',
      periodoFim: '',
    },
  },
  {
    id: 'view-entradas-pix',
    nome: 'Entradas PIX',
    fixa: true,
    filtros: {
      tipo: 'entrada',
      metodo: 'PIX',
      busca: '',
      periodoModo: 'mes',
      periodoInicio: '',
      periodoFim: '',
    },
  },
  {
    id: 'view-saidas',
    nome: 'Saídas do mês',
    fixa: true,
    filtros: {
      tipo: 'saida',
      metodo: '',
      busca: '',
      periodoModo: 'mes',
      periodoInicio: '',
      periodoFim: '',
    },
  },
];

function garantirViewsPadrao(views: SavedView[]): SavedView[] {
  const map = new Map(views.map((v) => [v.id, v] as const));
  for (const base of DEFAULT_SAVED_VIEWS) {
    const atual = map.get(base.id);
    if (!atual) {
      map.set(base.id, base);
      continue;
    }
    map.set(base.id, { ...base, filtros: atual.filtros, fixa: true });
  }
  const merged = [...map.values()];
  const fixas = merged.filter((v) => v.fixa).sort((a, b) => DEFAULT_SAVED_VIEWS.findIndex((d) => d.id === a.id) - DEFAULT_SAVED_VIEWS.findIndex((d) => d.id === b.id));
  const custom = merged.filter((v) => !v.fixa);
  return [...fixas, ...custom];
}

export function TransacoesPage() {
  const { monthYear } = useMonthYear();
  const [tipo, setTipo] = useState<'todos' | 'entrada' | 'saida'>('todos');
  const [metodo, setMetodo] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [periodoModo, setPeriodoModo] = useState<'mes' | 'periodo'>('mes');
  /** Intervalo inclusivo (yyyy-mm-dd); dois cliques no calendário dos filtros. */
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  /** Primeiro clique aguardando o segundo (mesmo mês). */
  const [periodoCliquePendente, setPeriodoCliquePendente] = useState<string | null>(null);
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [novaViewNome, setNovaViewNome] = useState('');
  const calendarioPopoverRef = useRef<HTMLDivElement>(null);
  const calendarioTriggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPeriodoInicio('');
    setPeriodoFim('');
    setPeriodoCliquePendente(null);
    setCalendarioAberto(false);
    setPeriodoModo('mes');
  }, [monthYear.mes, monthYear.ano]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (calendarioAberto) {
        setCalendarioAberto(false);
        return;
      }
      if (periodoCliquePendente) setPeriodoCliquePendente(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [periodoCliquePendente, calendarioAberto]);

  useEffect(() => {
    if (!calendarioAberto) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (calendarioPopoverRef.current?.contains(t)) return;
      if (calendarioTriggerRef.current?.contains(t)) return;
      setCalendarioAberto(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [calendarioAberto]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_VIEWS_KEY);
      if (!raw) {
        setSavedViews(garantirViewsPadrao(DEFAULT_SAVED_VIEWS));
        return;
      }
      const parsed = JSON.parse(raw) as SavedView[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setSavedViews(garantirViewsPadrao(parsed));
      } else {
        setSavedViews(garantirViewsPadrao(DEFAULT_SAVED_VIEWS));
      }
    } catch {
      setSavedViews(garantirViewsPadrao(DEFAULT_SAVED_VIEWS));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(savedViews));
  }, [savedViews]);

  const apiExtra = useMemo(() => {
    let dia: string | undefined;
    let dia_fim: string | undefined;
    if (periodoModo === 'periodo' && periodoInicio && periodoFim) {
      const { min, max } = ordenarDatasIso(periodoInicio, periodoFim);
      if (min === max) {
        dia = min;
      } else {
        dia = min;
        dia_fim = max;
      }
    }
    return {
      metodo: metodo || undefined,
      q: busca.trim() || undefined,
      dia,
      dia_fim,
      limit: 300,
      offset: 0,
    };
  }, [metodo, busca, periodoModo, periodoInicio, periodoFim]);

  const periodoLegivel = useMemo(() => {
    if (!periodoInicio || !periodoFim) return null;
    const { min, max } = ordenarDatasIso(periodoInicio, periodoFim);
    if (min === max) return formatDate(min);
    return `${formatDate(min)} — ${formatDate(max)}`;
  }, [periodoInicio, periodoFim]);

  const handlePeriodoDiaCalendario = useCallback((dataIso: string) => {
    setPeriodoCliquePendente((pend) => {
      if (!pend) return dataIso;
      const { min, max } = ordenarDatasIso(pend, dataIso);
      setPeriodoInicio(min);
      setPeriodoFim(max);
      window.setTimeout(() => setCalendarioAberto(false), 0);
      return null;
    });
  }, []);

  const limparPeriodoDias = useCallback(() => {
    setPeriodoInicio('');
    setPeriodoFim('');
    setPeriodoCliquePendente(null);
    setCalendarioAberto(false);
  }, []);

  const diaFiltradoResumo = useMemo(() => {
    if (periodoModo !== 'periodo' || !periodoInicio || !periodoFim) return null;
    const { min, max } = ordenarDatasIso(periodoInicio, periodoFim);
    return min === max ? min : null;
  }, [periodoModo, periodoInicio, periodoFim]);

  const aplicarFiltroDiaNaData = useCallback(
    (iso: string) => {
      if (diaFiltradoResumo === iso) {
        limparPeriodoDias();
        setPeriodoModo('mes');
        return;
      }
      setPeriodoModo('periodo');
      setPeriodoInicio(iso);
      setPeriodoFim(iso);
      setPeriodoCliquePendente(null);
      setCalendarioAberto(false);
    },
    [diaFiltradoResumo, limparPeriodoDias]
  );

  const getDiaCalendarioClasse = useCallback(
    (iso: string) => {
      const base =
        'border border-transparent text-slate-800 hover:border-indigo-300 hover:bg-indigo-50/90 dark:text-slate-100 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/40';
      if (periodoCliquePendente === iso) {
        return `${base} border-indigo-500 bg-indigo-100 text-indigo-950 ring-2 ring-indigo-400 dark:border-indigo-400 dark:bg-indigo-900/70 dark:text-indigo-50`;
      }
      if (periodoInicio && periodoFim) {
        const { min, max } = ordenarDatasIso(periodoInicio, periodoFim);
        if (iso >= min && iso <= max) {
          return `${base} border-indigo-200 bg-indigo-50 text-indigo-950 dark:border-indigo-700 dark:bg-indigo-950/45 dark:text-indigo-100`;
        }
      }
      return base;
    },
    [periodoCliquePendente, periodoInicio, periodoFim]
  );

  const query = useQuery({
    queryKey: ['transacoes-unificadas', monthYear.mes, monthYear.ano, tipo, apiExtra],
    queryFn: () => getTransacoesPorMes(monthYear.mes, monthYear.ano, tipo, apiExtra),
  });

  const data = query.data;
  const itens = data?.itens ?? [];
  const resumoGeral = data?.resumo_geral ?? {
    total_entradas: 0,
    total_saidas: 0,
    saldo_liquido: 0,
    quantidade_total: 0,
  };
  const resumoPorDia = data?.resumo_por_dia ?? [];
  const resumoPorMetodo = data?.resumo_por_metodo ?? [];

  const competenciaTitulo = useMemo(
    () => formatCompetenciaTitulo(monthYear.mes, monthYear.ano),
    [monthYear.mes, monthYear.ano]
  );
  const competenciaNumerica = `${String(monthYear.mes).padStart(2, '0')}/${monthYear.ano}`;
  const competenciaRef = `Competência: ${competenciaTitulo} (${competenciaNumerica})`;

  /** Fallback quando API antiga não envia `linhas` no resumo (usa só os itens já carregados). */
  const linhasPorDiaFallback = useMemo(() => {
    const map = new Map<string, ResumoDiaLinhaDetalhe[]>();
    for (const t of itens) {
      const lista = map.get(t.data) ?? [];
      lista.push({
        pessoa: t.pessoa,
        valor: Math.abs(Number(t.valor || 0)),
        tipo: t.tipo,
        descricao: t.descricao,
        metodo: t.metodo,
      });
      map.set(t.data, lista);
    }
    return map;
  }, [itens]);

  const linhasDoDia = useCallback(
    (dataIso: string, linhasApi?: ResumoDiaLinhaDetalhe[]) => {
      if (linhasApi && linhasApi.length > 0) return linhasApi;
      return linhasPorDiaFallback.get(dataIso) ?? [];
    },
    [linhasPorDiaFallback]
  );

  const chartData = useMemo(
    () =>
      resumoPorDia
        .filter((r) => typeof r.data === 'string' && r.data.length >= 10)
        .slice()
        .reverse()
        .map((r) => ({
          dataIso: r.data,
          dia: r.data.slice(8, 10),
          entradas: Number(r.entradas || 0),
          saidas: Number(r.saidas || 0),
        })),
    [resumoPorDia]
  );

  const limparFiltros = () => {
    setTipo('todos');
    setMetodo('');
    setBusca('');
    setPeriodoModo('mes');
    limparPeriodoDias();
  };

  const salvarViewAtual = useCallback(() => {
    const nome = novaViewNome.trim();
    if (!nome) return;
    const nova: SavedView = {
      id: `${Date.now()}`,
      nome,
      filtros: {
        tipo,
        metodo,
        busca: busca.trim(),
        periodoModo,
        periodoInicio,
        periodoFim,
      },
    };
    setSavedViews((prev) => [nova, ...prev.filter((v) => v.nome.toLowerCase() !== nome.toLowerCase())]);
    setNovaViewNome('');
  }, [novaViewNome, tipo, metodo, busca, periodoModo, periodoInicio, periodoFim]);

  const aplicarView = useCallback(
    (view: SavedView) => {
      setTipo(view.filtros.tipo);
      setMetodo(view.filtros.metodo);
      setBusca(view.filtros.busca);
      setPeriodoModo(view.filtros.periodoModo);
      setPeriodoInicio(view.filtros.periodoInicio);
      setPeriodoFim(view.filtros.periodoFim);
      setPeriodoCliquePendente(null);
      setCalendarioAberto(false);
    },
    []
  );

  const excluirView = useCallback((id: string) => {
    setSavedViews((prev) => prev.filter((v) => !(v.id === id && v.fixa)));
  }, []);

  const filtrosAtivos = useMemo(() => {
    const chips: Array<{ id: string; label: string; onRemove?: () => void }> = [];
    if (tipo !== 'todos') chips.push({ id: 'tipo', label: `Tipo: ${tipo}`, onRemove: () => setTipo('todos') });
    if (metodo) chips.push({ id: 'metodo', label: `Método: ${metodo}`, onRemove: () => setMetodo('') });
    if (busca.trim()) chips.push({ id: 'busca', label: `Busca: ${busca.trim()}`, onRemove: () => setBusca('') });
    if (periodoModo === 'periodo' && periodoLegivel) {
      chips.push({ id: 'periodo', label: `Período: ${periodoLegivel}`, onRemove: limparPeriodoDias });
    }
    return chips;
  }, [tipo, metodo, busca, periodoModo, periodoLegivel, limparPeriodoDias]);

  const kpiItems = useMemo(
    () => [
      {
        label: 'Entrou',
        value: formatCurrency(resumoGeral.total_entradas),
        helperText: competenciaRef,
        isLoading: query.isLoading,
        accentColor: 'success' as const,
      },
      {
        label: 'Saiu',
        value: formatCurrency(resumoGeral.total_saidas),
        helperText: competenciaRef,
        isLoading: query.isLoading,
        accentColor: 'danger' as const,
      },
      {
        label: 'Saldo líquido',
        value: formatCurrency(resumoGeral.saldo_liquido),
        helperText: competenciaRef,
        isLoading: query.isLoading,
      },
      {
        label: 'Nº transações',
        value: String(resumoGeral.quantidade_total),
        helperText: competenciaRef,
        isLoading: query.isLoading,
      },
    ],
    [resumoGeral, competenciaRef, query.isLoading]
  );

  return (
    <div className="p-6 space-y-6">
      <Topbar
        title="Transações"
        subtitle="Extrato unificado de entradas e saídas do Supabase. A competência é a do seletor no topo da página."
      />

      <section
        className="rounded-xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50 via-white to-slate-50 px-4 py-3.5 shadow-sm ring-1 ring-indigo-500/10 dark:border-indigo-800/60 dark:from-indigo-950/50 dark:via-slate-900 dark:to-slate-950 dark:ring-indigo-400/10"
        aria-label={`Competência: ${competenciaTitulo}`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0 space-y-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-700 dark:text-indigo-400">
              Mês selecionado no painel
            </p>
            <p className="truncate text-xl font-bold capitalize tracking-tight text-slate-900 sm:text-2xl dark:text-slate-50">
              {competenciaTitulo}
            </p>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Tabelas, totais e gráfico abaixo usam só este mês. Para mudar, use o seletor <strong className="font-semibold text-slate-800 dark:text-slate-200">Mês</strong> na barra fixa no topo (ao lado de Atalhos).
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
            <span className="rounded-lg border border-indigo-200/80 bg-white/90 px-3 py-2 text-center text-sm font-bold tabular-nums text-indigo-950 shadow-sm dark:border-indigo-700/80 dark:bg-slate-800/90 dark:text-indigo-100">
              {competenciaNumerica}
            </span>
          </div>
        </div>
      </section>

      <FilterBar
        title="Filtros"
        subtitle={competenciaRef}
        periodLabel={periodoModo === 'periodo' && periodoLegivel ? `Período ativo: ${periodoLegivel}` : undefined}
        chips={filtrosAtivos}
        onClear={limparFiltros}
      >
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/30">
          <p className="mb-2 text-xs font-semibold text-indigo-900 dark:text-indigo-100">Views salvas</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={novaViewNome}
              onChange={(e) => setNovaViewNome(e.target.value)}
              placeholder="Ex.: Fechamento semanal"
              className="w-52 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs dark:border-indigo-700 dark:bg-slate-900"
            />
            <button
              type="button"
              onClick={salvarViewAtual}
              disabled={!novaViewNome.trim()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Salvar view
            </button>
            {savedViews.length === 0 ? (
              <span className="text-xs text-slate-600 dark:text-slate-300">Sem views salvas ainda.</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {savedViews.map((view) => (
                  <div key={view.id} className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2 py-1 text-xs dark:border-indigo-700 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => aplicarView(view)}
                      className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                    >
                      {view.nome}
                    </button>
                    {!view.fixa ? (
                      <button
                        type="button"
                        onClick={() => excluirView(view.id)}
                        className="text-slate-500 hover:text-rose-600 dark:text-slate-300 dark:hover:text-rose-300"
                        aria-label={`Excluir view ${view.nome}`}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as 'todos' | 'entrada' | 'saida')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="todos">Todos</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Método</label>
            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {METODOS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="relative md:col-span-2" ref={calendarioTriggerRef}>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Período no mês</label>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPeriodoModo('mes');
                  limparPeriodoDias();
                }}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  periodoModo === 'mes'
                    ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'
                }`}
              >
                Por mês
              </button>
              <button
                type="button"
                onClick={() => setPeriodoModo('periodo')}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  periodoModo === 'periodo'
                    ? 'bg-indigo-600 text-white'
                    : 'border border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300'
                }`}
              >
                Por período
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCalendarioAberto((v) => !v)}
                disabled={periodoModo !== 'periodo'}
                className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 shadow-sm hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-100 dark:hover:bg-indigo-900/60"
                aria-expanded={calendarioAberto}
                aria-haspopup="dialog"
              >
                {calendarioAberto ? 'Fechar calendário' : 'Escolher período…'}
              </button>
              {periodoModo === 'periodo' && periodoLegivel ? (
                <span className="text-xs font-medium tabular-nums text-slate-700 dark:text-slate-200">{periodoLegivel}</span>
              ) : null}
              <button
                type="button"
                onClick={limparPeriodoDias}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                disabled={!periodoInicio && !periodoFim && !periodoCliquePendente}
              >
                Limpar período
              </button>
            </div>
            {periodoModo === 'periodo' ? (
              <PeriodoMesCalendarioPopover
                mes={monthYear.mes}
                ano={monthYear.ano}
                aberto={calendarioAberto}
                onFechar={() => setCalendarioAberto(false)}
                onDiaClick={handlePeriodoDiaCalendario}
                getDiaClasse={getDiaCalendarioClasse}
                popoverRef={calendarioPopoverRef}
              />
            ) : null}
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Pesquisa</label>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pessoa ou descrição"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </FilterBar>

      <KpiStrip items={kpiItems} />

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Resumo por dia</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {competenciaRef}
              {diaFiltradoResumo ? (
                <>
                  {' '}
                  · Filtrando: <strong>{formatDate(diaFiltradoResumo)}</strong>
                  <button
                    type="button"
                    onClick={() => {
                      limparPeriodoDias();
                      setPeriodoModo('mes');
                    }}
                    className="ml-1 font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                  >
                    ver mês inteiro
                  </button>
                </>
              ) : (
                <> · Clique na <strong>data</strong> para ver só aquele dia · passe o mouse nos valores para a composição</>
              )}
            </p>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-100 dark:border-slate-700">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-white/95 text-left text-slate-600 shadow-[0_1px_0_0_rgb(226,232,240)] backdrop-blur-sm dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-300 dark:shadow-[0_1px_0_0_rgb(71,85,105)]">
                  <th className="whitespace-nowrap py-2.5 pl-2 pr-2 text-xs font-semibold uppercase tracking-wide">Data</th>
                  <th className="whitespace-nowrap py-2.5 pr-2 text-right text-xs font-semibold uppercase tracking-wide">Entradas</th>
                  <th className="whitespace-nowrap py-2.5 pr-2 text-right text-xs font-semibold uppercase tracking-wide">Saídas</th>
                  <th className="whitespace-nowrap py-2.5 pr-2 text-right text-xs font-semibold uppercase tracking-wide">Saldo</th>
                  <th className="whitespace-nowrap py-2.5 pr-2 text-right text-xs font-semibold uppercase tracking-wide">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {resumoPorDia.map((r) => {
                  const linhas = linhasDoDia(r.data, r.linhas);
                  const dataLabel = formatDate(r.data);
                  const diaSelecionado = diaFiltradoResumo === r.data;
                  return (
                    <tr
                      key={r.data}
                      className={`border-b border-slate-100 dark:border-slate-800 ${
                        diaSelecionado ? 'bg-indigo-50/70 dark:bg-indigo-950/35' : ''
                      }`}
                    >
                      <td className="py-2 pl-2 pr-2">
                        <button
                          type="button"
                          onClick={() => aplicarFiltroDiaNaData(r.data)}
                          title={
                            diaSelecionado
                              ? 'Clique para voltar ao mês inteiro'
                              : 'Clique para ver transações só deste dia'
                          }
                          className={`rounded-md px-1.5 py-0.5 text-left font-medium transition-colors ${
                            diaSelecionado
                              ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                              : 'text-indigo-800 underline decoration-indigo-300/80 underline-offset-2 hover:bg-indigo-50 dark:text-indigo-200 dark:hover:bg-indigo-950/50'
                          }`}
                        >
                          {dataLabel}
                        </button>
                      </td>
                      <td className="py-2 pr-2 text-right text-emerald-700 dark:text-emerald-400">
                        <ResumoDiaValorHover
                          valorExibido={formatCurrency(r.entradas)}
                          linhas={linhas}
                          modo="entradas"
                          dataLabel={dataLabel}
                          className="text-emerald-700 dark:text-emerald-400"
                        />
                      </td>
                      <td className="py-2 pr-2 text-right text-rose-700 dark:text-rose-400">
                        <ResumoDiaValorHover
                          valorExibido={formatCurrency(r.saidas)}
                          linhas={linhas}
                          modo="saidas"
                          dataLabel={dataLabel}
                          className="text-rose-700 dark:text-rose-400"
                        />
                      </td>
                      <td
                        className={`py-2 pr-2 text-right ${r.saldo >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}
                      >
                        <ResumoDiaValorHover
                          valorExibido={formatCurrency(r.saldo)}
                          linhas={linhas}
                          modo="saldo"
                          dataLabel={dataLabel}
                          className={r.saldo >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}
                        />
                      </td>
                      <td className="py-2 pr-2 text-right text-slate-700 dark:text-slate-300">
                        <ResumoDiaValorHover
                          valorExibido={String(r.qtd)}
                          linhas={linhas}
                          modo="qtd"
                          dataLabel={dataLabel}
                          className="text-slate-700 dark:text-slate-300"
                        />
                      </td>
                    </tr>
                  );
                })}
                {resumoPorDia.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-500">
                      Sem dados para o filtro atual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 space-y-0.5">
            <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Fluxo diário no mês
            </h3>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {competenciaRef}. Barras agrupadas por dia civil — entradas e saídas em valores do filtro atual. Passe o cursor para ver totais e
              saldo do dia.
            </p>
          </div>
          <TransacoesDailyFlowChart
            data={chartData}
            isLoading={query.isLoading}
            emptyMessage="Ajuste o mês no topo da página ou limpe os filtros para ver o movimento diário."
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Resumo por método de pagamento</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{competenciaRef}</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-2">Método</th>
                <th className="py-2 pr-2 text-right">Entradas (qtd)</th>
                <th className="py-2 pr-2 text-right">Entradas (valor)</th>
                <th className="py-2 pr-2 text-right">Saídas (qtd)</th>
                <th className="py-2 pr-2 text-right">Saídas (valor)</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {resumoPorMetodo.map((r) => (
                <tr key={r.metodo} className="border-b border-slate-100">
                  <td className="py-2 pr-2 font-medium">{r.metodo}</td>
                  <td className="py-2 pr-2 text-right">{r.entradas_qtd}</td>
                  <td className="py-2 pr-2 text-right text-emerald-700">{formatCurrency(r.entradas_valor)}</td>
                  <td className="py-2 pr-2 text-right">{r.saidas_qtd}</td>
                  <td className="py-2 pr-2 text-right text-rose-700">{formatCurrency(r.saidas_valor)}</td>
                  <td className="py-2 text-right font-medium">{formatCurrency(r.total_valor)}</td>
                </tr>
              ))}
              {resumoPorMetodo.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    Sem dados para o filtro atual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <DataTable
        title="Últimas transações"
        subtitle={`${competenciaRef} · Limite: 300 linhas · ${competenciaNumerica}`}
        rows={itens}
        columns={[
          {
            id: 'data',
            header: 'Data',
            sticky: true,
            render: (t) => <span className="font-medium">{formatDate(t.data)}</span>,
          },
          {
            id: 'tipo',
            header: 'Tipo',
            render: (t) => (
              <StatusBadge
                tone={t.tipo === 'entrada' ? 'ok' : 'pendente'}
                label={t.tipo === 'entrada' ? 'Entrada' : 'Saída'}
              />
            ),
          },
          { id: 'pessoa', header: 'Pessoa', render: (t) => t.pessoa || '–' },
          { id: 'descricao', header: 'Descrição', render: (t) => t.descricao || '–' },
          { id: 'metodo', header: 'Método', optional: true, render: (t) => ('metodo' in t && t.metodo ? t.metodo : '—') },
          {
            id: 'valor',
            header: 'Valor',
            align: 'right',
            render: (t) => (
              <span className={`font-medium ${t.tipo === 'entrada' ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatCurrency(Math.abs(Number(t.valor || 0)))}
              </span>
            ),
          },
        ]}
        loadingRows={query.isLoading ? <LoadingRow colSpan={6} rows={5} /> : undefined}
        emptyBlock={<EmptyState message="Sem transações para os filtros selecionados." />}
      />
      {query.error ? (
        <ErrorPanel message={query.error instanceof Error ? query.error.message : 'Erro ao carregar transações.'} />
      ) : null}
    </div>
  );
}

