/**
 * Cadastro de assinaturas PagBank + alertas "parou de pagar?".
 * Soft-fail se a tabela `assinatura_credito_recorrente` ainda não existir.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isNameCompatible, normalizeText } from '../logic/conciliacaoTexto.js';
import {
  isCreditoGenericoExtrato,
  valorBancoCompativel,
} from '../logic/creditoRecorrente.js';
import {
  derivarStatusBylaInicial,
  elegivelAlertaParouDePagar,
  janelaEsperadaPagamentoAssinatura,
  type StatusBylaAssinatura,
} from '../logic/assinaturaCreditoRecorrente.js';
import {
  fluxoUuidFromAnyPlanilhaId,
  planilhaIdFromFluxoUuid,
} from '../logic/fluxoPagamentoFingerprint.js';
import {
  chaveItemCredito,
  itensCompletosNoMes,
  listRegrasCreditoRecorrenteAtivas,
  type CreditoRecorrenteRegra,
} from './mapeamentoCreditoRecorrente.js';
import { listVinculosMes } from './validacaoVinculos.js';

export type AssinaturaCreditoRecorrente = {
  id: string;
  pagbank_subs_id: string;
  pagbank_cust_id: string | null;
  nome_exibicao: string;
  status_pagbank: 'Ativa' | 'Cancelada';
  status_byla: StatusBylaAssinatura;
  valor_bruto: number;
  plano_rotulo: string | null;
  dia_cobranca: number;
  ciclo_atual: number;
  ciclo_total: number;
  proxima_cobranca: string | null;
  historico_cobrancas: Array<{ data: string; status: string }>;
  offset_dias_extrato: number;
  regra_sticky_id: string | null;
  ativo: boolean;
};

export type AlertaParouDePagar = {
  assinatura_id: string;
  nome_exibicao: string;
  data_esperada: string;
  mensagem: string;
};

export type UpsertAssinaturaInput = {
  pagbank_subs_id: string;
  pagbank_cust_id?: string | null;
  nome_exibicao: string;
  status_pagbank: 'Ativa' | 'Cancelada';
  valor_bruto: number;
  plano_rotulo?: string | null;
  dia_cobranca: number;
  ciclo_atual: number;
  ciclo_total: number;
  data_criacao_assinatura?: string | null;
  proxima_cobranca?: string | null;
  historico_cobrancas?: Array<{ data: string; status: string }>;
  offset_dias_extrato?: number;
  regra_sticky_id?: string | null;
  ativo?: boolean;
  status_byla?: StatusBylaAssinatura;
};

let tableAvailable: boolean | null = null;

function isMissingTableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('assinatura_credito_recorrente') &&
    (m.includes('does not exist') || m.includes('schema cache'))
  );
}

function markMissingTable(): void {
  tableAvailable = false;
}

function parseHistorico(raw: unknown): Array<{ data: string; status: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      data: String(o.data ?? ''),
      status: String(o.status ?? ''),
    };
  });
}

function mapAssinaturaRow(r: Record<string, unknown>): AssinaturaCreditoRecorrente {
  return {
    id: String(r.id),
    pagbank_subs_id: String(r.pagbank_subs_id ?? ''),
    pagbank_cust_id: r.pagbank_cust_id != null ? String(r.pagbank_cust_id) : null,
    nome_exibicao: String(r.nome_exibicao ?? ''),
    status_pagbank: String(r.status_pagbank ?? 'Ativa') as 'Ativa' | 'Cancelada',
    status_byla: String(r.status_byla ?? 'ativa') as StatusBylaAssinatura,
    valor_bruto: Number(r.valor_bruto || 0),
    plano_rotulo: r.plano_rotulo != null ? String(r.plano_rotulo) : null,
    dia_cobranca: Number(r.dia_cobranca || 1),
    ciclo_atual: Number(r.ciclo_atual ?? 0),
    ciclo_total: Number(r.ciclo_total || 1),
    proxima_cobranca:
      r.proxima_cobranca != null ? String(r.proxima_cobranca).slice(0, 10) : null,
    historico_cobrancas: parseHistorico(r.historico_cobrancas),
    offset_dias_extrato: Number(r.offset_dias_extrato ?? 5),
    regra_sticky_id: r.regra_sticky_id != null ? String(r.regra_sticky_id) : null,
    ativo: r.ativo !== false,
  };
}

export function decidirAlertaParouDePagar(opts: {
  assinatura: Pick<
    AssinaturaCreditoRecorrente,
    | 'id'
    | 'nome_exibicao'
    | 'status_byla'
    | 'ativo'
    | 'ciclo_atual'
    | 'ciclo_total'
    | 'proxima_cobranca'
    | 'dia_cobranca'
    | 'offset_dias_extrato'
  >;
  mes: number;
  ano: number;
  temPagamentoNaJanela: boolean;
  hojeIso: string;
}): AlertaParouDePagar | null {
  const { assinatura, mes, ano, temPagamentoNaJanela, hojeIso } = opts;

  if (
    !elegivelAlertaParouDePagar({
      statusByla: assinatura.status_byla,
      ativo: assinatura.ativo,
      cicloAtual: assinatura.ciclo_atual,
      cicloTotal: assinatura.ciclo_total,
      proximaCobranca: assinatura.proxima_cobranca,
    })
  ) {
    return null;
  }

  if (temPagamentoNaJanela) return null;

  const { dataEsperada, janela } = janelaEsperadaPagamentoAssinatura({
    ano,
    mes,
    diaCobranca: assinatura.dia_cobranca,
    offsetDiasExtrato: assinatura.offset_dias_extrato,
  });

  const fimJanela = janela[janela.length - 1] ?? dataEsperada;
  if (hojeIso.slice(0, 10) <= fimJanela) return null;

  const nome = assinatura.nome_exibicao;
  return {
    assinatura_id: assinatura.id,
    nome_exibicao: nome,
    data_esperada: dataEsperada,
    mensagem: `${nome} — não encontramos o pagamento deste ciclo. Parou de pagar?`,
  };
}

type TransacaoJanela = {
  id: string;
  data: string;
  valor: number;
  pessoa: string;
  descricao: string | null;
};

function textoIndicaVendas(pessoa: string, descricao?: string | null): boolean {
  return normalizeText(`${pessoa} ${descricao ?? ''}`).includes('VENDAS');
}

function valorCompativelAssinatura(valorBanco: number, valorBruto: number): boolean {
  return valorBancoCompativel({
    valorBanco,
    somaMensalidades: valorBruto,
    valorBancoUltimo: null,
    toleranciaPct: 0.05,
  });
}

function chavesFromPlanilhaIds(planilhaIds: string[]): Set<string> {
  const chaves = new Set<string>();
  for (const pid of planilhaIds) {
    const parts = String(pid).split('|');
    if (parts.length >= 3) {
      chaves.add(`${normalizeText(parts[0])}|${String(parts[1]).trim()}|${String(parts[2]).trim()}`);
    }
  }
  return chaves;
}

function alunoNormDoPlanilhaId(
  planilhaId: string,
  alunoNormPorPlanilhaId?: Map<string, string>,
): string | null {
  const pid = String(planilhaId ?? '').trim();
  if (!pid) return null;
  if (alunoNormPorPlanilhaId) {
    const direct =
      alunoNormPorPlanilhaId.get(pid) ??
      alunoNormPorPlanilhaId.get(planilhaIdFromFluxoUuid(pid));
    if (direct) return direct;
    const uuid = fluxoUuidFromAnyPlanilhaId(pid);
    if (uuid) {
      const byUuid =
        alunoNormPorPlanilhaId.get(uuid) ??
        alunoNormPorPlanilhaId.get(planilhaIdFromFluxoUuid(uuid));
      if (byUuid) return byUuid;
    }
  }
  const parts = pid.split('|');
  if (parts.length >= 3) return normalizeText(parts[0]);
  return null;
}

function tokenDentroDeUmTypo(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length < 5 || b.length < 5) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  edits += a.length - i + (b.length - j);
  return edits <= 1;
}

function nomeAlunoCasaComAssinatura(alunoNorm: string, assinaturaNome: string): boolean {
  if (!alunoNorm || !assinaturaNome) return false;
  if (alunoNorm === assinaturaNome) return true;
  if (alunoNorm.includes(assinaturaNome) || assinaturaNome.includes(alunoNorm)) return true;
  if (isNameCompatible(alunoNorm, assinaturaNome)) return true;

  const ta = alunoNorm.split(' ').filter(Boolean);
  const tb = assinaturaNome.split(' ').filter(Boolean);
  if (ta.length < 2 || tb.length < 2) return false;
  if (ta[0] !== tb[0]) return false;

  let hits = 0;
  for (const a of ta.slice(1)) {
    for (const b of tb.slice(1)) {
      if (tokenDentroDeUmTypo(a, b)) hits += 1;
    }
  }
  return hits >= 1;
}

/** Monta mapa planilha_id → aluno normalizado a partir dos pagamentos do Fluxo no mês. */
export function montarAlunoNormPorPlanilhaId(
  pagamentos: Array<{ id: string; aluno_nome: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of pagamentos) {
    const nome = normalizeText(p.aluno_nome);
    if (!nome) continue;
    const uuid = String(p.id ?? '').trim();
    if (!uuid) continue;
    map.set(uuid, nome);
    map.set(planilhaIdFromFluxoUuid(uuid), nome);
  }
  return map;
}

