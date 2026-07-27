/**
 * Scoring de matches prováveis (Validação banco↔fluxo).
 * Espelha o prompt de auditoria 2026-07-27 — não auto-confirma vínculos.
 */
import { alunoNormKey } from './alunoPagadorMatch.js';
import {
  scoreNomePlanilhaBanco,
  datasJanelaCreditoRecorrenteParaPlanilha,
  type PlanilhaItem,
  type BancoItem,
} from './conciliacaoPagamentoMatch.js';
import { isNameCompatible, normalizeText } from './conciliacaoTexto.js';
import { isCreditoGenericoExtrato, valorPlanilhaBancoCompativel } from './creditoRecorrente.js';
import {
  formaFluxoCompativelComBanco,
  inferirMeioPagamentoFluxo,
  inferirMeioPagamentoVinculo,
} from './meioPagamentoVinculo.js';
import { businessRules } from '../businessRules.js';

/** Pesos do prompt (soma = 100). */
export const MATCHES_PROVAVEIS_PESOS = {
  nome: 35,
  valor: 25,
  data: 20,
  meio: 10,
  sticky: 10,
} as const;

export const MATCHES_PROVAVEIS_BUCKETS = {
  alto: 75,
  medio: 55,
  baixo: 40,
} as const;

/** Gap mínimo vs 2º candidato para manter bucket alto. */
export const MATCHES_PROVAVEIS_GAP_ALTO = 8;

export type MatchesProvaveisBucket = 'alto' | 'medio' | 'baixo';

export type MatchesProvaveisScoreBreakdown = {
  nome: number;
  valor: number;
  data: number;
  meio: number;
  sticky: number;
  total: number;
  razoes: string[];
};

export function deltaDiasIso(a: string, b: string): number {
  const ta = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const tb = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 999;
  return Math.round((tb - ta) / 86_400_000);
}

/**
 * Pontua um par fluxo×banco. Retorna null se data/valor/meio/nome falharem hard filters.
 */
export function scoreParMatchesProvaveis(
  planilha: PlanilhaItem,
  banco: BancoItem,
  stickyKeys: Set<string>,
  flexDays: number = businessRules.conciliacao.bancoJanelaDias,
): MatchesProvaveisScoreBreakdown | null {
  const W = MATCHES_PROVAVEIS_PESOS;
  const razoes: string[] = [];
  const fluxoData = planilha.data.slice(0, 10);
  const bancoData = String(banco.data).slice(0, 10);
  const generico = isCreditoGenericoExtrato(banco.pessoa, banco.descricao);
  const janelaVendas = generico ? datasJanelaCreditoRecorrenteParaPlanilha(planilha) : null;

  let dataOk = false;
  let dataPts = 0;
  if (generico && janelaVendas?.has(bancoData)) {
    dataOk = true;
    dataPts = W.data * 0.75;
    razoes.push('data_janela_vendas');
  } else {
    const d = Math.abs(deltaDiasIso(fluxoData, bancoData));
    if (d <= flexDays) {
      dataOk = true;
      if (d === 0) {
        dataPts = W.data;
        razoes.push('data_mesmo_dia');
      } else if (d === 1) {
        dataPts = W.data * 0.85;
        razoes.push('data_±1');
      } else {
        dataPts = W.data * Math.max(0.35, 1 - d / (flexDays + 1));
        razoes.push(`data_±${d}`);
      }
    }
  }
  if (!dataOk) return null;

  if (
    !valorPlanilhaBancoCompativel({
      valorPlanilha: Number(planilha.valor || 0),
      valorBanco: Number(banco.valor || 0),
      pessoa: banco.pessoa,
      descricao: banco.descricao,
    })
  ) {
    return null;
  }

  const vPl = Number(planilha.valor || 0);
  const vBk = Number(banco.valor || 0);
  const diffAbs = Math.abs(vPl - vBk);
  let valorPts = 0;
  if (diffAbs <= 0.01) {
    valorPts = W.valor;
    razoes.push('valor_exato');
  } else if (generico && vPl > 0) {
    const pct = diffAbs / vPl;
    if (pct <= 0.055) {
      valorPts = W.valor * (1 - pct / 0.055) * 0.95 + W.valor * 0.05;
      razoes.push(`valor_taxa_cartao_${(pct * 100).toFixed(1)}pct`);
    } else return null;
  } else if (diffAbs <= businessRules.conciliacao.valorTolerancia) {
    valorPts = W.valor * 0.9;
    razoes.push('valor_tol');
  } else return null;

  if (!formaFluxoCompativelComBanco(planilha.forma, banco)) return null;
  const meioF = inferirMeioPagamentoFluxo(planilha.forma);
  const meioB = inferirMeioPagamentoVinculo({ pessoa: banco.pessoa, descricao: banco.descricao });
  let meioPts = W.meio * 0.4;
  if (meioF !== 'desconhecido' && meioB !== 'desconhecido' && meioF === meioB) {
    meioPts = W.meio;
    razoes.push('meio_igual');
  } else if (
    (meioF === 'credito_a_vista' || meioF === 'credito_recorrente') &&
    (meioB === 'credito_a_vista' || meioB === 'credito_recorrente')
  ) {
    meioPts = W.meio * 0.9;
    razoes.push('meio_credito_familia');
  } else if (meioF === 'desconhecido' || meioB === 'desconhecido') {
    meioPts = W.meio * 0.55;
    razoes.push('meio_parcial');
  } else {
    meioPts = W.meio * 0.5;
    razoes.push('meio_compativel');
  }

  const nomeRaw = scoreNomePlanilhaBanco(planilha, banco); // 0..5
  let nomePts = (nomeRaw / 5) * W.nome;
  if (nomeRaw >= 4) razoes.push('nome_forte');
  else if (nomeRaw >= 3) razoes.push('nome_token');
  else if (nomeRaw > 0) razoes.push('nome_fraco');
  else if (generico) {
    nomePts = W.nome * 0.15;
    razoes.push('nome_generico_vendas');
  } else {
    nomePts = 0;
    razoes.push('sem_nome');
  }

  const alunoKey = alunoNormKey(planilha.aluno);
  const bancoNorm = normalizeText(banco.pessoa);
  const stickyHit =
    stickyKeys.has(`${alunoKey}::${bancoNorm}`) ||
    [...(planilha.responsaveis ?? []), planilha.pagadorPix]
      .filter(Boolean)
      .some((n) => isNameCompatible(String(n), banco.pessoa));

  let stickyPts = 0;
  if (stickyKeys.has(`${alunoKey}::${bancoNorm}`)) {
    stickyPts = W.sticky;
    razoes.push('sticky_aluno_pagador');
  } else if (stickyHit && nomeRaw > 0) {
    stickyPts = W.sticky * 0.5;
    razoes.push('sticky_via_responsavel');
  }

  if (nomeRaw === 0 && stickyPts === 0 && !generico) return null;

  const total = Math.round((nomePts + valorPts + dataPts + meioPts + stickyPts) * 10) / 10;
  return {
    nome: Math.round(nomePts * 10) / 10,
    valor: Math.round(valorPts * 10) / 10,
    data: Math.round(dataPts * 10) / 10,
    meio: Math.round(meioPts * 10) / 10,
    sticky: Math.round(stickyPts * 10) / 10,
    total,
    razoes,
  };
}

