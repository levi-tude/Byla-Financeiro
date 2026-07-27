import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePlanilhaId, planilhaIdFromFluxoUuid } from '../logic/fluxoPagamentoFingerprint.js';
import { isFormaPagamentoDinheiro } from '../logic/pagamentoDinheiroFluxo.js';
import {
  resolverRegimeCobranca,
  type RegimeCobrancaAluno,
} from '../logic/regimeCobrancaAluno.js';
import { listVinculosMes, listVinculosPorPlanilhaIds } from './validacaoVinculos.js';

export type StatusExtratoFluxo =
  | 'validado'
  | 'pendente'
  | 'divergente'
  | 'sem_lancamento'
  | 'bolsa'
  | 'excecao';

export type FluxoPagamentoExtratoStatus = {
  fluxo_pagamento_id: string;
  planilha_id: string;
  status_extrato: StatusExtratoFluxo;
  banco_id: string | null;
  vinculo_id: string | null;
};

export function indexVinculosList(
  vinculos: Array<{ id: string; banco_id: string; planilha_id: string }>,
): Map<string, { banco_id: string; id: string }> {
  const map = new Map<string, { banco_id: string; id: string }>();
  for (const v of vinculos) {
    const key = normalizePlanilhaId(v.planilha_id);
    map.set(key, { banco_id: v.banco_id, id: v.id });
  }
  return map;
}

export async function indexVinculosPorPlanilha(
  mes: number,
  ano: number,
): Promise<Map<string, { banco_id: string; id: string }>> {
  const vinculos = await listVinculosMes(mes, ano);
  return indexVinculosList(vinculos);
}

/** Índice pelos IDs dos pagamentos (independente do mês gravado no vínculo). */
export async function indexVinculosPorPagamentoIds(
  pagamentoIds: string[],
): Promise<Map<string, { banco_id: string; id: string }>> {
  const planilhaIds = pagamentoIds.map((id) => planilhaIdFromFluxoUuid(id));
  const vinculos = await listVinculosPorPlanilhaIds(planilhaIds);
  return indexVinculosList(vinculos);
}

export function statusExtratoForFluxoPagamento(
  fluxoPagamentoId: string,
  vinculosByPlanilha: Map<string, { banco_id: string; id: string }>,
  opts?: { forma?: string | null; regime?: RegimeCobrancaAluno | null },
): FluxoPagamentoExtratoStatus {
  const planilhaId = planilhaIdFromFluxoUuid(fluxoPagamentoId);

  if (opts?.regime === 'bolsa' || opts?.regime === 'excecao') {
    return {
      fluxo_pagamento_id: fluxoPagamentoId,
      planilha_id: planilhaId,
      status_extrato: opts.regime,
      banco_id: null,
      vinculo_id: null,
    };
  }

  if (isFormaPagamentoDinheiro(opts?.forma)) {
    return {
      fluxo_pagamento_id: fluxoPagamentoId,
      planilha_id: planilhaId,
      status_extrato: 'validado',
      banco_id: null,
      vinculo_id: null,
    };
  }

  const v = vinculosByPlanilha.get(planilhaId);
  if (v) {
    return {
      fluxo_pagamento_id: fluxoPagamentoId,
      planilha_id: planilhaId,
      status_extrato: 'validado',
      banco_id: v.banco_id,
      vinculo_id: v.id,
    };
  }
  return {
    fluxo_pagamento_id: fluxoPagamentoId,
    planilha_id: planilhaId,
    status_extrato: 'pendente',
    banco_id: null,
    vinculo_id: null,
  };
}

export async function enrichFluxoPagamentosComStatusExtrato<
  T extends {
    id: string;
    forma?: string | null;
    regime_cobranca?: string | null;
    plano?: string | null;
    aluno_regime_cobranca?: string | null;
    aluno_plano?: string | null;
  },
>(pagamentos: T[], _mes?: number, _ano?: number): Promise<(T & FluxoPagamentoExtratoStatus)[]> {
  void _mes;
  void _ano;
  const vinculos = await indexVinculosPorPagamentoIds(pagamentos.map((p) => String(p.id)));
  return pagamentos.map((p) => {
    const regime = resolverRegimeCobranca({
      regime_cobranca: p.aluno_regime_cobranca ?? p.regime_cobranca,
      plano: p.aluno_plano ?? p.plano,
    });
    return {
      ...p,
      ...statusExtratoForFluxoPagamento(String(p.id), vinculos, {
        forma: p.forma,
        regime: regime === 'normal' ? null : regime,
      }),
    };
  });
}

export type FluxoTotaisCompetenciaLinha = {
  aba: string;
  modalidade: string;
  mes_competencia: number;
  ano_competencia: number;
  total: number;
  qtd: number;
  total_validado: number;
  qtd_validado: number;
};

type PagRow = {
  id: string;
  aba: string;
  modalidade: string;
  valor: number;
  mes_competencia: number;
  ano_competencia: number;
  forma?: string | null;
};

export function agregarTotaisFluxoCompetencia(
  pagamentos: (PagRow & Partial<FluxoPagamentoExtratoStatus>)[],
  mes: number,
  ano: number,
): FluxoTotaisCompetenciaLinha[] {
  const map = new Map<string, FluxoTotaisCompetenciaLinha>();
  for (const p of pagamentos) {
    if (Number(p.mes_competencia) !== mes || Number(p.ano_competencia) !== ano) continue;
    const aba = String(p.aba ?? '').trim();
    const modalidade = String(p.modalidade ?? aba).trim();
    const key = `${aba}|${modalidade}`;
    const cur = map.get(key) ?? {
      aba,
      modalidade,
      mes_competencia: mes,
      ano_competencia: ano,
      total: 0,
      qtd: 0,
      total_validado: 0,
      qtd_validado: 0,
    };
    const v = Math.abs(Number(p.valor || 0));
    cur.total += v;
    cur.qtd += 1;
    if (p.status_extrato === 'validado') {
      cur.total_validado += v;
      cur.qtd_validado += 1;
    }
    map.set(key, cur);
  }
  return [...map.values()].sort(
    (a, b) => a.aba.localeCompare(b.aba, 'pt-BR') || a.modalidade.localeCompare(b.modalidade, 'pt-BR'),
  );
}

export async function loadFluxoPagamentosCompetenciaMes(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
  aba?: string,
  modalidade?: string,
): Promise<(PagRow & FluxoPagamentoExtratoStatus)[]> {
  let query = supabase
    .from('fluxo_pagamentos_operacionais')
    .select('id, aba, modalidade, valor, forma, mes_competencia, ano_competencia')
    .eq('mes_competencia', mes)
    .eq('ano_competencia', ano)
    .limit(10000);
  if (aba) query = query.eq('aba', aba);
  if (modalidade) query = query.eq('modalidade', modalidade);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PagRow[];
  return enrichFluxoPagamentosComStatusExtrato(rows, mes, ano);
}

export function comparativoFluxoExtrato(totais: FluxoTotaisCompetenciaLinha[]): {
  total_fluxo: number;
  total_validado_extrato: number;
  delta: number;
} {
  let total_fluxo = 0;
  let total_validado_extrato = 0;
  for (const t of totais) {
    total_fluxo += t.total;
    total_validado_extrato += t.total_validado;
  }
  return {
    total_fluxo: Math.round(total_fluxo * 100) / 100,
    total_validado_extrato: Math.round(total_validado_extrato * 100) / 100,
    delta: Math.round((total_fluxo - total_validado_extrato) * 100) / 100,
  };
}
