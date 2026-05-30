import { getSupabase } from './supabaseClient.js';
import { config } from '../config.js';
import { listSheetNames } from './sheetsService.js';
import { lerPagamentosPorAbaEAno } from './planilhaPagamentos.js';
import { isEligibleSheet, businessRules } from '../businessRules.js';
import { normalizeText, sameDayISO } from '../logic/conciliacaoTexto.js';
import type { PlanilhaItem } from '../logic/conciliacaoPagamentoMatch.js';
import { isFluxoPrimaryForValidacao, isPlanilhaFallbackForValidacao } from './fluxoPrimarySource.js';

export type CarregarItensValidacaoResult = {
  itens: PlanilhaItem[];
  fonte: 'fluxo_operacional' | 'planilha_google';
  erro?: string;
};

export type ValidacaoFluxoIndiceDia = {
  data: string;
  quantidade: number;
  total: number;
  mesCompetencia: number;
  anoCompetencia: number;
};

export type ValidacaoFluxoIndiceAno = {
  ano: number;
  fonte: 'fluxo_operacional' | 'planilha_google';
  erro?: string;
  abas: string[];
  modalidadesPorAba: Record<string, string[]>;
  datas: ValidacaoFluxoIndiceDia[];
};

function mapRowsToPlanilhaItens(rows: Record<string, unknown>[]): PlanilhaItem[] {
  const itens: PlanilhaItem[] = [];
  for (const p of rows) {
    const mod = String(p.modalidade ?? p.aba ?? '').trim();
    const valor = Number(p.valor || 0);
    const dataPg = String(p.data_pagamento ?? '').slice(0, 10);
    if (!dataPg) continue;
    itens.push({
      id: `fluxo::${p.id}`,
      aba: String(p.aba ?? ''),
      modalidade: mod,
      aluno: String(p.aluno_nome ?? ''),
      linha: Number(p.linha_planilha ?? 0),
      data: dataPg,
      forma: p.forma != null ? String(p.forma) : '',
      valor,
      mesCompetencia: Number(p.mes_competencia ?? 0),
      anoCompetencia: Number(p.ano_competencia ?? 0),
      responsaveis: p.responsaveis ? [String(p.responsaveis)] : [],
      pagadorPix: p.pagador_pix ? String(p.pagador_pix) : undefined,
    });
  }
  return itens;
}

/** Mesmos filtros de aba/modalidade da validação diária, em qualquer intervalo de datas. */
async function listarItensFluxoNoIntervalo(params: {
  inicio: string;
  fim: string;
  abaReq: string;
  modalidadeReq: string;
}): Promise<CarregarItensValidacaoResult> {
  const { inicio, fim, abaReq, modalidadeReq } = params;
  const supabase = getSupabase();
  if (!supabase) {
    return { itens: [], fonte: 'fluxo_operacional', erro: 'Supabase não configurado.' };
  }

  let query = supabase
    .from('fluxo_pagamentos_operacionais')
    .select(
      'id, aba, modalidade, linha_planilha, aluno_nome, data_pagamento, forma, valor, mes_competencia, ano_competencia, responsaveis, pagador_pix'
    )
    .gte('data_pagamento', inicio)
    .lte('data_pagamento', fim);

  const abaNorm = normalizeText(abaReq);
  if (abaNorm !== 'TODAS') {
    const { data: abasRows } = await supabase.from('fluxo_pagamentos_operacionais').select('aba').limit(5000);
    const abas = Array.from(new Set((abasRows ?? []).map((r) => String(r.aba ?? '').trim()).filter(Boolean)));
    const match = abas.filter(
      (a) => normalizeText(a) === abaNorm || normalizeText(a).includes(abaNorm) || abaNorm.includes(normalizeText(a))
    );
    if (match.length === 1) query = query.eq('aba', match[0]);
    else if (match.length > 1) query = query.in('aba', match);
    else query = query.ilike('aba', `%${abaReq.trim()}%`);
  }

  const { data, error } = await query;
  if (error) return { itens: [], fonte: 'fluxo_operacional', erro: error.message };

  const modalidadeNorm = modalidadeReq ? normalizeText(modalidadeReq) : '';
  const itens = mapRowsToPlanilhaItens((data ?? []) as Record<string, unknown>[]).filter(
    (p) => !modalidadeNorm || normalizeText(p.modalidade) === modalidadeNorm,
  );

  return { itens, fonte: 'fluxo_operacional' };
}

