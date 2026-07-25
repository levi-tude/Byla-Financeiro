/**
 * Sticky de crédito recorrente: aprende do vínculo e sugere nos meses seguintes.
 * Soft-fail se a tabela `mapeamento_credito_recorrente` ainda não existir.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  escolherCandidatoCredito,
  isCreditoGenericoExtrato,
  janelaEsperadaCreditoRecorrente,
  offsetObservadoDias,
  type CreditoBancoCand,
} from '../logic/creditoRecorrente.js';
import { normalizeText } from '../logic/conciliacaoTexto.js';
import { fluxoUuidFromPlanilhaId, planilhaIdFromFluxoUuid } from '../logic/fluxoPagamentoFingerprint.js';
import { listVinculosMes } from './validacaoVinculos.js';

export type CreditoRecorrenteItem = {
  aluno_norm: string;
  aluno_exibicao: string;
  aba: string;
  modalidade: string;
};

export type CreditoRecorrenteRegra = {
  id: string;
  rotulo: string;
  dia_pagamento_fluxo: number;
  offset_dias_extrato: number;
  itens: CreditoRecorrenteItem[];
  valor_mensalidades_soma: number;
  valor_banco_ultimo: number | null;
  bandeira_pista: string | null;
  ativo: boolean;
};

export type SugestaoCreditoRecorrente = {
  regra_id: string;
  rotulo: string;
  /** Dia de cobrança no Fluxo (aba operacional). */
  data_fluxo: string;
  data_esperada: string;
  janela: string[];
  aviso_valor: boolean;
  banco: { id: string; data: string; valor: number; pessoa: string } | null;
  status: 'unico' | 'ambiguidade' | 'nenhum';
  candidatos: Array<{ id: string; data: string; valor: number; pessoa: string }>;
  planilha_ids: string[];
  alunos_exibicao: string[];
};

export type FluxoPagamentoAprendizado = {
  aluno_nome: string;
  aba: string;
  modalidade: string;
  valor: number;
  data_pagamento: string;
  pagador_pix?: string | null;
};

export type PayloadAprendizadoCredito = {
  itens: CreditoRecorrenteItem[];
  valor_mensalidades_soma: number;
  dia_pagamento_fluxo: number;
  rotulo: string;
};

let tableAvailable: boolean | null = null;

function isMissingTableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('mapeamento_credito_recorrente') &&
    (m.includes('does not exist') || m.includes('schema cache'))
  );
}

function markMissingTable(): void {
  tableAvailable = false;
}

export function chaveItemCredito(i: CreditoRecorrenteItem): string {
  return `${i.aluno_norm}|${String(i.aba ?? '').trim()}|${String(i.modalidade ?? '').trim()}`;
}

export function setsChavesIguais(a: CreditoRecorrenteItem[], b: CreditoRecorrenteItem[]): boolean {
  const sa = a.map(chaveItemCredito).sort().join('\n');
  const sb = b.map(chaveItemCredito).sort().join('\n');
  return sa === sb;
}

/** 1→N: só sugere quando todos os itens da regra têm pagamento no mês. */
export function itensCompletosNoMes(
  regraItens: CreditoRecorrenteItem[],
  matchedChaves: Iterable<string>,
): boolean {
  if (regraItens.length === 0) return false;
  const matched = new Set(matchedChaves);
  return regraItens.every((item) => matched.has(chaveItemCredito(item)));
}

function diaFromIso(iso: string): number | null {
  const m = String(iso ?? '')
    .slice(0, 10)
    .match(/^\d{4}-\d{2}-(\d{2})$/);
  if (!m) return null;
  const d = Number(m[1]);
  return d >= 1 && d <= 31 ? d : null;
}

