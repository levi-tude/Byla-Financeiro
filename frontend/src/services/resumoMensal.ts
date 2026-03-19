import { supabase } from './supabase';
import type { ResumoMensalRow } from '../types/resumo';

function getClient() {
  if (!supabase) {
    throw new Error(
      'Supabase não configurado. Crie o arquivo frontend/.env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (Supabase → Project Settings → API).'
    );
  }
  return supabase;
}

export async function getResumoMensal(): Promise<ResumoMensalRow[]> {
  const client = getClient();
  const { data, error } = await client
    .from('v_resumo_mensal_oficial')
    .select('ano, mes, total_entradas, total_saidas, saldo_mes, qtd_entradas, qtd_saidas')
    .order('ano', { ascending: false })
    .order('mes', { ascending: false })
    .limit(24);

  if (error) throw error;
  return (data ?? []) as ResumoMensalRow[];
}

export async function getUltimoMesResumo(): Promise<ResumoMensalRow | null> {
  const rows = await getResumoMensal();
  return rows.length > 0 ? rows[0] : null;
}
