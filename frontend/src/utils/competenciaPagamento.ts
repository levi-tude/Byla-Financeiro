/**
 * Competência (mês/ano de referência do serviço) vs data de pagamento na planilha.
 * Usado na validação e, no futuro, no calendário mensal (banco × planilha).
 */

/** Ex.: "março de 2026" */
export function labelCompetenciaMesAno(mes: number, ano: number): string {
  const t = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Competência (mês civil do serviço) igual ao mês da data de pagamento (YYYY-MM-DD). */
export function competenciaAlinhaComDataPagamento(dataIso: string, mesCompetencia: number, anoCompetencia: number): boolean {
  const y = Number(dataIso.slice(0, 4));
  const m = Number(dataIso.slice(5, 7));
  return y === anoCompetencia && m === mesCompetencia;
}

/** Texto curto para tooltip / aviso quando competência ≠ mês da data. */
export const AVISO_COMPETENCIA_DIFERENTE =
  'Este pagamento aparece neste dia pela data de pagamento; a competência (mês de referência do serviço) é outra — veja a coluna Competência.';
