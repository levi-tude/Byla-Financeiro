import type { ControleCaixaResponse } from '../services/backendApi';
import type { FluxoOperacionalAluno, FluxoOperacionalPagamento } from '../services/backendApi';
import type { ResumoMensalRow } from '../types/resumo';
import type { MonthlyTrendPoint } from '../components/charts/MonthlyTrendChart';

export function formatBrl(value: number | null | undefined, maxDigits = 0): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: maxDigits,
    maximumFractionDigits: maxDigits,
  });
}

export function formatPct(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function formatPctChange(current: number | null | undefined, prev: number | null | undefined): string | null {
  if (current == null || prev == null || !Number.isFinite(current) || !Number.isFinite(prev) || prev === 0) return null;
  const pct = ((current - prev) / Math.abs(prev)) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function formatDeltaBrl(current: number | null | undefined, prev: number | null | undefined): string | null {
  if (current == null || prev == null || !Number.isFinite(current) || !Number.isFinite(prev)) return null;
  const d = current - prev;
  const sign = d > 0 ? '+' : '';
  return `${sign}${formatBrl(d)}`;
}

export function findResumoRow(resumo: ResumoMensalRow[], mes: number, ano: number): ResumoMensalRow | null {
  return resumo.find((r) => r.mes === mes && r.ano === ano) ?? null;
}

export function previousMonth(mes: number, ano: number): { mes: number; ano: number } {
  if (mes <= 1) return { mes: 12, ano: ano - 1 };
  return { mes: mes - 1, ano };
}

/** Últimos N meses inclusive, do mais antigo ao mais recente. */
export function lastNMonths(mes: number, ano: number, n: number): { mes: number; ano: number }[] {
  const out: { mes: number; ano: number }[] = [];
  let m = mes;
  let a = ano;
  for (let i = 0; i < n; i++) {
    out.unshift({ mes: m, ano: a });
    const p = previousMonth(m, a);
    m = p.mes;
    a = p.ano;
  }
  return out;
}

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function labelMesAno(mes: number, ano: number): string {
  return `${MESES_CURTO[mes - 1]}/${String(ano).slice(-2)}`;
}

/** Rótulo do mês selecionado no painel (para destacar barra no gráfico de lucro). */
export function selectedMonthChartLabel(mes: number, ano: number): string {
  return labelMesAno(mes, ano);
}

export function mesExtenso(mes: number, ano: number): string {
  const d = new Date(ano, mes - 1, 1);
  const s = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function controleToTrendPoint(mes: number, ano: number, data: ControleCaixaResponse | undefined): MonthlyTrendPoint {
  const t = data?.totais;
  return {
    label: labelMesAno(mes, ano),
    totalEntradas: Number(t?.entradaTotal ?? 0),
    totalSaidas: Number(t?.saidaTotal ?? 0),
    saldoMes: Number(t?.lucroTotal ?? 0),
  };
}

export function resumoToTrendPoint(row: ResumoMensalRow): MonthlyTrendPoint {
  return {
    label: labelMesAno(row.mes, row.ano),
    totalEntradas: row.total_entradas,
    totalSaidas: row.total_saidas,
    saldoMes: row.saldo_mes,
  };
}

export type ModalityRow = { name: string; value: number; pct: number };

/** Evita rótulo genérico "(modalidade)" vindo do cadastro; usa aba/planilha como fallback. */
export function resolveModalityLabel(modalidade: string | null | undefined, aba: string | null | undefined): string {
  const mod = String(modalidade ?? '').trim();
  const abaStr = String(aba ?? '').trim();
  const modInvalid =
    !mod || mod === '—' || /^\(modalidade\)$/i.test(mod) || mod.toLowerCase() === 'modalidade';
  if (!modInvalid) return formatModalityDisplayName(mod);
  if (abaStr) return formatModalityDisplayName(abaStr);
  return 'Sem modalidade';
}

/** Converte CAIXA ALTA em título legível sem quebrar siglas curtas (ex.: KPOP). */
export function formatModalityDisplayName(raw: string): string {
  const t = raw.trim();
  if (!t) return 'Sem modalidade';
  const mostlyUpper = t.length > 4 && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÃÕÂÊÎÔÛ]/.test(t);
  if (mostlyUpper) {
    return t
      .toLowerCase()
      .split(/\s+/)
      .map((w) => (w.length <= 4 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
  }
  return t;
}

export function truncateModalityLabel(label: string, maxLen = 38): string {
  if (label.length <= maxLen) return label;
  return `${label.slice(0, maxLen - 1)}…`;
}

export type ModalityBarRow = {
  fullName: string;
  label: string;
  value: number;
  pct: number;
};

/** Top N modalidades + agrupamento "Outras" — adequado para barras, não pizza. */
export function buildModalityBarSeries(
  items: { name: string; value: number }[],
  maxBars = 8,
): ModalityBarRow[] {
  const total = items.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return [];
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, maxBars);
  const rest = sorted.slice(maxBars);
  const rows: ModalityBarRow[] = top.map((x) => ({
    fullName: x.name,
    label: truncateModalityLabel(x.name),
    value: x.value,
    pct: (x.value / total) * 100,
  }));
  if (rest.length > 0) {
    const restVal = rest.reduce((s, x) => s + x.value, 0);
    rows.push({
      fullName: `Outras modalidades (${rest.length})`,
      label: `Outras (${rest.length})`,
      value: restVal,
      pct: (restVal / total) * 100,
    });
  }
  return rows;
}

export function buildModalityRows(items: { name: string; value: number }[]): ModalityRow[] {
  const total = items.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return [];
  return items.map((x) => ({
    name: x.name,
    value: x.value,
    pct: (x.value / total) * 100,
  }));
}

export function lucroCrescenteStreakFromLucros(lucros: (number | null | undefined)[]): number {
  const vals = lucros.filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length < 2) return vals.length === 1 && vals[0] > 0 ? 1 : 0;
  let streak = 1;
  for (let i = vals.length - 1; i >= 1; i--) {
    if (vals[i] > vals[i - 1]) streak += 1;
    else break;
  }
  return streak;
}

function isPlanoBolsa(plano: string | null | undefined): boolean {
  const n = String(plano ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
  return n === 'bolsa' || n.includes('bolsa');
}

function ignoradosPendencia(a: FluxoOperacionalAluno): Set<string> {
  const s = new Set<string>();
  for (const x of a.pendencia_campos_ignorados ?? []) {
    const k = String(x).trim();
    if (k) s.add(k);
  }
  return s;
}

export function camposCadastroFaltantes(a: FluxoOperacionalAluno): string[] {
  const ign = ignoradosPendencia(a);
  const r: string[] = [];
  if (!ign.has('wpp') && !String(a.wpp ?? '').trim()) r.push('WhatsApp');
  if (!ign.has('responsaveis') && !(a.responsaveis_exibicao?.trim() || a.responsaveis?.trim())) r.push('Responsáveis');
  if (!ign.has('venc') && !(a.venc_exibicao?.trim() || a.venc?.trim())) r.push('Vencimento');
  if (!ign.has('valor_ref') && !isPlanoBolsa(a.plano)) {
    if (a.valor_mensal_origem === 'planilha_bruta' || a.valor_mensal_origem === 'ultimo_pagamento') {
      r.push('Valor ref.');
    } else if (a.valor_referencia == null && a.valor_mensal_exibicao == null) {
      r.push('Valor ref.');
    }
  }
  if (!ign.has('pagador_pix') && !(a.pagador_pix_exibicao?.trim() || a.pagador_pix?.trim())) r.push('Pagador PIX');
  if (!ign.has('plano') && !String(a.plano ?? '').trim()) r.push('Plano');
  return r;
}

function alunoPagamentoKey(aba: string, linha: number, nome: string): string {
  return `${aba.trim().toLowerCase()}|${linha}|${nome.trim().toLowerCase()}`;
}

export function computeFluxoOperacionalResumo(
  alunos: FluxoOperacionalAluno[],
  pagamentos: FluxoOperacionalPagamento[],
  mes: number,
  ano: number,
): {
  receitaModalidade: { name: string; value: number }[];
  semPagamentoNoMes: number;
  pendenciasCadastro: number;
  vencimentoHoje: number;
} {
  const pagsMes = pagamentos.filter((p) => p.mes_competencia === mes && p.ano_competencia === ano);
  const pagKeys = new Set(
    pagsMes.map((p) => alunoPagamentoKey(p.aba, p.linha_planilha, p.aluno_nome)),
  );

  let semPagamentoNoMes = 0;
  let pendenciasCadastro = 0;
  let vencimentoHoje = 0;

  const diaHoje = new Date().getDate();

  for (const a of alunos) {
    if (!a.ativo) continue;
    const key = alunoPagamentoKey(a.aba, a.linha_planilha, a.aluno_nome);
    if (!pagKeys.has(key)) semPagamentoNoMes += 1;
    if (camposCadastroFaltantes(a).length > 0) pendenciasCadastro += 1;
    const vencStr = (a.venc_exibicao ?? a.venc ?? '').trim();
    const diaVenc = parseInt(vencStr.replace(/\D/g, ''), 10);
    if (Number.isFinite(diaVenc) && diaVenc === diaHoje) vencimentoHoje += 1;
  }

  const porMod = new Map<string, number>();
  for (const p of pagsMes) {
    const mod = resolveModalityLabel(p.modalidade, p.aba);
    porMod.set(mod, (porMod.get(mod) ?? 0) + Number(p.valor || 0));
  }
  const receitaModalidade = [...porMod.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return { receitaModalidade, semPagamentoNoMes, pendenciasCadastro, vencimentoHoje };
}

export type DashboardAlert = { tone: 'info' | 'warning' | 'danger'; title: string; body: string };

/** Até 2 alertas sobre o fechamento financeiro (não Fluxo, não extrato). */
export function buildFechamentoAlerts(params: {
  lucro: number | null;
  lucroPrev: number | null;
  entrada: number | null;
  entradaPrev: number | null;
  saida: number | null;
  saidaPrev: number | null;
}): DashboardAlert[] {
  const out: DashboardAlert[] = [];
  const { lucro, lucroPrev, entrada, entradaPrev, saida, saidaPrev } = params;

  if (lucro != null && lucroPrev != null && lucro < lucroPrev) {
    out.push({
      tone: 'danger',
      title: 'Lucro menor que no mês passado',
      body: `Fechamento atual: ${formatBrl(lucro)}. Mês anterior: ${formatBrl(lucroPrev)}.`,
    });
  } else if (lucro != null && lucro <= 0) {
    out.push({
      tone: 'danger',
      title: 'Lucro negativo no fechamento',
      body: 'Revise despesas e receitas no Controle de caixa deste mês.',
    });
  }

  if (
    entrada != null &&
    entradaPrev != null &&
    saida != null &&
    saidaPrev != null &&
    entradaPrev > 0 &&
    saidaPrev > 0
  ) {
    const pctEnt = (entrada - entradaPrev) / entradaPrev;
    const pctSai = (saida - saidaPrev) / saidaPrev;
    if (pctSai > pctEnt + 0.005) {
      out.push({
        tone: 'warning',
        title: 'Despesas subiram mais que as entradas',
        body: `Entradas ${formatPctChange(entrada, entradaPrev) ?? '—'} e despesas ${formatPctChange(saida, saidaPrev) ?? '—'} em relação ao mês anterior.`,
      });
    }
  }

  return out.slice(0, 2);
}
