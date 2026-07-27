/**
 * P0 — recupera vínculos órfãos pós-remigração do Fluxo (persiste remap 1:1 + sticky).
 * Não cria vínculos novos de Validação: só religa planilha_id já confirmados.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  analisarCasamentoOrfaosPorDataValor,
  type OrfaoParaHeuristica,
} from '../logic/vinculosOrfaosHeuristica.js';
import {
  fluxoUuidFromAnyPlanilhaId,
  planilhaIdFromFluxoUuid,
  planRemapVinculosFluxo,
} from '../logic/fluxoPagamentoFingerprint.js';
import { sincronizarMapeamentoAlunoPagadorFromVinculosAno } from './mapeamentoAlunoPagador.js';
import {
  aplicarRemapVinculosFluxo,
  loadFluxoPagamentosAno,
  loadVinculoPlanilhaIdsFluxoAno,
  type RemapVinculosReport,
} from './remapValidacaoVinculosFluxo.js';

const SELECT_PAG_MIN =
  'id, aba, linha_planilha, aluno_nome, data_pagamento, valor';

type PagMin = {
  id: string;
  aba: string;
  linha_planilha: number;
  aluno_nome: string;
  data_pagamento: string | null;
  valor: number;
};

function alunoMatchKey(aba: string, linha: number, alunoNome: string): string {
  return `${String(aba).trim().toLowerCase()}|${Number(linha)}|${String(alunoNome).trim().toLowerCase()}`;
}

function asPagMin(r: Record<string, unknown>): PagMin {
  return {
    id: String(r.id),
    aba: String(r.aba ?? ''),
    linha_planilha: Number(r.linha_planilha) || 0,
    aluno_nome: String(r.aluno_nome ?? ''),
    data_pagamento: r.data_pagamento == null ? null : String(r.data_pagamento).slice(0, 10),
    valor: Number(r.valor) || 0,
  };
}

export type RecuperarOrfaosReport = {
  ano: number;
  dryRun: boolean;
  orfaosEncontrados: number;
  remapeados: number;
  ambiguosIgnorados: number;
  semCandidato: number;
  stickyUpserted: number;
  stickySkipped: number;
  erros: string[];
  /** Amostra sem PII: só ids (para log/ops). */
  amostraRemap: Array<{ oldPlanilhaId: string; newPlanilhaId: string }>;
};

export type PosRemigracaoFluxoReport = {
  ano: number;
  fingerprint: RemapVinculosReport;
  heuristica: RecuperarOrfaosReport;
};

async function loadPagamentosAno(supabase: SupabaseClient, ano: number): Promise<PagMin[]> {
  const inicio = `${ano}-01-01`;
  const fim = `${ano}-12-31`;
  const { data, error } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select(SELECT_PAG_MIN)
    .gte('data_pagamento', inicio)
    .lte('data_pagamento', fim);
  if (error) throw new Error(`Erro ao ler pagamentos do Fluxo: ${error.message}`);
  return (data ?? []).map((r) => asPagMin(r as Record<string, unknown>));
}

async function loadVinculosFluxoAno(
  supabase: SupabaseClient,
  ano: number,
): Promise<Array<{ planilha_id: string; banco_id: string; data_ref: string }>> {
  const { data, error } = await supabase
    .from('validacao_pagamentos_vinculos')
    .select('planilha_id, banco_id, data_ref')
    .eq('ano', ano)
    .like('planilha_id', 'fluxo::%');
  if (error) throw new Error(`Erro ao ler vínculos: ${error.message}`);
  return (data ?? []).map((r) => ({
    planilha_id: String((r as { planilha_id: string }).planilha_id),
    banco_id: String((r as { banco_id: string }).banco_id),
    data_ref: String((r as { data_ref: string }).data_ref).slice(0, 10),
  }));
}

async function loadValorPessoaBanco(
  supabase: SupabaseClient,
  bancoIds: string[],
): Promise<Map<string, { valor: number; pessoa: string }>> {
  const out = new Map<string, { valor: number; pessoa: string }>();
  const CHUNK = 200;
  for (let i = 0; i < bancoIds.length; i += CHUNK) {
    const slice = bancoIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('transacoes')
      .select('id, pessoa, valor')
      .in('id', slice);
    if (error) throw new Error(`Erro ao ler transações: ${error.message}`);
    for (const t of data ?? []) {
      out.set(String((t as { id: string }).id), {
        valor: Math.abs(Number((t as { valor?: number }).valor ?? 0)),
        pessoa: String((t as { pessoa?: string }).pessoa ?? '').trim(),
      });
    }
  }
  return out;
}

