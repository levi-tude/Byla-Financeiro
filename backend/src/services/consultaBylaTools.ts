/**
 * Tools só-leitura do Consulta Byla.
 * Números vêm exclusivamente destas consultas (mesmas fontes das telas Admin).
 */

import { getSupabase } from './supabaseClient.js';
import { filtrarTransacoesOficiais, metodoPagamentoFinal, normalizarTipoTransacao, type TransacaoBase } from './transacoesFiltro.js';
import { getConciliacaoPagamentosMes } from './conciliacaoPagamentosMes.js';
import { getFinancasAlunos } from './financasAlunosReadModel.js';
import { loadControleCaixaExisting } from './controleCaixaRead.js';
import { normalizeText } from '../logic/conciliacaoTexto.js';
import { buscarMovimentosPorPessoa } from './consultaMovimentosPessoa.js';
import type { ConsultaToolId } from '../ai/consultaCatalog.js';
import { todayIsoLocal } from '../ai/consultaCatalog.js';
import { getConciliacaoVencimentosMesData } from './conciliacaoVencimentosMes.js';
import { montarAlunosPanorama } from './relatorioMontagem.js';
import { limparDocumentoPessoa } from '../ai/pseudonimizacao.js';
import { instrucaoIa } from '../ai/instrucaoIa.js';
import { textoMaioresSaidas, textoSaidasProfessores } from './consultaSaidas.js';
import type { MapeamentoPessoa } from './consultaMovimentosPessoa.js';

export type ConsultaToolContext = {
  mes: number;
  ano: number;
};

export type ConsultaToolResult =
  | { ok: true; factsText: string; tool: ConsultaToolId }
  | { ok: false; error: string; tool: ConsultaToolId; needsClarification?: boolean };

const TOP_N = 12;

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function rangeMes(mes: number, ano: number): { inicio: string; fim: string } {
  const inicio = `${ano}-${pad2(mes)}-01`;
  const fim = `${ano}-${pad2(mes)}-${pad2(new Date(ano, mes, 0).getDate())}`;
  return { inicio, fim };
}