function diaPagamentoMajority(datas: string[]): number {
  const counts = new Map<number, number>();
  for (const iso of datas) {
    const d = diaFromIso(iso);
    if (d == null) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best = 1;
  let bestN = -1;
  for (const [dia, n] of counts) {
    if (n > bestN || (n === bestN && dia > best)) {
      best = dia;
      bestN = n;
    }
  }
  return bestN >= 0 ? best : 1;
}

export function montarPayloadAprendizadoCredito(
  pagamentos: FluxoPagamentoAprendizado[],
): PayloadAprendizadoCredito {
  const itens: CreditoRecorrenteItem[] = [];
  let soma = 0;
  const datas: string[] = [];
  let rotulo = '';
  let pagadorFallback = '';

  for (const p of pagamentos) {
    const aluno_exibicao = String(p.aluno_nome ?? '').trim();
    const aluno_norm = normalizeText(aluno_exibicao);
    const aba = String(p.aba ?? '').trim();
    const modalidade = String(p.modalidade ?? '').trim();
    const valor = Number(p.valor || 0);
    soma += valor;
    datas.push(String(p.data_pagamento ?? '').slice(0, 10));
    if (!pagadorFallback) {
      const px = String(p.pagador_pix ?? '').trim();
      if (px) pagadorFallback = px;
    }
    if (!rotulo && aluno_exibicao) rotulo = aluno_exibicao;
    if (!aluno_norm && !aba && !modalidade) continue;
    itens.push({
      aluno_norm: aluno_norm || aluno_exibicao.toUpperCase(),
      aluno_exibicao: aluno_exibicao || pagadorFallback || '—',
      aba,
      modalidade,
    });
  }

  if (!rotulo) rotulo = pagadorFallback || 'Crédito recorrente';

  return {
    itens,
    valor_mensalidades_soma: Math.round(soma * 100) / 100,
    dia_pagamento_fluxo: diaPagamentoMajority(datas),
    rotulo,
  };
}

function parseItensJson(raw: unknown): CreditoRecorrenteItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      aluno_norm: String(o.aluno_norm ?? ''),
      aluno_exibicao: String(o.aluno_exibicao ?? ''),
      aba: String(o.aba ?? ''),
      modalidade: String(o.modalidade ?? ''),
    };
  });
}

function mapRegraRow(r: Record<string, unknown>): CreditoRecorrenteRegra {
  return {
    id: String(r.id),
    rotulo: String(r.rotulo ?? ''),
    dia_pagamento_fluxo: Number(r.dia_pagamento_fluxo || 1),
    offset_dias_extrato: Number(r.offset_dias_extrato ?? 5),
    itens: parseItensJson(r.itens),
    valor_mensalidades_soma: Number(r.valor_mensalidades_soma || 0),
    valor_banco_ultimo: r.valor_banco_ultimo != null ? Number(r.valor_banco_ultimo) : null,
    bandeira_pista: r.bandeira_pista != null ? String(r.bandeira_pista) : null,
    ativo: r.ativo !== false,
  };
}

export function extrairBandeiraPista(pessoa: string, descricao?: string | null): string | null {
  const t = normalizeText(`${pessoa} ${descricao ?? ''}`);
  if (t.includes('MASTERCARD') || t.includes('MASTER')) return 'MASTER';
  if (t.includes('VISA')) return 'VISA';
  if (t.includes('ELO')) return 'ELO';
  return null;
}