/**
 * True se já existe vínculo confirmado no mês para o mesmo aluno da assinatura
 * (ex.: crédito Mastercard validado — não precisa ser texto "Vendas").
 */
export function temVinculoValidadoAssinatura(opts: {
  assinatura: Pick<AssinaturaCreditoRecorrente, 'valor_bruto' | 'nome_exibicao'>;
  vinculos: Array<{ banco_id: string; planilha_id: string }>;
  transacoes: TransacaoJanela[];
  alunoNormPorPlanilhaId?: Map<string, string>;
}): boolean {
  const { assinatura, vinculos, transacoes, alunoNormPorPlanilhaId } = opts;
  const nomeAssinatura = normalizeText(assinatura.nome_exibicao);
  if (!nomeAssinatura || !alunoNormPorPlanilhaId || alunoNormPorPlanilhaId.size === 0) {
    return false;
  }

  const txPorId = new Map(transacoes.map((t) => [t.id, t]));
  for (const v of vinculos) {
    const aluno = alunoNormDoPlanilhaId(v.planilha_id, alunoNormPorPlanilhaId);
    if (!aluno || !nomeAlunoCasaComAssinatura(aluno, nomeAssinatura)) continue;
    const tx = txPorId.get(v.banco_id);
    if (!tx) continue;
    if (!valorCompativelAssinatura(tx.valor, assinatura.valor_bruto)) continue;
    return true;
  }
  return false;
}

