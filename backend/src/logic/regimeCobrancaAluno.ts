/**
 * Regime de cobrança do aluno no Fluxo (cadastro operacional).
 * Valores persistidos: normal | bolsa | excecao.
 * Compat: plano contendo "bolsa" ainda conta como bolsa se regime não estiver marcado.
 */

export const REGIMES_COBRANCA_ALUNO = ['normal', 'bolsa', 'excecao'] as const;

export type RegimeCobrancaAluno = (typeof REGIMES_COBRANCA_ALUNO)[number];

export const REGIME_COBRANCA_LABEL: Record<RegimeCobrancaAluno, string> = {
  normal: 'Normal',
  bolsa: 'Bolsa',
  excecao: 'Exceção',
};

export function parseRegimeCobranca(raw: unknown): RegimeCobrancaAluno | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (s === 'normal') return 'normal';
  if (s === 'bolsa') return 'bolsa';
  if (s === 'excecao' || s === 'exceção') return 'excecao';
  return null;
}

/** Legado: texto do campo plano indicando bolsa (planilha antiga). */
export function isPlanoBolsaTexto(plano: string | null | undefined): boolean {
  const n = String(plano ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
  return n === 'bolsa' || n.includes('bolsa');
}

/**
 * Resolve o regime efetivo: coluna `regime_cobranca` ganha;
 * se normal/ausente e plano diz bolsa → bolsa.
 */
export function resolverRegimeCobranca(input: {
  regime_cobranca?: string | null;
  plano?: string | null;
}): RegimeCobrancaAluno {
  const parsed = parseRegimeCobranca(input.regime_cobranca);
  if (parsed === 'bolsa' || parsed === 'excecao') return parsed;
  if (isPlanoBolsaTexto(input.plano)) return 'bolsa';
  return 'normal';
}

/** Bolsa ou exceção: sem cobrança obrigatória / não tratar como pendente normal. */
export function isRegimeSemCobranca(regime: RegimeCobrancaAluno): boolean {
  return regime === 'bolsa' || regime === 'excecao';
}

export function alunoSemCobrancaObrigatoria(input: {
  regime_cobranca?: string | null;
  plano?: string | null;
}): boolean {
  return isRegimeSemCobranca(resolverRegimeCobranca(input));
}
