/**
 * Sync incremental do Fluxo: upsert alunos + diff de pagamentos sem trocar UUID.
 * Não chama remap de vínculos — IDs existentes permanecem.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { PlanilhaAlunosAdapter } from '../adapters/PlanilhaAlunosAdapter.js';
import { isEligibleSheet } from '../businessRules.js';
import {
  buildAlunosFromPlanilhaRows,
  buildPagamentosDesiredFromAba,
  canonicalSheetName,
  normFluxoImport,
} from '../logic/fluxoPlanilhaImport.js';
import { isModalidadeProgramaBolsas } from '../logic/programaBolsasMap.js';
import { fluxoUuidFromAnyPlanilhaId } from '../logic/fluxoPagamentoFingerprint.js';
import {
  aplicarOverlaysNaMigracao,
  type FluxoAlunoOverlay,
} from '../logic/fluxoRemigracaoOverlays.js';
import {
  gravarOverlaysSticky,
  lerOverlaysSticky,
  mesclarOverlays,
} from './fluxoAlunoOverlaySticky.js';
import {
  planAlunosIncremental,
  planPagamentosIncremental,
  type PagamentoDesiredIncremental,
  type PagamentoExistingIncremental,
} from '../logic/syncFluxoIncrementalPlan.js';
import { lerPagamentosPorAbaEAno } from './planilhaPagamentos.js';

const SELECT_PAG_EXISTING =
  'id, aba, modalidade, linha_planilha, ordem_lancamento, aluno_nome, data_pagamento, forma, valor, mes_competencia, ano_competencia, responsaveis, pagador_pix, raw_pagamento, origem';

export type SyncFluxoIncrementalReport = {
  ok: boolean;
  modo: 'full' | 'alunos-only';
  ano: number;
  abas: string[];
  dryRun: boolean;
  alunos: { upserted: number; inativados: number; overlaysAplicados: number };
  pagamentos: {
    atualizados: number;
    inseridos: number;
    ausentesSemVinculo: number;
    obsoletosComVinculo: number;
    inalterados: number;
  };
  /** Sem PII: só id + aba + data + valor. */
  amostraPagamentos: Array<{
    acao: 'insert' | 'ausente' | 'obsoleto' | 'update';
    id?: string;
    aba: string;
    data_pagamento: string;
    valor: number;
  }>;
  avisos: string[];
  erros: string[];
};

function abaNoFiltro(aba: string, filtro?: string[]): boolean {
  if (!filtro || filtro.length === 0) return true;
  const n = normFluxoImport(aba);
  return filtro.some((f) => normFluxoImport(canonicalSheetName(f)) === n);
}

type RangeQuery<T> = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

async function fetchAll<T>(queryFactory: () => RangeQuery<T>): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await queryFactory().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function loadOverlays(
  supabase: SupabaseClient,
): Promise<FluxoAlunoOverlay[]> {
  const rows = await fetchAll<Record<string, unknown>>(() =>
    supabase
      .from('fluxo_alunos_operacionais')
      .select(
        'aba, linha_planilha, aluno_nome, ativo, regime_cobranca, pendencia_campos_ignorados, cobranca_tentativas',
      ),
  );
  return rows.map((r) => ({
    aba: String(r.aba ?? ''),
    aluno_nome: String(r.aluno_nome ?? ''),
    linha_planilha: Number(r.linha_planilha ?? 0),
    ativo: r.ativo !== false,
    regime_cobranca: r.regime_cobranca != null ? String(r.regime_cobranca) : null,
    pendencia_campos_ignorados: r.pendencia_campos_ignorados ?? [],
    cobranca_tentativas: r.cobranca_tentativas ?? [],
  }));
}