export function resolverTemPagamentoNaJanela(opts: {
  assinatura: Pick<
    AssinaturaCreditoRecorrente,
    'valor_bruto' | 'regra_sticky_id' | 'nome_exibicao'
  >;
  janela: string[];
  vinculos: Array<{ banco_id: string; planilha_id: string }>;
  transacoes: TransacaoJanela[];
  regraSticky?: CreditoRecorrenteRegra | null;
  /** Se informado, vínculo Validação do mesmo aluno silencia o alerta (mesmo sem "Vendas"). */
  alunoNormPorPlanilhaId?: Map<string, string>;
}): boolean {
  const { assinatura, janela, vinculos, transacoes, regraSticky, alunoNormPorPlanilhaId } = opts;

  if (
    temVinculoValidadoAssinatura({
      assinatura,
      vinculos,
      transacoes,
      alunoNormPorPlanilhaId,
    })
  ) {
    return true;
  }

  const janelaSet = new Set(janela);

  const txPorId = new Map(transacoes.map((t) => [t.id, t]));
  const vinculosPorBanco = new Map<string, string[]>();
  for (const v of vinculos) {
    const list = vinculosPorBanco.get(v.banco_id) ?? [];
    list.push(v.planilha_id);
    vinculosPorBanco.set(v.banco_id, list);
  }

  const candidatos: TransacaoJanela[] = [];
  for (const [bancoId, planilhaIds] of vinculosPorBanco) {
    const tx = txPorId.get(bancoId);
    if (!tx) continue;
    if (!janelaSet.has(tx.data.slice(0, 10))) continue;

    if (assinatura.regra_sticky_id && regraSticky) {
      const chaves = chavesFromPlanilhaIds(planilhaIds);
      if (itensCompletosNoMes(regraSticky.itens, chaves)) {
        candidatos.push(tx);
      }
      continue;
    }

    if (!isCreditoGenericoExtrato(tx.pessoa, tx.descricao)) continue;
    if (!valorCompativelAssinatura(tx.valor, assinatura.valor_bruto)) continue;

    const nomeNorm = normalizeText(assinatura.nome_exibicao);
    const alunoNoVinculo = planilhaIds
      .map((pid) => alunoNormDoPlanilhaId(pid, alunoNormPorPlanilhaId))
      .find((n) => n && nomeAlunoCasaComAssinatura(n, nomeNorm));

    // Crédito genérico (Mastercard/Visa) só conta se o vínculo for da mesma aluna.
    // Agregado "Vendas" continua elegível sem nome (regra antiga).
    if (!textoIndicaVendas(tx.pessoa, tx.descricao) && !alunoNoVinculo) continue;

    const rotuloNorm = normalizeText(regraSticky?.rotulo ?? '');
    if (rotuloNorm && (rotuloNorm.includes(nomeNorm) || nomeNorm.includes(rotuloNorm))) {
      candidatos.push(tx);
      continue;
    }

    candidatos.push(tx);
  }

  if (candidatos.length === 1) return true;
  if (candidatos.length === 0) return false;
  return false;
}

