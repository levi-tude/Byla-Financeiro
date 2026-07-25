import {
  dataEsperadaCreditoRecorrente,
  FOLGA_DIAS_JANELA_VENDAS,
  janelaDatasCredito,
} from './creditoRecorrente.js';

export type StatusBylaAssinatura = 'ativa' | 'cancelada' | 'parou_de_pagar' | 'concluida';

export function derivarStatusBylaInicial(opts: {
  statusPagbank: 'Ativa' | 'Cancelada';
  cicloAtual: number;
  cicloTotal: number;
  proximaCobranca: string | null;
}): StatusBylaAssinatura {
  if (opts.statusPagbank === 'Cancelada') return 'cancelada';
  if (
    opts.cicloAtual === opts.cicloTotal &&
    (opts.proximaCobranca == null || opts.proximaCobranca === '')
  ) {
    return 'concluida';
  }
  return 'ativa';
}

export function elegivelAlertaParouDePagar(opts: {
  statusByla: StatusBylaAssinatura;
  ativo: boolean;
  cicloAtual: number;
  cicloTotal: number;
  proximaCobranca: string | null;
}): boolean {
  if (!opts.ativo) return false;
  if (opts.statusByla !== 'ativa') return false;
  if (opts.cicloAtual === opts.cicloTotal && !opts.proximaCobranca) return false;
  return true;
}

/** Data esperada no extrato: dia_cobranca + offset no mês/ano de referência. */
export function janelaEsperadaPagamentoAssinatura(opts: {
  ano: number;
  mes: number;
  diaCobranca: number;
  offsetDiasExtrato: number;
  folgaDias?: number;
}): { dataEsperada: string; janela: string[] } {
  const dataEsperada = dataEsperadaCreditoRecorrente(
    opts.ano,
    opts.mes,
    opts.diaCobranca,
    opts.offsetDiasExtrato,
  );
  return {
    dataEsperada,
    janela: janelaDatasCredito(dataEsperada, opts.folgaDias ?? FOLGA_DIAS_JANELA_VENDAS),
  };
}
