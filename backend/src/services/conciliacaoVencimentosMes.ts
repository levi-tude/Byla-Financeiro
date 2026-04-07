/**
 * Lógica compartilhada entre GET /conciliacao-vencimentos e relatórios R5.
 */

import { getSupabase } from './supabaseClient.js';
import { listSheetNames } from './sheetsService.js';
import { config } from '../config.js';
import { lerPagamentosPorAbaEAno } from './planilhaPagamentos.js';
import type { PagamentoPlanilha } from './planilhaPagamentos.js';
import { isEligibleSheet, businessRules } from '../businessRules.js';
import { filtrarTransacoesOficiais } from './transacoesFiltro.js';
import { dataVencimentoNoMes, diffDiasISO } from '../logic/vencimentoPlanilha.js';
import { normalizeText, shiftISODate } from '../logic/conciliacaoTexto.js';
import {
  matchUmPagamentoPlanilhaBanco,
  type PlanilhaItem,
  type BancoItem,
  type PilatesNomePagadorRow,
} from '../logic/conciliacaoPagamentoMatch.js';

async function carregarEntradasBancoJanela(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  dataPagamento: string,
): Promise<BancoItem[]> {
  const flexDays = businessRules.conciliacao.bancoJanelaDias;
  const bancoDatas: string[] = [];
  for (let d = -flexDays; d <= flexDays; d++) {
    bancoDatas.push(shiftISODate(dataPagamento.slice(0, 10), d));
  }
  const { data: bancoRows, error: bancoError } = await supabase
    .from('transacoes')
    .select('id, data, pessoa, valor, descricao, tipo')
    .in('data', bancoDatas)
    .order('id', { ascending: false });
  if (bancoError) return [];
  const todas = (bancoRows ?? []) as {
    id: string;
    data: string;
    pessoa: string;
    valor: number;
    descricao: string | null;
    tipo: string;
  }[];
  const { entradas } = filtrarTransacoesOficiais(todas);
  return entradas.map((r) => ({
    id: r.id,
    data: r.data,
    pessoa: r.pessoa ?? '',
    descricao: r.descricao ?? null,
    valor: Number(r.valor || 0),
  }));
}

async function carregarPilatesPagadorDia(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  dataStr: string,
): Promise<PilatesNomePagadorRow[]> {
  const { data: rows, error } = await supabase
    .from('v_mensalidades_por_atividade')
    .select('aluno_nome, nome_pagador, valor, forma_pagamento, atividade_nome')
    .eq('data_pagamento', dataStr);
  if (error || !Array.isArray(rows)) return [];
  const out: PilatesNomePagadorRow[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const atividadeNome = normalizeText(String(r.atividade_nome ?? ''));
    if (!atividadeNome.includes('PILATES')) continue;
    out.push({
      aluno_nome: (r.aluno_nome as string) ?? null,
      nome_pagador: (r.nome_pagador as string) ?? null,
      valor: r.valor != null ? Number(r.valor) : null,
      forma_pagamento: (r.forma_pagamento as string) ?? null,
      atividade_nome: (r.atividade_nome as string) ?? null,
    });
  }
  return out;
}

const GRACE_DIAS_APOS_VENCIMENTO = businessRules.conciliacao.graceDiasAposVencimento;

function hojeIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type ConciliacaoVencimentoItem = {
  aba: string;
  modalidade: string;
  aluno: string;
  linha: number;
  dia_vencimento: number | null;
  data_vencimento_mes: string | null;
  pago_na_planilha: boolean;
  data_pagamento_planilha: string | null;
  valor_pagamento_planilha: number | null;
  situacao: 'ok' | 'atrasado' | 'em_aberto' | 'a_vencer' | 'sem_vencimento';
  dias_apos_vencimento_quando_pago: number | null;
  dias_em_atraso_hoje: number | null;
  dias_para_vencimento: number | null;
  mensagem: string;
  banco_confirmado: boolean | null;
  banco_status: 'ok' | 'possivel' | 'nao' | 'nao_aplicavel';
  data_banco: string | null;
  pessoa_banco: string | null;
  transacao_banco_id: string | null;
  banco_mensagem: string;
};

