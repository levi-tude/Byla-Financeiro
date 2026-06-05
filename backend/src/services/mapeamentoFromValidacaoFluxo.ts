import type { SupabaseClient } from '@supabase/supabase-js';
import { hintAbaFluxoParaControle } from '../domain/entradas/abaControleMap.js';
import {
  isCategoriaEntradaAluguelCoworking,
  isCategoriaEntradaParceiros,
  loadCatalogoEntradasControleMes,
  resolveHintNoCatalogo,
} from '../domain/entradas/categoriasEntrada.js';
import { normalizePessoa } from '../logic/normalizePessoa.js';
import type { MapeamentoRow } from '../logic/despesasMapeamento.js';
import { listVinculosMes, findVinculoByPlanilhaId } from './validacaoVinculos.js';
import {
  loadMapeamentoEntradaByPessoa,
  mapeamentoFluxoExtraFields,
} from './mapeamentoPessoaCategoriaQuery.js';

async function loadMapeamentoEntrada(
  supabase: SupabaseClient,
  pessoaNorm: string,
): Promise<MapeamentoRow | null> {
  return loadMapeamentoEntradaByPessoa(supabase, pessoaNorm);
}

type FluxoPagamentoRow = {
  id: string;
  aba: string;
  modalidade: string;
  aluno_nome: string;
  pagador_pix: string | null;
  mes_competencia: number;
  ano_competencia: number;
};

function parseFluxoId(planilhaId: string): string | null {
  const t = planilhaId.trim();
  if (t.startsWith('fluxo::')) return t.slice('fluxo::'.length);
  return null;
}

function detalheSugestao(dataRef: string, aluno: string, modalidade: string): string {
  const alunoLabel = aluno.trim() || '—';
  const modLabel = modalidade.trim() || '—';
  const [y, m, d] = dataRef.slice(0, 10).split('-');
  const dataBr = d && m && y ? `${d}/${m}/${y}` : dataRef;
  return `Vínculo ${dataBr} · ${alunoLabel} · ${modLabel}`;
}

/** true quando o mesmo pagador tem vínculos apontando para linhas diferentes no mês. */
export function conflitoAbasTemplateKeys(templateKeys: string[]): boolean {
  const unique = [...new Set(templateKeys.filter(Boolean))];
  return unique.length > 1;
}

async function templateKeysVinculosMesmoPagador(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
  pessoaNorm: string,
): Promise<string[]> {
  const vinculos = await listVinculosMes(mes, ano);
  const keys: string[] = [];
  for (const v of vinculos) {
    const fluxo = await loadFluxoPagamento(supabase, v.planilha_id);
    if (!fluxo) continue;
    const bancoPessoa = await loadBancoPessoa(supabase, v.banco_id);
    const pagadorRaw = (fluxo.pagador_pix ?? '').trim() || bancoPessoa || '';
    const pn = normalizePessoa(pagadorRaw);
    if (pn !== pessoaNorm) continue;
    const hint = hintAbaFluxoParaControle(fluxo.aba, fluxo.modalidade);
    if (hint) keys.push(hint.templateKeyPreferido);
  }
  return keys;
}

async function loadFluxoPagamento(
  supabase: SupabaseClient,
  planilhaId: string,
): Promise<FluxoPagamentoRow | null> {
  const fluxoId = parseFluxoId(planilhaId);
  if (!fluxoId) return null;
  const { data, error } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select('id, aba, modalidade, aluno_nome, pagador_pix, mes_competencia, ano_competencia')
    .eq('id', fluxoId)
    .maybeSingle<FluxoPagamentoRow>();
  if (error || !data) return null;
  return data;
}

async function loadBancoPessoa(supabase: SupabaseClient, bancoId: string): Promise<string | null> {
  const { data, error } = await supabase.from('transacoes').select('pessoa').eq('id', bancoId).maybeSingle();
  if (error || !data) return null;
  const p = String((data as { pessoa?: string }).pessoa ?? '').trim();
  return p || null;
}

/** Não sobrescreve regra manual já confirmada. */
function podeAplicarSugestao(existing: MapeamentoRow | null): boolean {
  if (!existing) return true;
  if (existing.confirmado !== false && existing.origem_regra !== 'validacao_fluxo') return false;
  return true;
}

export type SugestaoFluxoResult = {
  aplicados: number;
  ignorados: number;
  erros: string[];
};

/**
 * Ao vincular PIX ↔ linha do fluxo no Pagamento dia a dia, grava sugestão em mapeamento (confirmado=false).
 */
