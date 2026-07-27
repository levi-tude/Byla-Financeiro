/**
 * Seleção de pares planilha↔banco confirmados por match automático inequívoco
 * que ainda não têm vínculo persistido — para auto-gravar em validacao_pagamentos_vinculos.
 */

import { normalizePlanilhaId } from './fluxoPagamentoFingerprint.js';

export type ParConfirmadoAutoPersist = {
  planilhaId: string;
  bancoId: string;
};

/**
 * Retorna apenas 1:1 inequívocos ainda sem vínculo (nem planilha nem banco já ligados).
 * Não inclui "possível match" nem agrupamentos N→1 (esses ficam para confirmação manual).
 */
export function selecionarConfirmadosParaAutoPersistir(args: {
  confirmados: Array<{ planilhaId: string; bancoId: string }>;
  vinculosExistentes: Array<{ planilha_id: string; banco_id: string }>;
}): ParConfirmadoAutoPersist[] {
  const planilhaJaVinculada = new Set<string>();
  const bancoJaVinculado = new Set<string>();
  for (const v of args.vinculosExistentes) {
    const pid = normalizePlanilhaId(v.planilha_id);
    if (pid) planilhaJaVinculada.add(pid);
    const bid = String(v.banco_id ?? '').trim();
    if (bid) bancoJaVinculado.add(bid);
  }

  const out: ParConfirmadoAutoPersist[] = [];
  const planilhaNesteBatch = new Set<string>();
  const bancoNesteBatch = new Set<string>();

  for (const c of args.confirmados) {
    const planilhaId = normalizePlanilhaId(c.planilhaId);
    const bancoId = String(c.bancoId ?? '').trim();
    if (!planilhaId || !bancoId) continue;
    if (planilhaJaVinculada.has(planilhaId) || planilhaNesteBatch.has(planilhaId)) continue;
    if (bancoJaVinculado.has(bancoId) || bancoNesteBatch.has(bancoId)) continue;
    out.push({ planilhaId, bancoId });
    planilhaNesteBatch.add(planilhaId);
    bancoNesteBatch.add(bancoId);
  }
  return out;
}
