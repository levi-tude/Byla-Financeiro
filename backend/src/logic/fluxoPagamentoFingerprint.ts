/**
 * Identidade estável de um pagamento do Fluxo (independente do UUID).
 * Usada para religar validacao_pagamentos_vinculos após remigração.
 */

export type FluxoPagamentoIdentity = {
  aba: string;
  modalidade: string;
  linha_planilha: number;
  ordem_lancamento: number;
  aluno_nome: string;
  data_pagamento: string;
  forma: string | null;
  valor: number;
  mes_competencia: number;
  ano_competencia: number;
};

export function fluxoPagamentoFingerprint(p: FluxoPagamentoIdentity): string {
  return [
    String(p.aba ?? '').trim(),
    String(p.modalidade ?? '').trim(),
    String(Number(p.linha_planilha) || 0),
    String(Number(p.ordem_lancamento) || 0),
    String(p.aluno_nome ?? '').trim(),
    String(p.data_pagamento ?? '').slice(0, 10),
    String(p.forma ?? '').trim(),
    Number(p.valor || 0).toFixed(2),
    String(Number(p.mes_competencia) || 0),
    String(Number(p.ano_competencia) || 0),
  ].join('|');
}

export function planilhaIdFromFluxoUuid(id: string): string {
  const t = String(id ?? '').trim();
  if (t.startsWith('fluxo::')) return t;
  return `fluxo::${t}`;
}

export function fluxoUuidFromPlanilhaId(planilhaId: string): string | null {
  const t = String(planilhaId ?? '').trim();
  if (!t.startsWith('fluxo::')) return null;
  const id = t.slice('fluxo::'.length).trim();
  return id || null;
}

/** Aceita `fluxo::<uuid>` ou UUID bare (vínculos legados). */
export function fluxoUuidFromAnyPlanilhaId(planilhaId: string): string | null {
  const fromPrefix = fluxoUuidFromPlanilhaId(planilhaId);
  if (fromPrefix) return fromPrefix;
  const t = String(planilhaId ?? '').trim();
  if (/^[0-9a-f-]{36}$/i.test(t)) return t;
  return null;
}

export function normalizePlanilhaId(planilhaId: string): string {
  return planilhaIdFromFluxoUuid(planilhaId);
}

export type VinculoRemapUpdate = {
  oldPlanilhaId: string;
  newPlanilhaId: string;
};

export type VinculoRemapResult = {
  updates: VinculoRemapUpdate[];
  orphaned: string[];
  unchanged: string[];
};

/**
 * Cruza vínculos `fluxo::<uuid>` com pagamentos antigos/novos pela fingerprint.
 */
export function planRemapVinculosFluxo(args: {
  oldPayments: Array<FluxoPagamentoIdentity & { id: string }>;
  newPayments: Array<FluxoPagamentoIdentity & { id: string }>;
  vinculoPlanilhaIds: string[];
}): VinculoRemapResult {
  const oldById = new Map(args.oldPayments.map((p) => [p.id, p]));
  const newByFp = new Map<string, string>();
  for (const p of args.newPayments) {
    const fp = fluxoPagamentoFingerprint(p);
    // Se houver colisão, o primeiro ganha; UNIQUE da tabela evita duplicata real.
    if (!newByFp.has(fp)) newByFp.set(fp, p.id);
  }

  const updates: VinculoRemapUpdate[] = [];
  const orphaned: string[] = [];
  const unchanged: string[] = [];

  for (const planilhaId of args.vinculoPlanilhaIds) {
    const oldUuid = fluxoUuidFromPlanilhaId(planilhaId);
    if (!oldUuid) {
      unchanged.push(planilhaId);
      continue;
    }
    const oldPay = oldById.get(oldUuid);
    if (!oldPay) {
      orphaned.push(planilhaId);
      continue;
    }
    const newUuid = newByFp.get(fluxoPagamentoFingerprint(oldPay));
    if (!newUuid) {
      orphaned.push(planilhaId);
      continue;
    }
    if (newUuid === oldUuid) {
      unchanged.push(planilhaId);
      continue;
    }
    updates.push({
      oldPlanilhaId: planilhaId,
      newPlanilhaId: planilhaIdFromFluxoUuid(newUuid),
    });
  }

  return { updates, orphaned, unchanged };
}