async function loadOverlaysPreservados(
  supabase: SupabaseClient,
): Promise<{ overlays: FluxoAlunoOverlay[]; aviso?: string }> {
  const atuais = await loadOverlays(supabase);
  try {
    const sticky = await lerOverlaysSticky(supabase);
    return { overlays: mesclarOverlays(atuais, sticky) };
  } catch (e) {
    return {
      overlays: atuais,
      aviso: `overlay permanente indisponível; preservação feita pelo cadastro atual: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }
}

async function loadAlunosExisting(
  supabase: SupabaseClient,
  filtroAbas?: string[],
): Promise<Array<{ aba: string; linha_planilha: number; ativo: boolean }>> {
  const rows = await fetchAll<Record<string, unknown>>(() => {
    let q = supabase
      .from('fluxo_alunos_operacionais')
      .select('aba, linha_planilha, ativo, origem')
      .eq('origem', 'migracao_planilha');
    return q;
  });
  return rows
    .filter((r) => abaNoFiltro(String(r.aba ?? ''), filtroAbas))
    .map((r) => ({
      aba: String(r.aba ?? ''),
      linha_planilha: Number(r.linha_planilha ?? 0),
      ativo: r.ativo !== false,
    }));
}

function asExistingPag(r: Record<string, unknown>): PagamentoExistingIncremental {
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
    responsaveis: r.responsaveis == null ? null : String(r.responsaveis),
    pagador_pix: r.pagador_pix == null ? null : String(r.pagador_pix),
    raw_pagamento: r.raw_pagamento,
    origem: String(r.origem ?? 'migracao_planilha'),
  };
}

async function loadPagamentosExisting(
  supabase: SupabaseClient,
  ano: number,
  filtroAbas?: string[],
): Promise<PagamentoExistingIncremental[]> {
  const inicio = `${ano}-01-01`;
  const fim = `${ano}-12-31`;
  const byData = await fetchAll<Record<string, unknown>>(() => {
    let q = supabase
      .from('fluxo_pagamentos_operacionais')
      .select(SELECT_PAG_EXISTING)
      .eq('origem', 'migracao_planilha')
      .gte('data_pagamento', inicio)
      .lte('data_pagamento', fim);
    return q;
  });
  const byComp = await fetchAll<Record<string, unknown>>(() => {
    let q = supabase
      .from('fluxo_pagamentos_operacionais')
      .select(SELECT_PAG_EXISTING)
      .eq('origem', 'migracao_planilha')
      .eq('ano_competencia', ano);
    return q;
  });
  const byId = new Map<string, PagamentoExistingIncremental>();
  for (const r of [...byData, ...byComp]) {
    const p = asExistingPag(r);
    if (!abaNoFiltro(p.aba, filtroAbas)) continue;
    byId.set(p.id, p);
  }
  return [...byId.values()];
}

async function loadVinculadosIds(
  supabase: SupabaseClient,
  existingIds: Set<string>,
): Promise<Set<string>> {
  const rows = await fetchAll<{ planilha_id: string }>(() =>
    supabase.from('validacao_pagamentos_vinculos').select('planilha_id').like('planilha_id', 'fluxo::%'),
  );
  const out = new Set<string>();
  for (const r of rows) {
    const uuid = fluxoUuidFromAnyPlanilhaId(r.planilha_id);
    if (uuid && existingIds.has(uuid)) out.add(uuid);
  }
  return out;
}

async function aplicarAlunos(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
  inativar: Array<{ aba: string; linha_planilha: number }>,
  dryRun: boolean,
): Promise<string[]> {
  const erros: string[] = [];
  if (dryRun) return erros;
  // Remove campos internos do parser que não existem na tabela
  const CAMPOS_INTERNOS = new Set(['secao', 'raw_row', 'origem']);
  const sanitize = (r: Record<string, unknown>) => {
    const out = Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_') && !CAMPOS_INTERNOS.has(k)));
    // Garantir campos NOT NULL com default (Supabase não aplica column default quando o valor chega explicitamente como null)
    if (out['pendencia_campos_ignorados'] == null) out['pendencia_campos_ignorados'] = [];
    if (out['cobranca_tentativas'] == null) out['cobranca_tentativas'] = [];
    return out;
  };

  const CHUNK = 80;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK).map(sanitize);
    const { error } = await supabase
      .from('fluxo_alunos_operacionais')
      .upsert(slice, { onConflict: 'aba,linha_planilha' });
    if (error) erros.push(`upsert alunos: ${error.message}`);
  }
  for (const a of inativar) {
    const { error } = await supabase
      .from('fluxo_alunos_operacionais')
      .update({ ativo: false })
      .eq('aba', a.aba)
      .eq('linha_planilha', a.linha_planilha)
      .eq('origem', 'migracao_planilha');
    if (error) erros.push(`inativar aluno linha ${a.linha_planilha}: ${error.message}`);
  }
  return erros;
}

async function aplicarPagamentos(
  supabase: SupabaseClient,
  plan: ReturnType<typeof planPagamentosIncremental>,
  dryRun: boolean,
): Promise<string[]> {
  const erros: string[] = [];
  if (dryRun) return erros;

  for (const u of plan.updates) {
    const { error } = await supabase
      .from('fluxo_pagamentos_operacionais')
      .update(u.patch)
      .eq('id', u.id)
      .eq('origem', 'migracao_planilha');
    if (error) erros.push(`update ${u.id}: ${error.message}`);
  }

  for (const original of plan.inserts) {
    const row: Record<string, unknown> = {
      aba: original.aba,
      modalidade: original.modalidade,
      linha_planilha: original.linha_planilha,
      ordem_lancamento: original.ordem_lancamento,
      aluno_nome: original.aluno_nome,
      data_pagamento: original.data_pagamento,
      forma: original.forma,
      valor: original.valor,
      mes_competencia: original.mes_competencia,
      ano_competencia: original.ano_competencia,
      responsaveis: original.responsaveis ?? null,
      pagador_pix: original.pagador_pix ?? null,
      raw_pagamento: original.raw_pagamento ?? {},
      origem: 'migracao_planilha',
    };
    let inserted = false;
    for (let attempts = 0; attempts < 10 && !inserted; attempts += 1) {
      const { error } = await supabase.from('fluxo_pagamentos_operacionais').insert(row);
      if (!error) {
        inserted = true;
        break;
      }
      if (error.message.toLowerCase().includes('duplicate key value')) {
        row.ordem_lancamento = Number(row.ordem_lancamento ?? 1) + 1;
        continue;
      }
      erros.push(`insert pagamento: ${error.message}`);
      break;
    }
    if (!inserted && erros.length === 0) {
      erros.push('insert pagamento: conflito UNIQUE repetido');
    }
  }

  return erros;
}

export async function syncFluxoIncremental(
  supabase: SupabaseClient,
  args: {
    ano: number;
    dryRun?: boolean;
    alunosOnly?: boolean;
    abas?: string[];
  },
): Promise<SyncFluxoIncrementalReport> {
  const ano = args.ano;
  const dryRun = Boolean(args.dryRun);
  const alunosOnly = Boolean(args.alunosOnly);
  const filtroAbas = args.abas?.map((a) => canonicalSheetName(a)).filter(Boolean);

  const report: SyncFluxoIncrementalReport = {
    ok: true,
    modo: alunosOnly ? 'alunos-only' : 'full',
    ano,
    abas: [],
    dryRun,
    alunos: { upserted: 0, inativados: 0, overlaysAplicados: 0 },
    pagamentos: {
      atualizados: 0,
      inseridos: 0,
      ausentesSemVinculo: 0,
      obsoletosComVinculo: 0,
      inalterados: 0,
    },
    amostraPagamentos: [],
    avisos: [],
    erros: [],
  };

  const planilha = new PlanilhaAlunosAdapter();
  const all = await planilha.listarTodasAbas();
  if (all.error) {
    report.ok = false;
    report.erros.push(`planilha: ${all.error}`);
    return report;
  }

  const abasPlanilha = Array.from(
    new Set(
      (all.abas ?? [])
        .map((a) => canonicalSheetName(a))
        .filter((a) => a && isEligibleSheet(a) && abaNoFiltro(a, filtroAbas)),
    ),
  );
  report.abas = abasPlanilha;

  const alunosDesired = buildAlunosFromPlanilhaRows(all.rows as Record<string, unknown>[])
    .filter((a) => abaNoFiltro(a.aba, filtroAbas))
    // Programa de Bolsas é visão espelho — não cadastrar como modalidade do Fluxo.
    .filter((a) => a.secao !== 'bolsas' && !isModalidadeProgramaBolsas(a.modalidade));
  if (alunosDesired.length === 0) {
    report.ok = false;
    report.erros.push('Nenhum aluno parseado no escopo.');
    return report;
  }

  const overlaysResult = await loadOverlaysPreservados(supabase);
  const overlays = overlaysResult.overlays;
  if (overlaysResult.aviso) report.avisos.push(overlaysResult.aviso);
  const overlayResult = aplicarOverlaysNaMigracao(alunosDesired, overlays);
  // Capacitação / seções ativas: a planilha manda no ativo.
  // Corrige sticky falso de quando o limite de linha marcava o bloco como inativo.
  for (const row of overlayResult.rows) {
    const secao = String(row.secao ?? 'normal');
    if (secao === 'inativo') {
      row.ativo = false;
      continue;
    }
    if (secao === 'capacitacao') {
      const desired = alunosDesired.find(
        (a) => a.aba === row.aba && a.linha_planilha === Number(row.linha_planilha),
      );
      if (desired?.ativo) row.ativo = true;
    }
  }
  const existingAlunos = await loadAlunosExisting(supabase, filtroAbas);
  const alunosPlan = planAlunosIncremental({
    desired: overlayResult.rows.map((r) => ({
      aba: String(r.aba),
      linha_planilha: Number(r.linha_planilha),
    })),
    existing: existingAlunos,
  });

  report.alunos.upserted = alunosPlan.upsertCount;
  report.alunos.inativados = alunosPlan.inativar.length;
  report.alunos.overlaysAplicados = overlayResult.aplicados;

  const alunosErros = await aplicarAlunos(
    supabase,
    overlayResult.rows as Record<string, unknown>[],
    alunosPlan.inativar,
    dryRun,
  );
  report.erros.push(...alunosErros);
  if (!dryRun && alunosErros.length === 0) {
    const stickyResult = await gravarOverlaysSticky(
      supabase,
      overlayResult.rows as FluxoAlunoOverlay[],
    ).catch((e) => ({ gravados: 0, erro: e instanceof Error ? e.message : String(e) }));
    if (stickyResult.erro) {
      report.avisos.push(`não foi possível atualizar o overlay permanente: ${stickyResult.erro}`);
    }
  }

  if (alunosOnly) {
    report.ok = report.erros.length === 0;
    return report;
  }

  const desiredPags: PagamentoDesiredIncremental[] = [];
  const errosPag: string[] = [];
  const avisosDatas: string[] = [];
  for (const aba of abasPlanilha) {
    const res = await lerPagamentosPorAbaEAno(aba, ano);
    if (res.error) {
      errosPag.push(`${aba}: falha ao ler pagamentos`);
      continue;
    }
    desiredPags.push(
      ...buildPagamentosDesiredFromAba({
        aba,
        alunos: res.alunos,
        erros: errosPag,
        avisosDatasCorrigidas: avisosDatas,
      }),
    );
  }
  if (errosPag.length > 0) {
    report.avisos.push(`${errosPag.length} avisos de parse de pagamentos (sem detalhe de aluno)`);
  }
  if (avisosDatas.length > 0) {
    report.avisos.push(`${avisosDatas.length} datas de pagamento corrigidas no parse`);
  }

  const existingPags = await loadPagamentosExisting(supabase, ano, filtroAbas);
  const vinculadosIds = await loadVinculadosIds(
    supabase,
    new Set(existingPags.map((p) => p.id)),
  );
  const pagPlan = planPagamentosIncremental({
    desired: desiredPags,
    existing: existingPags,
    vinculadosIds,
  });

  report.pagamentos.atualizados = pagPlan.updates.length;
  report.pagamentos.inseridos = pagPlan.inserts.length;
  report.pagamentos.ausentesSemVinculo = pagPlan.ausentesSemVinculo.length;
  report.pagamentos.obsoletosComVinculo = pagPlan.obsoletosComVinculo.length;
  report.pagamentos.inalterados = pagPlan.inalterados.length;
  const existingById = new Map(existingPags.map((p) => [p.id, p]));
  report.amostraPagamentos = [
    ...pagPlan.inserts.map((p) => ({
      acao: 'insert' as const,
      aba: p.aba,
      data_pagamento: p.data_pagamento,
      valor: p.valor,
    })),
    ...pagPlan.updates.map((u) => ({
      acao: 'update' as const,
      id: u.id,
      aba: existingById.get(u.id)?.aba ?? '',
      data_pagamento: u.patch.data_pagamento,
      valor: u.patch.valor,
    })),
    ...pagPlan.ausentesSemVinculo.map((id) => ({
      acao: 'ausente' as const,
      id,
      aba: existingById.get(id)?.aba ?? '',
      data_pagamento: existingById.get(id)?.data_pagamento ?? '',
      valor: existingById.get(id)?.valor ?? 0,
    })),
    ...pagPlan.obsoletosComVinculo.map((id) => ({
      acao: 'obsoleto' as const,
      id,
      aba: existingById.get(id)?.aba ?? '',
      data_pagamento: existingById.get(id)?.data_pagamento ?? '',
      valor: existingById.get(id)?.valor ?? 0,
    })),
  ];
  report.avisos.push(...pagPlan.avisos);

  const pagErros = await aplicarPagamentos(supabase, pagPlan, dryRun);
  report.erros.push(...pagErros);
  report.ok = report.erros.length === 0;
  return report;
}
