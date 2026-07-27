import { fluxoUuidFromAnyPlanilhaId, normalizePlanilhaId } from '../logic/fluxoPagamentoFingerprint.js';
import { getSupabase } from './supabaseClient.js';

export type VinculoPagamento = {
  id: string;
  data_ref: string;
  mes: number;
  ano: number;
  banco_id: string;
  planilha_id: string;
  observacao: string | null;
  created_at?: string;
  updated_at?: string;
};

const mem = new Map<string, VinculoPagamento>(); // key = planilha_id

function randomId(): string {
  return `mem_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export async function listVinculosDia(data: string, mes: number, ano: number): Promise<VinculoPagamento[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data: rows, error } = await supabase
    .from('validacao_pagamentos_vinculos')
    .select('id, data_ref, mes, ano, banco_id, planilha_id, observacao, created_at, updated_at')
    .eq('data_ref', data)
    .eq('mes', mes)
    .eq('ano', ano);
  if (!error && Array.isArray(rows)) return rows as VinculoPagamento[];
  return Array.from(mem.values()).filter((v) => v.data_ref === data && v.mes === mes && v.ano === ano);
}

export async function listVinculosMes(mes: number, ano: number): Promise<VinculoPagamento[]> {
  const supabase = getSupabase();
  if (supabase) {
    const { data: rows, error } = await supabase
      .from('validacao_pagamentos_vinculos')
      .select('id, data_ref, mes, ano, banco_id, planilha_id, observacao, created_at, updated_at')
      .eq('mes', mes)
      .eq('ano', ano);
    if (!error && Array.isArray(rows)) return rows as VinculoPagamento[];
  }
  return Array.from(mem.values()).filter((v) => v.mes === mes && v.ano === ano);
}

function expandPlanilhaIdsForLookup(planilhaIds: string[]): string[] {
  const out = new Set<string>();
  for (const raw of planilhaIds) {
    const t = String(raw ?? '').trim();
    if (!t) continue;
    out.add(t);
    out.add(normalizePlanilhaId(t));
    const uuid = fluxoUuidFromAnyPlanilhaId(t);
    if (uuid) out.add(uuid);
  }
  return [...out];
}

/** Vínculos pelos IDs dos pagamentos do Fluxo (independente do mês gravado no extrato). */
export async function listVinculosPorPlanilhaIds(planilhaIds: string[]): Promise<VinculoPagamento[]> {
  const ids = expandPlanilhaIdsForLookup(planilhaIds);
  if (ids.length === 0) return [];

  const supabase = getSupabase();
  if (supabase) {
    const CHUNK = 200;
    const all: VinculoPagamento[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data: rows, error } = await supabase
        .from('validacao_pagamentos_vinculos')
        .select('id, data_ref, mes, ano, banco_id, planilha_id, observacao, created_at, updated_at')
        .in('planilha_id', slice);
      if (error) throw new Error(error.message);
      if (Array.isArray(rows)) all.push(...(rows as VinculoPagamento[]));
    }
    const byKey = new Map<string, VinculoPagamento>();
    for (const v of all) byKey.set(normalizePlanilhaId(v.planilha_id), v);
    return [...byKey.values()];
  }

  const lookup = new Set(ids.map((id) => normalizePlanilhaId(id)));
  return Array.from(mem.values()).filter((v) => lookup.has(normalizePlanilhaId(v.planilha_id)));
}

export async function upsertVinculosDia(
  data: string,
  mes: number,
  ano: number,
  bancoId: string,
  planilhaIds: string[],
  observacao?: string,
): Promise<{ persisted: 'supabase' | 'memory_fallback'; itens: VinculoPagamento[] }> {
  const supabase = getSupabase();
  const itens = planilhaIds.map((pid) => ({
    data_ref: data,
    mes,
    ano,
    banco_id: bancoId,
    planilha_id: pid,
    observacao: observacao ?? null,
  }));

  if (supabase) {
    const { data: conflitantes } = await supabase
      .from('validacao_pagamentos_vinculos')
      .select('planilha_id, banco_id')
      .in('planilha_id', planilhaIds);
    const conflito = (conflitantes ?? []).find((r) => r.banco_id && r.banco_id !== bancoId);
    if (conflito) {
      throw new Error(`Planilha ${conflito.planilha_id} já vinculada a outro banco.`);
    }
    const { data: up, error } = await supabase
      .from('validacao_pagamentos_vinculos')
      .upsert(itens, { onConflict: 'planilha_id' })
      .select('id, data_ref, mes, ano, banco_id, planilha_id, observacao, created_at, updated_at');
    if (!error) return { persisted: 'supabase', itens: (up ?? []) as VinculoPagamento[] };
  }

  const out: VinculoPagamento[] = [];
  for (const pid of planilhaIds) {
    const existente = mem.get(pid);
    if (existente && existente.banco_id !== bancoId) {
      throw new Error(`Planilha ${pid} já vinculada a outro banco.`);
    }
    const item: VinculoPagamento = {
      id: existente?.id ?? randomId(),
      data_ref: data,
      mes,
      ano,
      banco_id: bancoId,
      planilha_id: pid,
      observacao: observacao ?? null,
      created_at: existente?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mem.set(pid, item);
    out.push(item);
  }
  return { persisted: 'memory_fallback', itens: out };
}

export async function findVinculoByPlanilhaId(planilhaId: string): Promise<VinculoPagamento | null> {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('validacao_pagamentos_vinculos')
      .select('id, data_ref, mes, ano, banco_id, planilha_id, observacao, created_at, updated_at')
      .eq('planilha_id', planilhaId)
      .maybeSingle();
    if (!error && data) return data as VinculoPagamento;
  }
  return mem.get(planilhaId) ?? null;
}

export async function removeVinculo(planilhaId: string): Promise<{ persisted: 'supabase' | 'memory_fallback' }> {
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.from('validacao_pagamentos_vinculos').delete().eq('planilha_id', planilhaId);
    if (!error) return { persisted: 'supabase' };
  }
  mem.delete(planilhaId);
  return { persisted: 'memory_fallback' };
}