export async function listAssinaturas(
  supabase: SupabaseClient,
  opts?: { apenasAtivas?: boolean },
): Promise<AssinaturaCreditoRecorrente[]> {
  if (tableAvailable === false) return [];

  let q = supabase
    .from('assinatura_credito_recorrente')
    .select(
      'id, pagbank_subs_id, pagbank_cust_id, nome_exibicao, status_pagbank, status_byla, valor_bruto, plano_rotulo, dia_cobranca, ciclo_atual, ciclo_total, proxima_cobranca, historico_cobrancas, offset_dias_extrato, regra_sticky_id, ativo',
    )
    .order('nome_exibicao', { ascending: true });

  if (opts?.apenasAtivas) q = q.eq('ativo', true);

  const { data, error } = await q;
  if (!error) {
    tableAvailable = true;
    return (data ?? []).map((r) => mapAssinaturaRow(r as Record<string, unknown>));
  }
  if (isMissingTableError(error.message)) {
    markMissingTable();
    return [];
  }
  throw new Error(error.message);
}

export async function upsertAssinatura(
  supabase: SupabaseClient,
  input: UpsertAssinaturaInput,
): Promise<AssinaturaCreditoRecorrente | null> {
  if (tableAvailable === false) return null;

  const statusByla =
    input.status_byla ??
    derivarStatusBylaInicial({
      statusPagbank: input.status_pagbank,
      cicloAtual: input.ciclo_atual,
      cicloTotal: input.ciclo_total,
      proximaCobranca: input.proxima_cobranca ?? null,
    });

  const row = {
    pagbank_subs_id: input.pagbank_subs_id.trim(),
    pagbank_cust_id: input.pagbank_cust_id ?? null,
    nome_exibicao: input.nome_exibicao.trim(),
    status_pagbank: input.status_pagbank,
    status_byla: statusByla,
    valor_bruto: input.valor_bruto,
    plano_rotulo: input.plano_rotulo ?? null,
    dia_cobranca: input.dia_cobranca,
    ciclo_atual: input.ciclo_atual,
    ciclo_total: input.ciclo_total,
    data_criacao_assinatura: input.data_criacao_assinatura ?? null,
    proxima_cobranca: input.proxima_cobranca ?? null,
    historico_cobrancas: input.historico_cobrancas ?? [],
    offset_dias_extrato: input.offset_dias_extrato ?? 5,
    regra_sticky_id: input.regra_sticky_id ?? null,
    ativo: input.ativo !== false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('assinatura_credito_recorrente')
    .upsert(row, { onConflict: 'pagbank_subs_id' })
    .select(
      'id, pagbank_subs_id, pagbank_cust_id, nome_exibicao, status_pagbank, status_byla, valor_bruto, plano_rotulo, dia_cobranca, ciclo_atual, ciclo_total, proxima_cobranca, historico_cobrancas, offset_dias_extrato, regra_sticky_id, ativo',
    )
    .single();

  if (!error && data) {
    tableAvailable = true;
    return mapAssinaturaRow(data as Record<string, unknown>);
  }
  if (error && isMissingTableError(error.message)) {
    markMissingTable();
    return null;
  }
  throw new Error(error?.message ?? 'Falha ao salvar assinatura');
}

export async function patchAssinatura(
  supabase: SupabaseClient,
  id: string,
  input: Partial<Omit<UpsertAssinaturaInput, 'pagbank_subs_id'>>,
): Promise<AssinaturaCreditoRecorrente | null> {
  if (tableAvailable === false) return null;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.pagbank_cust_id !== undefined) patch.pagbank_cust_id = input.pagbank_cust_id;
  if (input.nome_exibicao !== undefined) patch.nome_exibicao = input.nome_exibicao.trim();
  if (input.status_pagbank !== undefined) patch.status_pagbank = input.status_pagbank;
  if (input.status_byla !== undefined) patch.status_byla = input.status_byla;
  if (input.valor_bruto !== undefined) patch.valor_bruto = input.valor_bruto;
  if (input.plano_rotulo !== undefined) patch.plano_rotulo = input.plano_rotulo;
  if (input.dia_cobranca !== undefined) patch.dia_cobranca = input.dia_cobranca;
  if (input.ciclo_atual !== undefined) patch.ciclo_atual = input.ciclo_atual;
  if (input.ciclo_total !== undefined) patch.ciclo_total = input.ciclo_total;
  if (input.data_criacao_assinatura !== undefined) {
    patch.data_criacao_assinatura = input.data_criacao_assinatura;
  }
  if (input.proxima_cobranca !== undefined) patch.proxima_cobranca = input.proxima_cobranca;
  if (input.historico_cobrancas !== undefined) patch.historico_cobrancas = input.historico_cobrancas;
  if (input.offset_dias_extrato !== undefined) patch.offset_dias_extrato = input.offset_dias_extrato;
  if (input.regra_sticky_id !== undefined) patch.regra_sticky_id = input.regra_sticky_id;
  if (input.ativo !== undefined) patch.ativo = input.ativo;

  const { data, error } = await supabase
    .from('assinatura_credito_recorrente')
    .update(patch)
    .eq('id', id)
    .select(
      'id, pagbank_subs_id, pagbank_cust_id, nome_exibicao, status_pagbank, status_byla, valor_bruto, plano_rotulo, dia_cobranca, ciclo_atual, ciclo_total, proxima_cobranca, historico_cobrancas, offset_dias_extrato, regra_sticky_id, ativo',
    )
    .maybeSingle();

  if (!error && data) {
    tableAvailable = true;
    return mapAssinaturaRow(data as Record<string, unknown>);
  }
  if (error && isMissingTableError(error.message)) {
    markMissingTable();
    return null;
  }
  if (!error && !data) return null;
  throw new Error(error?.message ?? 'Falha ao atualizar assinatura');
}

