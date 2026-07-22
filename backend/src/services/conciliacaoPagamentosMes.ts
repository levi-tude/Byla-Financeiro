/**
 * Conciliação mensal de pagamentos: Fluxo operacional + extrato.
 * Classifica em dia / atrasado / pendente reusando vínculos e matcher da validação.
 */

import {
  classificarStatusConciliacao,
  isPlanoBolsaConciliacao,
  parseDiaVencimentoCadastro,
  type ConciliacaoPagamentoStatus,
} from '../logic/conciliacaoStatusExtrato.js';
import {
  matchUmPagamentoPlanilhaBanco,
  type BancoItem,
  type PilatesNomePagadorRow,
  type PlanilhaItem,
} from '../logic/conciliacaoPagamentoMatch.js';
import { normalizeText } from '../logic/conciliacaoTexto.js';
import { getSupabase } from './supabaseClient.js';
import { listVinculosMes } from './validacaoVinculos.js';
import { filtrarTransacoesOficiais, type TransacaoBase } from './transacoesFiltro.js';

export type ConciliacaoPagamentoItem = {
  aluno_id: string;
  aluno_nome: string;
  aba: string;
  modalidade: string;
  dia_vencimento: number | null;
  status: ConciliacaoPagamentoStatus;
  data_credito?: string | null;
  valor_credito?: number | null;
  pessoa_banco?: string | null;
  transacao_id?: string | null;
  vinculo_id?: string | null;
  banco_status?: 'vinculo' | 'match' | 'nenhum';
};

export type ConciliacaoPagamentosTotais = {
  em_dia: number;
  atrasado: number;
  pendente: number;
  sem_vencimento: number;
  bolsa: number;
  total: number;
};

export type ConciliacaoPagamentosMesResult = {
  mes: number;
  ano: number;
  totais: ConciliacaoPagamentosTotais;
  itens: ConciliacaoPagamentoItem[];
};

export type ConciliacaoAlunoFixture = {
  id: string;
  aba: string;
  modalidade: string;
  aluno_nome: string;
  venc: string | null;
  plano: string | null;
  valor_referencia: number | null;
  responsaveis: string | null;
  pagador_pix: string | null;
};

export type ConciliacaoPagamentoFixture = {
  id: string;
  aba: string;
  modalidade: string;
  aluno_nome: string;
  data_pagamento: string | null;
  forma: string | null;
  valor: number;
  mes_competencia: number;
  ano_competencia: number;
  responsaveis: string | null;
  pagador_pix: string | null;
  linha_planilha?: number;
};

export type ConciliacaoTransacaoFixture = {
  id: string;
  data: string;
  pessoa: string;
  valor: number;
  descricao: string | null;
  tipo: string;
};

