/**
 * Memória sticky: aluno do Fluxo ↔ nome do pagador no extrato.
 * Aprendida nos vínculos manuais; usada no match dos meses seguintes.
 */

import { normalizeText } from './conciliacaoTexto.js';
import type { PlanilhaItem } from './conciliacaoPagamentoMatch.js';

export type AlunoPagadorRegra = {
  aluno_normalizado: string;
  pessoa_banco_normalizada: string;
  pessoa_banco_exibicao: string;
};

/** Chave de aluno alinhada ao matcher de nomes. */
export function alunoNormKey(aluno: string): string {
  return normalizeText(aluno);
}

/**
 * Inclui pagadores já aprendidos nos nomes usados no match (aluno/responsáveis/PIX).
 */
export function enriquecerPlanilhaComPagadoresAprendidos(
  planilha: PlanilhaItem,
  regras: AlunoPagadorRegra[],
): PlanilhaItem {
  const key = alunoNormKey(planilha.aluno);
  const extras = regras
    .filter((r) => r.aluno_normalizado === key)
    .map((r) => r.pessoa_banco_exibicao.trim() || r.pessoa_banco_normalizada)
    .filter(Boolean);
  if (extras.length === 0) return planilha;
  const responsaveis = [...(planilha.responsaveis ?? [])];
  for (const e of extras) {
    if (!responsaveis.some((r) => normalizeText(r) === normalizeText(e))) {
      responsaveis.push(e);
    }
  }
  const pagadorPix =
    planilha.pagadorPix?.trim() ||
    extras[0] ||
    undefined;
  return { ...planilha, responsaveis, pagadorPix };
}
