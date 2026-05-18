import type { FluxoOperacionalPagamento } from '../services/backendApi';

export const MULTI_ABAS_ORDEM = ['BYLA DANÇA', 'PILATES', 'TEATRO', 'YOGA', 'G.R.', 'TEATRO INFANTIL'] as const;

export function normalizarAbaMulti(aba: string): string {
  const base = String(aba ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toUpperCase();
  if (base === 'PILATES MARINA') return 'PILATES';
  if (base === 'BYLA DANCA') return 'BYLA DANÇA';
  if (base === 'GR') return 'G.R.';
  if (base === 'TEATRO INFANTIL') return 'TEATRO INFANTIL';
  if (base === 'PILATES') return 'PILATES';
  if (base === 'TEATRO') return 'TEATRO';
  if (base === 'YOGA') return 'YOGA';
  return String(aba ?? '').trim() || '—';
}

export function ordenarAbasPresentes(presentes: Iterable<string>): string[] {
  const set = presentes instanceof Set ? presentes : new Set(presentes);
  const ordered = MULTI_ABAS_ORDEM.filter((a) => set.has(a));
  const extras = [...set]
    .filter((a) => !MULTI_ABAS_ORDEM.includes(a as (typeof MULTI_ABAS_ORDEM)[number]))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return [...ordered, ...extras];
}

export type ReceitaAbaRow = {
  aba: string;
  value: number;
  pctMes: number;
  modalidadeCount: number;
};

export type ReceitaModalidadeRow = {
  modalidade: string;
  label: string;
  fullName: string;
  value: number;
  pctAba: number;
  pctMes: number;
};

export type ReceitaPorAbaModalidade = {
  totalMes: number;
  abas: ReceitaAbaRow[];
  porAba: Map<string, ReceitaModalidadeRow[]>;
};

function truncateLabel(label: string, maxLen = 38): string {
  if (label.length <= maxLen) return label;
  return `${label.slice(0, maxLen - 1)}…`;
}

function buildModalidadeRowsForAba(
  modMap: Map<string, number>,
  totalMes: number,
  totalAba: number,
  maxBars = 8,
): ReceitaModalidadeRow[] {
  if (totalAba <= 0) return [];
  const sorted = [...modMap.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, maxBars);
  const rest = sorted.slice(maxBars);
  const rows: ReceitaModalidadeRow[] = top.map(([modalidade, value]) => ({
    modalidade,
    fullName: modalidade,
    label: truncateLabel(modalidade),
    value,
    pctAba: (value / totalAba) * 100,
    pctMes: totalMes > 0 ? (value / totalMes) * 100 : 0,
  }));
  if (rest.length > 0) {
    const restVal = rest.reduce((s, [, v]) => s + v, 0);
    rows.push({
      modalidade: `__outras__${rest.length}`,
      fullName: `Outras modalidades (${rest.length})`,
      label: `Outras (${rest.length})`,
      value: restVal,
      pctAba: (restVal / totalAba) * 100,
      pctMes: totalMes > 0 ? (restVal / totalMes) * 100 : 0,
    });
  }
  return rows;
}

export function buildReceitaPorAbaModalidade(
  pagamentos: FluxoOperacionalPagamento[],
  mes: number,
  ano: number,
  resolveModalityLabel: (mod: string | null | undefined, aba: string | null | undefined) => string,
): ReceitaPorAbaModalidade {
  const pagsMes = pagamentos.filter((p) => p.mes_competencia === mes && p.ano_competencia === ano);
  const porAbaMod = new Map<string, Map<string, number>>();

  for (const p of pagsMes) {
    const aba = normalizarAbaMulti(p.aba);
    const mod = resolveModalityLabel(p.modalidade, p.aba);
    if (!porAbaMod.has(aba)) porAbaMod.set(aba, new Map());
    const modMap = porAbaMod.get(aba)!;
    modMap.set(mod, (modMap.get(mod) ?? 0) + Number(p.valor || 0));
  }

  const totalMes = [...porAbaMod.values()].reduce(
    (s, modMap) => s + [...modMap.values()].reduce((a, v) => a + v, 0),
    0,
  );

  const abasOrdenadas = ordenarAbasPresentes(porAbaMod.keys());
  const abas: ReceitaAbaRow[] = [];
  const porAba = new Map<string, ReceitaModalidadeRow[]>();

  for (const aba of abasOrdenadas) {
    const modMap = porAbaMod.get(aba);
    if (!modMap) continue;
    const value = [...modMap.values()].reduce((a, v) => a + v, 0);
    abas.push({
      aba,
      value,
      pctMes: totalMes > 0 ? (value / totalMes) * 100 : 0,
      modalidadeCount: modMap.size,
    });
    porAba.set(aba, buildModalidadeRowsForAba(modMap, totalMes, value));
  }

  return { totalMes, abas, porAba };
}