type CreditoResolvido = {
  data: string;
  valor: number;
  pessoa: string;
  transacao_id: string;
  vinculo_id: string | null;
  banco_status: 'vinculo' | 'match';
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ultimoDiaMes(mes: number, ano: number): number {
  return new Date(ano, mes, 0).getDate();
}

function chaveAlunoAba(aba: string, alunoNome: string): string {
  return `${normalizeText(aba)}|${normalizeText(alunoNome)}`;
}

function planilhaIdFromFluxoUuid(fluxoId: string): string {
  const t = fluxoId.trim();
  if (t.startsWith('fluxo::')) return t;
  return `fluxo::${t}`;
}

function toBancoItem(t: ConciliacaoTransacaoFixture | TransacaoBase | BancoItem): BancoItem {
  return {
    id: t.id,
    data: String(t.data).slice(0, 10),
    pessoa: t.pessoa ?? '',
    descricao: 'descricao' in t ? (t.descricao ?? null) : null,
    valor: Number(t.valor || 0),
  };
}

function pagamentoToPlanilhaItem(p: ConciliacaoPagamentoFixture, mes: number, ano: number): PlanilhaItem {
  const dataPg = (p.data_pagamento ?? '').slice(0, 10);
  const fallbackData = `${ano}-${pad2(mes)}-01`;
  return {
    id: planilhaIdFromFluxoUuid(String(p.id)),
    aba: String(p.aba ?? ''),
    modalidade: String(p.modalidade ?? p.aba ?? ''),
    aluno: String(p.aluno_nome ?? ''),
    linha: Number(p.linha_planilha ?? 0),
    data: dataPg || fallbackData,
    forma: p.forma != null ? String(p.forma) : '',
    valor: Number(p.valor || 0),
    mesCompetencia: Number(p.mes_competencia || mes),
    anoCompetencia: Number(p.ano_competencia || ano),
    responsaveis: p.responsaveis ? [String(p.responsaveis)] : [],
    pagadorPix: p.pagador_pix ? String(p.pagador_pix) : undefined,
  };
}

function emptyTotais(): ConciliacaoPagamentosTotais {
  return {
    em_dia: 0,
    atrasado: 0,
    pendente: 0,
    sem_vencimento: 0,
    bolsa: 0,
    total: 0,
  };
}

function resolverCreditoAluno(params: {
  pagamentosAluno: ConciliacaoPagamentoFixture[];
  entradasById: Map<string, BancoItem>;
  entradasLista: BancoItem[];
  vinculosByPlanilha: Map<string, { banco_id: string; id: string }>;
  usadosBanco: Set<string>;
  pilatesNomePagadorRows: PilatesNomePagadorRow[];
  mes: number;
  ano: number;
}): CreditoResolvido | null {
  const {
    pagamentosAluno,
    entradasById,
    entradasLista,
    vinculosByPlanilha,
    usadosBanco,
    pilatesNomePagadorRows,
    mes,
    ano,
  } = params;

  const creditos: CreditoResolvido[] = [];

  for (const pag of pagamentosAluno) {
    const planilhaId = planilhaIdFromFluxoUuid(String(pag.id));
    const vinculo = vinculosByPlanilha.get(planilhaId);
    if (!vinculo) continue;
    const banco = entradasById.get(vinculo.banco_id);
    if (!banco) continue;
    usadosBanco.add(banco.id);
    creditos.push({
      data: banco.data.slice(0, 10),
      valor: Number(banco.valor || 0),
      pessoa: banco.pessoa ?? '',
      transacao_id: banco.id,
      vinculo_id: vinculo.id,
      banco_status: 'vinculo',
    });
  }

  if (creditos.length === 0 && pagamentosAluno.length > 0) {
    for (const pag of pagamentosAluno) {
      const planilha = pagamentoToPlanilhaItem(pag, mes, ano);
      const match = matchUmPagamentoPlanilhaBanco(
        planilha,
        entradasLista,
        usadosBanco,
        pilatesNomePagadorRows,
      );
      if (match.status !== 'confirmado') continue;
      usadosBanco.add(match.banco.id);
      creditos.push({
        data: match.banco.data.slice(0, 10),
        valor: Number(match.banco.valor || 0),
        pessoa: match.banco.pessoa ?? '',
        transacao_id: match.banco.id,
        vinculo_id: null,
        banco_status: 'match',
      });
    }
  }

  if (creditos.length === 0) return null;
  creditos.sort((a, b) => a.data.localeCompare(b.data));
  return creditos[0];
}

/**
 * Montagem pura (fixtures) — usada pelos testes e por getConciliacaoPagamentosMes.
 */
export function montarItensConciliacaoPagamentos(input: {
  mes: number;
  ano: number;
  alunos: ConciliacaoAlunoFixture[];
  pagamentos: ConciliacaoPagamentoFixture[];
  entradas: Array<ConciliacaoTransacaoFixture | TransacaoBase | BancoItem>;
  vinculosByPlanilha: Map<string, { banco_id: string; id: string }>;
  pilatesNomePagadorRows?: PilatesNomePagadorRow[];
}): ConciliacaoPagamentosMesResult {
  const { mes, ano, alunos, pagamentos, vinculosByPlanilha } = input;
  const pilatesNomePagadorRows = input.pilatesNomePagadorRows ?? [];

  const entradasLista = input.entradas.map(toBancoItem);
  const entradasById = new Map(entradasLista.map((e) => [e.id, e]));

  const pagamentosPorAluno = new Map<string, ConciliacaoPagamentoFixture[]>();
  for (const p of pagamentos) {
    if (Number(p.mes_competencia) !== mes || Number(p.ano_competencia) !== ano) continue;
    const key = chaveAlunoAba(p.aba, p.aluno_nome);
    const arr = pagamentosPorAluno.get(key) ?? [];
    arr.push(p);
    pagamentosPorAluno.set(key, arr);
  }

  const usadosBanco = new Set<string>();
  const itens: ConciliacaoPagamentoItem[] = [];

  for (const a of alunos) {
    const planoBolsa = isPlanoBolsaConciliacao(a.plano);
    const diaVenc = parseDiaVencimentoCadastro(a.venc);
    const key = chaveAlunoAba(a.aba, a.aluno_nome);
    const pags = pagamentosPorAluno.get(key) ?? [];

    const credito = resolverCreditoAluno({
      pagamentosAluno: pags,
      entradasById,
      entradasLista,
      vinculosByPlanilha,
      usadosBanco,
      pilatesNomePagadorRows,
      mes,
      ano,
    });

    const status = classificarStatusConciliacao({
      diaVencimento: diaVenc,
      dataCreditoIso: credito?.data ?? null,
      mes,
      ano,
      planoBolsa,
    });

    itens.push({
      aluno_id: a.id,
      aluno_nome: a.aluno_nome,
      aba: a.aba,
      modalidade: a.modalidade || a.aba,
      dia_vencimento: diaVenc,
      status,
      data_credito: credito?.data ?? null,
      valor_credito: credito?.valor ?? null,
      pessoa_banco: credito?.pessoa ?? null,
      transacao_id: credito?.transacao_id ?? null,
      vinculo_id: credito?.vinculo_id ?? null,
      banco_status: credito?.banco_status ?? 'nenhum',
    });
  }

  itens.sort(
    (x, y) =>
      x.modalidade.localeCompare(y.modalidade, 'pt-BR') ||
      x.aluno_nome.localeCompare(y.aluno_nome, 'pt-BR'),
  );

  const totais = emptyTotais();
  for (const it of itens) {
    totais[it.status] += 1;
    totais.total += 1;
  }

  return { mes, ano, totais, itens };
}

/**
 * Secretaria: mesmos status, sem campos bancários no payload.
 * Admin: mantém campos de extrato.
 */
export function stripCamposBancariosConciliacao(
  result: ConciliacaoPagamentosMesResult,
  role: string | null | undefined,
): ConciliacaoPagamentosMesResult {
  if (role === 'admin') return result;
  return {
    ...result,
    itens: result.itens.map((item) => ({
      aluno_id: item.aluno_id,
      aluno_nome: item.aluno_nome,
      aba: item.aba,
      modalidade: item.modalidade,
      dia_vencimento: item.dia_vencimento,
      status: item.status,
    })),
  };
}

export async function getConciliacaoPagamentosMes(
  mes: number,
  ano: number,
): Promise<ConciliacaoPagamentosMesResult> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase não configurado.');
  }

  const { data: alunosRows, error: alunosErr } = await supabase
    .from('fluxo_alunos_operacionais')
    .select(
      'id, aba, modalidade, aluno_nome, venc, plano, valor_referencia, responsaveis, pagador_pix',
    )
    .eq('ativo', true)
    .limit(10000);
  if (alunosErr) throw new Error(alunosErr.message);

  const { data: pagRows, error: pagErr } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select(
      'id, aba, modalidade, aluno_nome, data_pagamento, forma, valor, mes_competencia, ano_competencia, responsaveis, pagador_pix, linha_planilha',
    )
    .eq('mes_competencia', mes)
    .eq('ano_competencia', ano)
    .limit(10000);
  if (pagErr) throw new Error(pagErr.message);

  const inicio = `${ano}-${pad2(mes)}-01`;
  const fim = `${ano}-${pad2(mes)}-${pad2(ultimoDiaMes(mes, ano))}`;
  const { data: txRows, error: txErr } = await supabase
    .from('transacoes')
    .select('id, data, pessoa, valor, descricao, tipo')
    .gte('data', inicio)
    .lte('data', fim)
    .order('id', { ascending: false })
    .limit(20000);
  if (txErr) throw new Error(txErr.message);

  const todas = (txRows ?? []) as TransacaoBase[];
  const { entradas } = filtrarTransacoesOficiais(todas);

  const vinculos = await listVinculosMes(mes, ano);
  const vinculosByPlanilha = new Map<string, { banco_id: string; id: string }>();
  for (const v of vinculos) {
    vinculosByPlanilha.set(v.planilha_id, { banco_id: v.banco_id, id: v.id });
  }

  const alunos: ConciliacaoAlunoFixture[] = ((alunosRows ?? []) as Record<string, unknown>[]).map(
    (r) => ({
      id: String(r.id),
      aba: String(r.aba ?? ''),
      modalidade: String(r.modalidade ?? r.aba ?? ''),
      aluno_nome: String(r.aluno_nome ?? ''),
      venc: r.venc != null ? String(r.venc) : null,
      plano: r.plano != null ? String(r.plano) : null,
      valor_referencia: r.valor_referencia != null ? Number(r.valor_referencia) : null,
      responsaveis: r.responsaveis != null ? String(r.responsaveis) : null,
      pagador_pix: r.pagador_pix != null ? String(r.pagador_pix) : null,
    }),
  );

  const pagamentos: ConciliacaoPagamentoFixture[] = ((pagRows ?? []) as Record<string, unknown>[]).map(
    (r) => ({
      id: String(r.id),
      aba: String(r.aba ?? ''),
      modalidade: String(r.modalidade ?? r.aba ?? ''),
      aluno_nome: String(r.aluno_nome ?? ''),
      data_pagamento: r.data_pagamento != null ? String(r.data_pagamento).slice(0, 10) : null,
      forma: r.forma != null ? String(r.forma) : null,
      valor: Number(r.valor || 0),
      mes_competencia: Number(r.mes_competencia || 0),
      ano_competencia: Number(r.ano_competencia || 0),
      responsaveis: r.responsaveis != null ? String(r.responsaveis) : null,
      pagador_pix: r.pagador_pix != null ? String(r.pagador_pix) : null,
      linha_planilha: r.linha_planilha != null ? Number(r.linha_planilha) : undefined,
    }),
  );

  return montarItensConciliacaoPagamentos({
    mes,
    ano,
    alunos,
    pagamentos,
    entradas,
    vinculosByPlanilha,
  });
}
