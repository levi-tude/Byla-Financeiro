import type { SupabaseClient } from '@supabase/supabase-js';
import type { MapeamentoRow } from '../logic/despesasMapeamento.js';

export const MAPEAMENTO_SELECT_BASE =
  'id, pessoa_normalizada, categoria, subcategoria, template_key, bloco_template_key, aplica_tipo, ativo, updated_at, observacao';

export const MAPEAMENTO_SELECT_EXTENDED = `${MAPEAMENTO_SELECT_BASE}, origem_regra, confirmado`;

let extendedColumnsAvailable: boolean | null = null;

function isMissingExtendedColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('origem_regra') || m.includes('confirmado');
}

export function normalizeMapeamentoRow(row: MapeamentoRow): MapeamentoRow {
  return {
    ...row,
    origem_regra: row.origem_regra ?? 'manual',
    confirmado: row.confirmado ?? true,
  };
}

export async function loadMapeamentosEntradaRows(supabase: SupabaseClient): Promise<MapeamentoRow[]> {
  const select =
    extendedColumnsAvailable === false ? MAPEAMENTO_SELECT_BASE : MAPEAMENTO_SELECT_EXTENDED;

  const { data, error } = await supabase
    .from('mapeamento_pessoa_categoria')
    .select(select)
    .in('aplica_tipo', ['entrada', 'todos']);

  if (!error) {
    extendedColumnsAvailable = select === MAPEAMENTO_SELECT_EXTENDED;
    return ((data ?? []) as MapeamentoRow[]).map(normalizeMapeamentoRow);
  }

  if (extendedColumnsAvailable !== false && isMissingExtendedColumnError(error.message)) {
    extendedColumnsAvailable = false;
    const fallback = await supabase
      .from('mapeamento_pessoa_categoria')
      .select(MAPEAMENTO_SELECT_BASE)
      .in('aplica_tipo', ['entrada', 'todos']);
    if (fallback.error) throw new Error(fallback.error.message);
    return ((fallback.data ?? []) as MapeamentoRow[]).map(normalizeMapeamentoRow);
  }

  throw new Error(error.message);
}

/** Campos extras para sugestão fluxo; omitidos se a migration ainda não rodou. */
export function mapeamentoFluxoExtraFields(): {
  confirmado: boolean;
  origem_regra: 'validacao_fluxo';
} | Record<string, never> {
  if (extendedColumnsAvailable === false) return {};
  return { confirmado: false, origem_regra: 'validacao_fluxo' as const };
}

export function mapeamentoManualExtraFields(): {
  confirmado: boolean;
  origem_regra: 'manual';
} | Record<string, never> {
  if (extendedColumnsAvailable === false) return {};
  return { confirmado: true, origem_regra: 'manual' as const };
}

export function mapeamentoSelectForResponse(): string {
  return extendedColumnsAvailable === false ? MAPEAMENTO_SELECT_BASE : MAPEAMENTO_SELECT_EXTENDED;
}

export async function loadMapeamentoEntradaByPessoa(
  supabase: SupabaseClient,
  pessoaNorm: string,
): Promise<MapeamentoRow | null> {
  const rows = await loadMapeamentosEntradaRows(supabase);
  return rows.find((r) => r.pessoa_normalizada === pessoaNorm) ?? null;
}

export async function deleteMapeamentoById(
  supabase: SupabaseClient,
  id: string,
  aplicaTipos: string[],
): Promise<{ pessoa_normalizada: string } | null> {
  const { data: existing, error: fetchErr } = await supabase
    .from('mapeamento_pessoa_categoria')
    .select('id, pessoa_normalizada, aplica_tipo')
    .eq('id', id)
    .maybeSingle<{ id: string; pessoa_normalizada: string; aplica_tipo: string }>();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!existing || !aplicaTipos.includes(existing.aplica_tipo)) return null;

  const { error } = await supabase.from('mapeamento_pessoa_categoria').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return { pessoa_normalizada: existing.pessoa_normalizada };
}