function semanaAround(dataRef: string): { inicio: string; fim: string } {
  const d = new Date(`${dataRef}T12:00:00`);
  const day = d.getDay(); // 0 dom
  const diffSeg = day === 0 ? -6 : 1 - day;
  const seg = new Date(d);
  seg.setDate(d.getDate() + diffSeg);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  const iso = (x: Date) =>
    `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
  return { inicio: iso(seg), fim: iso(dom) };
}

async function loadTransacoesRange(inicio: string, fim: string): Promise<TransacaoBase[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase
    .from('transacoes')
    .select('id, data, pessoa, valor, descricao, tipo')
    .gte('data', inicio)
    .lte('data', fim)
    .limit(8000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as TransacaoBase[];
  const oficiais = filtrarTransacoesOficiais(
    rows.map((r) => ({
      ...r,
      valor: Number(r.valor),
      data: String(r.data).slice(0, 10),
    })),
  );
  // Dígitos de documento colados ao nome não saem daqui (nem para o LLM nem para a resposta).
  return [...oficiais.entradas, ...oficiais.saidas].map((t) => ({ ...t, pessoa: limparDocumentoPessoa(t.pessoa) }));
}

/** Cobertura do extrato: último lançamento no período pedido e último lançamento importado (geral). */
export const MARCA_SEM_DADOS_EXTRATO = 'Sem dados do extrato';

export type CoberturaExtrato = { ultimaNoPeriodo: string | null; ultimaGeral: string | null };
export type CoberturaLoader = (inicio: string, fim: string) => Promise<CoberturaExtrato>;

/** Leitura (só SELECT) de max(data) em `transacoes` no período e no geral. */
export const loadCoberturaExtrato: CoberturaLoader = async (inicio, fim) => {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');
  const [noPeriodo, geral] = await Promise.all([
    supabase.from('transacoes').select('data').gte('data', inicio).lte('data', fim).order('data', { ascending: false }).limit(1),
    supabase.from('transacoes').select('data').order('data', { ascending: false }).limit(1),
  ]);
  if (noPeriodo.error) throw new Error(noPeriodo.error.message);
  if (geral.error) throw new Error(geral.error.message);
  const d = (r: { data: unknown[] | null }) => {
    const v = (r.data?.[0] as { data?: string } | undefined)?.data;
    return v ? String(v).slice(0, 10) : null;
  };
  return { ultimaNoPeriodo: d(noPeriodo), ultimaGeral: d(geral) };
};

export function dataBr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Linha obrigatória em toda resposta baseada no extrato: até que data há dados e se o período está incompleto.
 * Sem nenhum lançamento no período → "SEM DADOS" (nunca R$ 0,00).
 */
export function textoCoberturaExtrato(inicio: string, fim: string, cob: CoberturaExtrato): string {
  const periodo = inicio === fim ? dataBr(inicio) : `${dataBr(inicio)} a ${dataBr(fim)}`;
  if (!cob.ultimaNoPeriodo) {
    const ult = cob.ultimaGeral ? ` O último lançamento importado no extrato é de ${dataBr(cob.ultimaGeral)}.` : '';
    return `${MARCA_SEM_DADOS_EXTRATO} para esse período (${periodo}).${ult}`;
  }
  let s = `Dados do extrato até ${dataBr(cob.ultimaNoPeriodo)}.`;
  if (cob.ultimaGeral && cob.ultimaGeral < fim) {
    s += ` ATENÇÃO: período incompleto — o extrato só foi importado até ${dataBr(cob.ultimaGeral)}; lançamentos depois dessa data ainda não estão no sistema.`;
  }
  return s;
}


function totaisTipo(txs: TransacaoBase[]): { entradas: number; saidas: number; qtdE: number; qtdS: number } {
  let entradas = 0;
  let saidas = 0;
  let qtdE = 0;
  let qtdS = 0;
  for (const t of txs) {
    const v = Math.abs(Number(t.valor || 0));
    const tipo = String(t.tipo ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    if (tipo === 'saida') {
      saidas += v;
      qtdS += 1;
    } else {
      entradas += v;
      qtdE += 1;
    }
  }
  return { entradas, saidas, qtdE, qtdS };
}

function formatResumoPeriodo(titulo: string, inicio: string, fim: string, txs: TransacaoBase[]): string {
  const t = totaisTipo(txs);
  return [
    titulo,
    `Período: ${inicio} a ${fim}.`,
    `Entradas: ${brl(t.entradas)} (${t.qtdE} lançamentos).`,
    `Saídas: ${brl(t.saidas)} (${t.qtdS} lançamentos).`,
    `Saldo do período: ${brl(t.entradas - t.saidas)}.`,
  ].join('\n');
}

async function toolResumoMes(ctx: ConsultaToolContext): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase
    .from('v_resumo_mensal_oficial')
    .select('ano, mes, total_entradas, total_saidas, saldo_mes, qtd_entradas, qtd_saidas')
    .eq('mes', ctx.mes)
    .eq('ano', ctx.ano)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const { inicio, fim } = rangeMes(ctx.mes, ctx.ano);
    const txs = await loadTransacoesRange(inicio, fim);
    return formatResumoPeriodo(`Resumo do mês ${pad2(ctx.mes)}/${ctx.ano} (extrato oficial)`, inicio, fim, txs);
  }
  return [
    `Resumo do mês ${pad2(ctx.mes)}/${ctx.ano} (visão oficial).`,
    `Entradas: ${brl(Number(data.total_entradas))} (${data.qtd_entradas ?? '—'}).`,
    `Saídas: ${brl(Number(data.total_saidas))} (${data.qtd_saidas ?? '—'}).`,
    `Saldo: ${brl(Number(data.saldo_mes))}.`,
  ].join('\n');
}

async function toolResumoCategoria(ctx: ConsultaToolContext): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');
  const { inicio, fim } = rangeMes(ctx.mes, ctx.ano);
  const { data, error } = await supabase
    .from('v_transacoes_export')
    .select('id, data, pessoa, valor, descricao, tipo, categoria_sugerida')
    .gte('data', inicio)
    .lte('data', fim)
    .limit(8000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<TransacaoBase & { categoria_sugerida?: string | null }>;
  const oficiais = filtrarTransacoesOficiais(rows);
  const ids = new Set([...oficiais.entradas, ...oficiais.saidas].map((x) => x.id));
  const filtradas = rows.filter((r) => ids.has(r.id));
  const map = new Map<string, { total: number; qtd: number; entradas: number; saidas: number }>();
  for (const r of filtradas) {
    const cat = (r.categoria_sugerida ?? '').trim() || 'A classificar';
    const v = Math.abs(Number(r.valor || 0));
    const e = map.get(cat) ?? { total: 0, qtd: 0, entradas: 0, saidas: 0 };
    e.total += v;
    e.qtd += 1;
    const tipo = String(r.tipo ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    if (tipo === 'saida') e.saidas += v;
    else e.entradas += v;
    map.set(cat, e);
  }
  const linhas = [...map.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, TOP_N)
    .map(
      ([nome, v]) =>
        `${nome}: ${brl(v.total)} (${v.qtd}) — entr. ${brl(v.entradas)} / saí. ${brl(v.saidas)}`,
    );
  const extra = map.size > TOP_N ? `\n… e mais ${map.size - TOP_N} categorias.` : '';
  return [
    `Resumo por categoria do extrato — ${pad2(ctx.mes)}/${ctx.ano}.`,
    ...linhas,
  ].join('\n') + extra;
}

async function toolResumoMeio(ctx: ConsultaToolContext): Promise<string> {
  const { inicio, fim } = rangeMes(ctx.mes, ctx.ano);
  const txs = await loadTransacoesRange(inicio, fim);
  const map = new Map<string, { entradas: number; saidas: number; qtd: number }>();
  for (const t of txs) {
    const tipoN = normalizarTipoTransacao(t.tipo);
    const metodo = metodoPagamentoFinal(`${t.pessoa} ${t.descricao ?? ''}`, tipoN);
    const e = map.get(metodo) ?? { entradas: 0, saidas: 0, qtd: 0 };
    const v = Math.abs(Number(t.valor || 0));
    if (tipoN === 'saida') e.saidas += v;
    else e.entradas += v;
    e.qtd += 1;
    map.set(metodo, e);
  }
  const linhas = [...map.entries()]
    .sort((a, b) => b[1].entradas + b[1].saidas - (a[1].entradas + a[1].saidas))
    .map(([m, v]) => `${m}: entr. ${brl(v.entradas)} / saí. ${brl(v.saidas)} (${v.qtd})`);
  return [`Resumo por meio de pagamento — ${pad2(ctx.mes)}/${ctx.ano}.`, ...linhas].join('\n');
}

export type PagamentoFluxoRow = { aba: string | null; modalidade: string | null; valor: number | string | null };
export type PagamentosFluxoLoader = (inicio: string, fim: string) => Promise<PagamentoFluxoRow[]>;

const FONTE_MODALIDADE =
  'Fonte: Fluxo de caixa operacional (pagamentos lançados por aba/modalidade, por data de pagamento). O extrato do banco não tem modalidade preenchida.';

/** Leitura (só SELECT) dos pagamentos do Fluxo operacional em um intervalo de datas de pagamento. */
export const loadPagamentosFluxoRange: PagamentosFluxoLoader = async (inicio, fim) => {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select('aba, modalidade, valor')
    .gte('data_pagamento', inicio)
    .lte('data_pagamento', fim)
    .limit(10000);
  if (error) throw new Error(error.message);
  return (data ?? []) as PagamentoFluxoRow[];
};

function rotuloModalidade(r: PagamentoFluxoRow): string {
  return (r.aba ?? '').trim() || (r.modalidade ?? '').trim() || 'Sem aba';
}

/** Entradas por modalidade (aba do Fluxo) no mês. */
export async function toolModalidades(
  ctx: ConsultaToolContext,
  load: PagamentosFluxoLoader = loadPagamentosFluxoRange,
): Promise<string> {
  const { inicio, fim } = rangeMes(ctx.mes, ctx.ano);
  const rows = await load(inicio, fim);
  const head = `Entradas por modalidade — ${pad2(ctx.mes)}/${ctx.ano}. ${FONTE_MODALIDADE}`;
  if (rows.length === 0) {
    return `${head}\nNENHUM REGISTRO ENCONTRADO no mês.\n${instrucaoIa('Não informe valor zero: diga que não há registro.')}`;
  }
  const map = new Map<string, { total: number; qtd: number }>();
  for (const r of rows) {
    const k = rotuloModalidade(r);
    const e = map.get(k) ?? { total: 0, qtd: 0 };
    e.total += Number(r.valor ?? 0);
    e.qtd += 1;
    map.set(k, e);
  }
  const linhas = [...map.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([n, v]) => `${n}: ${brl(v.total)} (${v.qtd} pagamento(s))`);
  const total = [...map.values()].reduce((s, v) => s + v.total, 0);
  return [head, ...linhas, `TOTAL: ${brl(total)}.`].join('\n');
}

async function toolControleVs(ctx: ConsultaToolContext): Promise<string> {
  const of = await loadControleCaixaExisting(ctx.mes, ctx.ano, 'oficial');
  const sis = await loadControleCaixaExisting(ctx.mes, ctx.ano, 'sistema');
  const fmt = (label: string, r: Awaited<ReturnType<typeof loadControleCaixaExisting>>) => {
    if (!('data' in r)) return `${label}: indisponível (${r.error}).`;
    const t = r.data.totais;
    return [
      `${label}:`,
      `  Entradas ${brl(Number(t.entradaTotal ?? 0))}`,
      `  Saídas ${brl(Number(t.saidaTotal ?? 0))}`,
      `  Lucro ${brl(Number(t.lucroTotal ?? 0))}`,
    ].join('\n');
  };
  const ofTot = 'data' in of ? of.data.totais : null;
  const sisTot = 'data' in sis ? sis.data.totais : null;
  let delta = '';
  if (ofTot && sisTot) {
    const dEnt = Number(sisTot.entradaTotal ?? 0) - Number(ofTot.entradaTotal ?? 0);
    const dSai = Number(sisTot.saidaTotal ?? 0) - Number(ofTot.saidaTotal ?? 0);
    delta = `\nDiferença (sistema − oficial): entradas ${brl(dEnt)}; saídas ${brl(dSai)}.`;
  }
  return [
    `Controle de caixa — ${pad2(ctx.mes)}/${ctx.ano}.`,
    fmt('Oficial', of),
    fmt('Sistema', sis),
  ].join('\n') + delta;
}

async function toolPendentes(ctx: ConsultaToolContext): Promise<string> {
  const r = await getConciliacaoPagamentosMes(ctx.mes, ctx.ano);
  const pend = r.itens.filter((i) => i.status === 'pendente').slice(0, TOP_N);
  const linhas = pend.map(
    (i) => `${i.aluno_nome} (${i.aba}/${i.modalidade}) — venc. dia ${i.dia_vencimento ?? '—'}`,
  );
  const extra = r.totais.pendente > TOP_N ? `\n… e mais ${r.totais.pendente - TOP_N}.` : '';
  return [
    `Conciliação ${pad2(ctx.mes)}/${ctx.ano}: em dia ${r.totais.em_dia}, atrasado ${r.totais.atrasado}, pendente ${r.totais.pendente} (total ${r.totais.total}).`,
    linhas.length ? 'Pendentes:' : 'Nenhum pendente.',
    ...linhas,
  ].join('\n') + extra;
}

async function toolFluxoDia(data: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data: rows, error } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select('aluno_nome, aba, modalidade, valor, forma, data_pagamento')
    .eq('data_pagamento', data)
    .limit(500);
  if (error) throw new Error(error.message);
  const list = rows ?? [];
  const total = list.reduce((a, r) => a + Math.abs(Number(r.valor || 0)), 0);
  const top = list.slice(0, TOP_N).map(
    (r) =>
      `${r.aluno_nome} — ${brl(Number(r.valor || 0))} (${r.forma ?? '—'}; ${r.aba}/${r.modalidade})`,
  );
  const extra = list.length > TOP_N ? `\n… e mais ${list.length - TOP_N}.` : '';
  return [
    `Pagamentos do Fluxo em ${data}: ${list.length} lançamento(s), total ${brl(total)}.`,
    ...top,
  ].join('\n') + extra;
}

async function toolBancoDia(data: string): Promise<string> {
  const txs = await loadTransacoesRange(data, data);
  const t = totaisTipo(txs);
  const top = txs.slice(0, TOP_N).map((x) => {
    const tipo = String(x.tipo ?? '').toLowerCase().includes('said') ? 'saída' : 'entrada';
    return `${x.pessoa} — ${brl(Math.abs(Number(x.valor)))} (${tipo})`;
  });
  const extra = txs.length > TOP_N ? `\n… e mais ${txs.length - TOP_N}.` : '';
  return [
    `Movimentos do banco em ${data}: ${txs.length} lançamento(s).`,
    `Entradas ${brl(t.entradas)}; saídas ${brl(t.saidas)}.`,
    ...top,
  ].join('\n') + extra;
}

async function toolSemVinculo(ctx: ConsultaToolContext): Promise<string> {
  const { grupos } = await getFinancasAlunos(ctx.mes, ctx.ano, undefined, 'sem_vinculo');
  const flat = grupos.flatMap((g) =>
    g.pagamentos
      .filter((p) => p.banco_status === 'nenhum')
      .map((p) => ({
        aluno: g.aluno_exibicao,
        aba: g.aba,
        modalidade: g.modalidade,
        valor: p.valor,
        data: p.data_pagamento,
      })),
  );
  const top = flat.slice(0, TOP_N).map(
    (x) => `${x.aluno} — ${brl(x.valor)} (${x.data ?? '—'}; ${x.aba}/${x.modalidade})`,
  );
  const extra = flat.length > TOP_N ? `\n… e mais ${flat.length - TOP_N}.` : '';
  return [
    `Sem reconhecimento bancário em ${pad2(ctx.mes)}/${ctx.ano}: ${flat.length}.`,
    ...top,
  ].join('\n') + extra;
}

async function toolBuscaAluno(ctx: ConsultaToolContext, nome: string): Promise<string> {
  const { grupos } = await getFinancasAlunos(ctx.mes, ctx.ano);
  const key = normalizeText(nome);
  const matched = grupos.filter((g) => normalizeText(g.aluno_exibicao).includes(key));
  if (matched.length === 0) {
    return `Nenhum aluno encontrado com “${nome}” em ${pad2(ctx.mes)}/${ctx.ano}.`;
  }
  const linhas: string[] = [`Situação — competência ${pad2(ctx.mes)}/${ctx.ano}:`];
  for (const g of matched.slice(0, 5)) {
    linhas.push(`${g.aluno_exibicao} (${g.aba}/${g.modalidade}):`);
    for (const p of g.pagamentos.slice(0, 6)) {
      linhas.push(
        `  ${p.data_pagamento ?? '—'} ${brl(p.valor)} · ${p.meio} · conciliação ${p.status_conciliacao} · banco ${p.banco_status}`,
      );
    }
  }
  if (matched.length > 5) linhas.push(`… e mais ${matched.length - 5} grupo(s).`);
  return linhas.join('\n');
}

async function toolBuscaValor(
  ctx: ConsultaToolContext,
  valor: number,
  data?: string,
): Promise<string> {
  const { inicio, fim } = data ? { inicio: data, fim: data } : rangeMes(ctx.mes, ctx.ano);
  const txs = await loadTransacoesRange(inicio, fim);
  const tol = 0.05;
  const hits = txs.filter((t) => Math.abs(Math.abs(Number(t.valor)) - valor) <= tol);
  if (hits.length === 0) {
    return `Nenhum lançamento de ${brl(valor)} em ${inicio === fim ? inicio : `${inicio} a ${fim}`}.`;
  }
  const top = hits.slice(0, TOP_N).map((t) => {
    const tipo = String(t.tipo ?? '').toLowerCase().includes('said') ? 'saída' : 'entrada';
    return `${t.data} · ${t.pessoa} · ${brl(Math.abs(Number(t.valor)))} (${tipo})`;
  });
  const extra = hits.length > TOP_N ? `\n… e mais ${hits.length - TOP_N}.` : '';
  return [`Encontrei ${hits.length} lançamento(s) perto de ${brl(valor)}:`, ...top].join('\n') + extra;
}

async function toolAlunosPorModalidade(modalidadeFiltro?: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase
    .from('fluxo_alunos_operacionais')
    .select('id, aba, modalidade, aluno_nome, ativo')
    .limit(5000);
  if (error) throw new Error(error.message);
  return formatAlunosPorModalidade((data ?? []) as AlunoFluxoRow[], modalidadeFiltro);
}

export type AlunoFluxoRow = { aba: string | null; modalidade: string | null; aluno_nome: string | null; ativo: boolean | null };

/** Linha de cabeçalho importada da planilha (modalidade literal "(modalidade)") — não é aluno. */
export function isModalidadePlaceholder(modalidade: string | null | undefined): boolean {
  return (modalidade ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, '') === '(modalidade)';
}

export function formatAlunosPorModalidade(todas: AlunoFluxoRow[], modalidadeFiltro?: string): string {
  const rows = todas.filter((r) => !isModalidadePlaceholder(r.modalidade));
  const ignoradas = todas.length - rows.length;
  const alvo = modalidadeFiltro ? normalizeText(modalidadeFiltro) : '';
  const map = new Map<string, { ativos: number; inativos: number; nomes: string[] }>();
  for (const r of rows) {
    const mod = (r.modalidade ?? '').trim() || (r.aba ?? '').trim() || 'Sem modalidade';
    if (alvo && !normalizeText(mod).includes(alvo) && !normalizeText(r.aba ?? '').includes(alvo)) continue;
    const e = map.get(mod) ?? { ativos: 0, inativos: 0, nomes: [] };
    if (r.ativo === false) e.inativos += 1;
    else {
      e.ativos += 1;
      if (r.aluno_nome) e.nomes.push(r.aluno_nome);
    }
    map.set(mod, e);
  }
  if (map.size === 0) return alvo ? `Nenhuma modalidade encontrada para "${modalidadeFiltro}".` : 'Nenhum aluno cadastrado no Fluxo.';
  const linhas = [...map.entries()]
    .sort((a, b) => b[1].ativos - a[1].ativos)
    .map(([m, v]) => {
      const base = `${m}: ${v.ativos} ativo(s), ${v.inativos} inativo(s)`;
      if (!alvo) return base;
      const nomes = v.nomes.slice(0, 40).join(', ');
      return `${base}${nomes ? `. Ativos: ${nomes}${v.nomes.length > 40 ? '…' : ''}` : ''}`;
    });
  const totAtivos = [...map.values()].reduce((s, v) => s + v.ativos, 0);
  const totInativos = [...map.values()].reduce((s, v) => s + v.inativos, 0);
  return [
    'Alunos por modalidade (cadastro do Fluxo de caixa no sistema).',
    ...linhas,
    `TOTAL: ${totAtivos} ativo(s), ${totInativos} inativo(s).`,
    ignoradas ? `Obs.: ${ignoradas} linha(s) com modalidade "(modalidade)" (cabeçalho importado da planilha) foram excluídas da contagem.` : '',
  ].filter(Boolean).join('\n');
}

async function toolInadimplencia(ctx: ConsultaToolContext): Promise<string> {
  const raw = await getConciliacaoVencimentosMesData(ctx.mes, ctx.ano);
  if ('aviso' in raw) return `Inadimplência ${pad2(ctx.mes)}/${ctx.ano}: ${raw.aviso}`;
  const inad = raw.itens.filter(
    (i) => !i.pago_na_planilha && (i.situacao === 'em_aberto' || i.situacao === 'a_vencer' || i.situacao === 'sem_vencimento'),
  );
  const rotulo: Record<string, string> = { em_aberto: 'em aberto (vencido)', a_vencer: 'a vencer', sem_vencimento: 'sem vencimento' };
  const cont = { em_aberto: 0, a_vencer: 0, sem_vencimento: 0 } as Record<string, number>;
  for (const i of inad) cont[i.situacao] = (cont[i.situacao] ?? 0) + 1;
  const top = inad.slice(0, 25).map((i) => `${i.aluno} (${i.modalidade}) — ${rotulo[i.situacao] ?? i.situacao}`);
  return [
    `Sem pagamento na competência ${pad2(ctx.mes)}/${ctx.ano} (planilha do Fluxo, referência ${raw.hoje}): ${inad.length} aluno(s).`,
    `Em aberto (vencido): ${cont.em_aberto}; a vencer: ${cont.a_vencer}; sem vencimento: ${cont.sem_vencimento}.`,
    ...top,
    inad.length > 25 ? `… e mais ${inad.length - 25}.` : '',
  ].filter(Boolean).join('\n');
}

/** null = mês sem nenhum lançamento no extrato (não é zero). */
async function resumoMesNumeros(mes: number, ano: number): Promise<{ entradas: number; saidas: number } | null> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase
    .from('v_resumo_mensal_oficial')
    .select('total_entradas, total_saidas')
    .eq('mes', mes)
    .eq('ano', ano)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return { entradas: Number(data.total_entradas ?? 0), saidas: Number(data.total_saidas ?? 0) };
  const { inicio, fim } = rangeMes(mes, ano);
  const txs = await loadTransacoesRange(inicio, fim);
  if (txs.length === 0) return null;
  const t = totaisTipo(txs);
  return { entradas: t.entradas, saidas: t.saidas };
}

async function toolCompararMeses(a: { mes: number; ano: number }, b: { mes: number; ano: number }): Promise<string> {
  const [ra, rb] = await Promise.all([resumoMesNumeros(a.mes, a.ano), resumoMesNumeros(b.mes, b.ano)]);
  return formatCompararMeses(a, b, ra, rb);
}

export function formatCompararMeses(
  a: { mes: number; ano: number },
  b: { mes: number; ano: number },
  ra: { entradas: number; saidas: number } | null,
  rb: { entradas: number; saidas: number } | null,
): string {
  const pct = (x: number, y: number) => (x === 0 ? '—' : `${(((y - x) / x) * 100).toFixed(1)}%`);
  const la = `${pad2(a.mes)}/${a.ano}`;
  const lb = `${pad2(b.mes)}/${b.ano}`;
  if (!ra || !rb) {
    const sem = [!ra ? la : null, !rb ? lb : null].filter(Boolean).join(' e ');
    return [
      `Comparação ${la} × ${lb} (extrato oficial).`,
      `Sem dados no extrato para ${sem} — não é possível comparar.`,
      ra ? `${la}: entradas ${brl(ra.entradas)} · saídas ${brl(ra.saidas)}.` : '',
      rb ? `${lb}: entradas ${brl(rb.entradas)} · saídas ${brl(rb.saidas)}.` : '',
    ].filter(Boolean).join('\n');
  }
  return [
    `Comparação ${la} × ${lb} (extrato oficial).`,
    `Entradas: ${brl(ra.entradas)} × ${brl(rb.entradas)} (variação ${brl(rb.entradas - ra.entradas)}, ${pct(ra.entradas, rb.entradas)}).`,
    `Saídas: ${brl(ra.saidas)} × ${brl(rb.saidas)} (variação ${brl(rb.saidas - ra.saidas)}, ${pct(ra.saidas, rb.saidas)}).`,
    `Saldo: ${brl(ra.entradas - ra.saidas)} × ${brl(rb.entradas - rb.saidas)}.`,
  ].join('\n');
}

async function toolSaidasPlanilhaControle(ctx: ConsultaToolContext): Promise<string> {
  const r = await loadControleCaixaExisting(ctx.mes, ctx.ano, 'oficial');
  if (!('data' in r)) return `Controle de caixa (Planilha) ${pad2(ctx.mes)}/${ctx.ano}: indisponível (${r.error}).`;
  const d = r.data;
  if (!d.existe) return `Controle de caixa (Planilha) ${pad2(ctx.mes)}/${ctx.ano}: mês ainda não migrado.`;
  const blocos = d.blocos.filter((b) => b.tipo === 'saida');
  const linhas: string[] = [];
  for (const b of blocos) {
    const total = b.linhas.reduce((s, l) => s + Number(l.valor ?? 0), 0);
    linhas.push(`${b.titulo}: ${brl(total)}`);
    const tops = [...b.linhas]
      .filter((l) => Number(l.valor ?? 0) !== 0)
      .sort((x, y) => Number(y.valor ?? 0) - Number(x.valor ?? 0))
      .slice(0, 8)
      .map((l) => `  ${l.label}: ${brl(Number(l.valor ?? 0))}`);
    linhas.push(...tops);
  }
  return [
    `Saídas do Controle de caixa (Planilha) ${pad2(ctx.mes)}/${ctx.ano}.`,
    `Total de saídas: ${brl(Number(d.totais.saidaTotal ?? 0))} (parceiros ${brl(Number(d.totais.saidaParceirosTotal ?? 0))}, fixas ${brl(Number(d.totais.saidaFixasTotal ?? 0))}).`,
    ...linhas,
  ].join('\n');
}

async function toolResumoPlanilhaFluxo(ctx: ConsultaToolContext): Promise<string> {
  const p = (await montarAlunosPanorama(ctx.ano, ctx.mes)) as {
    aviso?: string;
    totais?: { total_alunos_ativos?: number; total_mensalidade_competencia?: number };
    por_aba?: Array<{ aba: string; total_alunos_ativos: number; total_mensalidade_competencia: number }>;
  };
  if (p.aviso) return `Planilha FLUXO DE CAIXA: ${p.aviso}`;
  const linhas = (p.por_aba ?? []).map(
    (a) => `${a.aba}: ${a.total_alunos_ativos} aluno(s), mensalidades ${brl(a.total_mensalidade_competencia)}`,
  );
  return [
    `Planilha FLUXO DE CAIXA — competência ${pad2(ctx.mes)}/${ctx.ano}.`,
    `Total: ${p.totais?.total_alunos_ativos ?? 0} aluno(s) nas abas; mensalidades na competência ${brl(Number(p.totais?.total_mensalidade_competencia ?? 0))}.`,
    ...linhas,
  ].join('\n');
}

/** Lista de meses terminando em (mes, ano), do mais antigo para o mais recente. */
export function mesesAte(mes: number, ano: number, n: number): Array<{ mes: number; ano: number }> {
  const out: Array<{ mes: number; ano: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ano, mes - 1 - i, 1);
    out.push({ mes: d.getMonth() + 1, ano: d.getFullYear() });
  }
  return out;
}

/** Meses entre dois YYYY-MM (inclusive), no máximo 12. */
function mesesEntre(a: { mes: number; ano: number }, b: { mes: number; ano: number }) {
  const n = (b.ano - a.ano) * 12 + (b.mes - a.mes) + 1;
  if (n < 1 || n > 12) return null;
  return mesesAte(b.mes, b.ano, n);
}

function periodoParams(params: Record<string, string>, ctx: ConsultaToolContext) {
  const ini = parseMesAnoParam(params.mes_inicio);
  const fim = parseMesAnoParam(params.mes_fim);
  if (ini && fim) return mesesEntre(ini, fim);
  if (ini) return mesesEntre(ini, ini);
  return [{ mes: ctx.mes, ano: ctx.ano }];
}

async function toolBalancoMeses(ctx: ConsultaToolContext, n: number): Promise<string> {
  const meses = mesesAte(ctx.mes, ctx.ano, n);
  const nums = await Promise.all(meses.map((m) => resumoMesNumeros(m.mes, m.ano)));
  return formatBalancoMeses(meses, nums);
}

export function formatBalancoMeses(
  meses: Array<{ mes: number; ano: number }>,
  nums: Array<{ entradas: number; saidas: number } | null>,
): string {
  const n = meses.length;
  let te = 0;
  let ts = 0;
  const linhas = meses.map((m, i) => {
    const r = nums[i];
    if (!r) return `${pad2(m.mes)}/${m.ano}: sem dados no extrato`;
    te += r.entradas;
    ts += r.saidas;
    return `${pad2(m.mes)}/${m.ano}: entradas ${brl(r.entradas)} · saídas ${brl(r.saidas)} · saldo ${brl(r.entradas - r.saidas)}`;
  });
  return [
    `Balanço mês a mês (${n} meses). Fonte: extrato bancário oficial.`,
    ...linhas,
    `TOTAL: entradas ${brl(te)} · saídas ${brl(ts)} · saldo ${brl(te - ts)}.`,
  ].join('\n');
}

/** Entradas de uma modalidade (aba ou modalidade contém o termo) mês a mês. */
export async function toolEntradasModalidadePeriodo(
  modalidade: string,
  meses: Array<{ mes: number; ano: number }>,
  load: PagamentosFluxoLoader = loadPagamentosFluxoRange,
): Promise<string> {
  const key = normalizeText(modalidade);
  const linhas: string[] = [];
  let total = 0;
  let qtdTotal = 0;
  for (const m of meses) {
    const { inicio, fim } = rangeMes(m.mes, m.ano);
    const rows = (await load(inicio, fim)).filter(
      (r) => normalizeText(r.aba ?? '').includes(key) || normalizeText(r.modalidade ?? '').includes(key),
    );
    const v = rows.reduce((s, r) => s + Number(r.valor ?? 0), 0);
    total += v;
    qtdTotal += rows.length;
    linhas.push(rows.length > 0 ? `${pad2(m.mes)}/${m.ano}: ${brl(v)} (${rows.length} pagamento(s))` : `${pad2(m.mes)}/${m.ano}: nenhum registro`);
  }
  const head = `Entradas da modalidade “${modalidade}”. ${FONTE_MODALIDADE}`;
  if (!key || qtdTotal === 0) {
    return `${head}\nNENHUM REGISTRO ENCONTRADO no período.\n${instrucaoIa('Não informe valor zero: diga que não há registro.')}`;
  }
  return [head, ...linhas, `TOTAL do período: ${brl(total)}.`].join('\n');
}

function parseMesAnoParam(raw: string | undefined): { mes: number; ano: number } | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{1,2})$/) ?? null;
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12 || ano < 2000 || ano > 2100) return null;
  return { mes, ano };
}

/**
 * Período do extrato que a tool consulta (para a linha "dados do extrato até …").
 * null = tool não usa o extrato. `exclusivo` = a resposta vem só do extrato (sem lançamento → "sem dados").
 */
export function periodoExtratoDaTool(
  tool: ConsultaToolId,
  params: Record<string, string>,
  ctx: ConsultaToolContext,
): { inicio: string; fim: string; exclusivo: boolean } | null {
  const mesCtx = { ...rangeMes(ctx.mes, ctx.ano), exclusivo: true };
  switch (tool) {
    case 'resumo_mes':
    case 'resumo_categoria_extrato':
    case 'resumo_meio_pagamento':
    case 'maiores_saidas':
    case 'saidas_professores':
      return mesCtx;
    case 'busca_por_valor':
      return params.data ? { inicio: params.data, fim: params.data, exclusivo: true } : mesCtx;
    case 'resumo_semana':
      return { ...semanaAround(params.data_ref ?? todayIsoLocal()), exclusivo: true };
    case 'resumo_dia':
    case 'movimentos_banco_dia': {
      const d = params.data ?? todayIsoLocal();
      return { inicio: d, fim: d, exclusivo: true };
    }
    case 'resumo_periodo':
      return params.inicio && params.fim ? { inicio: params.inicio, fim: params.fim, exclusivo: true } : null;
    case 'balanco_meses': {
      const n = Math.min(12, Math.max(1, Math.trunc(Number(params.meses ?? 1)) || 1));
      const ms = mesesAte(ctx.mes, ctx.ano, n);
      return { inicio: rangeMes(ms[0]!.mes, ms[0]!.ano).inicio, fim: rangeMes(ms.at(-1)!.mes, ms.at(-1)!.ano).fim, exclusivo: true };
    }
    case 'comparar_meses': {
      const a = parseMesAnoParam(params.mes_a);
      const b = parseMesAnoParam(params.mes_b);
      if (!a || !b) return null;
      const [x, y] = a.ano * 12 + a.mes <= b.ano * 12 + b.mes ? [a, b] : [b, a];
      // Não é exclusivo: um dos meses pode ter dados e o outro não (a tool diz qual).
      return { inicio: rangeMes(x.mes, x.ano).inicio, fim: rangeMes(y.mes, y.ano).fim, exclusivo: false };
    }
    case 'movimentos_por_pessoa': {
      const ms = periodoParams(params, ctx);
      if (!ms) return null;
      // Outras fontes (Controle, planilha) também respondem: só anexa a cobertura.
      return { inicio: rangeMes(ms[0]!.mes, ms[0]!.ano).inicio, fim: rangeMes(ms.at(-1)!.mes, ms.at(-1)!.ano).fim, exclusivo: false };
    }
    default:
      return null;
  }
}

async function loadSaidasMes(ctx: ConsultaToolContext) {
  const { inicio, fim } = rangeMes(ctx.mes, ctx.ano);
  const rows = await loadTransacoesRange(inicio, fim);
  return rows.filter((t) => normalizarTipoTransacao(t.tipo) === 'saida');
}

async function loadMapeamentoPessoas(): Promise<MapeamentoPessoa[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('mapeamento_pessoa_categoria')
    .select('pessoa_normalizada, categoria, subcategoria')
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as MapeamentoPessoa[];
}

async function toolMaioresSaidas(ctx: ConsultaToolContext): Promise<string> {
  return textoMaioresSaidas(await loadSaidasMes(ctx), ctx.mes, ctx.ano);
}

async function toolSaidasProfessores(ctx: ConsultaToolContext): Promise<string> {
  const [saidas, maps] = await Promise.all([loadSaidasMes(ctx), loadMapeamentoPessoas().catch(() => [])]);
  return textoSaidasProfessores(saidas, maps, ctx.mes, ctx.ano);
}

export type ExecuteToolDeps = { cobertura?: CoberturaLoader };

export async function executeConsultaTool(
  tool: ConsultaToolId,
  params: Record<string, string>,
  ctx: ConsultaToolContext,
  deps: ExecuteToolDeps = {},
): Promise<ConsultaToolResult> {
  try {
    if (params.precisa_dado === '1' && tool === 'busca_aluno' && !params.nome) {
      return {
        ok: false,
        tool,
        needsClarification: true,
        error: 'Qual o nome do aluno?',
      };
    }
    if (params.precisa_dado === '1' && tool === 'busca_por_valor' && !params.valor) {
      return {
        ok: false,
        tool,
        needsClarification: true,
        error: 'Qual o valor (ex.: R$ 250,00) e, se quiser, o dia?',
      };
    }
    if (params.precisa_dado === '1' && tool === 'resumo_periodo' && !(params.inicio && params.fim)) {
      return {
        ok: false,
        tool,
        needsClarification: true,
        error: 'Informe o período no formato 2026-07-01 a 2026-07-15.',
      };
    }

    const periodoExtrato = periodoExtratoDaTool(tool, params, ctx);
    let cobertura = '';
    if (periodoExtrato) {
      const cob = await (deps.cobertura ?? loadCoberturaExtrato)(periodoExtrato.inicio, periodoExtrato.fim);
      cobertura = textoCoberturaExtrato(periodoExtrato.inicio, periodoExtrato.fim, cob);
      // Período sem nenhum lançamento: não roda a tool (que somaria R$ 0,00).
      if (!cob.ultimaNoPeriodo && periodoExtrato.exclusivo) return { ok: true, tool, factsText: cobertura };
    }

    let factsText: string;
    switch (tool) {
      case 'resumo_mes':
        factsText = await toolResumoMes(ctx);
        break;
      case 'resumo_semana': {
        const ref = params.data_ref ?? todayIsoLocal();
        const { inicio, fim } = semanaAround(ref);
        factsText = formatResumoPeriodo('Resumo da semana (seg–dom)', inicio, fim, await loadTransacoesRange(inicio, fim));
        break;
      }
      case 'resumo_dia': {
        const data = params.data ?? todayIsoLocal();
        factsText = formatResumoPeriodo(`Resumo do dia ${data}`, data, data, await loadTransacoesRange(data, data));
        break;
      }
      case 'resumo_periodo': {
        const inicio = params.inicio!;
        const fim = params.fim!;
        factsText = formatResumoPeriodo('Resumo por período', inicio, fim, await loadTransacoesRange(inicio, fim));
        break;
      }
      case 'resumo_modalidades':
        factsText = await toolModalidades(ctx);
        break;
      case 'controle_oficial_vs_sistema':
        factsText = await toolControleVs(ctx);
        break;
      case 'resumo_categoria_extrato':
        factsText = await toolResumoCategoria(ctx);
        break;
      case 'resumo_meio_pagamento':
        factsText = await toolResumoMeio(ctx);
        break;
      case 'pendentes_conciliacao':
        factsText = await toolPendentes(ctx);
        break;
      case 'pagamentos_fluxo_dia':
        factsText = await toolFluxoDia(params.data ?? todayIsoLocal());
        break;
      case 'movimentos_banco_dia':
        factsText = await toolBancoDia(params.data ?? todayIsoLocal());
        break;
      case 'sem_vinculo_validacao':
        factsText = await toolSemVinculo(ctx);
        break;
      case 'busca_aluno':
        factsText = await toolBuscaAluno(ctx, params.nome!);
        break;
      case 'busca_por_valor':
        factsText = await toolBuscaValor(ctx, Number(params.valor), params.data);
        break;
      case 'alunos_por_modalidade':
        factsText = await toolAlunosPorModalidade(params.modalidade);
        break;
      case 'inadimplencia_mes':
        factsText = await toolInadimplencia(ctx);
        break;
      case 'comparar_meses': {
        const a = parseMesAnoParam(params.mes_a);
        const b = parseMesAnoParam(params.mes_b);
        if (!a || !b) {
          return { ok: false, tool, needsClarification: true, error: 'Quais dois meses comparar? (ex.: 2026-08 e 2026-09)' };
        }
        factsText = await toolCompararMeses(a, b);
        break;
      }
      case 'balanco_meses': {
        const n = Math.min(12, Math.max(1, Math.trunc(Number(params.meses ?? 1)) || 1));
        factsText = await toolBalancoMeses(ctx, n);
        break;
      }
      case 'entradas_modalidade_periodo':
      case 'movimentos_por_pessoa': {
        const meses = periodoParams(params, ctx);
        if (!meses) {
          return { ok: false, tool, needsClarification: true, error: 'Período inválido: use mes_inicio e mes_fim (YYYY-MM), até 12 meses.' };
        }
        const alvo = tool === 'entradas_modalidade_periodo' ? params.modalidade : params.nome;
        if (!alvo) return { ok: false, tool, needsClarification: true, error: 'Qual modalidade ou pessoa?' };
        factsText =
          tool === 'entradas_modalidade_periodo'
            ? await toolEntradasModalidadePeriodo(alvo, meses)
            : await buscarMovimentosPorPessoa(alvo, meses);
        break;
      }
      case 'saidas_planilha_controle':
        factsText = await toolSaidasPlanilhaControle(ctx);
        break;
      case 'resumo_planilha_fluxo':
        factsText = await toolResumoPlanilhaFluxo(ctx);
        break;
      case 'maiores_saidas':
        factsText = await toolMaioresSaidas(ctx);
        break;
      case 'saidas_professores':
        factsText = await toolSaidasProfessores(ctx);
        break;
      default: {
        const _exhaustive: never = tool;
        return { ok: false, tool: _exhaustive, error: 'Consulta não implementada.' };
      }
    }
    if (cobertura) factsText = `${factsText}\n${cobertura}`;
    return { ok: true, tool, factsText };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao consultar dados.';
    return { ok: false, tool, error: msg };
  }
}
