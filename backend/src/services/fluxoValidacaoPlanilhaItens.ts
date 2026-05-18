import { getSupabase } from './supabaseClient.js';
import { config } from '../config.js';
import { listSheetNames } from './sheetsService.js';
import { lerPagamentosPorAbaEAno } from './planilhaPagamentos.js';
import { isEligibleSheet, businessRules } from '../businessRules.js';
import { normalizeText, sameDayISO } from '../logic/conciliacaoTexto.js';
import type { PlanilhaItem } from '../logic/conciliacaoPagamentoMatch.js';
import { isFluxoPrimaryForValidacao } from './fluxoPrimarySource.js';

export type CarregarItensValidacaoResult = {
  itens: PlanilhaItem[];
  fonte: 'fluxo_operacional' | 'planilha_google';
  erro?: string;
};

async function carregarItensDoFluxo(params: {
  dataStr: string;
  abaReq: string;
  modalidadeReq: string;
}): Promise<CarregarItensValidacaoResult> {
  const { dataStr, abaReq, modalidadeReq } = params;
  const supabase = getSupabase();
  if (!supabase) {
    return { itens: [], fonte: 'fluxo_operacional', erro: 'Supabase não configurado.' };
  }

  let query = supabase
    .from('fluxo_pagamentos_operacionais')
    .select(
      'id, aba, modalidade, linha_planilha, aluno_nome, data_pagamento, forma, valor, mes_competencia, ano_competencia, responsaveis, pagador_pix'
    )
    .eq('data_pagamento', dataStr);

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

  const itens: PlanilhaItem[] = [];
  for (const p of data ?? []) {
    const mod = String(p.modalidade ?? p.aba ?? '').trim();
    if (modalidadeReq && normalizeText(mod) !== normalizeText(modalidadeReq)) continue;
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

  return { itens, fonte: 'fluxo_operacional' };
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

export async function carregarItensPlanilhaParaValidacao(params: {
  dataStr: string;
  abaReq: string;
  modalidadeReq: string;
}): Promise<CarregarItensValidacaoResult> {
  const ano = Number(params.dataStr.slice(0, 4));
  if (isFluxoPrimaryForValidacao()) {
    const fluxo = await carregarItensDoFluxo(params);
    if (fluxo.itens.length > 0 || !fluxo.erro) return fluxo;
    if (!config.sheets.spreadsheetId) return fluxo;
    const fallback = await carregarItensDaPlanilhaGoogle({ ...params, ano });
    if (fallback.itens.length > 0) return fallback;
    return fluxo;
  }
  return carregarItensDaPlanilhaGoogle({ ...params, ano });
}
