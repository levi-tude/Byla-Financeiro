/**
 * Totais lidos da planilha CONTROLE DE CAIXA (aba do mês).
 * Domínio puro.
 */

export interface LinhaPlanilha {
  label: string;
  valor: string;
  valorNum?: number;
}

/** Blocos de saída (Parceiros, Gastos fixos, Aluguel…) extraídos da aba. */
export type SaidaBlocoPlanilha = { titulo: string; linhas: LinhaPlanilha[] };

export interface FluxoPlanilhaTotais {
  entradaTotal: number | null;
  saidaTotal: number | null;
  /** Soma dos detalhes só em Saídas Parceiros + Saídas Fixas (duas seções principais). */
  saidaSomaSecoesPrincipais?: number | null;
  saidaParceirosTotal?: number | null;
  saidaFixasTotal?: number | null;
  lucroTotal: number | null;
  mes: number | null;
  ano: number | null;
  aba: string | null;
  linhas: LinhaPlanilha[];
  /** Por par de colunas (0 = A-B, 1 = C-D, 2 = E-F…). Cada bloco mantém ordem da planilha e evita misturar entrada/saída. */
  porColuna?: LinhaPlanilha[][];
  /** Saídas agrupadas (ordem de linhas + colunas, deduplicado por título). */
  saidasBlocos?: SaidaBlocoPlanilha[];
  /** Entradas agrupadas (primeira coluna + ordem até 1º bloco de saída). */
  entradasBlocos?: SaidaBlocoPlanilha[];
}

export function criarFluxoPlanilhaVazio(): FluxoPlanilhaTotais {
  return {
    entradaTotal: null,
    saidaTotal: null,
    saidaSomaSecoesPrincipais: null,
    saidaParceirosTotal: null,
    saidaFixasTotal: null,
    lucroTotal: null,
    mes: null,
    ano: null,
    aba: null,
    linhas: [],
    porColuna: [],
    saidasBlocos: [],
    entradasBlocos: [],
  };
}
