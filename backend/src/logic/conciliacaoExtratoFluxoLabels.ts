import type { ConciliacaoPagamentoStatus } from './conciliacaoStatusExtrato.js';

export type FluxoLancamentoStatus = 'ok' | 'pendente';
export type ExtratoConfirmadoStatus = 'confirmado' | 'nao' | 'nao_aplicavel';

const STATUS_BASE: Record<ConciliacaoPagamentoStatus, string> = {
  em_dia: 'Em dia',
  atrasado: 'Atrasado',
  pendente: 'Pendente',
  sem_vencimento: 'Sem vencimento',
  bolsa: 'Bolsa',
  excecao: 'Exceção',
};

/**
 * Rótulo humano: extrato × lançamento no Fluxo.
 * Extrato confirmado + Fluxo sem data ≠ “não pagou”.
 */
export function rotuloConciliacaoExtratoFluxo(input: {
  status: ConciliacaoPagamentoStatus;
  extrato: ExtratoConfirmadoStatus;
  fluxo: FluxoLancamentoStatus;
}): string {
  const { status, extrato, fluxo } = input;
  if (status === 'bolsa' || status === 'excecao' || status === 'sem_vencimento') {
    return STATUS_BASE[status];
  }
  if (extrato === 'confirmado' && fluxo === 'pendente') {
    return 'Pago no banco · Fluxo pendente';
  }
  if (extrato === 'confirmado' && fluxo === 'ok') {
    return status === 'atrasado' ? 'Pago (atrasado) · Fluxo ok' : 'Pago · Fluxo ok';
  }
  if (extrato === 'nao_aplicavel' && fluxo === 'ok') {
    return status === 'atrasado' ? 'Dinheiro (atrasado) · Fluxo ok' : 'Dinheiro · Fluxo ok';
  }
  if (extrato === 'nao' && fluxo === 'ok') {
    return 'Fluxo com data · extrato sem vínculo';
  }
  return STATUS_BASE[status];
}