/**
 * Aplica UPDATEs de planilha_id (com tratamento de colisão).
 */
export async function aplicarUpdatesPlanilhaId(
  supabase: SupabaseClient,
  updates: Array<{ oldPlanilhaId: string; newPlanilhaId: string }>,
  dryRun: boolean,
): Promise<{ remapeados: number; erros: string[]; colisoes: number }> {
  const report = { remapeados: 0, erros: [] as string[], colisoes: 0 };
  for (const u of updates) {
    if (dryRun) {
      report.remapeados += 1;
      continue;
    }
    const { data: conflict } = await supabase
      .from('validacao_pagamentos_vinculos')
      .select('planilha_id')
      .eq('planilha_id', u.newPlanilhaId)
      .maybeSingle();

    if (conflict) {
      report.colisoes += 1;
      const { error: delErr } = await supabase
        .from('validacao_pagamentos_vinculos')
        .delete()
        .eq('planilha_id', u.oldPlanilhaId);
      if (delErr) report.erros.push(`${u.oldPlanilhaId}: ${delErr.message}`);
      continue;
    }

    const { error } = await supabase
      .from('validacao_pagamentos_vinculos')
      .update({ planilha_id: u.newPlanilhaId, updated_at: new Date().toISOString() })
      .eq('planilha_id', u.oldPlanilhaId);

    if (error) report.erros.push(`${u.oldPlanilhaId}: ${error.message}`);
    else report.remapeados += 1;
  }
  return report;
}

/**
 * Planeja remap heurístico 1:1 (data±1 + valor) sem tocar no banco.
 * Usado em testes e pelo job de persistência.
 */
export function planRecuperarOrfaosHeuristica(args: {
  orfaos: OrfaoParaHeuristica[];
  pagamentosLivres: Array<{
    id: string;
    alunoKey: string;
    data_pagamento: string | null;
    valor: number;
  }>;
}): {
  updates: Array<{ oldPlanilhaId: string; newPlanilhaId: string; alunoKey: string }>;
  ambiguosIgnorados: number;
  semCandidato: number;
} {
  const analise = analisarCasamentoOrfaosPorDataValor({
    orfaos: args.orfaos,
    pagamentos: args.pagamentosLivres,
  });
  return {
    updates: analise.matches.map((m) => ({
      oldPlanilhaId: m.oldPlanilhaId,
      newPlanilhaId: planilhaIdFromFluxoUuid(m.newPagamentoId),
      alunoKey: m.alunoKey,
    })),
    ambiguosIgnorados: analise.ambiguosIgnorados,
    semCandidato: analise.semCandidato,
  };
}

/**
 * Job principal: órfãos do ano → remap 1:1 inequívoco → sticky backfill.
 */