export async function aplicarSugestaoMapeamentoFromVinculos(
  supabase: SupabaseClient,
  dataRef: string,
  mes: number,
  ano: number,
  bancoId: string,
  planilhaIds: string[],
): Promise<SugestaoFluxoResult> {
  const result: SugestaoFluxoResult = { aplicados: 0, ignorados: 0, erros: [] };
  const bancoPessoa = await loadBancoPessoa(supabase, bancoId);
  if (!bancoPessoa) {
    result.erros.push('Transação bancária não encontrada.');
    return result;
  }

  for (const planilhaId of planilhaIds) {
    const fluxo = await loadFluxoPagamento(supabase, planilhaId);
    if (!fluxo) {
      result.ignorados += 1;
      continue;
    }

    const pagadorRaw = (fluxo.pagador_pix ?? '').trim() || bancoPessoa;
    const pessoaNorm = normalizePessoa(pagadorRaw);
    if (!pessoaNorm) {
      result.ignorados += 1;
      continue;
    }

    const catalogMes = fluxo.mes_competencia >= 1 && fluxo.mes_competencia <= 12 ? fluxo.mes_competencia : mes;
    const catalogAno = fluxo.ano_competencia >= 2000 ? fluxo.ano_competencia : ano;

    const hint = hintAbaFluxoParaControle(fluxo.aba, fluxo.modalidade);
    if (!hint) {
      result.ignorados += 1;
      continue;
    }

    let catalog;
    try {
      catalog = await loadCatalogoEntradasControleMes(catalogMes, catalogAno);
    } catch (e) {
      result.erros.push(e instanceof Error ? e.message : String(e));
      continue;
    }

    const cat = resolveHintNoCatalogo(catalog, hint);
    if (!cat) {
      result.ignorados += 1;
      continue;
    }

    if (isCategoriaEntradaAluguelCoworking(cat)) {
      result.ignorados += 1;
      continue;
    }
    if (!isCategoriaEntradaParceiros(cat)) {
      result.ignorados += 1;
      continue;
    }

    const keysMes = await templateKeysVinculosMesmoPagador(supabase, mes, ano, pessoaNorm);
    if (conflitoAbasTemplateKeys(keysMes)) {
      result.ignorados += 1;
      continue;
    }

    const existing = await loadMapeamentoEntrada(supabase, pessoaNorm);
    if (!podeAplicarSugestao(existing)) {
      result.ignorados += 1;
      continue;
    }

    const subcategoria =
      fluxo.aba && fluxo.modalidade
        ? `${fluxo.aba} · ${fluxo.modalidade}`
        : fluxo.modalidade || fluxo.aba || null;

    const row = {
      pessoa_normalizada: pessoaNorm,
      categoria: cat.label,
      subcategoria,
      template_key: cat.templateKey,
      bloco_template_key: cat.blocoTemplateKey,
      aplica_tipo: 'entrada' as const,
      ativo: true,
      ...mapeamentoFluxoExtraFields(),
      observacao: detalheSugestao(dataRef, fluxo.aluno_nome, fluxo.modalidade),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('mapeamento_pessoa_categoria')
      .upsert(row, { onConflict: 'pessoa_normalizada,aplica_tipo' });

    if (error) {
      result.erros.push(error.message);
    } else {
      result.aplicados += 1;
    }
  }

  return result;
}

/** Garante sugestões de mapeamento para vínculos já salvos (não exige refazer validação). */
export async function sincronizarMapeamentoSugestoesFromVinculosMes(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
): Promise<SugestaoFluxoResult> {
  const vinculos = await listVinculosMes(mes, ano);
  const merged: SugestaoFluxoResult = { aplicados: 0, ignorados: 0, erros: [] };
  const byBanco = new Map<string, { dataRef: string; planilhaIds: string[] }>();

  for (const v of vinculos) {
    const cur = byBanco.get(v.banco_id) ?? { dataRef: v.data_ref, planilhaIds: [] };
    cur.planilhaIds.push(v.planilha_id);
    byBanco.set(v.banco_id, cur);
  }

  for (const [bancoId, { dataRef, planilhaIds }] of byBanco) {
    const r = await aplicarSugestaoMapeamentoFromVinculos(supabase, dataRef, mes, ano, bancoId, planilhaIds);
    merged.aplicados += r.aplicados;
    merged.ignorados += r.ignorados;
    merged.erros.push(...r.erros);
  }

  return merged;
}

/** Remove sugestão não confirmada quando o vínculo é desfeito (se não houver outro vínculo igual no mês). */
export async function revogarSugestaoMapeamentoFromVinculo(
  supabase: SupabaseClient,
  planilhaId: string,
): Promise<void> {
  const vinculoRemovido = await findVinculoByPlanilhaId(planilhaId);
  if (!vinculoRemovido) return;

  const fluxo = await loadFluxoPagamento(supabase, planilhaId);
  if (!fluxo) return;

  const { mes, ano } = vinculoRemovido;
  const vinculos = await listVinculosMes(mes, ano);
  const bancoPessoa = await loadBancoPessoa(supabase, vinculoRemovido.banco_id);
  const pagadorRaw = (fluxo.pagador_pix ?? '').trim() || bancoPessoa || '';
  const pessoaNorm = normalizePessoa(pagadorRaw);
  if (!pessoaNorm) return;

  const outrosVinculosMesmoPagador = await Promise.all(
    vinculos
      .filter((v) => v.planilha_id !== planilhaId)
      .map(async (v) => {
        const f = await loadFluxoPagamento(supabase, v.planilha_id);
        if (!f) return false;
        const bp = await loadBancoPessoa(supabase, v.banco_id);
        const pn = normalizePessoa((f.pagador_pix ?? '').trim() || bp || '');
        return pn === pessoaNorm;
      }),
  );
  if (outrosVinculosMesmoPagador.some(Boolean)) return;

  const existing = await loadMapeamentoEntrada(supabase, pessoaNorm);
  if (!existing) return;
  if (existing.confirmado !== false || existing.origem_regra !== 'validacao_fluxo') return;

  await supabase.from('mapeamento_pessoa_categoria').delete().eq('id', existing.id);
}
