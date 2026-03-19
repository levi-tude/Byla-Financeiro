/**
 * Totais da planilha CONTROLE DE CAIXA (resposta do backend).
 * Domínio: apenas tipos; sem chamadas de API.
 */

export interface FluxoPlanilhaTotais {
  entradaTotal: number | null;
  saidaTotal: number | null;
  lucroTotal: number | null;
  mes: number | null;
  ano: number | null;
  aba: string | null;
  linhas: { label: string; valor: string; valorNum?: number }[];
}
