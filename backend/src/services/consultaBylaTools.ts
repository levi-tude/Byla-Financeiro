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
import type { ConsultaToolId } from '../ai/consultaCatalog.js';
import { todayIsoLocal } from '../ai/consultaCatalog.js';

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
  return [...oficiais.entradas, ...oficiais.saidas];
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

async function toolModalidades(ctx: ConsultaToolContext): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');
  const { inicio, fim } = rangeMes(ctx.mes, ctx.ano);
  const { data, error } = await supabase
    .from('v_transacoes_export')
    .select('id, data, pessoa, valor, descricao, tipo, modalidade')
    .gte('data', inicio)
    .lte('data', fim)
    .limit(8000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<TransacaoBase & { modalidade?: string | null }>;
  const oficiais = filtrarTransacoesOficiais(rows);
  const ids = new Set(oficiais.entradas.map((x) => x.id));
  const map = new Map<string, { total: number; qtd: number }>();
  for (const r of rows.filter((x) => ids.has(x.id))) {
    const mod = (r.modalidade ?? '').trim() || 'Sem modalidade';
    const e = map.get(mod) ?? { total: 0, qtd: 0 };
    e.total += Math.abs(Number(r.valor || 0));
    e.qtd += 1;
    map.set(mod, e);
  }
  const linhas = [...map.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([n, v]) => `${n}: ${brl(v.total)} (${v.qtd})`);
  return [`Entradas por modalidade — ${pad2(ctx.mes)}/${ctx.ano}.`, ...linhas].join('\n');
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

export async function executeConsultaTool(
  tool: ConsultaToolId,
  params: Record<string, string>,
  ctx: ConsultaToolContext,
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
      default: {
        const _exhaustive: never = tool;
        return { ok: false, tool: _exhaustive, error: 'Consulta não implementada.' };
      }
    }
    return { ok: true, tool, factsText };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao consultar dados.';
    return { ok: false, tool, error: msg };
  }
}
