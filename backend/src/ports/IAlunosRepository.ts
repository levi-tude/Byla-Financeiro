/**
 * Porta: leitura de alunos (Supabase).
 * Implementada por adapter que usa Supabase.
 */

export interface AlunoRecord {
  id?: string;
  nome?: string;
  [key: string]: unknown;
}

export interface IAlunosRepository {
  listar(): Promise<AlunoRecord[]>;
}
