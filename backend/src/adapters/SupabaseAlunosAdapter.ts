/**
 * Adapter: implementa IAlunosRepository usando Supabase.
 * Contexto: cadastro (fallback quando planilha não disponível).
 */

import { getSupabase } from '../services/supabaseClient.js';
import type { IAlunosRepository, AlunoRecord } from '../ports/IAlunosRepository.js';

export class SupabaseAlunosAdapter implements IAlunosRepository {
  async listar(): Promise<AlunoRecord[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    const { data, error } = await supabase.from('alunos').select('id, nome').order('nome');
    if (error) return [];
    return (data ?? []) as AlunoRecord[];
  }
}