export type ConciliacaoVencimentosKpis = {
  total: number;
  ok: number;
  atrasado: number;
  em_aberto: number;
  a_vencer: number;
  sem_vencimento: number;
  banco_ok: number;
  banco_pendente: number;
  banco_ambiguo: number;
};

export type ConciliacaoVencimentosMesOk = {
  mes: number;
  ano: number;
  tolerancia_dias: number;
  hoje: string;
  kpis: ConciliacaoVencimentosKpis;
  itens: ConciliacaoVencimentoItem[];
};

export type ConciliacaoVencimentosMesAviso = {
  mes: number;
  ano: number;
  itens: [];
  aviso: string;
};

export type ConciliacaoVencimentosMesResult = ConciliacaoVencimentosMesOk | ConciliacaoVencimentosMesAviso;

/** Erros que a rota HTTP deve mapear para status. */
export class ConciliacaoVencimentosMesError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ConciliacaoVencimentosMesError';
  }
}

/**
 * Mesma montagem que GET /conciliacao-vencimentos (para reutilizar em relatórios).
 */
export async function getConciliacaoVencimentosMesData(mes: number, ano: number): Promise<ConciliacaoVencimentosMesResult> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new ConciliacaoVencimentosMesError('Supabase não configurado.', 503);
  }
  const sb = supabase;

  const idPlanilha = config.sheets.spreadsheetId;
  if (!idPlanilha) {
    throw new ConciliacaoVencimentosMesError('Planilha FLUXO BYLA não configurada.', 400, { itens: [] });
  }

  const { names, error: abasError } = await listSheetNames(idPlanilha);
  if (abasError) return { mes, ano, itens: [], aviso: abasError };

  const abasElegiveis = names.filter((n) => isEligibleSheet(n));
  const usadosBancoGlobal = new Set<string>();
  const poolCache = new Map<string, BancoItem[]>();
  const pilatesCache = new Map<string, PilatesNomePagadorRow[]>();

  type BancoMeta = {
    banco_confirmado: boolean;
    banco_status: 'ok' | 'possivel' | 'nao';
    data_banco: string | null;
    pessoa_banco: string | null;
    transacao_banco_id: string | null;
    banco_mensagem: string;
  };

  async function bancoMetaParaComps(
    comps: PagamentoPlanilha[],
    a: { aluno: string; modalidade: string; linha: number },
    aba: string,
  ): Promise<BancoMeta> {
    if (comps.length === 0) {
      return {
        banco_confirmado: false,
        banco_status: 'nao',
        data_banco: null,
        pessoa_banco: null,
        transacao_banco_id: null,
        banco_mensagem: 'Sem pagamento na planilha para esta competência.',
      };
    }
    const sorted = [...comps].sort((x, y) => x.data.localeCompare(y.data));
    let todosConfirmados = true;
    let anyPossivel = false;
    let anyNao = false;
    let lastBanco: BancoItem | null = null;
    const ids: string[] = [];

    for (const p of sorted) {
      const planilha: PlanilhaItem = {
        id: `${aba}::${a.linha}::${a.aluno}::${p.data}::${p.valor}::${p.forma}`,
        aba,
        modalidade: a.modalidade ?? aba,
        aluno: a.aluno,
        linha: a.linha,
        data: p.data,
        forma: p.forma,
        valor: Number(p.valor || 0),
        mesCompetencia: p.mesCompetencia,
        anoCompetencia: p.anoCompetencia,
        responsaveis: p.responsaveis ?? [],
        pagadorPix: p.pagadorPix,
      };
      const dataKey = p.data.slice(0, 10);
      let pool = poolCache.get(dataKey);
      if (!pool) {
        pool = await carregarEntradasBancoJanela(sb, dataKey);
        poolCache.set(dataKey, pool);
      }
      const needsPilates = normalizeText(aba).includes('PILATES') || normalizeText(a.modalidade ?? '').includes('PILATES');
      let pilatesRows: PilatesNomePagadorRow[] = [];
      if (needsPilates) {
        if (!pilatesCache.has(dataKey)) {
          pilatesCache.set(dataKey, await carregarPilatesPagadorDia(sb, dataKey));
        }
        pilatesRows = pilatesCache.get(dataKey)!;
      }
      const match = matchUmPagamentoPlanilhaBanco(planilha, pool, usadosBancoGlobal, pilatesRows);
      if (match.status === 'confirmado') {
        usadosBancoGlobal.add(match.banco.id);
        ids.push(match.banco.id);
        lastBanco = match.banco;
      } else {
        todosConfirmados = false;
        if (match.status === 'possivel') anyPossivel = true;
        else anyNao = true;
      }
    }

    const banco_confirmado = todosConfirmados && sorted.length > 0;
    let banco_status: 'ok' | 'possivel' | 'nao';
    if (banco_confirmado) banco_status = 'ok';
    else if (anyPossivel) banco_status = 'possivel';
    else banco_status = 'nao';

    let banco_mensagem: string;
    if (banco_confirmado) {
      banco_mensagem =
        sorted.length === 1
          ? `Banco: correspondência única (valor + nome), ${lastBanco?.pessoa ?? ''} em ${(lastBanco?.data ?? '').slice(0, 10)}.`
          : `${sorted.length} lançamentos na planilha: todos conferem no banco (mesma regra da Validação).`;
    } else if (anyPossivel) {
      banco_mensagem = `Banco: há valor igual na janela ±${businessRules.conciliacao.bancoJanelaDias} dias, mas nome ambíguo ou vários candidatos — use a Validação de pagamentos.`;
    } else {
      banco_mensagem = `Banco: sem entrada que combine valor + nome (janela ±${businessRules.conciliacao.bancoJanelaDias} dias da data do pagamento na planilha).`;
    }

    return {
      banco_confirmado,
      banco_status,
      data_banco: lastBanco?.data ? lastBanco.data.slice(0, 10) : null,
      pessoa_banco: lastBanco?.pessoa ?? null,
      transacao_banco_id: ids.length ? ids.join(',') : null,
      banco_mensagem,
    };
  }

  type Sit = 'ok' | 'atrasado' | 'em_aberto' | 'a_vencer' | 'sem_vencimento';
  const itens: ConciliacaoVencimentoItem[] = [];

  const hoje = hojeIsoLocal();
  for (const aba of abasElegiveis) {
    const { alunos, error: errAba } = await lerPagamentosPorAbaEAno(aba, ano);
    if (errAba) continue;
    for (const a of alunos) {
      const diaV = a.diaVencimento;
      const modalidade = a.modalidade ?? aba;
      const comps = (a.pagamentos ?? []).filter((p) => p.mesCompetencia === mes && p.anoCompetencia === ano);
      const pagoPlanilha = comps.length > 0;
      let dataPag: string | null = null;
      let valorPag: number | null = null;
      if (pagoPlanilha) {
        const ordenado = [...comps].sort((x, y) => x.data.localeCompare(y.data));
        dataPag = ordenado[0]?.data ?? null;
        valorPag = ordenado.reduce((s, p) => s + Number(p.valor || 0), 0);
      }
      const bancoBlock: BancoMeta | null = pagoPlanilha ? await bancoMetaParaComps(comps, a, aba) : null;

      if (diaV == null || diaV < 1 || diaV > 31) {
        itens.push({
          aba,
          modalidade,
          aluno: a.aluno,
          linha: a.linha,
          dia_vencimento: null,
          data_vencimento_mes: null,
          pago_na_planilha: pagoPlanilha,
          data_pagamento_planilha: dataPag,
          valor_pagamento_planilha: valorPag,
          situacao: 'sem_vencimento',
          dias_apos_vencimento_quando_pago: null,
          dias_em_atraso_hoje: null,
          dias_para_vencimento: null,
          mensagem: pagoPlanilha
            ? 'Pagamento lançado na planilha para a competência; coluna de vencimento não identificada nesta aba.'
            : 'Sem dia de vencimento na planilha; não é possível calcular atraso.',
          banco_confirmado: bancoBlock?.banco_confirmado ?? null,
          banco_status: bancoBlock?.banco_status ?? 'nao_aplicavel',
          data_banco: bancoBlock?.data_banco ?? null,
          pessoa_banco: bancoBlock?.pessoa_banco ?? null,
          transacao_banco_id: bancoBlock?.transacao_banco_id ?? null,
          banco_mensagem: bancoBlock?.banco_mensagem ?? '—',
        });
        continue;
      }

      const dataVenc = dataVencimentoNoMes(ano, mes, diaV);
      if (pagoPlanilha && dataPag) {
        const diffPago = diffDiasISO(dataPag, dataVenc);
        const okTolerancia = diffPago <= GRACE_DIAS_APOS_VENCIMENTO;
        const situacao: Sit = okTolerancia ? 'ok' : 'atrasado';
        const diasApos = Math.max(0, diffPago);
        itens.push({
          aba,
          modalidade,
          aluno: a.aluno,
          linha: a.linha,
          dia_vencimento: diaV,
          data_vencimento_mes: dataVenc,
          pago_na_planilha: true,
          data_pagamento_planilha: dataPag,
          valor_pagamento_planilha: valorPag,
          situacao,
          dias_apos_vencimento_quando_pago: diasApos,
          dias_em_atraso_hoje: null,
          dias_para_vencimento: null,
          mensagem: okTolerancia
            ? `Pago em ${dataPag} (até ${GRACE_DIAS_APOS_VENCIMENTO} dias após venc. ${dataVenc}).`
            : `Pago em ${dataPag}, após o período de tolerância (${GRACE_DIAS_APOS_VENCIMENTO} dias) do venc. ${dataVenc}.`,
          banco_confirmado: bancoBlock!.banco_confirmado,
          banco_status: bancoBlock!.banco_status,
          data_banco: bancoBlock!.data_banco,
          pessoa_banco: bancoBlock!.pessoa_banco,
          transacao_banco_id: bancoBlock!.transacao_banco_id,
          banco_mensagem: bancoBlock!.banco_mensagem,
        });
      } else {
        const diffHoje = diffDiasISO(hoje, dataVenc);
        let situacao: Sit;
        let diasAtraso: number | null = null;
        let diasPara: number | null = null;
        let msg: string;
        if (diffHoje > 0) {
          situacao = 'em_aberto';
          diasAtraso = diffHoje;
          msg = `Sem pagamento lançado para a competência ${mes}/${ano} na planilha. Vencimento ${dataVenc} — ${diffHoje} dia(s) em atraso (hoje ${hoje}).`;
        } else {
          situacao = 'a_vencer';
          diasPara = -diffHoje;
          msg = `Sem pagamento para ${mes}/${ano} na planilha. Vencimento ${dataVenc} — falta(m) ${-diffHoje} dia(s) (hoje ${hoje}).`;
        }
        itens.push({
          aba,
          modalidade,
          aluno: a.aluno,
          linha: a.linha,
          dia_vencimento: diaV,
          data_vencimento_mes: dataVenc,
          pago_na_planilha: false,
          data_pagamento_planilha: null,
          valor_pagamento_planilha: null,
          situacao,
          dias_apos_vencimento_quando_pago: null,
          dias_em_atraso_hoje: diasAtraso,
          dias_para_vencimento: diasPara,
          mensagem: msg,
          banco_confirmado: null,
          banco_status: 'nao_aplicavel',
          data_banco: null,
          pessoa_banco: null,
          transacao_banco_id: null,
          banco_mensagem: '—',
        });
      }
    }
  }

  const kpis: ConciliacaoVencimentosKpis = {
    total: itens.length,
    ok: itens.filter((x) => x.situacao === 'ok').length,
    atrasado: itens.filter((x) => x.situacao === 'atrasado').length,
    em_aberto: itens.filter((x) => x.situacao === 'em_aberto').length,
    a_vencer: itens.filter((x) => x.situacao === 'a_vencer').length,
    sem_vencimento: itens.filter((x) => x.situacao === 'sem_vencimento').length,
    banco_ok: itens.filter((x) => x.banco_confirmado === true).length,
    banco_pendente: itens.filter((x) => x.pago_na_planilha && x.banco_confirmado === false && x.banco_status === 'nao').length,
    banco_ambiguo: itens.filter((x) => x.banco_status === 'possivel').length,
  };

  return {
    mes,
    ano,
    tolerancia_dias: GRACE_DIAS_APOS_VENCIMENTO,
    hoje,
    kpis,
    itens,
  };
}