function ultimoDiaMes(mes: number, ano: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dataFluxoIsoParaOffset(
  dataRef: string,
  diaPagamentoFluxo: number,
  datasPagamento: string[],
): string {
  const ref = String(dataRef).slice(0, 10);
  const m = ref.match(/^(\d{4})-(\d{2})/);
  if (m) {
    const ano = Number(m[1]);
    const mes = Number(m[2]);
    const ultimo = ultimoDiaMes(mes, ano);
    const dia = Math.min(diaPagamentoFluxo, ultimo);
    return `${ano}-${pad2(mes)}-${pad2(dia)}`;
  }
  const first = datasPagamento
    .map((d) => String(d).slice(0, 10))
    .find((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  return first ?? ref;
}

function pagamentoNoMes(
  p: { mes_competencia?: number | null; ano_competencia?: number | null; data_pagamento?: string | null },
  mes: number,
  ano: number,
): boolean {
  const mc = Number(p.mes_competencia || 0);
  const ac = Number(p.ano_competencia || 0);
  if (mc >= 1 && mc <= 12 && ac >= 2000) {
    return mc === mes && ac === ano;
  }
  const data = String(p.data_pagamento ?? '').slice(0, 10);
  const m = data.match(/^(\d{4})-(\d{2})-/);
  if (!m) return false;
  return Number(m[1]) === ano && Number(m[2]) === mes;
}

export async function listRegrasCreditoRecorrente(
  supabase: SupabaseClient,
  opts?: { apenasAtivas?: boolean },
): Promise<CreditoRecorrenteRegra[]> {
  if (tableAvailable === false) return [];
  let q = supabase
    .from('mapeamento_credito_recorrente')
    .select(
      'id, rotulo, dia_pagamento_fluxo, offset_dias_extrato, itens, valor_mensalidades_soma, valor_banco_ultimo, bandeira_pista, ativo',
    )
    .order('updated_at', { ascending: false });
  if (opts?.apenasAtivas) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (!error) {
    tableAvailable = true;
    return (data ?? []).map((r) => mapRegraRow(r as Record<string, unknown>));
  }
  if (isMissingTableError(error.message)) {
    markMissingTable();
    return [];
  }
  throw new Error(error.message);
}

export async function listRegrasCreditoRecorrenteAtivas(
  supabase: SupabaseClient,
): Promise<CreditoRecorrenteRegra[]> {
  return listRegrasCreditoRecorrente(supabase, { apenasAtivas: true });
}

/** Atualiza `valor_banco_ultimo` (e opcionalmente `codigo_ultimo`) após confirmar sugestão. */
export async function atualizarValorBancoUltimo(
  supabase: SupabaseClient,
  args: { regraId: string; valorBanco: number; codigoUltimo?: string | null },
): Promise<{ updated: boolean; reason?: string }> {
  if (tableAvailable === false) return { updated: false, reason: 'table_missing' };
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    valor_banco_ultimo: args.valorBanco,
    updated_at: now,
  };
  if (args.codigoUltimo !== undefined) {
    patch.codigo_ultimo = args.codigoUltimo;
  }
  const { error } = await supabase
    .from('mapeamento_credito_recorrente')
    .update(patch)
    .eq('id', args.regraId);
  if (error) {
    if (isMissingTableError(error.message)) {
      markMissingTable();
      return { updated: false, reason: 'table_missing' };
    }
    throw new Error(error.message);
  }
  tableAvailable = true;
  return { updated: true };
}

export async function patchRegraCreditoRecorrente(
  supabase: SupabaseClient,
  id: string,
  patch: { ativo?: boolean; rotulo?: string },
): Promise<CreditoRecorrenteRegra | null> {
  if (tableAvailable === false) return null;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.ativo !== undefined) update.ativo = patch.ativo;
  if (patch.rotulo !== undefined) update.rotulo = patch.rotulo;
  const { data, error } = await supabase
    .from('mapeamento_credito_recorrente')
    .update(update)
    .eq('id', id)
    .select(
      'id, rotulo, dia_pagamento_fluxo, offset_dias_extrato, itens, valor_mensalidades_soma, valor_banco_ultimo, bandeira_pista, ativo',
    )
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error.message)) {
      markMissingTable();
      return null;
    }
    throw new Error(error.message);
  }
  if (!data) return null;
  tableAvailable = true;
  return mapRegraRow(data as Record<string, unknown>);
}

