import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '../app/Topbar';
import { MonthYearPicker } from '../components/ui/MonthYearPicker';
import { useMonthYear } from '../context/MonthYearContext';
import {
  getControleCaixa,
  putControleCaixa,
  type ControleCaixaBloco,
  type ControleCaixaResponse,
} from '../services/backendApi';
import { useToast } from '../context/ToastContext';
import { ApiErrorPanel } from '../components/ui/ApiErrorPanel';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Link } from 'react-router-dom';
import { FilterBar } from '../components/finance/FilterBar';
import {
  formatDeltaBrl,
  formatPctChange,
  labelMesAno,
  mesExtenso,
  previousMonth,
} from '../logic/overviewDashboard';

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
  const blocos: ControleCaixaBloco[] = [
    {
      tipo: 'entrada',
      titulo: 'Entradas Parceiros',
      ordem: 0,
      templateKey: 'entrada_parceiros',
      isDefault: true,
      isCustom: false,
      lockedLevel: 'strong',
      linhas: [
        'Pilates',
        'Dança',
        'Teatro',
        'Yoga',
        'Funcional',
        'Outros parceiros',
      ].map((label, ordem) => ({
        label,
        valor: null,
        valorTexto: null,
        ordem,
        templateKey: `ent_parc_${ordem}`,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'warn',
      })),
    },
    {
      tipo: 'entrada',
      titulo: 'Entradas Aluguel / Coworking',
      ordem: 1,
      templateKey: 'entrada_aluguel_coworking',
      isDefault: true,
      isCustom: false,
      lockedLevel: 'strong',
      linhas: ['Aluguel sala 1', 'Aluguel sala 2', 'Coworking', 'Outras entradas aluguel'].map((label, ordem) => ({
        label,
        valor: null,
        valorTexto: null,
        ordem,
        templateKey: `ent_alug_${ordem}`,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'warn',
      })),
    },
    {
      tipo: 'saida',
      titulo: 'Total Saídas (Parceiros)',
      ordem: 2,
      templateKey: 'saida_parceiros',
      isDefault: true,
      isCustom: false,
      lockedLevel: 'strong',
      linhas: ['Repasse Pilates', 'Repasse Dança', 'Repasse Teatro', 'Repasse Yoga', 'Repasse Funcional', 'Outros repasses'].map(
        (label, ordem) => ({
          label,
          valor: null,
          valorTexto: null,
          ordem,
          templateKey: `sai_parc_${ordem}`,
          isDefault: true,
          isCustom: false,
          lockedLevel: 'warn',
        })
      ),
    },
    {
      tipo: 'saida',
      titulo: 'Gastos Fixos',
      ordem: 3,
      templateKey: 'saida_gastos_fixos',
      isDefault: true,
      isCustom: false,
      lockedLevel: 'strong',
      linhas: [
        'Aluguel',
        'Energia',
        'Água',
        'Internet',
        'Salários / Pró-labore',
        'Impostos e taxas',
        'Sistemas / assinaturas',
        'Marketing',
        'Outros gastos fixos',
      ].map((label, ordem) => ({
        label,
        valor: null,
        valorTexto: null,
        ordem,
        templateKey: `sai_fix_${ordem}`,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'warn',
      })),
    },
    {
      tipo: 'saida',
      titulo: 'Saídas Aluguel',
      ordem: 4,
      templateKey: 'saida_aluguel',
      isDefault: true,
      isCustom: false,
      lockedLevel: 'strong',
      linhas: ['Limpeza', 'Manutenção', 'Condomínio', 'Outras saídas aluguel'].map((label, ordem) => ({
        label,
        valor: null,
        valorTexto: null,
        ordem,
        templateKey: `sai_alug_${ordem}`,
        isDefault: true,
        isCustom: false,
        lockedLevel: 'warn',
      })),
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

export function ControleCaixaPage() {
  const { monthYear } = useMonthYear();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [defaultEditDecision, setDefaultEditDecision] = useState<DefaultEditDecision>(null);

  const mesAnterior = useMemo(
    () => previousMonth(monthYear.mes, monthYear.ano),
    [monthYear.mes, monthYear.ano],
  );
  const prevLabel = labelMesAno(mesAnterior.mes, mesAnterior.ano);
  const relatorioMesHref = `/relatorios-ia?tipo=mensal_operacional&mes=${monthYear.mes}&ano=${monthYear.ano}`;

  const controleQuery = useQuery({
    queryKey: ['controle-caixa', monthYear.mes, monthYear.ano],
    queryFn: () => getControleCaixa(monthYear.mes, monthYear.ano),
  });

  const controlePrevQuery = useQuery({
    queryKey: ['controle-caixa', mesAnterior.mes, mesAnterior.ano],
    queryFn: () => getControleCaixa(mesAnterior.mes, mesAnterior.ano),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (controleQuery.data) {
      setDraft(cloneState(controleQuery.data));
    }
  }, [controleQuery.data]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [monthYear.mes, monthYear.ano]);

  const saveMutation = useMutation({
    mutationFn: (state: DraftState) =>
      putControleCaixa(monthYear.mes, monthYear.ano, {
        abaRef: state.abaRef.trim() || null,
        totais: totaisCalculados,
        blocos: state.blocos,
      }),
    onSuccess: async (data) => {
      setDraft(cloneState(data));
      showToast('Alterações salvas no Supabase.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['controle-caixa', monthYear.mes, monthYear.ano] });
      await queryClient.invalidateQueries({ queryKey: ['fluxo-completo', monthYear.mes, monthYear.ano] });
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
        childrenRight={<MonthYearPicker />}
      />

      <FilterBar
        title="Fechamento do mês"
        subtitle="Comece pelo resumo fixo abaixo; expanda os blocos para lançar valores linha a linha."
        periodLabel={mesExtenso(monthYear.mes, monthYear.ano)}
      >
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Os totais de entradas, saídas e lucro são calculados automaticamente a partir dos blocos.
        </p>
      </FilterBar>

      {controleQuery.isLoading && <div className="text-sm text-gray-500">Carregando dados do mês...</div>}
      {controleQuery.error && (
        <ApiErrorPanel
          message={controleQuery.error instanceof Error ? controleQuery.error.message : 'Erro ao carregar controle.'}
          onRetry={() => controleQuery.refetch()}
        />
      )}

      {draft && (
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
                    isDirty
                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                  }`}
                >
                  {isDirty ? 'Rascunho não salvo' : 'Salvo'}
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
                  onChange={(e) => setDraft((prev) => (prev ? { ...prev, abaRef: e.target.value } : prev))}
                  className="mt-1 w-full max-w-md rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
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
                        onChange={(e) =>
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
                          })
                        }
                        className="w-full shrink-0 rounded border border-slate-300 px-2 py-1.5 text-sm tabular-nums sm:w-40 dark:border-slate-600 dark:bg-slate-800"
                        placeholder="R$ 0,00"
                        inputMode="decimal"
                        aria-label={`Valor — ${linha.label}`}
                      />
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
    </div>
  );
}
