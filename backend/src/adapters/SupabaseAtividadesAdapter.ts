/**
 * Adapter: implementa IAtividadesRepository usando Supabase (tabela atividades).
 */

import { getSupabase } from '../services/supabaseClient.js';
import type { IAtividadesRepository, AtividadeRecord } from '../ports/IAtividadesRepository.js';

export class SupabaseAtividadesAdapter implements IAtividadesRepository {
  async listar(): Promise<AtividadeRecord[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const op = await supabase
      .from('fluxo_alunos_operacionais')
      .select('modalidade')
      .order('modalidade');
    if (!op.error && (op.data?.length ?? 0) > 0) {
      const uniq = Array.from(new Set((op.data ?? []).map((r) => String(r.modalidade ?? '').trim()).filter(Boolean)));
      return uniq.map((nome) => ({ id: nome, nome, origem: 'fluxo_operacional' }));
    }

    const { data, error } = await supabase.from('atividades').select('id, nome').order('nome');
    if (error) return [];
    return (data ?? []) as AtividadeRecord[];
  }
}
