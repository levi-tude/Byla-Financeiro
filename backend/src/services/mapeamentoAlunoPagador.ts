/**
 * Persistência da memória aluno ↔ pagador do extrato.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { alunoNormKey, type AlunoPagadorRegra } from '../logic/alunoPagadorMatch.js';
import { normalizePessoa } from '../logic/normalizePessoa.js';
import { fluxoUuidFromPlanilhaId } from '../logic/fluxoPagamentoFingerprint.js';

let tableAvailable: boolean | null = null;

function isAlunoPagadorTableUnavailable(): boolean {
  return tableAvailable === false;
}

function isMissingTableError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('mapeamento_aluno_pagador') && (m.includes('does not exist') || m.includes('schema cache'));
}

export async function listMapeamentoAlunoPagadorAtivos(
  supabase: SupabaseClient,
): Promise<AlunoPagadorRegra[]> {
  if (tableAvailable === false) return [];
  const { data, error } = await supabase
    .from('mapeamento_aluno_pagador')
    .select('aluno_normalizado, pessoa_banco_normalizada, pessoa_banco_exibicao')
    .eq('ativo', true);
  if (!error) {
    tableAvailable = true;
    return (data ?? []).map((r) => ({
      aluno_normalizado: String((r as { aluno_normalizado: string }).aluno_normalizado),
      pessoa_banco_normalizada: String((r as { pessoa_banco_normalizada: string }).pessoa_banco_normalizada),
      pessoa_banco_exibicao: String((r as { pessoa_banco_exibicao: string }).pessoa_banco_exibicao),
    }));
  }
  if (isMissingTableError(error.message)) {
    tableAvailable = false;
    return [];
  }
  throw new Error(error.message);
}

export async function upsertMapeamentoAlunoPagador(
  supabase: SupabaseClient,
  args: {
    alunoNome: string;
    pessoaBanco: string;
    aba?: string | null;
  },
): Promise<boolean> {
  if (tableAvailable === false) return false;
  const aluno_normalizado = alunoNormKey(args.alunoNome);
  const pessoa_banco_exibicao = String(args.pessoaBanco ?? '').trim();
  const pessoa_banco_normalizada = normalizePessoa(pessoa_banco_exibicao);
  if (!aluno_normalizado || !pessoa_banco_normalizada) return false;

  const { data: existing } = await supabase
    .from('mapeamento_aluno_pagador')
    .select('id, evidencias')
    .eq('aluno_normalizado', aluno_normalizado)
    .eq('pessoa_banco_normalizada', pessoa_banco_normalizada)
    .maybeSingle();

  const now = new Date().toISOString();
  if (existing?.id) {
    const { error } = await supabase
      .from('mapeamento_aluno_pagador')
      .update({
        pessoa_banco_exibicao,
        aba: args.aba ?? null,
        evidencias: Number((existing as { evidencias?: number }).evidencias ?? 1) + 1,
        ativo: true,
        updated_at: now,
      })
      .eq('id', (existing as { id: string }).id);
    if (error) {
      if (isMissingTableError(error.message)) {
        tableAvailable = false;
        return false;
      }
      throw new Error(error.message);
    }
    tableAvailable = true;
    return true;
  }

  const { error } = await supabase.from('mapeamento_aluno_pagador').insert({
    aluno_normalizado,
    pessoa_banco_normalizada,
    pessoa_banco_exibicao,
    aba: args.aba ?? null,
    evidencias: 1,
    ativo: true,
    updated_at: now,
  });
  if (error) {
    if (isMissingTableError(error.message)) {
      tableAvailable = false;
      return false;
    }
    throw new Error(error.message);
  }
  tableAvailable = true;
  return true;
}

/**
 * Aprende a partir de um vínculo recém-salvo (pagamento fluxo + pessoa do extrato).
 */
export async function aprenderAlunoPagadorFromVinculo(
  supabase: SupabaseClient,
  planilhaId: string,
  bancoId: string,
): Promise<void> {
  const fluxoId = fluxoUuidFromPlanilhaId(planilhaId);
  if (!fluxoId) return;

  const { data: fluxo, error: fluxoErr } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select('aluno_nome, aba')
    .eq('id', fluxoId)
    .maybeSingle();
  if (fluxoErr || !fluxo) return;

  const { data: banco, error: bancoErr } = await supabase
    .from('transacoes')
    .select('pessoa')
    .eq('id', bancoId)
    .maybeSingle();
  if (bancoErr || !banco) return;

  const pessoa = String((banco as { pessoa?: string }).pessoa ?? '').trim();
  const aluno = String((fluxo as { aluno_nome?: string }).aluno_nome ?? '').trim();
  if (!pessoa || !aluno) return;

  await upsertMapeamentoAlunoPagador(supabase, {
    alunoNome: aluno,
    pessoaBanco: pessoa,
    aba: (fluxo as { aba?: string }).aba ?? null,
  });
}

export type SyncStickyReport = { upserted: number; skipped: number };

/**
 * Reconstrói/atualiza memória a partir dos vínculos do ano (pós-remap de migração).
 */
export async function sincronizarMapeamentoAlunoPagadorFromVinculosAno(
  supabase: SupabaseClient,
  ano: number,
): Promise<SyncStickyReport> {
  const report: SyncStickyReport = { upserted: 0, skipped: 0 };
  if (isAlunoPagadorTableUnavailable()) return report;

  const { data: vinculos, error } = await supabase
    .from('validacao_pagamentos_vinculos')
    .select('planilha_id, banco_id')
    .eq('ano', ano)
    .like('planilha_id', 'fluxo::%');
  if (error) {
    if (isMissingTableError(error.message)) {
      tableAvailable = false;
      return report;
    }
    throw new Error(error.message);
  }

  for (const v of vinculos ?? []) {
    try {
      await aprenderAlunoPagadorFromVinculo(
        supabase,
        String((v as { planilha_id: string }).planilha_id),
        String((v as { banco_id: string }).banco_id),
      );
      if (isAlunoPagadorTableUnavailable()) {
        report.skipped += 1;
        continue;
      }
      report.upserted += 1;
    } catch {
      report.skipped += 1;
    }
  }
  return report;
}
