/**
 * Porta: leitura de pendências (mensalidades não confirmadas) no Supabase.
 */

export interface PendenciaRecord {
  [key: string]: unknown;
}

export interface IPendenciasRepository {
  listarPendentes(limit?: number): Promise<PendenciaRecord[]>;
}
