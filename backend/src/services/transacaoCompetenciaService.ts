import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanilhaItem } from '../logic/conciliacaoPagamentoMatch.js';
import {
  type CompetenciaEfetiva,
  type CompetenciaMesAno,
  type CompetenciaTransacaoRow,
  type OrigemSugestaoCompetencia,
  competenciaFromDataIso,
  detectDuplicatasCompetencia,
  isBlocoRepasseParceiros,
  resolveCompetenciaEfetiva,
  suggestCompetenciaDespesa,
  suggestCompetenciaEntrada,
} from '../domain/competencia/competenciaTransacao.js';
import type { VinculoPagamento } from './validacaoVinculos.js';

const memStore = new Map<string, CompetenciaTransacaoRow>();

export type TransacaoComCompetencia = {
  mes_competencia: number;
  ano_competencia: number;
  competencia_confirmada: boolean;
  competencia_origem: OrigemSugestaoCompetencia;
  competencia_sugerida_mes: number;
  competencia_sugerida_ano: number;
  competencia_alinha_data: boolean;
  alerta_duplicata_competencia: boolean;
};

export async function loadCompetenciasMap(
  supabase: SupabaseClient,
  transacaoIds: string[],
): Promise<Map<string, CompetenciaTransacaoRow>> {
  const map = new Map<string, CompetenciaTransacaoRow>();
  if (transacaoIds.length === 0) return map;

  const unique = [...new Set(transacaoIds)];
  if (supabase) {
    const { data, error } = await supabase
      .from('transacao_competencia')
      .select('transacao_id, mes_competencia, ano_competencia, confirmada, origem_sugestao, updated_at')
      .in('transacao_id', unique);
    if (!error && Array.isArray(data)) {
      for (const row of data as CompetenciaTransacaoRow[]) {
        map.set(row.transacao_id, row);
      }
      return map;
    }
  }

  for (const id of unique) {
    const m = memStore.get(id);
    if (m) map.set(id, m);
  }
  return map;
}

function fluxoCompetenciaFromVinculo(
  txnId: string,
  vinculos: VinculoPagamento[],
  fluxoById: Map<string, PlanilhaItem>,
): { mes: number; ano: number } | null {
  for (const v of vinculos) {
    if (v.banco_id !== txnId) continue;
    const fluxo = fluxoById.get(v.planilha_id);
    if (!fluxo) continue;
    const mes = fluxo.mesCompetencia;
    const ano = fluxo.anoCompetencia;
    if (mes >= 1 && mes <= 12 && ano >= 2000) return { mes, ano };
  }
  return null;
}

export function enrichTransacaoCompetenciaEntrada<T extends { id: string; data: string; pessoa_normalizada: string }>(
  txn: T,
  storedMap: Map<string, CompetenciaTransacaoRow>,
  vinculos: VinculoPagamento[],
  fluxoById: Map<string, PlanilhaItem>,
): T & TransacaoComCompetencia {
  const fluxoComp = fluxoCompetenciaFromVinculo(txn.id, vinculos, fluxoById);
  const { efetiva: sug, origem } = suggestCompetenciaEntrada(txn.data, fluxoComp?.mes, fluxoComp?.ano);
  const stored = storedMap.get(txn.id) ?? null;
  const eff = resolveCompetenciaEfetiva(txn.data, stored, sug, origem);
  return attachCompetenciaFields(txn, eff);
}

export function enrichTransacaoCompetenciaDespesa<
  T extends { id: string; data: string; pessoa_normalizada: string; template_key_efetivo?: string | null; bloco_template_key?: string | null },
>(
  txn: T,
  storedMap: Map<string, CompetenciaTransacaoRow>,
  blocoTemplateKey: string | null,
  blocoTitulo: string | null,
): T & TransacaoComCompetencia {
  const isRepasse = isBlocoRepasseParceiros(blocoTemplateKey, blocoTitulo);
  const { efetiva: sug, origem } = suggestCompetenciaDespesa(txn.data, isRepasse);
  const stored = storedMap.get(txn.id) ?? null;
  const eff = resolveCompetenciaEfetiva(txn.data, stored, sug, origem);
  return attachCompetenciaFields(txn, eff);
}

function attachCompetenciaFields<T extends { id: string }>(
  txn: T,
  eff: CompetenciaEfetiva,
): T & TransacaoComCompetencia {
  return {
    ...txn,
    mes_competencia: eff.mes,
    ano_competencia: eff.ano,
    competencia_confirmada: eff.confirmada,
    competencia_origem: eff.origem_sugestao,
    competencia_sugerida_mes: eff.sugerida.mes,
    competencia_sugerida_ano: eff.sugerida.ano,
    competencia_alinha_data: eff.alinha_data,
    alerta_duplicata_competencia: false,
  };
}

export function applyDuplicataAlertas<
  T extends { id: string; pessoa_normalizada: string; mes_competencia: number; ano_competencia: number },
>(transacoes: T[]): T[] {
  const dupes = detectDuplicatasCompetencia(
    transacoes.map((t) => ({
      id: t.id,
      pessoaNorm: t.pessoa_normalizada,
      mes: t.mes_competencia,
      ano: t.ano_competencia,
    })),
  );
  return transacoes.map((t) =>
    dupes.has(t.id) ? { ...t, alerta_duplicata_competencia: true } : t,
  );
}

export function transacaoContaNaCompetencia(
  t: { mes_competencia?: number; ano_competencia?: number; competencia_confirmada?: boolean },
  mes: number,
  ano: number,
  requireConfirmada = false,
): boolean {
  if (t.mes_competencia == null || t.ano_competencia == null) return false;
  if (t.mes_competencia !== mes || t.ano_competencia !== ano) return false;
  if (requireConfirmada && !t.competencia_confirmada) return false;
  return true;
}

export async function upsertCompetenciaTransacao(
  supabase: SupabaseClient | null,
  transacaoId: string,
  mes: number,
  ano: number,
  confirmada: boolean,
  origem: OrigemSugestaoCompetencia,
): Promise<CompetenciaTransacaoRow> {
  const row: CompetenciaTransacaoRow = {
    transacao_id: transacaoId,
    mes_competencia: mes,
    ano_competencia: ano,
    confirmada,
    origem_sugestao: origem,
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    const { data, error } = await supabase
      .from('transacao_competencia')
      .upsert(row, { onConflict: 'transacao_id' })
      .select('transacao_id, mes_competencia, ano_competencia, confirmada, origem_sugestao, updated_at')
      .single();
    if (!error && data) return data as CompetenciaTransacaoRow;
  }

  memStore.set(transacaoId, row);
  return row;
}

export function competenciaMesAnoFromQuery(mes: number, ano: number): CompetenciaMesAno {
  return { mes, ano };
}
