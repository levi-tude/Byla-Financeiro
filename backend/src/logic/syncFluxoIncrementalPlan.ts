/**
 * Diff puro do sync incremental do Fluxo.
 * Não toca no banco: só planeja updates / inserts / preservações de ausentes.
 */

import {
  fluxoPagamentoFingerprint,
  fluxoPagamentoFingerprintSemOrdem,
  fluxoPagamentoSlotKey,
  type FluxoPagamentoIdentity,
} from './fluxoPagamentoFingerprint.js';
import { chaveOverlayPorLinha } from './fluxoRemigracaoOverlays.js';

export type PagamentoDesiredIncremental = FluxoPagamentoIdentity & {
  responsaveis?: string | null;
  pagador_pix?: string | null;
  raw_pagamento?: unknown;
};

export type PagamentoExistingIncremental = PagamentoDesiredIncremental & {
  id: string;
  origem: string;
};

export type PagamentoUpdatePlanejado = {
  id: string;
  patch: {
    valor: number;
    forma: string | null;
    data_pagamento: string;
    mes_competencia: number;
    ano_competencia: number;
    modalidade: string;
    aluno_nome: string;
    responsaveis: string | null;
    pagador_pix: string | null;
    raw_pagamento?: unknown;
  };
  motivo: 'slot' | 'sem_ordem' | 'fingerprint';
};

export type PlanoPagamentosIncremental = {
  inalterados: string[];
  updates: PagamentoUpdatePlanejado[];
  inserts: PagamentoDesiredIncremental[];
  ausentesSemVinculo: string[];
  obsoletosComVinculo: string[];
  avisos: string[];
};

export type PlanoAlunosIncremental = {
  upsertCount: number;
  inativar: Array<{ aba: string; linha_planilha: number }>;
};

function normText(s: string | null | undefined): string {
  return String(s ?? '').trim();
}

function money(n: number): number {
  return Number(Number(n || 0).toFixed(2));
}

function camposMutaveisIguais(
  a: PagamentoDesiredIncremental,
  b: PagamentoDesiredIncremental,
): boolean {
  return (
    money(a.valor) === money(b.valor) &&
    normText(a.forma) === normText(b.forma) &&
    String(a.data_pagamento ?? '').slice(0, 10) === String(b.data_pagamento ?? '').slice(0, 10) &&
    Number(a.mes_competencia || 0) === Number(b.mes_competencia || 0) &&
    Number(a.ano_competencia || 0) === Number(b.ano_competencia || 0) &&
    normText(a.modalidade) === normText(b.modalidade) &&
    normText(a.aluno_nome) === normText(b.aluno_nome) &&
    normText(a.responsaveis) === normText(b.responsaveis) &&
    normText(a.pagador_pix) === normText(b.pagador_pix)
  );
}

function patchFromDesired(d: PagamentoDesiredIncremental): PagamentoUpdatePlanejado['patch'] {
  const patch: PagamentoUpdatePlanejado['patch'] = {
    valor: money(d.valor),
    forma: d.forma == null || !String(d.forma).trim() ? null : String(d.forma).trim(),
    data_pagamento: String(d.data_pagamento ?? '').slice(0, 10),
    mes_competencia: Number(d.mes_competencia || 0),
    ano_competencia: Number(d.ano_competencia || 0),
    modalidade: String(d.modalidade ?? '').trim(),
    aluno_nome: String(d.aluno_nome ?? '').trim(),
    responsaveis: d.responsaveis == null || !String(d.responsaveis).trim() ? null : String(d.responsaveis).trim(),
    pagador_pix: d.pagador_pix == null || !String(d.pagador_pix).trim() ? null : String(d.pagador_pix).trim(),
  };
  if (d.raw_pagamento !== undefined) patch.raw_pagamento = d.raw_pagamento;
  return patch;
}

function indexUnico<T>(
  items: T[],
  keyFn: (item: T) => string,
): { unique: Map<string, T>; ambiguous: Set<string> } {
  const counts = new Map<string, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const list = counts.get(k) ?? [];
    list.push(item);
    counts.set(k, list);
  }
  const unique = new Map<string, T>();
  const ambiguous = new Set<string>();
  for (const [k, list] of counts) {
    if (list.length === 1) unique.set(k, list[0]!);
    else ambiguous.add(k);
  }
  return { unique, ambiguous };
}

/**
 * Planeja o diff de pagamentos. `existing` deve já estar filtrado para origem=migracao_planilha.
 * `vinculadosIds` = UUIDs de fluxo_pagamentos_operacionais que têm vínculo fluxo::.
 */