export function bucketMatchesProvaveis(
  score: number,
  ambiguo: boolean,
): MatchesProvaveisBucket | null {
  const B = MATCHES_PROVAVEIS_BUCKETS;
  if (score >= B.alto) return ambiguo ? 'medio' : 'alto';
  if (score >= B.medio) return 'medio';
  if (score >= B.baixo) return 'baixo';
  return null;
}

/** Rótulos curtos para Admin/secretária (não tags técnicas). */
export const RAZAO_LABEL_ADMIN: Record<string, string> = {
  data_mesmo_dia: 'Mesmo dia',
  'data_±1': 'Dia vizinho (±1)',
  data_janela_vendas: 'Janela de liquidação (cartão/Vendas)',
  valor_exato: 'Valor igual',
  valor_tol: 'Valor quase igual',
  meio_igual: 'Forma de pagamento bate',
  meio_parcial: 'Forma de pagamento compatível',
  meio_compativel: 'Forma de pagamento compatível',
  meio_credito_familia: 'Crédito / recorrente',
  nome_forte: 'Nome bate bem',
  nome_token: 'Parte do nome bate',
  nome_fraco: 'Nome parcial',
  nome_generico_vendas: 'Extrato genérico (Vendas)',
  sem_nome: 'Sem nome no extrato',
  sticky_aluno_pagador: 'Já reconhecido antes',
  sticky_via_responsavel: 'Pagador conhecido',
};

export function rotulosRazoesAdmin(razoes: string[]): string[] {
  return razoes.map((r) => {
    if (RAZAO_LABEL_ADMIN[r]) return RAZAO_LABEL_ADMIN[r];
    if (r.startsWith('data_±')) return `Diferença de ${r.slice(6)} dia(s)`;
    if (r.startsWith('valor_taxa_cartao_')) return 'Valor com taxa de cartão';
    return r;
  });
}

export function confiancaLabel(bucket: MatchesProvaveisBucket): string {
  if (bucket === 'alto') return 'Alta confiança';
  if (bucket === 'medio') return 'Média confiança';
  return 'Baixa confiança';
}
