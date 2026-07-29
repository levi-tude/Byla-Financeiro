/**
 * Detecção de pagamento duplicado no Fluxo (cadastro manual vs linha já existente).
 * A UNIQUE do banco inclui aluno_nome + forma — grafia diferente ou forma null vs PIX
 * permite duas linhas “iguais” para a mesma aluna/dia/valor.
 */

export type FluxoPagamentoDedupeCandidate = {
  aba: string;
  modalidade: string;
  linha_planilha: number;
  data_pagamento: string;
  valor: number;
  mes_competencia: number;
  ano_competencia: number;
};

export type FluxoPagamentoDedupeRow = FluxoPagamentoDedupeCandidate & {
  id: string;
};

const VALOR_EPS = 0.01;

function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function dataDia(s: unknown): string {
  return String(s ?? '').slice(0, 10);
}

/** Mesma linha de aluno (aba/modalidade/linha) + mesmo dia + valor + competência. */
export function isMesmoLancamentoFluxo(
  a: FluxoPagamentoDedupeCandidate,
  b: FluxoPagamentoDedupeCandidate,
): boolean {
  if (norm(a.aba) !== norm(b.aba)) return false;
  if (norm(a.modalidade) !== norm(b.modalidade)) return false;
  if (Number(a.linha_planilha) !== Number(b.linha_planilha)) return false;
  if (dataDia(a.data_pagamento) !== dataDia(b.data_pagamento)) return false;
  if (Number(a.mes_competencia) !== Number(b.mes_competencia)) return false;
  if (Number(a.ano_competencia) !== Number(b.ano_competencia)) return false;
  return Math.abs(Number(a.valor) - Number(b.valor)) <= VALOR_EPS;
}

export function findPagamentoDuplicado(
  existentes: FluxoPagamentoDedupeRow[],
  candidato: FluxoPagamentoDedupeCandidate,
  ignoreId?: string | null,
): FluxoPagamentoDedupeRow | null {
  for (const row of existentes) {
    if (ignoreId && row.id === ignoreId) continue;
    if (isMesmoLancamentoFluxo(row, candidato)) return row;
  }
  return null;
}
