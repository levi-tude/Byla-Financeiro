import type { SupabaseClient } from '@supabase/supabase-js';
import { listVinculosMes } from './validacaoVinculos.js';

export type StatusExtratoFluxo = 'validado' | 'pendente' | 'divergente' | 'sem_lancamento';

export type FluxoPagamentoExtratoStatus = {
  fluxo_pagamento_id: string;
  planilha_id: string;
  status_extrato: StatusExtratoFluxo;
  banco_id: string | null;
  vinculo_id: string | null;
};

function planilhaIdFromFluxoUuid(fluxoId: string): string {
  const t = fluxoId.trim();
  if (t.startsWith('fluxo::')) return t;
  return `fluxo::${t}`;
}

export async function indexVinculosPorPlanilha(
  mes: number,
  ano: number,
): Promise<Map<string, { banco_id: string; id: string }>> {
  const vinculos = await listVinculosMes(mes, ano);
  const map = new Map<string, { banco_id: string; id: string }>();
  for (const v of vinculos) {
    map.set(v.planilha_id, { banco_id: v.banco_id, id: v.id });
  }
  return map;
}

export function statusExtratoForFluxoPagamento(
  fluxoPagamentoId: string,
  vinculosByPlanilha: Map<string, { banco_id: string; id: string }>,
): FluxoPagamentoExtratoStatus {
  const planilhaId = planilhaIdFromFluxoUuid(fluxoPagamentoId);
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

export async function enrichFluxoPagamentosComStatusExtrato<T extends { id: string }>(
  pagamentos: T[],
  mes: number,
  ano: number,
): Promise<(T & FluxoPagamentoExtratoStatus)[]> {
  const vinculos = await indexVinculosPorPlanilha(mes, ano);
  return pagamentos.map((p) => ({
    ...p,
    ...statusExtratoForFluxoPagamento(String(p.id), vinculos),
  }));
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
    .select('id, aba, modalidade, valor, mes_competencia, ano_competencia')
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