export function planPagamentosIncremental(args: {
  desired: PagamentoDesiredIncremental[];
  existing: PagamentoExistingIncremental[];
  vinculadosIds: Set<string>;
}): PlanoPagamentosIncremental {
  const existingMigracao = args.existing.filter((p) => p.origem === 'migracao_planilha');
  const desired = args.desired;
  const avisos: string[] = [];

  const byFpExisting = indexUnico(existingMigracao, fluxoPagamentoFingerprint);
  const byFpDesired = indexUnico(desired, fluxoPagamentoFingerprint);

  const usedDesired = new Set<PagamentoDesiredIncremental>();
  const usedExisting = new Set<string>();
  const inalterados: string[] = [];
  const updates: PagamentoUpdatePlanejado[] = [];

  for (const d of desired) {
    const fp = fluxoPagamentoFingerprint(d);
    const ex = byFpExisting.unique.get(fp);
    if (!ex || usedExisting.has(ex.id)) continue;
    usedDesired.add(d);
    usedExisting.add(ex.id);
    if (camposMutaveisIguais(d, ex)) inalterados.push(ex.id);
    else updates.push({ id: ex.id, patch: patchFromDesired(d), motivo: 'fingerprint' });
  }

  const desiredRest = desired.filter((d) => !usedDesired.has(d));
  const existingRest = existingMigracao.filter((p) => !usedExisting.has(p.id));

  const bySlotDesired = indexUnico(desiredRest, fluxoPagamentoSlotKey);
  const bySlotExisting = indexUnico(existingRest, fluxoPagamentoSlotKey);

  for (const [slot, d] of bySlotDesired.unique) {
    const ex = bySlotExisting.unique.get(slot);
    if (!ex || usedExisting.has(ex.id) || usedDesired.has(d)) continue;
    usedDesired.add(d);
    usedExisting.add(ex.id);
    if (camposMutaveisIguais(d, ex)) inalterados.push(ex.id);
    else updates.push({ id: ex.id, patch: patchFromDesired(d), motivo: 'slot' });
  }

  const desiredAposSlot = desired.filter((d) => !usedDesired.has(d));
  const existingAposSlot = existingMigracao.filter((p) => !usedExisting.has(p.id));

  const bySemOrdemDesired = indexUnico(desiredAposSlot, fluxoPagamentoFingerprintSemOrdem);
  const bySemOrdemExisting = indexUnico(existingAposSlot, fluxoPagamentoFingerprintSemOrdem);

  for (const [k, d] of bySemOrdemDesired.unique) {
    const ex = bySemOrdemExisting.unique.get(k);
    if (!ex || usedExisting.has(ex.id) || usedDesired.has(d)) continue;
    usedDesired.add(d);
    usedExisting.add(ex.id);
    if (camposMutaveisIguais(d, ex)) {
      inalterados.push(ex.id);
      avisos.push(`ordem_lancamento divergente no pagamento ${ex.id} (mantido)`);
    } else {
      updates.push({ id: ex.id, patch: patchFromDesired(d), motivo: 'sem_ordem' });
      avisos.push(`ordem_lancamento divergente no pagamento ${ex.id} (atualizado sem mudar ordem)`);
    }
  }

  const inserts = desired.filter((d) => !usedDesired.has(d));
  const leftover = existingMigracao.filter((p) => !usedExisting.has(p.id));
  const ausentesSemVinculo: string[] = [];
  const obsoletosComVinculo: string[] = [];
  for (const p of leftover) {
    if (args.vinculadosIds.has(p.id)) obsoletosComVinculo.push(p.id);
    else ausentesSemVinculo.push(p.id);
  }

  if (byFpDesired.ambiguous.size > 0) {
    avisos.push(`fingerprint duplicado na planilha: ${byFpDesired.ambiguous.size}`);
  }

  if (ausentesSemVinculo.length > 0) {
    avisos.push(
      `${ausentesSemVinculo.length} pagamentos ausentes na planilha foram preservados para revisão manual`,
    );
  }

  return { inalterados, updates, inserts, ausentesSemVinculo, obsoletosComVinculo, avisos };
}

export function planAlunosIncremental(args: {
  desired: Array<{ aba: string; linha_planilha: number }>;
  existing: Array<{ aba: string; linha_planilha: number; ativo: boolean }>;
}): PlanoAlunosIncremental {
  const desiredKeys = new Set(
    args.desired.map((d) => chaveOverlayPorLinha(d.aba, d.linha_planilha)),
  );
  const inativar: Array<{ aba: string; linha_planilha: number }> = [];
  for (const e of args.existing) {
    const key = chaveOverlayPorLinha(e.aba, e.linha_planilha);
    if (desiredKeys.has(key)) continue;
    if (e.ativo === false) continue;
    inativar.push({ aba: e.aba, linha_planilha: e.linha_planilha });
  }
  return { upsertCount: args.desired.length, inativar };
}
