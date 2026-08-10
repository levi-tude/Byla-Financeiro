import {
  resolverRegimeCobranca,
  type RegimeCobrancaAluno,
} from './regimeCobrancaAluno.js';
import { proximoDiaUtilBrasilBahia, toIsoDate } from './feriadosBrasilBahia.js';

export type ConciliacaoPagamentoStatus =
  | 'em_dia'
  | 'atrasado'
  | 'pendente'
  | 'sem_vencimento'
  | 'bolsa'
  | 'excecao';

export function parseDiaVencimentoCadastro(venc: string | null | undefined): number | null {
  const raw = String(venc ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // Prefer last 1–2 digit group that looks like a day (1–31)
  const m = raw.match(/\b([12]?\d|3[01])\b/);
  const n = m ? Number(m[1]) : Number(digits.slice(0, 2));
  if (!Number.isFinite(n) || n < 1 || n > 31) return null;
  return n;
}

/** @deprecated Prefer resolverRegimeCobranca / alunoSemCobrancaObrigatoria. */
export function isPlanoBolsaConciliacao(plano: string | null | undefined): boolean {
  return resolverRegimeCobranca({ plano }) === 'bolsa';
}

function ultimoDiaMes(mes: number, ano: number): number {
  return new Date(Date.UTC(ano, mes, 0, 12, 0, 0)).getUTCDate();
}

/**
 * Data de vencimento efetiva no mês: se cair em sáb/dom/feriado (BR+BA),
 * vai para o próximo dia útil.
 */
export function dataVencimentoEfetiva(ano: number, mes: number, diaVencimento: number): string {
  const last = ultimoDiaMes(mes, ano);
  const dia = Math.min(Math.max(1, Math.floor(diaVencimento)), last);
  const candidata = toIsoDate(ano, mes, dia);
  return proximoDiaUtilBrasilBahia(candidata);
}

export function classificarStatusConciliacao(input: {
  diaVencimento: number | null;
  dataCreditoIso: string | null;
  mes: number;
  ano: number;
  /** Preferir `regime`; `planoBolsa` mantido por compatibilidade. */
  regime?: RegimeCobrancaAluno;
  planoBolsa?: boolean;
}): ConciliacaoPagamentoStatus {
  const regime =
    input.regime ??
    (input.planoBolsa ? 'bolsa' : 'normal');
  if (regime === 'bolsa') return 'bolsa';
  if (regime === 'excecao') return 'excecao';
  if (input.diaVencimento == null) return 'sem_vencimento';
  const iso = (input.dataCreditoIso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'pendente';

  const efetiva = dataVencimentoEfetiva(input.ano, input.mes, input.diaVencimento);
  const inicioMes = toIsoDate(input.ano, input.mes, 1);

  // Crédito antes do mês de referência não conta para esta cobrança.
  if (iso < inicioMes) return 'pendente';

  // Em dia: pagou até a data efetiva (pode “vazar” para o mês seguinte se o vencimento
  // caiu em fim de semana/feriado no fim do mês).
  if (iso <= efetiva) return 'em_dia';

  // Atrasado: pagou depois da efetiva. Se o crédito for só em mês futuro sem relação
  // com o spillover da efetiva, trata como pendente (ainda sem crédito “deste” ciclo).
  const fimMes = toIsoDate(input.ano, input.mes, ultimoDiaMes(input.mes, input.ano));
  if (iso > fimMes && iso > efetiva) return 'pendente';

  return 'atrasado';
}
