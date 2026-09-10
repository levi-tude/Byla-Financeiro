/**
 * Extrato confirmado por aluno × competência antes do lançamento no Fluxo.
 * No sync incremental, promove para validacao_pagamentos_vinculos (fluxo::uuid).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { planilhaIdFromFluxoUuid } from '../logic/fluxoPagamentoFingerprint.js';
import { normalizeText } from '../logic/conciliacaoTexto.js';
import { getSupabase } from './supabaseClient.js';
import { upsertVinculosDia } from './validacaoVinculos.js';

export type ExtratoAntesFluxoRow = {
  id: string;
  aluno_id: string;
  mes: number;
  ano: number;
  banco_id: string;
  data_ref: string;
  observacao: string | null;
  promoted_planilha_id: string | null;
  promoted_at: string | null;
};

type MemRow = ExtratoAntesFluxoRow;

const mem = new Map<string, MemRow>(); // key = aluno_id|mes|ano

function memKey(alunoId: string, mes: number, ano: number): string {
  return `${alunoId}|${mes}|${ano}`;
}

function tableMissing(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('validacao_extrato_antes_fluxo') && (m.includes('does not exist') || m.includes('schema cache'));
}

export async function listExtratoAntesFluxoMes(
  mes: number,
  ano: number,
): Promise<ExtratoAntesFluxoRow[]> {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('validacao_extrato_antes_fluxo')
      .select(
        'id, aluno_id, mes, ano, banco_id, data_ref, observacao, promoted_planilha_id, promoted_at',
      )
      .eq('mes', mes)
      .eq('ano', ano);
    if (!error && Array.isArray(data)) {
      return (data as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        aluno_id: String(r.aluno_id),
        mes: Number(r.mes),
        ano: Number(r.ano),
        banco_id: String(r.banco_id),
        data_ref: String(r.data_ref).slice(0, 10),
        observacao: r.observacao != null ? String(r.observacao) : null,
        promoted_planilha_id:
          r.promoted_planilha_id != null ? String(r.promoted_planilha_id) : null,
        promoted_at: r.promoted_at != null ? String(r.promoted_at) : null,
      }));
    }
    if (error && !tableMissing(error.message)) throw new Error(error.message);
  }
  return Array.from(mem.values()).filter((v) => v.mes === mes && v.ano === ano);
}

export async function upsertExtratoAntesFluxo(input: {
  aluno_id: string;
  mes: number;
  ano: number;
  banco_id: string;
  data_ref: string;
  observacao?: string | null;
}): Promise<{ persisted: 'supabase' | 'memory_fallback'; item: ExtratoAntesFluxoRow }> {
  const dataRef = input.data_ref.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef)) {
    throw new Error('data_ref inválida.');
  }
  const row = {
    aluno_id: input.aluno_id,
    mes: input.mes,
    ano: input.ano,
    banco_id: input.banco_id,
    data_ref: dataRef,
    observacao: input.observacao ?? 'extrato_antes_fluxo',
    promoted_planilha_id: null as string | null,
    promoted_at: null as string | null,
  };

  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('validacao_extrato_antes_fluxo')
      .upsert(row, { onConflict: 'aluno_id,mes,ano' })
      .select(
        'id, aluno_id, mes, ano, banco_id, data_ref, observacao, promoted_planilha_id, promoted_at',
      )
      .maybeSingle();
    if (!error && data) {
      const r = data as Record<string, unknown>;
      return {
        persisted: 'supabase',
        item: {
          id: String(r.id),
          aluno_id: String(r.aluno_id),
          mes: Number(r.mes),
          ano: Number(r.ano),
          banco_id: String(r.banco_id),
          data_ref: String(r.data_ref).slice(0, 10),
          observacao: r.observacao != null ? String(r.observacao) : null,
          promoted_planilha_id:
            r.promoted_planilha_id != null ? String(r.promoted_planilha_id) : null,
          promoted_at: r.promoted_at != null ? String(r.promoted_at) : null,
        },
      };
    }
    if (error && !tableMissing(error.message)) throw new Error(error.message);
  }

  const key = memKey(input.aluno_id, input.mes, input.ano);
  const existing = mem.get(key);
  const item: ExtratoAntesFluxoRow = {
    id: existing?.id ?? `mem_${Date.now()}`,
    ...row,
    data_ref: dataRef,
  };
  mem.set(key, item);
  return { persisted: 'memory_fallback', item };
}

export async function removeExtratoAntesFluxo(
  alunoId: string,
  mes: number,
  ano: number,
): Promise<{ persisted: 'supabase' | 'memory_fallback' }> {
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from('validacao_extrato_antes_fluxo')
      .delete()
      .eq('aluno_id', alunoId)
      .eq('mes', mes)
      .eq('ano', ano);
    if (!error) return { persisted: 'supabase' };
    if (!tableMissing(error.message)) throw new Error(error.message);
  }
  mem.delete(memKey(alunoId, mes, ano));
  return { persisted: 'memory_fallback' };
}

export type PromoverExtratoAntesResult = {
  promovidos: number;
  avisos: string[];
};

/**
 * Quando o pagamento aparece no Fluxo, cria vínculo fluxo:: e marca promoted.
 * Não altera vínculos já existentes em outro banco.
 */
