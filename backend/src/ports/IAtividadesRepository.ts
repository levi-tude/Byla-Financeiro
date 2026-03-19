/**
 * Porta: leitura de atividades/modalidades no Supabase.
 */

export interface AtividadeRecord {
  id?: string | number;
  nome?: string;
  [key: string]: unknown;
}

export interface IAtividadesRepository {
  listar(): Promise<AtividadeRecord[]>;
}