export async function aprenderCreditoRecorrenteFromVinculo(
  supabase: SupabaseClient,
  args: { bancoId: string; planilhaIds: string[]; dataRef: string; lembrar: boolean },
): Promise<{ saved: boolean; reason?: string; regra_id?: string }> {
  if (!args.lembrar) return { saved: false, reason: 'lembrar_false' };
  if (tableAvailable === false) return { saved: false, reason: 'table_missing' };

  const { data: banco, error: bancoErr } = await supabase
    .from('transacoes')
    .select('id, pessoa, descricao, valor, id_unico, data')
    .eq('id', args.bancoId)
    .maybeSingle();
  if (bancoErr || !banco) {
    return { saved: false, reason: 'banco_nao_encontrado' };
  }

  const pessoa = String((banco as { pessoa?: string }).pessoa ?? '');
  const descricao = (banco as { descricao?: string | null }).descricao ?? null;
  if (!isCreditoGenericoExtrato(pessoa, descricao)) {
    return { saved: false, reason: 'nao_credito_generico' };
  }

  const uuids = args.planilhaIds
    .map((pid) => fluxoUuidFromPlanilhaId(pid))
    .filter((id): id is string => Boolean(id));
  if (uuids.length === 0) return { saved: false, reason: 'sem_fluxo_ids' };

  const { data: fluxoRows, error: fluxoErr } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select('id, aluno_nome, aba, modalidade, valor, data_pagamento, pagador_pix')
    .in('id', uuids);
  if (fluxoErr || !fluxoRows?.length) {
    return { saved: false, reason: 'fluxo_nao_encontrado' };
  }

  const payload = montarPayloadAprendizadoCredito(
    (fluxoRows as FluxoPagamentoAprendizado[]).map((r) => ({
      aluno_nome: String((r as { aluno_nome?: string }).aluno_nome ?? ''),
      aba: String((r as { aba?: string }).aba ?? ''),
      modalidade: String((r as { modalidade?: string }).modalidade ?? ''),
      valor: Number((r as { valor?: number }).valor || 0),
      data_pagamento: String((r as { data_pagamento?: string }).data_pagamento ?? ''),
      pagador_pix: (r as { pagador_pix?: string | null }).pagador_pix ?? null,
    })),
  );
  if (payload.itens.length === 0) return { saved: false, reason: 'sem_itens' };

  const valorBanco = Number((banco as { valor?: number }).valor || 0);
  const dataBanco = String((banco as { data?: string }).data ?? '').slice(0, 10);
  const datasFluxo = (fluxoRows as FluxoPagamentoAprendizado[]).map((r) =>
    String((r as { data_pagamento?: string }).data_pagamento ?? '').slice(0, 10),
  );
  const dataFluxoIso = dataFluxoIsoParaOffset(
    args.dataRef,
    payload.dia_pagamento_fluxo,
    datasFluxo,
  );
  const offsetObservado = offsetObservadoDias(dataFluxoIso, dataBanco);
  const codigoUltimo =
    (banco as { id_unico?: string | null }).id_unico != null
      ? String((banco as { id_unico: string | null }).id_unico)
      : null;
  const bandeira = extrairBandeiraPista(pessoa, descricao);
  const now = new Date().toISOString();

  let regras: CreditoRecorrenteRegra[];
  try {
    regras = await listRegrasCreditoRecorrenteAtivas(supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isMissingTableError(msg)) {
      markMissingTable();
      return { saved: false, reason: 'table_missing' };
    }
    throw e;
  }

  const existente = regras.find((r) => setsChavesIguais(r.itens, payload.itens));
  if (existente) {
    const patch: Record<string, unknown> = {
      valor_banco_ultimo: valorBanco,
      codigo_ultimo: codigoUltimo,
      updated_at: now,
    };
    if (existente.offset_dias_extrato === 5 && offsetObservado !== 5) {
      patch.offset_dias_extrato = offsetObservado;
    }
    const { error } = await supabase
      .from('mapeamento_credito_recorrente')
      .update(patch)
      .eq('id', existente.id);
    if (error) {
      if (isMissingTableError(error.message)) {
        markMissingTable();
        return { saved: false, reason: 'table_missing' };
      }
      throw new Error(error.message);
    }
    tableAvailable = true;
    return { saved: true, regra_id: existente.id };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('mapeamento_credito_recorrente')
    .insert({
    rotulo: payload.rotulo,
    dia_pagamento_fluxo: payload.dia_pagamento_fluxo,
    offset_dias_extrato: offsetObservado || 5,
    itens: payload.itens,
    valor_mensalidades_soma: payload.valor_mensalidades_soma,
    valor_banco_ultimo: valorBanco,
    bandeira_pista: bandeira,
    codigo_ultimo: codigoUltimo,
    ativo: true,
    updated_at: now,
  })
    .select('id')
    .single();
  if (insertErr) {
    if (isMissingTableError(insertErr.message)) {
      markMissingTable();
      return { saved: false, reason: 'table_missing' };
    }
    throw new Error(insertErr.message);
  }
  tableAvailable = true;
  return {
    saved: true,
    regra_id: inserted ? String((inserted as { id: string }).id) : undefined,
  };
}

type FluxoRowMes = {
  id: string;
  aluno_nome: string;
  aba: string;
  modalidade: string;
  valor: number;
  data_pagamento: string | null;
  mes_competencia: number | null;
  ano_competencia: number | null;
};

async function carregarPagamentosMes(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
): Promise<FluxoRowMes[]> {
  const { data: porCompetencia, error: errComp } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select('id, aluno_nome, aba, modalidade, valor, data_pagamento, mes_competencia, ano_competencia')
    .eq('mes_competencia', mes)
    .eq('ano_competencia', ano)
    .limit(10000);

  if (!errComp && Array.isArray(porCompetencia) && porCompetencia.length > 0) {
    return porCompetencia as FluxoRowMes[];
  }

  const inicio = `${ano}-${pad2(mes)}-01`;
  const fim = `${ano}-${pad2(mes)}-${pad2(ultimoDiaMes(mes, ano))}`;
  const { data: porData, error: errData } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select('id, aluno_nome, aba, modalidade, valor, data_pagamento, mes_competencia, ano_competencia')
    .gte('data_pagamento', inicio)
    .lte('data_pagamento', fim)
    .limit(10000);
  if (errData || !porData) {
    if (errComp) throw new Error(errComp.message);
    if (errData) throw new Error(errData.message);
    return [];
  }
  return (porData as FluxoRowMes[]).filter((p) => pagamentoNoMes(p, mes, ano));
}

function matchPagamentosParaItens(
  pagamentos: FluxoRowMes[],
  itens: CreditoRecorrenteItem[],
): FluxoRowMes[] {
  const wanted = new Set(itens.map(chaveItemCredito));
  const matched: FluxoRowMes[] = [];
  for (const p of pagamentos) {
    const item: CreditoRecorrenteItem = {
      aluno_norm: normalizeText(String(p.aluno_nome ?? '')),
      aluno_exibicao: String(p.aluno_nome ?? '').trim(),
      aba: String(p.aba ?? '').trim(),
      modalidade: String(p.modalidade ?? '').trim(),
    };
    if (wanted.has(chaveItemCredito(item))) matched.push(p);
  }
  return matched;
}

export async function montarSugestoesCreditoRecorrenteMes(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
): Promise<SugestaoCreditoRecorrente[]> {
  const regras = await listRegrasCreditoRecorrenteAtivas(supabase);
  if (regras.length === 0) return [];

  const pagamentosMes = await carregarPagamentosMes(supabase, mes, ano);
  const vinculos = await listVinculosMes(mes, ano);
  const vinculados = new Set(vinculos.map((v) => v.planilha_id));

  const sugestoes: SugestaoCreditoRecorrente[] = [];

  for (const regra of regras) {
    const { dataFluxo, dataEsperada, janela } = janelaEsperadaCreditoRecorrente({
      ano,
      mes,
      diaPagamentoFluxo: regra.dia_pagamento_fluxo,
      offsetDiasExtrato: regra.offset_dias_extrato,
    });

    const { data: txRows, error: txErr } = await supabase
      .from('transacoes')
      .select('id, data, valor, pessoa, descricao')
      .in('data', janela)
      .limit(5000);

    if (txErr) {
      console.warn(
        `[credito-recorrente] transacoes query failed (regra ${regra.id}, ${mes}/${ano}): ${txErr.message}`,
      );
      continue;
    }

    const candidatosRaw: CreditoBancoCand[] = (txRows ?? []).map((r) => ({
      id: String((r as { id: string }).id),
      data: String((r as { data: string }).data).slice(0, 10),
      valor: Number((r as { valor?: number }).valor || 0),
      pessoa: String((r as { pessoa?: string }).pessoa ?? ''),
      descricao: (r as { descricao?: string | null }).descricao ?? null,
    }));

    const matched = matchPagamentosParaItens(pagamentosMes, regra.itens);
    const matchedChaves = matched.map((p) =>
      chaveItemCredito({
        aluno_norm: normalizeText(String(p.aluno_nome ?? '')),
        aluno_exibicao: String(p.aluno_nome ?? '').trim(),
        aba: String(p.aba ?? '').trim(),
        modalidade: String(p.modalidade ?? '').trim(),
      }),
    );
    if (!itensCompletosNoMes(regra.itens, matchedChaves)) continue;

    const planilhaIds = matched
      .map((p) => planilhaIdFromFluxoUuid(String(p.id)))
      .filter((pid) => !vinculados.has(pid));

    if (planilhaIds.length === 0) continue;

    const somaMes =
      matched.length > 0
        ? Math.round(matched.reduce((s, p) => s + Number(p.valor || 0), 0) * 100) / 100
        : regra.valor_mensalidades_soma;

    const escolha = escolherCandidatoCredito({
      candidatos: candidatosRaw,
      somaMensalidades: somaMes,
      valorBancoUltimo: regra.valor_banco_ultimo,
    });

    const candidatos = candidatosRaw
      .filter((c) => isCreditoGenericoExtrato(c.pessoa, c.descricao))
      .map((c) => ({ id: c.id, data: c.data, valor: c.valor, pessoa: c.pessoa }));

    const banco =
      escolha.status === 'unico' && escolha.candidato
        ? {
            id: escolha.candidato.id,
            data: escolha.candidato.data,
            valor: escolha.candidato.valor,
            pessoa: escolha.candidato.pessoa,
          }
        : null;

    sugestoes.push({
      regra_id: regra.id,
      rotulo: regra.rotulo,
      data_fluxo: dataFluxo,
      data_esperada: dataEsperada,
      janela,
      aviso_valor: Boolean(escolha.avisoValor),
      banco,
      status: escolha.status,
      candidatos,
      planilha_ids: planilhaIds,
      alunos_exibicao: regra.itens.map((i) => i.aluno_exibicao).filter(Boolean),
    });
  }

  return sugestoes;
}