export async function promoverExtratoAntesFluxoPendentes(
  supabase: SupabaseClient,
  opts?: { ano?: number },
): Promise<PromoverExtratoAntesResult> {
  const avisos: string[] = [];
  let q = supabase
    .from('validacao_extrato_antes_fluxo')
    .select('id, aluno_id, mes, ano, banco_id, data_ref, observacao, promoted_planilha_id')
    .is('promoted_planilha_id', null)
    .limit(5000);
  if (opts?.ano != null) q = q.eq('ano', opts.ano);

  const { data: pending, error } = await q;
  if (error) {
    if (tableMissing(error.message)) {
      return { promovidos: 0, avisos: ['tabela extrato_antes_fluxo indisponível'] };
    }
    throw new Error(error.message);
  }
  const rows = (pending ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return { promovidos: 0, avisos };

  const alunoIds = [...new Set(rows.map((r) => String(r.aluno_id)))];
  const { data: alunosRows, error: alunosErr } = await supabase
    .from('fluxo_alunos_operacionais')
    .select('id, aba, aluno_nome')
    .in('id', alunoIds);
  if (alunosErr) throw new Error(alunosErr.message);

  const alunoById = new Map(
    ((alunosRows ?? []) as Record<string, unknown>[]).map((a) => [
      String(a.id),
      {
        aba: String(a.aba ?? ''),
        aluno_nome: String(a.aluno_nome ?? ''),
      },
    ]),
  );

  let promovidos = 0;
  for (const r of rows) {
    const alunoId = String(r.aluno_id);
    const mes = Number(r.mes);
    const ano = Number(r.ano);
    const bancoId = String(r.banco_id);
    const dataRef = String(r.data_ref).slice(0, 10);
    const aluno = alunoById.get(alunoId);
    if (!aluno) {
      avisos.push(`aluno ${alunoId.slice(0, 8)}… ausente; promoção adiada`);
      continue;
    }

    const { data: pags, error: pagErr } = await supabase
      .from('fluxo_pagamentos_operacionais')
      .select('id, aba, aluno_nome, data_pagamento')
      .eq('mes_competencia', mes)
      .eq('ano_competencia', ano)
      .eq('aba', aluno.aba)
      .limit(50);
    if (pagErr) {
      avisos.push(`falha ao buscar pagamento: ${pagErr.message}`);
      continue;
    }

    const nomeAlvo = normalizeText(aluno.aluno_nome);
    const match = ((pags ?? []) as Record<string, unknown>[]).find(
      (p) => normalizeText(String(p.aluno_nome ?? '')) === nomeAlvo,
    );
    if (!match) continue;

    const pagamentoId = String(match.id);
    const planilhaId = planilhaIdFromFluxoUuid(pagamentoId);

    const { data: existente } = await supabase
      .from('validacao_pagamentos_vinculos')
      .select('planilha_id, banco_id')
      .eq('planilha_id', planilhaId)
      .maybeSingle();
    if (existente && String((existente as { banco_id: string }).banco_id) !== bancoId) {
      avisos.push(`pagamento já vinculado a outro banco; não promove ${planilhaId}`);
      continue;
    }

    if (!existente) {
      try {
        await upsertVinculosDia(dataRef, mes, ano, bancoId, [planilhaId], 'promovido_extrato_antes_fluxo');
      } catch (e) {
        avisos.push(e instanceof Error ? e.message : String(e));
        continue;
      }
    }

    const { error: updErr } = await supabase
      .from('validacao_extrato_antes_fluxo')
      .update({
        promoted_planilha_id: planilhaId,
        promoted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', r.id);
    if (updErr) {
      avisos.push(`marcar promoted: ${updErr.message}`);
      continue;
    }
    promovidos += 1;
  }

  return { promovidos, avisos };
}
