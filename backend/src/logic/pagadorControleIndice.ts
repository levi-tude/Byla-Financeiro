/**
 * Cruza pagador/responsável/aluno da planilha de pagamentos (abas PILATES, TEATRO…)
 * com o extrato e com as linhas do CONTROLE DE CAIXA — mesma ideia da validação de pagamentos.
 */

import { businessRules } from '../businessRules.js';
import { lerPagamentosPorAbaEAno, type PagamentosAluno } from '../services/planilhaPagamentos.js';
import { isNameCompatible, normalizeText } from './conciliacaoTexto.js';

export type BlocoPagadorControle =
  | { kind: 'pilates_mari'; aba: string; nomes: string[] }
  | { kind: 'teatro_unificado'; aba: string; nomes: string[] };

function nomesParaMatch(a: PagamentosAluno): string[] {
  const set = new Set<string>();
  const push = (s: string | undefined | null) => {
    const t = String(s ?? '').trim();
    if (t.length >= 2) set.add(t);
  };
  push(a.aluno);
  for (const p of a.pagamentos) {
    for (const r of p.responsaveis ?? []) push(r);
    push(p.pagadorPix);
  }
  return [...set];
}

/** Mesma ordem que matchUmPagamentoPlanilhaBanco: planilha × banco (pessoa/descrição). */
export function matchPagadorABanco(nomes: string[], pessoa: string, descricao: string | null): boolean {
  const bancoNames = [pessoa, descricao ?? ''].filter(Boolean) as string[];
  if (bancoNames.length === 0) return false;
  for (const n of nomes) {
    for (const bn of bancoNames) {
      if (isNameCompatible(n, bn)) return true;
    }
  }
  return false;
}

type LinhaControle = { titulo: string; label: string; valor: number };

export function encontrarLinhaPilatesMariControle(planilhaLinhas: LinhaControle[]): LinhaControle | null {
  for (const pl of planilhaLinhas) {
    const t = normalizeText(pl.label);
    if (t.includes('PILATES') && (t.includes('MARI') || t.includes('MARINA'))) return pl;
  }
  return null;
}

/** Teatro + Teatro Infantil: primeira linha do CONTROLE cujo rótulo contém TEATRO. */
export function encontrarLinhaTeatroControleUnificada(planilhaLinhas: LinhaControle[]): LinhaControle | null {
  for (const pl of planilhaLinhas) {
    if (normalizeText(pl.label).includes('TEATRO')) return pl;
  }
  return null;
}

/**
 * Carrega abas PILATES e todas as TEATRO* (inclui TEATRO INFANTIL), unificando Teatro num único destino.
 */
export async function carregarIndicePagadoresControle(ano: number): Promise<{
  blocos: BlocoPagadorControle[];
  errors: string[];
}> {
  const errors: string[] = [];
  const blocos: BlocoPagadorControle[] = [];

  const pilatesAba = businessRules.planilha.eligibleSheets.find((s) => normalizeText(s).includes('PILATES'));
  if (pilatesAba) {
    const { alunos, error } = await lerPagamentosPorAbaEAno(pilatesAba, ano);
    if (error) errors.push(`${pilatesAba}: ${error}`);
    for (const a of alunos) {
      const nomes = nomesParaMatch(a);
      if (nomes.length === 0) continue;
      blocos.push({ kind: 'pilates_mari', aba: pilatesAba, nomes });
    }
  }

  const teatroAbas = businessRules.planilha.eligibleSheets.filter((s) => normalizeText(s).includes('TEATRO'));
  for (const aba of teatroAbas) {
    const { alunos, error } = await lerPagamentosPorAbaEAno(aba, ano);
    if (error) errors.push(`${aba}: ${error}`);
    for (const a of alunos) {
      const nomes = nomesParaMatch(a);
      if (nomes.length === 0) continue;
      blocos.push({ kind: 'teatro_unificado', aba, nomes });
    }
  }

  blocos.sort((a, b) => {
    if (a.kind === b.kind) return 0;
    if (a.kind === 'pilates_mari') return -1;
    return 1;
  });

  return { blocos, errors };
}
