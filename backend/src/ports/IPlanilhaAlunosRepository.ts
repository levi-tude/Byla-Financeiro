/**
 * Porta: leitura de linhas da planilha FLUXO DE CAIXA BYLA (uma aba ou todas).
 * Implementada por adapter que usa Google Sheets API.
 */

export interface PlanilhaRow {
  [key: string]: string | number | boolean;
}

export interface IPlanilhaAlunosRepository {
  listar(range: string): Promise<{ rows: PlanilhaRow[]; error?: string }>;
  /** Lista todas as abas, lê cada uma e retorna linhas com _aba. Opcional. */
  listarTodasAbas?(): Promise<{ rows: PlanilhaRow[]; abas: string[]; error?: string }>;
}
