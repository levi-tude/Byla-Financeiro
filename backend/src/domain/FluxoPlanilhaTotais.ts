/**
 * Totais lidos da planilha CONTROLE DE CAIXA (aba do mês).
 * Domínio puro.
 */

export interface LinhaPlanilha {
  label: string;
  valor: string;
  valorNum?: number;
}

export interface FluxoPlanilhaTotais {
  entradaTotal: number | null;
  saidaTotal: number | null;
  lucroTotal: number | null;
  mes: number | null;
  ano: number | null;
  aba: string | null;
  linhas: LinhaPlanilha[];
  /** Por par de colunas (0 = A-B, 1 = C-D, 2 = E-F…). Cada bloco mantém ordem da planilha e evita misturar entrada/saída. */
  porColuna?: LinhaPlanilha[][];
}

export function criarFluxoPlanilhaVazio(): FluxoPlanilhaTotais {
  return {
    entradaTotal: null,
    saidaTotal: null,
    lucroTotal: null,
    mes: null,
    ano: null,
    aba: null,
    linhas: [],
    porColuna: [],
  };
}
