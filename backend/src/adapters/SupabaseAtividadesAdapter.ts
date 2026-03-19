/**
 * Adapter: implementa IAtividadesRepository usando Supabase (tabela atividades).
 */

import { getSupabase } from '../services/supabaseClient.js';
import type { IAtividadesRepository, AtividadeRecord } from '../ports/IAtividadesRepository.js';

export class SupabaseAtividadesAdapter implements IAtividadesRepository {
  async listar(): Promise<AtividadeRecord[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    const { data, error } = await supabase.from('atividades').select('id, nome').order('nome');
    if (error) return [];
    return (data ?? []) as AtividadeRecord[];
  }
}
