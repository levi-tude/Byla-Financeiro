import type { SupabaseClient } from '@supabase/supabase-js';
import { fluxoUuidFromAnyPlanilhaId } from '../logic/fluxoPagamentoFingerprint.js';

export type VinculoFluxoAlunoInfo = {
  alunos: string[];
  modalidades: string[];
  label: string;
};

/** Rótulo para UI — aluno(s) do Fluxo ligados ao extrato via Validação. */
export function formatVinculoFluxoLabel(alunos: string[], modalidades: string[]): string {
  const nomes = [...new Set(alunos.map((a) => a.trim()).filter(Boolean))];
  if (nomes.length === 0) return '';
  if (nomes.length === 1) {
    const mods = [...new Set(modalidades.map((m) => m.trim()).filter(Boolean))];
    if (mods.length === 1) return `${nomes[0]} · ${mods[0]}`;
    return nomes[0]!;
  }
  return nomes.join(', ');
}

export async function loadVinculoFluxoPorBancoIds(
  supabase: SupabaseClient,
  bancoIds: string[],
): Promise<Map<string, VinculoFluxoAlunoInfo>> {
  const ids = [...new Set(bancoIds.map((id) => String(id).trim()).filter(Boolean))];
  const out = new Map<string, VinculoFluxoAlunoInfo>();
  if (ids.length === 0) return out;

  const vinculos: { banco_id: string; planilha_id: string }[] = [];
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('validacao_pagamentos_vinculos')
      .select('banco_id, planilha_id')
      .in('banco_id', slice);
    if (error) throw new Error(error.message);
    if (Array.isArray(data)) vinculos.push(...(data as { banco_id: string; planilha_id: string }[]));
  }

  if (vinculos.length === 0) return out;

  const fluxoIds = [
    ...new Set(
      vinculos.map((v) => fluxoUuidFromAnyPlanilhaId(v.planilha_id)).filter((id): id is string => Boolean(id)),
    ),
  ];
  const fluxoById = new Map<string, { aluno_nome: string; modalidade: string }>();
  for (let i = 0; i < fluxoIds.length; i += CHUNK) {
    const slice = fluxoIds.slice(i, i + CHUNK);
    const { data: fluxos, error } = await supabase
      .from('fluxo_pagamentos_operacionais')
      .select('id, aluno_nome, modalidade')
      .in('id', slice);
    if (error) throw new Error(error.message);
    for (const f of fluxos ?? []) {
      fluxoById.set(String((f as { id: string }).id), {
        aluno_nome: String((f as { aluno_nome?: string }).aluno_nome ?? '').trim(),
        modalidade: String((f as { modalidade?: string }).modalidade ?? '').trim(),
      });
    }
  }

  const byBanco = new Map<string, { alunos: string[]; modalidades: string[] }>();
  for (const v of vinculos) {
    const uuid = fluxoUuidFromAnyPlanilhaId(v.planilha_id);
    if (!uuid) continue;
    const fluxo = fluxoById.get(uuid);
    if (!fluxo?.aluno_nome) continue;
    const cur = byBanco.get(v.banco_id) ?? { alunos: [], modalidades: [] };
    cur.alunos.push(fluxo.aluno_nome);
    if (fluxo.modalidade) cur.modalidades.push(fluxo.modalidade);
    byBanco.set(v.banco_id, cur);
  }

  for (const [bancoId, { alunos, modalidades }] of byBanco) {
    out.set(bancoId, {
      alunos,
      modalidades,
      label: formatVinculoFluxoLabel(alunos, modalidades),
    });
  }

  return out;
}
