import type { SheetRow } from '../services/sheetsService.js';

/**
 * Regras de merge conforme docs/REGRAS_FONTES_SUPABASE_PLANILHAS.md.
 * Para alunos, modalidades e pendências: planilhas complementam ou prevalecem.
 */

export interface MergeResult<T> {
  combinado: T[];
  origem: 'planilha' | 'supabase' | 'merge';
  regra_usada: string;
}

/** Prioriza linhas da planilha; se vazia, usa supabase. */
export function mergePriorizarPlanilha<T extends Record<string, unknown>>(
  planilhaRows: SheetRow[],
  supabaseRows: T[],
  regraDesc: string
): MergeResult<T> {
  const fromSheet = planilhaRows as unknown as T[];
  if (fromSheet.length > 0) {
    return { combinado: fromSheet, origem: 'planilha', regra_usada: regraDesc };
  }
  return { combinado: supabaseRows, origem: 'supabase', regra_usada: regraDesc };
}

/** Prioriza Supabase; se vazio, usa planilha. */
export function mergePriorizarSupabase<T extends Record<string, unknown>>(
  planilhaRows: SheetRow[],
  supabaseRows: T[],
  regraDesc: string
): MergeResult<T> {
  if (supabaseRows.length > 0) {
    return { combinado: supabaseRows, origem: 'supabase', regra_usada: regraDesc };
  }
  const fromSheet = planilhaRows as unknown as T[];
  return { combinado: fromSheet, origem: fromSheet.length > 0 ? 'planilha' : 'merge', regra_usada: regraDesc };
}

/** Enriquece: usa supabase como base e adiciona/sobrescreve campos com dados da planilha quando chave bate. */
export function mergeEnriquecerPorChave<T extends Record<string, unknown>>(
  planilhaRows: SheetRow[],
  supabaseRows: T[],
  chavePlanilha: string,
  chaveSupabase: string,
  regraDesc: string
): MergeResult<T> {
  if (planilhaRows.length === 0) {
    return { combinado: supabaseRows, origem: 'supabase', regra_usada: regraDesc };
  }
  const mapPlanilha = new Map<string, SheetRow>();
  for (const row of planilhaRows) {
    const k = String(row[chavePlanilha] ?? '').trim().toLowerCase();
    if (k) mapPlanilha.set(k, row);
  }
  const combinado: T[] = supabaseRows.map((s) => {
    const sk = String((s as Record<string, unknown>)[chaveSupabase] ?? '').trim().toLowerCase();
    const fromPlanilha = sk ? mapPlanilha.get(sk) : undefined;
    if (!fromPlanilha) return s;
    return { ...s, ...fromPlanilha } as T;
  });
  const keysSupabase = new Set(supabaseRows.map((s) => String((s as Record<string, unknown>)[chaveSupabase] ?? '').trim().toLowerCase()));
  for (const row of planilhaRows) {
    const k = String(row[chavePlanilha] ?? '').trim().toLowerCase();
    if (k && !keysSupabase.has(k)) combinado.push(row as unknown as T);
  }
  return { combinado, origem: 'merge', regra_usada: regraDesc };
}
