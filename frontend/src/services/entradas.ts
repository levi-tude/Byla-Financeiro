import { supabase } from './supabase';
import type { EntradaOficialRow } from '../types/entradas';

function getClient() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

export interface EntradasFiltro {
  dataInicio?: string;
  dataFim?: string;
  formaPagamento?: string;
}

export async function getEntradasOficiais(filtro: EntradasFiltro = {}): Promise<EntradaOficialRow[]> {
  const client = getClient();
  const { data, error } = await client
    .from('v_entradas_oficial')
    .select('id, data, pessoa, valor, forma_pagamento_banco, tipo, id_unico, ano, mes, created_at')
    .order('data', { ascending: false })
    .limit(300);
  if (error) throw error;
  let list = (data ?? []) as EntradaOficialRow[];
  if (filtro.dataInicio) list = list.filter((r) => r.data >= filtro.dataInicio!);
  if (filtro.dataFim) list = list.filter((r) => r.data <= filtro.dataFim!);
  if (filtro.formaPagamento)
    list = list.filter((r) =>
      (r.forma_pagamento_banco || '').toLowerCase().includes((filtro.formaPagamento || '').toLowerCase())
    );
  return list;
}
