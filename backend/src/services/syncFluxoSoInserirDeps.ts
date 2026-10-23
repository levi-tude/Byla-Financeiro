/** Dependências reais (Supabase + planilha) do sync automático só-inserir. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PlanilhaAlunosAdapter } from '../adapters/PlanilhaAlunosAdapter.js';
import { isEligibleSheet } from '../businessRules.js';
import {
  buildAlunosFromPlanilhaRows,
  buildPagamentosDesiredFromAba,
  canonicalSheetName,
} from '../logic/fluxoPlanilhaImport.js';
import { isModalidadeProgramaBolsas } from '../logic/programaBolsasMap.js';
import { fluxoUuidFromAnyPlanilhaId } from '../logic/fluxoPagamentoFingerprint.js';
import type { PagamentoDesiredIncremental } from '../logic/syncFluxoIncrementalPlan.js';
import { lerPagamentosPorAbaEAno } from './planilhaPagamentos.js';
import { log } from './logger.js';
import type { AlunoPlanilha, SyncDeps, SyncResumo } from './syncFluxoSoInserirAuto.js';

const T_ALUNOS = 'fluxo_alunos_operacionais';
const T_PAGS = 'fluxo_pagamentos_operacionais';
const T_VINC = 'validacao_pagamentos_vinculos';
/** Tabela de log proposta em scripts/supabase-schema-fluxo-sync-execucoes.sql (NÃO aplicada). */
const T_LOG = 'fluxo_sync_execucoes';

type Row = Record<string, unknown>;

async function fetchAll(supabase: SupabaseClient, table: string, select: string): Promise<Row[]> {
  const PAGE = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as Row[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function anoAtualSaoPaulo(): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date()));
}

export function createSyncDepsReais(supabase: SupabaseClient, ano = anoAtualSaoPaulo()): SyncDeps {
  const deps: SyncDeps = {
    async contar() {
      const alunos = await fetchAll(supabase, T_ALUNOS, 'id');
      const pags = await fetchAll(supabase, T_PAGS, 'id');
      const vinc = await fetchAll(supabase, T_VINC, 'id, planilha_id');
      const pagIds = new Set(pags.map((p) => String(p.id)));
      const com = new Set<string>();
      for (const v of vinc) {
        const uuid = fluxoUuidFromAnyPlanilhaId(String(v.planilha_id ?? ''));
        if (uuid && pagIds.has(uuid)) com.add(uuid);
      }
      return { alunos: alunos.length, pagamentos: pags.length, vinculos: vinc.length, pagamentosComVinculo: com.size };
    },
    async lerPlanilha() {
      const planilha = new PlanilhaAlunosAdapter();
      const all = await planilha.listarTodasAbas();
      if (all.error) throw new Error(`planilha: ${all.error}`);
      const abas = Array.from(
        new Set((all.abas ?? []).map((a) => canonicalSheetName(a)).filter((a) => a && isEligibleSheet(a))),
      );
      const alunosPlanilha = buildAlunosFromPlanilhaRows(all.rows as Row[])
        .filter((a) => a.secao !== 'inativo' && a.ativo)
        .filter((a) => a.secao !== 'bolsas' && !isModalidadeProgramaBolsas(a.modalidade)) as unknown as AlunoPlanilha[];
      const desiredPags: PagamentoDesiredIncremental[] = [];
      const errosParse: string[] = [];
      const datas: string[] = [];
      const errosLeitura: string[] = [];
      for (const aba of abas) {
        const res = await lerPagamentosPorAbaEAno(aba, ano);
        if (res.error) {
          errosLeitura.push(`${aba}: falha ao ler pagamentos`);
          continue;
        }
        desiredPags.push(
          ...buildPagamentosDesiredFromAba({ aba, alunos: res.alunos, erros: errosParse, avisosDatasCorrigidas: datas }),
        );
      }
      return {
        ano,
        abas,
        alunosPlanilha,
        desiredPags,
        errosLeitura,
        errosParse: errosParse.length,
        datasCorrigidas: datas.length,
      };
    },
    async lerBanco() {
      const existAlunos = await fetchAll(supabase, T_ALUNOS, 'id, aba, modalidade, aluno_nome, linha_planilha');
      const existPags = await fetchAll(
        supabase,
        T_PAGS,
        'id, aba, modalidade, linha_planilha, ordem_lancamento, aluno_nome, data_pagamento, valor, mes_competencia, ano_competencia',
      );
      return { existAlunos, existPags };
    },
    // SÓ INSERT — nunca update/upsert/delete.
    async inserirAluno(row) {
      const { error } = await supabase.from(T_ALUNOS).insert(row);
      return error ? error.message : null;
    },
    async inserirPagamento(row) {
      const { error } = await supabase.from(T_PAGS).insert(row);
      return error ? error.message : null;
    },
    log: (level, data) => log(level, { msg: 'sync_fluxo_so_inserir', ...data }),
  };

  // Log em tabela: só quando a tabela existir (migração revisada e aplicada pelo Levi).
  if ((process.env.SYNC_LOG_TABLE_ENABLED ?? '').trim().toLowerCase() === 'true') {
    deps.registrarExecucao = async (r: SyncResumo) => {
      const { error } = await supabase.from(T_LOG).insert({
        status: r.status,
        iniciado_em: r.iniciadoEm,
        finalizado_em: r.finalizadoEm,
        ano: r.ano ?? null,
        alunos_inseridos: r.inseridos?.alunos ?? 0,
        pagamentos_inseridos: r.inseridos?.pagamentos ?? 0,
        contagens: r.contagens ?? null,
        conflitos: r.conflitos,
        avisos: r.avisos,
        erros: r.erros,
      });
      if (error) throw new Error(error.message);
    };
  }

  const n8n = (process.env.SYNC_NOTIFY_WEBHOOK_URL ?? '').trim();
  if (n8n) deps.notificar = (r) => notificarWebhook(n8n, r);
  return deps;
}

/** Envia só contagens/tipos (sem nomes de alunos) para um webhook (ex.: n8n → WhatsApp/e-mail do Levi). */
export async function notificarWebhook(url: string, r: SyncResumo): Promise<void> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        evento: 'sync_fluxo_so_inserir',
        status: r.status,
        inseridos: r.inseridos,
        contagens: r.contagens,
        conflitos: r.conflitos.map((c) => ({ tipo: c.tipo, quantidade: c.quantidade })),
        erros: r.erros.length,
        finalizadoEm: r.finalizadoEm,
      }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}