function montarIndiceAnoDeItens(
  itens: PlanilhaItem[],
  ano: number,
  fonte: 'fluxo_operacional' | 'planilha_google',
  erro?: string,
): ValidacaoFluxoIndiceAno {
  const prefixAno = `${ano}-`;
  const abasSet = new Set<string>();
  const modsByAba = new Map<string, Set<string>>();
  const dateMap = new Map<
    string,
    {
      quantidade: number;
      total: number;
      porCompetencia: Map<string, { quantidade: number; total: number; mesCompetencia: number; anoCompetencia: number }>;
    }
  >();

  for (const p of itens) {
    const iso = p.data.slice(0, 10);
    if (!iso.startsWith(prefixAno)) continue;
    if (p.aba.trim()) abasSet.add(p.aba.trim());
    const mods = modsByAba.get(p.aba) ?? new Set<string>();
    if (p.modalidade.trim()) mods.add(p.modalidade.trim());
    modsByAba.set(p.aba, mods);

    const fallbackAno = Number(iso.slice(0, 4));
    const fallbackMes = Number(iso.slice(5, 7));
    const mesCompetencia = p.mesCompetencia || fallbackMes;
    const anoCompetencia = p.anoCompetencia || fallbackAno;

    const cur = dateMap.get(iso) ?? { quantidade: 0, total: 0, porCompetencia: new Map() };
    cur.quantidade += 1;
    cur.total += Number(p.valor || 0);
    const chaveComp = `${anoCompetencia}-${String(mesCompetencia).padStart(2, '0')}`;
    const compCur = cur.porCompetencia.get(chaveComp) ?? {
      quantidade: 0,
      total: 0,
      mesCompetencia,
      anoCompetencia,
    };
    compCur.quantidade += 1;
    compCur.total += Number(p.valor || 0);
    cur.porCompetencia.set(chaveComp, compCur);
    dateMap.set(iso, cur);
  }

  const datas: ValidacaoFluxoIndiceDia[] = Array.from(dateMap.entries()).map(([iso, v]) => {
    let best: { quantidade: number; total: number; mesCompetencia: number; anoCompetencia: number } | null = null;
    for (const comp of v.porCompetencia.values()) {
      if (!best) best = comp;
      else if (comp.total > best.total) best = comp;
      else if (comp.total === best.total && comp.quantidade > best.quantidade) best = comp;
    }
    const fallbackMes = Number(iso.slice(5, 7));
    const fallbackAno = Number(iso.slice(0, 4));
    return {
      data: iso,
      quantidade: v.quantidade,
      total: v.total,
      mesCompetencia: best?.mesCompetencia ?? fallbackMes,
      anoCompetencia: best?.anoCompetencia ?? fallbackAno,
    };
  });
  datas.sort((a, b) => b.quantidade - a.quantidade || b.total - a.total || b.data.localeCompare(a.data));

  const modalidadesPorAba: Record<string, string[]> = {};
  for (const [aba, mods] of modsByAba.entries()) {
    modalidadesPorAba[aba] = Array.from(mods).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  return {
    ano,
    fonte,
    erro,
    abas: Array.from(abasSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    modalidadesPorAba,
    datas,
  };
}

/** Índice do ano (datas + abas) — mesma leitura do fluxo que a validação diária. */
export async function carregarIndiceValidacaoFluxoAno(
  ano: number,
  abaReq: string,
  modalidadeReq: string,
): Promise<ValidacaoFluxoIndiceAno> {
  const inicio = `${ano}-01-01`;
  const fim = `${ano}-12-31`;

  let carregado: CarregarItensValidacaoResult;
  if (!isFluxoPrimaryForValidacao()) {
    if (!isPlanilhaFallbackForValidacao()) {
      return montarIndiceAnoDeItens([], ano, 'fluxo_operacional', 'Fonte oficial é o fluxo operacional (Supabase).');
    }
    const todos: PlanilhaItem[] = [];
    for (let m = 1; m <= 12; m++) {
      const chunk = await carregarItensDaPlanilhaGoogleMes(m, ano);
      if (chunk.erro && todos.length === 0) {
        return montarIndiceAnoDeItens([], ano, chunk.fonte, chunk.erro);
      }
      todos.push(...chunk.itens);
    }
    carregado = { itens: todos, fonte: 'planilha_google' };
  } else {
    const fluxo = await listarItensFluxoNoIntervalo({ inicio, fim, abaReq, modalidadeReq });
    if (fluxo.itens.length > 0 || !isPlanilhaFallbackForValidacao()) {
      carregado = fluxo;
    } else if (!config.sheets.spreadsheetId) {
      carregado = fluxo;
    } else {
      const todos: PlanilhaItem[] = [];
      for (let m = 1; m <= 12; m++) {
        const chunk = await carregarItensDaPlanilhaGoogleMes(m, ano);
        todos.push(...chunk.itens);
      }
      carregado =
        todos.length > 0 ? { itens: todos, fonte: 'planilha_google' } : fluxo.erro ? fluxo : { itens: [], fonte: 'planilha_google' };
    }
  }

  return montarIndiceAnoDeItens(carregado.itens, ano, carregado.fonte, carregado.erro);
}

async function carregarItensDoFluxo(params: {
  dataStr: string;
  abaReq: string;
  modalidadeReq: string;
}): Promise<CarregarItensValidacaoResult> {
  return listarItensFluxoNoIntervalo({
    inicio: params.dataStr,
    fim: params.dataStr,
    abaReq: params.abaReq,
    modalidadeReq: params.modalidadeReq,
  });
}

async function carregarItensDaPlanilhaGoogle(params: {
  dataStr: string;
  ano: number;
  abaReq: string;
  modalidadeReq: string;
}): Promise<CarregarItensValidacaoResult> {
  const { dataStr, ano, abaReq, modalidadeReq } = params;
  const idPlanilha = config.sheets.spreadsheetId;
  if (!idPlanilha) {
    return { itens: [], fonte: 'planilha_google', erro: 'Planilha FLUXO BYLA não configurada.' };
  }

  const { names, error: abasError } = await listSheetNames(idPlanilha);
  if (abasError) return { itens: [], fonte: 'planilha_google', erro: abasError };

  const abasElegiveis = names.filter((n) => isEligibleSheet(n));
  const abasSelecionadas =
    normalizeText(abaReq) === 'TODAS'
      ? abasElegiveis
      : abasElegiveis.filter(
          (a) =>
            normalizeText(a) === normalizeText(abaReq) || normalizeText(a).includes(normalizeText(abaReq))
        );

  const itens: PlanilhaItem[] = [];
  for (const aba of abasSelecionadas) {
    const { alunos, error } = await lerPagamentosPorAbaEAno(aba, ano);
    if (error) continue;
    for (const a of alunos) {
      const mod = a.modalidade ?? aba;
      if (modalidadeReq && normalizeText(mod) !== normalizeText(modalidadeReq)) continue;
      for (const p of a.pagamentos ?? []) {
        if (!sameDayISO(p.data, dataStr)) continue;
        itens.push({
          id: `${aba}::${a.linha}::${a.aluno}::${p.data}::${p.valor}::${p.forma}`,
          aba,
          modalidade: mod,
          aluno: a.aluno,
          linha: a.linha,
          data: p.data,
          forma: p.forma,
          valor: Number(p.valor || 0),
          mesCompetencia: Number((p as { mesCompetencia?: number; mes?: number }).mesCompetencia ?? p.mes ?? 0),
          anoCompetencia: Number((p as { anoCompetencia?: number; ano?: number }).anoCompetencia ?? p.ano ?? 0),
          responsaveis: Array.isArray((p as { responsaveis?: string[] }).responsaveis)
            ? ((p as { responsaveis?: string[] }).responsaveis as string[])
            : [],
          pagadorPix: (p as { pagadorPix?: string }).pagadorPix
            ? String((p as { pagadorPix?: string }).pagadorPix)
            : undefined,
        });
      }
    }
  }

  return { itens, fonte: 'planilha_google' };
}

async function carregarItensDoFluxoMes(mes: number, ano: number): Promise<CarregarItensValidacaoResult> {
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  return listarItensFluxoNoIntervalo({ inicio, fim, abaReq: 'TODAS', modalidadeReq: '' });
}

async function carregarItensDaPlanilhaGoogleMes(mes: number, ano: number): Promise<CarregarItensValidacaoResult> {
  const idPlanilha = config.sheets.spreadsheetId;
  if (!idPlanilha) {
    return { itens: [], fonte: 'planilha_google', erro: 'Planilha FLUXO BYLA não configurada.' };
  }

  const { names, error: abasError } = await listSheetNames(idPlanilha);
  if (abasError) return { itens: [], fonte: 'planilha_google', erro: abasError };

  const abasElegiveis = names.filter((n) => isEligibleSheet(n));
  const prefixMes = `${ano}-${String(mes).padStart(2, '0')}`;
  const itens: PlanilhaItem[] = [];

  for (const aba of abasElegiveis) {
    const { alunos, error } = await lerPagamentosPorAbaEAno(aba, ano);
    if (error) continue;
    for (const a of alunos) {
      const mod = a.modalidade ?? aba;
      for (const p of a.pagamentos ?? []) {
        const pd = (p.data ?? '').slice(0, 10);
        if (!pd.startsWith(prefixMes)) continue;
        itens.push({
          id: `${aba}::${a.linha}::${a.aluno}::${p.data}::${p.valor}::${p.forma}`,
          aba,
          modalidade: mod,
          aluno: a.aluno,
          linha: a.linha,
          data: p.data,
          forma: p.forma,
          valor: Number(p.valor || 0),
          mesCompetencia: Number((p as { mesCompetencia?: number; mes?: number }).mesCompetencia ?? p.mes ?? 0),
          anoCompetencia: Number((p as { anoCompetencia?: number; ano?: number }).anoCompetencia ?? p.ano ?? 0),
          responsaveis: Array.isArray((p as { responsaveis?: string[] }).responsaveis)
            ? ((p as { responsaveis?: string[] }).responsaveis as string[])
            : [],
          pagadorPix: (p as { pagadorPix?: string }).pagadorPix
            ? String((p as { pagadorPix?: string }).pagadorPix)
            : undefined,
        });
      }
    }
  }

  return { itens, fonte: 'planilha_google' };
}

/** Pagamentos do mês (todas as abas) — mesma prioridade fluxo × planilha da validação diária. */
export async function carregarItensMesParaValidacao(mes: number, ano: number): Promise<CarregarItensValidacaoResult> {
  if (!isFluxoPrimaryForValidacao()) {
    if (!isPlanilhaFallbackForValidacao()) {
      return { itens: [], fonte: 'fluxo_operacional', erro: 'Fonte oficial é o fluxo operacional (Supabase).' };
    }
    return carregarItensDaPlanilhaGoogleMes(mes, ano);
  }
  const fluxo = await carregarItensDoFluxoMes(mes, ano);
  if (fluxo.itens.length > 0 || !isPlanilhaFallbackForValidacao()) return fluxo;
  if (!config.sheets.spreadsheetId) return fluxo;
  const fallback = await carregarItensDaPlanilhaGoogleMes(mes, ano);
  if (fallback.itens.length > 0) return fallback;
  return fluxo.erro ? fluxo : fallback;
}

export async function carregarItensPlanilhaParaValidacao(params: {
  dataStr: string;
  abaReq: string;
  modalidadeReq: string;
}): Promise<CarregarItensValidacaoResult> {
  const ano = Number(params.dataStr.slice(0, 4));
  if (!isFluxoPrimaryForValidacao()) {
    if (!isPlanilhaFallbackForValidacao()) {
      return { itens: [], fonte: 'fluxo_operacional', erro: 'Fonte oficial é o fluxo operacional (Supabase).' };
    }
    return carregarItensDaPlanilhaGoogle({ ...params, ano });
  }
  const fluxo = await carregarItensDoFluxo(params);
  if (fluxo.itens.length > 0 || !isPlanilhaFallbackForValidacao()) return fluxo;
  if (!config.sheets.spreadsheetId) return fluxo;
  const fallback = await carregarItensDaPlanilhaGoogle({ ...params, ano });
  if (fallback.itens.length > 0) return fallback;
  return fluxo.erro ? fluxo : fallback;
}
