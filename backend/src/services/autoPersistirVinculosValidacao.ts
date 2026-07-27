/**
 * Auto-grava vínculos inequívocos da Validação diária (match 1 candidato)
 * e aprende sticky aluno↔pagador / mapeamento categoria quando possível.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  selecionarConfirmadosParaAutoPersistir,
  type ParConfirmadoAutoPersist,
} from '../logic/autoPersistirVinculosValidacao.js';
import { aplicarSugestaoMapeamentoFromVinculos } from './mapeamentoFromValidacaoFluxo.js';
import { aprenderAlunoPagadorFromVinculo } from './mapeamentoAlunoPagador.js';
import { upsertVinculosDia, type VinculoPagamento } from './validacaoVinculos.js';

const OBS_AUTO = 'auto_match';

export type AutoPersistirVinculosResult = {
  gravados: ParConfirmadoAutoPersist[];
  erros: string[];
};

/**
 * Persiste pares confirmados por match automático que ainda não estão em validacao_pagamentos_vinculos.
 * Best-effort: falhas individuais não abortam o restante.
 */
export async function persistirConfirmadosAutomaticosValidacao(args: {
  dataRef: string;
  mes: number;
  ano: number;
  confirmados: Array<{ planilhaId: string; bancoId: string }>;
  vinculosExistentes: Array<{ planilha_id: string; banco_id: string }>;
  supabase?: SupabaseClient | null;
}): Promise<AutoPersistirVinculosResult> {
  const pares = selecionarConfirmadosParaAutoPersistir({
    confirmados: args.confirmados,
    vinculosExistentes: args.vinculosExistentes,
  });
  const gravados: ParConfirmadoAutoPersist[] = [];
  const erros: string[] = [];

  // Agrupa por banco (upsert aceita N planilhas para o mesmo banco_id).
  const byBanco = new Map<string, string[]>();
  for (const p of pares) {
    const arr = byBanco.get(p.bancoId) ?? [];
    arr.push(p.planilhaId);
    byBanco.set(p.bancoId, arr);
  }

  for (const [bancoId, planilhaIds] of byBanco) {
    try {
      const result = await upsertVinculosDia(
        args.dataRef,
        args.mes,
        args.ano,
        bancoId,
        planilhaIds,
        OBS_AUTO,
      );
      for (const pid of planilhaIds) {
        gravados.push({ planilhaId: pid, bancoId });
      }

      if (args.supabase && result.persisted === 'supabase') {
        await aplicarSugestaoMapeamentoFromVinculos(
          args.supabase,
          args.dataRef,
          args.mes,
          args.ano,
          bancoId,
          planilhaIds,
        ).catch(() => undefined);
        for (const pid of planilhaIds) {
          await aprenderAlunoPagadorFromVinculo(args.supabase, pid, bancoId).catch(() => undefined);
        }
      }
    } catch (e) {
      erros.push(e instanceof Error ? e.message : String(e));
    }
  }

  return { gravados, erros };
}

/** Mescla vínculos existentes com os recém-gravados (para o restante do pipeline do dia). */
export function mesclarVinculosComAutoGravados(
  existentes: VinculoPagamento[],
  gravados: ParConfirmadoAutoPersist[],
): Array<{ planilha_id: string; banco_id: string }> {
  const byPlanilha = new Map<string, { planilha_id: string; banco_id: string }>();
  for (const v of existentes) {
    byPlanilha.set(v.planilha_id, { planilha_id: v.planilha_id, banco_id: v.banco_id });
  }
  for (const g of gravados) {
    byPlanilha.set(g.planilhaId, { planilha_id: g.planilhaId, banco_id: g.bancoId });
  }
  return [...byPlanilha.values()];
}
