import { getSupabase } from './supabaseClient.js';
import type { ControleModo } from '../domain/controleCaixa/modo.js';
import type { ControleTemplatePayload } from '../domain/controleCaixa/template.js';

export type ControlePersistPayload = ControleTemplatePayload;

/**
 * Upsert do período + replace completo de blocos/linhas para um (mes, ano, modo).
 * Nunca mistura modos: sync/editor usam 'sistema'; migração usa 'oficial'.
 */
export async function persistControleCaixaModo(
  mes: number,
  ano: number,
  payload: ControlePersistPayload,
  origem: string,
  modo: ControleModo,
): Promise<{ ok: true; periodoId: string } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase não configurado no backend.' };

  const { data: periodo, error: periodoErr } = await supabase
    .from('controle_caixa_periodos')
    .upsert(
      {
        mes,
        ano,
        modo,
        aba_ref: payload.abaRef ?? null,
        entrada_total: payload.totais.entradaTotal ?? null,
        saida_total: payload.totais.saidaTotal ?? null,
        lucro_total: payload.totais.lucroTotal ?? null,
        saida_parceiros_total: payload.totais.saidaParceirosTotal ?? null,
        saida_fixas_total: payload.totais.saidaFixasTotal ?? null,
        saida_soma_secoes_principais: payload.totais.saidaSomaSecoesPrincipais ?? null,
        origem,
      },
      { onConflict: 'mes,ano,modo' },
    )
    .select('id')
    .single<{ id: string }>();
  if (periodoErr || !periodo) {
    return { error: periodoErr?.message ?? 'Falha ao salvar período.' };
  }

  const periodoId = periodo.id;
  const delBlocos = await supabase.from('controle_caixa_blocos').delete().eq('periodo_id', periodoId);
  if (delBlocos.error) return { error: delBlocos.error.message };

  for (const bloco of payload.blocos) {
    const { data: blocoRow, error: blocoErr } = await supabase
      .from('controle_caixa_blocos')
      .insert({
        periodo_id: periodoId,
        tipo: bloco.tipo,
        titulo: bloco.titulo,
        ordem: bloco.ordem,
        template_key: bloco.templateKey ?? null,
        is_default: bloco.isDefault ?? false,
        is_custom: bloco.isCustom ?? true,
        locked_level: bloco.lockedLevel ?? 'none',
      })
      .select('id')
      .single<{ id: string }>();
    if (blocoErr || !blocoRow) {
      return { error: blocoErr?.message ?? 'Falha ao salvar bloco.' };
    }
    if (bloco.linhas.length === 0) continue;
    const insLinhas = await supabase.from('controle_caixa_linhas').insert(
      bloco.linhas.map((linha) => ({
        bloco_id: blocoRow.id,
        label: linha.label,
        valor: linha.valor ?? null,
        valor_texto: linha.valorTexto ?? null,
        ordem: linha.ordem,
        template_key: linha.templateKey ?? null,
        is_default: linha.isDefault ?? false,
        is_custom: linha.isCustom ?? true,
        locked_level: linha.lockedLevel ?? 'none',
      })),
    );
    if (insLinhas.error) return { error: insLinhas.error.message };
  }
  return { ok: true, periodoId };
}