/** Amarra regra sticky aprendida à assinatura PagBank (por SUBS id). */
export async function amarrarRegraStickyAssinatura(
  supabase: SupabaseClient,
  pagbankSubsId: string,
  regraStickyId: string,
): Promise<boolean> {
  if (tableAvailable === false) return false;

  const { data, error } = await supabase
    .from('assinatura_credito_recorrente')
    .update({
      regra_sticky_id: regraStickyId,
      updated_at: new Date().toISOString(),
    })
    .eq('pagbank_subs_id', pagbankSubsId.trim())
    .select('id')
    .maybeSingle();

  if (!error && data) {
    tableAvailable = true;
    return true;
  }
  if (error && isMissingTableError(error.message)) {
    markMissingTable();
    return false;
  }
  if (!error && !data) return false;
  throw new Error(error?.message ?? 'Falha ao amarrar regra sticky');
}

export async function classificarAssinatura(
  supabase: SupabaseClient,
  id: string,
  acao: 'cancelou' | 'parou_de_pagar' | 'dispensar',
): Promise<AssinaturaCreditoRecorrente | null> {
  if (tableAvailable === false) return null;
  if (acao === 'dispensar') {
    const atual = await listAssinaturas(supabase);
    return atual.find((a) => a.id === id) ?? null;
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (acao === 'cancelou') patch.status_byla = 'cancelada';
  if (acao === 'parou_de_pagar') patch.status_byla = 'parou_de_pagar';

  const { data, error } = await supabase
    .from('assinatura_credito_recorrente')
    .update(patch)
    .eq('id', id)
    .select(
      'id, pagbank_subs_id, pagbank_cust_id, nome_exibicao, status_pagbank, status_byla, valor_bruto, plano_rotulo, dia_cobranca, ciclo_atual, ciclo_total, proxima_cobranca, historico_cobrancas, offset_dias_extrato, regra_sticky_id, ativo',
    )
    .maybeSingle();

  if (!error && data) {
    tableAvailable = true;
    return mapAssinaturaRow(data as Record<string, unknown>);
  }
  if (error && isMissingTableError(error.message)) {
    markMissingTable();
    return null;
  }
  throw new Error(error?.message ?? 'Falha ao classificar assinatura');
}

function janelaRangeIso(janela: string[]): { inicio: string; fim: string } {
  const sorted = [...janela].sort();
  return { inicio: sorted[0], fim: sorted[sorted.length - 1] };
}

export async function listAlertasParouDePagar(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
  hojeIso = new Date().toISOString().slice(0, 10),
): Promise<AlertaParouDePagar[]> {
  if (tableAvailable === false) return [];

  const assinaturas = (await listAssinaturas(supabase, { apenasAtivas: true })).filter((a) =>
    elegivelAlertaParouDePagar({
      statusByla: a.status_byla,
      ativo: a.ativo,
      cicloAtual: a.ciclo_atual,
      cicloTotal: a.ciclo_total,
      proximaCobranca: a.proxima_cobranca,
    }),
  );

  if (assinaturas.length === 0) return [];

  const vinculos = await listVinculosMes(mes, ano);
  const regras = await listRegrasCreditoRecorrenteAtivas(supabase);
  const regraPorId = new Map(regras.map((r) => [r.id, r]));

  const { data: pagRows, error: pagErr } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select('id, aluno_nome')
    .eq('mes_competencia', mes)
    .eq('ano_competencia', ano)
    .limit(20000);
  if (pagErr) throw new Error(pagErr.message);
  const alunoNormPorPlanilhaId = montarAlunoNormPorPlanilhaId(
    (pagRows ?? []).map((r) => ({
      id: String((r as { id: string }).id),
      aluno_nome: String((r as { aluno_nome?: string }).aluno_nome ?? ''),
    })),
  );

  const janelas = assinaturas.map((a) => ({
    assinatura: a,
    ...janelaEsperadaPagamentoAssinatura({
      ano,
      mes,
      diaCobranca: a.dia_cobranca,
      offsetDiasExtrato: a.offset_dias_extrato,
    }),
  }));

  const minInicio = janelas
    .map((j) => janelaRangeIso(j.janela).inicio)
    .sort()[0];
  const maxFim = janelas
    .map((j) => janelaRangeIso(j.janela).fim)
    .sort()
    .slice(-1)[0];

  const { data: txRows, error } = await supabase
    .from('transacoes')
    .select('id, data, valor, pessoa, descricao')
    .gte('data', minInicio)
    .lte('data', maxFim)
    .limit(20000);

  if (error) {
    if (isMissingTableError(error.message)) {
      markMissingTable();
      return [];
    }
    throw new Error(error.message);
  }

  const txById = new Map<string, TransacaoJanela>();
  for (const r of txRows ?? []) {
    const id = String((r as { id: string }).id);
    txById.set(id, {
      id,
      data: String((r as { data: string }).data).slice(0, 10),
      valor: Number((r as { valor?: number }).valor || 0),
      pessoa: String((r as { pessoa?: string }).pessoa ?? ''),
      descricao: (r as { descricao?: string | null }).descricao ?? null,
    });
  }

  // Garante txs dos vínculos do mês (pode cair fora da janela Vendas, ex. Mastercard D+6).
  const bancoIdsFaltando = [
    ...new Set(vinculos.map((v) => v.banco_id).filter((id) => id && !txById.has(id))),
  ];
  if (bancoIdsFaltando.length > 0) {
    const { data: extraRows, error: extraErr } = await supabase
      .from('transacoes')
      .select('id, data, valor, pessoa, descricao')
      .in('id', bancoIdsFaltando)
      .limit(5000);
    if (extraErr) throw new Error(extraErr.message);
    for (const r of extraRows ?? []) {
      const id = String((r as { id: string }).id);
      txById.set(id, {
        id,
        data: String((r as { data: string }).data).slice(0, 10),
        valor: Number((r as { valor?: number }).valor || 0),
        pessoa: String((r as { pessoa?: string }).pessoa ?? ''),
        descricao: (r as { descricao?: string | null }).descricao ?? null,
      });
    }
  }

  const transacoes = [...txById.values()];
  const alertas: AlertaParouDePagar[] = [];

  for (const item of janelas) {
    const regraSticky = item.assinatura.regra_sticky_id
      ? regraPorId.get(item.assinatura.regra_sticky_id) ?? null
      : null;

    const temPagamentoNaJanela = resolverTemPagamentoNaJanela({
      assinatura: item.assinatura,
      janela: item.janela,
      vinculos,
      transacoes,
      regraSticky,
      alunoNormPorPlanilhaId,
    });

    const alerta = decidirAlertaParouDePagar({
      assinatura: item.assinatura,
      mes,
      ano,
      temPagamentoNaJanela,
      hojeIso,
    });

    if (alerta) alertas.push(alerta);
  }

  return alertas;
}

/** Expõe chaveItemCredito para testes de integração de sticky. */
export { chaveItemCredito };
