import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  executarPlanoConfirmacao,
  planejarConfirmacaoLote,
  type MatchSeguroLote,
  type ParConfirmacaoLote,
} from '../logic/matchesProvaveisLote.js';
import { aplicarSugestaoMapeamentoFromVinculos } from './mapeamentoFromValidacaoFluxo.js';
import { aprenderAlunoPagadorFromVinculo } from './mapeamentoAlunoPagador.js';
import { getMatchesProvaveisMes } from './matchesProvaveisMes.js';
import { getSupabase } from './supabaseClient.js';
import {
  listVinculosPorPlanilhaIds,
  upsertVinculosDia,
  type VinculoPagamento,
} from './validacaoVinculos.js';

const ORIGEM_LOTE = 'auto_match_mensal';

export type AplicarMatchesProvaveisLoteResult = {
  status: 'aplicado' | 'desatualizado';
  lote_id: string | null;
  analisados: number;
  aplicados: number;
  ignorados: number;
  erros: number;
  detalhes: Array<{
    planilha_id: string;
    banco_id: string;
    resultado: 'aplicado' | 'ignorado' | 'erro';
    motivo?: string;
  }>;
};

function dataMesAno(data: string): { mes: number; ano: number } {
  return { mes: Number(data.slice(5, 7)), ano: Number(data.slice(0, 4)) };
}

async function vinculosRelevantes(
  supabase: SupabaseClient,
  itens: MatchSeguroLote[],
): Promise<VinculoPagamento[]> {
  const planilhaIds = itens.flatMap((item) => item.planilha_ids);
  const porPlanilha = await listVinculosPorPlanilhaIds(planilhaIds);
  const bancoIds = [...new Set(itens.map((item) => item.banco_id).filter(Boolean))];
  if (bancoIds.length === 0) return porPlanilha;
  const { data, error } = await supabase
    .from('validacao_pagamentos_vinculos')
    .select('id, data_ref, mes, ano, banco_id, planilha_id, observacao, created_at, updated_at')
    .in('banco_id', bancoIds);
  if (error) throw new Error(error.message);
  const todos = [...porPlanilha, ...((data ?? []) as VinculoPagamento[])];
  return [...new Map(todos.map((v) => [v.id, v])).values()];
}

async function parContinuaLivre(
  supabase: SupabaseClient,
  par: ParConfirmacaoLote,
): Promise<boolean> {
  const porPlanilha = await listVinculosPorPlanilhaIds([par.planilhaId]);
  if (porPlanilha.length > 0) return false;
  const { data, error } = await supabase
    .from('validacao_pagamentos_vinculos')
    .select('id')
    .eq('banco_id', par.bancoId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length === 0;
}

async function registrarAuditoriaLote(
  supabase: SupabaseClient,
  args: {
    loteId: string;
    mes: number;
    ano: number;
    userId?: string | null;
    userEmail?: string | null;
    userRole?: string | null;
    aplicados: number;
    ignorados: number;
    erros: number;
  },
): Promise<void> {
  await supabase.from('fluxo_operacional_auditoria').insert({
    entidade: 'pagamento',
    acao: 'create',
    registro_id: args.loteId,
    user_id: args.userId ?? null,
    user_email: args.userEmail ?? null,
    user_role: args.userRole ?? null,
    before_data: null,
    after_data: {
      origem: ORIGEM_LOTE,
      mes: args.mes,
      ano: args.ano,
      aplicados: args.aplicados,
      ignorados: args.ignorados,
      erros: args.erros,
    },
  });
}

export async function aplicarMatchesProvaveisSegurosMes(args: {
  mes: number;
  ano: number;
  analiseId: string;
  actor?: { userId?: string | null; email?: string | null; role?: string | null };
}): Promise<AplicarMatchesProvaveisLoteResult> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');

  // Recalcula tudo imediatamente antes do lote; não confia no payload anterior da tela.
  const analiseAtual = await getMatchesProvaveisMes(args.mes, args.ano);
  const itensAtuais = analiseAtual.por_dia.flatMap((dia) => dia.itens);
  const vinculos = await vinculosRelevantes(supabase, itensAtuais);
  const plano = planejarConfirmacaoLote({
    itensAtuais,
    analiseId: args.analiseId,
    vinculosExistentes: vinculos,
  });

  if (plano.status === 'desatualizado') {
    return {
      status: 'desatualizado',
      lote_id: null,
      analisados: itensAtuais.length,
      aplicados: 0,
      ignorados: plano.ignorados,
      erros: 0,
      detalhes: [],
    };
  }

  const loteId = randomUUID();
  const observacao = `${ORIGEM_LOTE}::${loteId}`;
  const execucao = await executarPlanoConfirmacao({
    pares: plano.pares,
    revalidar: (par) => parContinuaLivre(supabase, par),
    gravar: async (par) => {
      const ref = dataMesAno(par.dataFluxo);
      const result = await upsertVinculosDia(
        par.dataFluxo,
        ref.mes,
        ref.ano,
        par.bancoId,
        [par.planilhaId],
        observacao,
      );
      if (result.persisted !== 'supabase') {
        throw new Error('O vínculo não foi persistido no banco.');
      }
      await aplicarSugestaoMapeamentoFromVinculos(
        supabase,
        par.dataFluxo,
        ref.mes,
        ref.ano,
        par.bancoId,
        [par.planilhaId],
      ).catch(() => undefined);
      await aprenderAlunoPagadorFromVinculo(supabase, par.planilhaId, par.bancoId).catch(
        () => undefined,
      );
    },
  });

  await registrarAuditoriaLote(supabase, {
    loteId,
    mes: args.mes,
    ano: args.ano,
    userId: args.actor?.userId,
    userEmail: args.actor?.email,
    userRole: args.actor?.role,
    aplicados: execucao.aplicados.length,
    ignorados: plano.ignorados + execucao.ignorados.length,
    erros: execucao.erros.length,
  }).catch(() => undefined);

  return {
    status: 'aplicado',
    lote_id: loteId,
    analisados: plano.pares.length + plano.ignorados,
    aplicados: execucao.aplicados.length,
    ignorados: plano.ignorados + execucao.ignorados.length,
    erros: execucao.erros.length,
    detalhes: [
      ...execucao.aplicados.map((p) => ({
        planilha_id: p.planilhaId,
        banco_id: p.bancoId,
        resultado: 'aplicado' as const,
      })),
      ...execucao.ignorados.map((p) => ({
        planilha_id: p.planilhaId,
        banco_id: p.bancoId,
        resultado: 'ignorado' as const,
        motivo: 'O caso mudou ou já foi vinculado durante a aplicação.',
      })),
      ...execucao.erros.map((p) => ({
        planilha_id: p.planilhaId,
        banco_id: p.bancoId,
        resultado: 'erro' as const,
        motivo: p.erro,
      })),
    ],
  };
}

export async function desfazerLoteMatchesProvaveis(
  loteId: string,
): Promise<{ lote_id: string; removidos: number }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');
  const observacao = `${ORIGEM_LOTE}::${loteId}`;
  const { data: rows, error: selectError } = await supabase
    .from('validacao_pagamentos_vinculos')
    .select('id')
    .eq('observacao', observacao);
  if (selectError) throw new Error(selectError.message);
  const ids = (rows ?? []).map((row) => String((row as { id: string }).id));
  if (ids.length === 0) return { lote_id: loteId, removidos: 0 };
  const { error } = await supabase.from('validacao_pagamentos_vinculos').delete().in('id', ids);
  if (error) throw new Error(error.message);
  return { lote_id: loteId, removidos: ids.length };
}