export async function recuperarVinculosOrfaosFluxoAno(
  supabase: SupabaseClient,
  args: { ano: number; dryRun?: boolean; skipSticky?: boolean },
): Promise<RecuperarOrfaosReport> {
  const ano = args.ano;
  const dryRun = Boolean(args.dryRun);
  const report: RecuperarOrfaosReport = {
    ano,
    dryRun,
    orfaosEncontrados: 0,
    remapeados: 0,
    ambiguosIgnorados: 0,
    semCandidato: 0,
    stickyUpserted: 0,
    stickySkipped: 0,
    erros: [],
    amostraRemap: [],
  };

  const pagamentos = await loadPagamentosAno(supabase, ano);
  const vivos = new Set(pagamentos.map((p) => p.id));
  const vinculos = await loadVinculosFluxoAno(supabase, ano);

  const orfaosRows = vinculos.filter((v) => {
    const uuid = fluxoUuidFromAnyPlanilhaId(v.planilha_id);
    return Boolean(uuid) && !vivos.has(uuid!);
  });
  report.orfaosEncontrados = orfaosRows.length;
  if (orfaosRows.length === 0) {
    if (!args.skipSticky && !dryRun) {
      const sticky = await sincronizarMapeamentoAlunoPagadorFromVinculosAno(supabase, ano);
      report.stickyUpserted = sticky.upserted;
      report.stickySkipped = sticky.skipped;
    }
    return report;
  }

  const vinculadosVivos = new Set<string>();
  for (const v of vinculos) {
    const uuid = fluxoUuidFromAnyPlanilhaId(v.planilha_id);
    if (uuid && vivos.has(uuid)) vinculadosVivos.add(uuid);
  }

  const bancoMap = await loadValorPessoaBanco(
    supabase,
    [...new Set(orfaosRows.map((v) => v.banco_id).filter(Boolean))],
  );

  const orfaos: OrfaoParaHeuristica[] = orfaosRows.map((v) => {
    const tx = bancoMap.get(v.banco_id);
    return {
      planilha_id: v.planilha_id,
      data_ref: v.data_ref,
      valor: tx?.valor ?? 0,
      pessoa_banco: tx?.pessoa ?? null,
    };
  });

  const pagamentosLivres = pagamentos
    .filter((p) => !vinculadosVivos.has(p.id))
    .map((p) => ({
      id: p.id,
      alunoKey: alunoMatchKey(p.aba, p.linha_planilha, p.aluno_nome),
      data_pagamento: p.data_pagamento,
      valor: p.valor,
    }));

  const plan = planRecuperarOrfaosHeuristica({ orfaos, pagamentosLivres });
  report.ambiguosIgnorados = plan.ambiguosIgnorados;
  report.semCandidato = plan.semCandidato;
  report.amostraRemap = plan.updates.slice(0, 20).map((u) => ({
    oldPlanilhaId: u.oldPlanilhaId,
    newPlanilhaId: u.newPlanilhaId,
  }));

  const applied = await aplicarUpdatesPlanilhaId(
    supabase,
    plan.updates.map((u) => ({
      oldPlanilhaId: u.oldPlanilhaId,
      newPlanilhaId: u.newPlanilhaId,
    })),
    dryRun,
  );
  report.remapeados = applied.remapeados;
  report.erros.push(...applied.erros);
  if (applied.colisoes > 0) {
    report.ambiguosIgnorados += applied.colisoes;
  }

  if (!args.skipSticky && !dryRun) {
    const sticky = await sincronizarMapeamentoAlunoPagadorFromVinculosAno(supabase, ano);
    report.stickyUpserted = sticky.upserted;
    report.stickySkipped = sticky.skipped;
  }

  return report;
}

/**
 * Hook pós-remigração: fingerprint (com snapshot) + heurística residual + sticky.
 */
export async function recuperarVinculosAposRemigracaoFluxo(
  supabase: SupabaseClient,
  args: {
    ano: number;
    oldPayments: Awaited<ReturnType<typeof loadFluxoPagamentosAno>>;
    dryRun?: boolean;
  },
): Promise<PosRemigracaoFluxoReport> {
  const ano = args.ano;
  const dryRun = Boolean(args.dryRun);
  const newPayments = await loadFluxoPagamentosAno(supabase, ano);
  const vinculoPlanilhaIds = await loadVinculoPlanilhaIdsFluxoAno(supabase, ano);

  let fingerprint: RemapVinculosReport;
  if (dryRun) {
    const plan = planRemapVinculosFluxo({
      oldPayments: args.oldPayments,
      newPayments,
      vinculoPlanilhaIds,
    });
    fingerprint = {
      remapeados: plan.updates.length,
      orfaos: plan.orphaned.length,
      inalterados: plan.unchanged.length,
      erros: [],
    };
  } else {
    fingerprint = await aplicarRemapVinculosFluxo(supabase, {
      oldPayments: args.oldPayments,
      newPayments,
      vinculoPlanilhaIds,
    });
  }

  // sticky uma vez no final (fingerprint + heurística)
  const heuristica = await recuperarVinculosOrfaosFluxoAno(supabase, {
    ano,
    dryRun,
    skipSticky: true,
  });

  if (!dryRun) {
    const sticky = await sincronizarMapeamentoAlunoPagadorFromVinculosAno(supabase, ano);
    heuristica.stickyUpserted = sticky.upserted;
    heuristica.stickySkipped = sticky.skipped;
  }

  return { ano, fingerprint, heuristica };
}
