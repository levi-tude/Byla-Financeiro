/**
 * Adapter: implementa IPendenciasRepository usando Supabase (view v_reconciliacao_mensalidades).
 */

import { getSupabase } from '../services/supabaseClient.js';
import type { IPendenciasRepository, PendenciaRecord } from '../ports/IPendenciasRepository.js';

export class SupabasePendenciasAdapter implements IPendenciasRepository {
  async listarPendentes(limit = 200): Promise<PendenciaRecord[]> {
    const supabase = getSupabase();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('v_reconciliacao_mensalidades')
      .select('*')
      .eq('confirmado_banco', false)
      .limit(limit);
    if (error) return [];
    return (data ?? []) as PendenciaRecord[];
  }
}
