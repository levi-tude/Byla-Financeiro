/**
 * Porta: leitura de qualquer aba/range da planilha FLUXO DE CAIXA BYLA.
 * Usado para modalidades, pendências e outras abas além de ATENDIMENTOS.
 */

export interface PlanilhaRow {
  [key: string]: string | number | boolean;
}

export interface IPlanilhaRangeRepository {
  listar(range: string): Promise<{ rows: PlanilhaRow[]; error?: string }>;
}
