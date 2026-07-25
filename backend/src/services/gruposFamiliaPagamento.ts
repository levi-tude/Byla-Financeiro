/**
 * Carrega catálogo sticky de grupos família/casal (N→1) do Supabase.
 * Dados reais ficam no banco — não no Git público.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  setGruposFamiliaCatalogo,
  type GrupoFamiliaPagamento,
} from '../logic/gruposFamiliaPagamento.js';

let tableAvailable: boolean | null = null;

function isMissingTableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('grupo_familia_pagamento') &&
    (m.includes('does not exist') || m.includes('schema cache'))
  );
}

function parseMembros(raw: unknown): string[][] {
  if (!Array.isArray(raw)) return [];
  const out: string[][] = [];
  for (const row of raw) {
    if (!Array.isArray(row)) continue;
    const tokens = row
      .map((t) => String(t ?? '').trim().toUpperCase())
      .filter(Boolean);
    if (tokens.length > 0) out.push(tokens);
  }
  return out;
}

export async function listGruposFamiliaPagamentoAtivos(
  supabase: SupabaseClient,
): Promise<GrupoFamiliaPagamento[]> {
  if (tableAvailable === false) return [];
  const { data, error } = await supabase
    .from('grupo_familia_pagamento')
    .select('chave, rotulo, membros')
    .eq('ativo', true);
  if (!error) {
    tableAvailable = true;
    return (data ?? [])
      .map((r) => {
        const row = r as { chave: string; rotulo: string; membros: unknown };
        return {
          chave: String(row.chave),
          rotulo: String(row.rotulo),
          membros: parseMembros(row.membros),
        };
      })
      .filter((g) => g.chave && g.membros.length >= 2);
  }
  if (isMissingTableError(error.message)) {
    tableAvailable = false;
    return [];
  }
  throw new Error(error.message);
}

/** Carrega do banco e aplica no catálogo em memória usado pelo match. */
export async function carregarGruposFamiliaNoMatch(
  supabase: SupabaseClient,
): Promise<number> {
  const grupos = await listGruposFamiliaPagamentoAtivos(supabase).catch(() => []);
  setGruposFamiliaCatalogo(grupos);
  return grupos.length;
}
