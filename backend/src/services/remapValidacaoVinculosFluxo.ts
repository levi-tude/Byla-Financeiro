/**
 * Religa validacao_pagamentos_vinculos após remigração do Fluxo (UUIDs novos).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fluxoPagamentoFingerprint,
  planRemapVinculosFluxo,
  type FluxoPagamentoIdentity,
} from '../logic/fluxoPagamentoFingerprint.js';

const SELECT_PAG =
  'id, aba, modalidade, linha_planilha, ordem_lancamento, aluno_nome, data_pagamento, forma, valor, mes_competencia, ano_competencia';

type PagRow = FluxoPagamentoIdentity & { id: string };

function asPagRow(r: Record<string, unknown>): PagRow {
  return {
    id: String(r.id),
    aba: String(r.aba ?? ''),
    modalidade: String(r.modalidade ?? ''),
    linha_planilha: Number(r.linha_planilha) || 0,
    ordem_lancamento: Number(r.ordem_lancamento) || 0,
    aluno_nome: String(r.aluno_nome ?? ''),
    data_pagamento: String(r.data_pagamento ?? '').slice(0, 10),
    forma: r.forma == null ? null : String(r.forma),
    valor: Number(r.valor) || 0,
    mes_competencia: Number(r.mes_competencia) || 0,
    ano_competencia: Number(r.ano_competencia) || 0,
  };
}

export async function loadFluxoPagamentosAno(
  supabase: SupabaseClient,
  ano: number,
): Promise<PagRow[]> {
  const inicio = `${ano}-01-01`;
  const fim = `${ano}-12-31`;
  const { data, error } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select(SELECT_PAG)
    .gte('data_pagamento', inicio)
    .lte('data_pagamento', fim);
  if (error) throw new Error(`Erro ao ler pagamentos do Fluxo: ${error.message}`);
  return (data ?? []).map((r) => asPagRow(r as Record<string, unknown>));
}

export async function loadVinculoPlanilhaIdsFluxoAno(
  supabase: SupabaseClient,
  ano: number,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('validacao_pagamentos_vinculos')
    .select('planilha_id')
    .eq('ano', ano)
    .like('planilha_id', 'fluxo::%');
  if (error) throw new Error(`Erro ao ler vínculos de validação: ${error.message}`);
  return (data ?? []).map((r) => String((r as { planilha_id: string }).planilha_id));
}

export type RemapVinculosReport = {
  remapeados: number;
  orfaos: number;
  inalterados: number;
  erros: string[];
};

/**
 * Aplica UPDATE planilha_id nos vínculos cujo pagamento reapareceu com UUID novo.
 */
export async function aplicarRemapVinculosFluxo(
  supabase: SupabaseClient,
  args: {
    oldPayments: PagRow[];
    newPayments: PagRow[];
    vinculoPlanilhaIds: string[];
  },
): Promise<RemapVinculosReport> {
  const plan = planRemapVinculosFluxo(args);
  const report: RemapVinculosReport = {
    remapeados: 0,
    orfaos: plan.orphaned.length,
    inalterados: plan.unchanged.length,
    erros: [],
  };

  for (const u of plan.updates) {
    // Se o novo id já tiver vínculo (colisão rara), remove o antigo órfão.
    const { data: conflict } = await supabase
      .from('validacao_pagamentos_vinculos')
      .select('planilha_id')
      .eq('planilha_id', u.newPlanilhaId)
      .maybeSingle();

    if (conflict) {
      const { error: delErr } = await supabase
        .from('validacao_pagamentos_vinculos')
        .delete()
        .eq('planilha_id', u.oldPlanilhaId);
      if (delErr) {
        report.erros.push(`${u.oldPlanilhaId}: ${delErr.message}`);
        continue;
      }
      report.orfaos += 1;
      continue;
    }

    const { error } = await supabase
      .from('validacao_pagamentos_vinculos')
      .update({ planilha_id: u.newPlanilhaId, updated_at: new Date().toISOString() })
      .eq('planilha_id', u.oldPlanilhaId);

    if (error) {
      report.erros.push(`${u.oldPlanilhaId}: ${error.message}`);
    } else {
      report.remapeados += 1;
    }
  }

  return report;
}

/** Utilitário de debug / logs. */
export function summarizeFingerprints(payments: PagRow[]): number {
  return new Set(payments.map((p) => fluxoPagamentoFingerprint(p))).size;
}
