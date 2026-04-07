import { businessRules } from '../businessRules.js';
import { isNameCompatible, normalizeText } from './conciliacaoTexto.js';

export type PlanilhaItem = {
  id: string;
  aba: string;
  modalidade: string;
  aluno: string;
  linha: number;
  data: string;
  forma: string;
  valor: number;
  mesCompetencia: number;
  anoCompetencia: number;
  responsaveis: string[];
  pagadorPix?: string;
};

export type BancoItem = {
  id: string;
  data: string;
  pessoa: string;
  descricao: string | null;
  valor: number;
};

export type PilatesNomePagadorRow = {
  aluno_nome: string | null;
  nome_pagador: string | null;
  valor: number | null;
  forma_pagamento: string | null;
  atividade_nome: string | null;
};

export type MatchUmResult =
  | { status: 'confirmado'; banco: BancoItem }
  | { status: 'possivel'; candidatos: BancoItem[] }
  | { status: 'nao' };

export type MatchAgrupadoResult =
  | { status: 'possivel'; candidatos: BancoItem[] }
  | { status: 'nao' };

/**
 * Mesma regra da rota validacao-pagamentos-diaria: valor ± tolerância + nome (e Pilates/pagador quando aplicável).
 */
export function matchUmPagamentoPlanilhaBanco(
  planilha: PlanilhaItem,
  bancoItens: BancoItem[],
  usadosBanco: Set<string>,
  pilatesNomePagadorRows: PilatesNomePagadorRow[],
): MatchUmResult {
  const TOL = businessRules.conciliacao.valorTolerancia;
  const isAnyPlanilhaNomeCompatible = (pl: PlanilhaItem, bancoNome: string): boolean => {
    const nomes = [pl.aluno, ...(pl.responsaveis ?? []), pl.pagadorPix].filter((x) => !!x) as string[];
    return nomes.some((n) => isNameCompatible(n, bancoNome));
  };
  const isBancoNamesCompatible = (pl: PlanilhaItem, banco: BancoItem): boolean => {
    const bancoNames = [banco.pessoa, banco.descricao ?? ''].filter((x) => !!x) as string[];
    return bancoNames.some((bn) => isAnyPlanilhaNomeCompatible(pl, bn));
  };
  const isBancoNamesCompatibleWithPilatesPagador = (pl: PlanilhaItem, banco: BancoItem): boolean => {
    if (!pilatesNomePagadorRows.length) return isBancoNamesCompatible(pl, banco);
    const isPilatesItem =
      normalizeText(pl.aba).includes('PILATES') || normalizeText(pl.modalidade).includes('PILATES');
    if (!isPilatesItem) return isBancoNamesCompatible(pl, banco);
    const bancoCompatBase = isBancoNamesCompatible(pl, banco);
    if (bancoCompatBase) return true;
    const candidatosPagadores = pilatesNomePagadorRows
      .filter((v) => v.nome_pagador && v.valor != null && Math.abs(Number(v.valor || 0) - Number(banco.valor || 0)) <= TOL)
      .filter((v) => (v.aluno_nome ? isNameCompatible(pl.aluno, v.aluno_nome) : false))
      .map((v) => v.nome_pagador!)
      .filter(Boolean);
    return candidatosPagadores.some((pag) => isAnyPlanilhaNomeCompatible(pl, pag));
  };

  const p = planilha;
  const candidatosValor = bancoItens.filter(
    (b) => !usadosBanco.has(b.id) && Math.abs(Number(b.valor || 0) - Number(p.valor || 0)) <= TOL,
  );
  const candidatosNome = candidatosValor.filter((b) => isBancoNamesCompatibleWithPilatesPagador(p, b));

  if (candidatosNome.length === 1) {
    return { status: 'confirmado', banco: candidatosNome[0] };
  }
  if (candidatosNome.length > 1) {
    return { status: 'possivel', candidatos: candidatosNome };
  }
  if (candidatosValor.length > 0) {
    return { status: 'possivel', candidatos: candidatosValor };
  }
  return { status: 'nao' };
}

/**
 * Excecao: **varias linhas na planilha** (mesmo aluno em mais de uma atividade, ou mesmo PIX pagando
 * mais de um aluno) contra **uma** entrada no banco com valor = soma. Nao usar para o inverso
 * (varios banco -> uma planilha). Retorno sempre "possivel" para revisao manual.
 */
export function matchPagamentosAgrupadosPlanilhaBanco(
  planilhas: PlanilhaItem[],
  bancoItens: BancoItem[],
  usadosBanco: Set<string>,
  pilatesNomePagadorRows: PilatesNomePagadorRow[],
): MatchAgrupadoResult {
  if (planilhas.length < 2) return { status: 'nao' };
  const base = planilhas[0];
  const valorTotal = planilhas.reduce((s, p) => s + Number(p.valor || 0), 0);
  const nomesGrupo = new Set<string>();
  for (const p of planilhas) {
    if (p.aluno) nomesGrupo.add(p.aluno);
    for (const r of p.responsaveis ?? []) if (r) nomesGrupo.add(r);
    if (p.pagadorPix) nomesGrupo.add(p.pagadorPix);
  }
  const sintetico: PlanilhaItem = {
    ...base,
    id: `agrupado::${planilhas.map((p) => p.id).join('|')}`,
    valor: valorTotal,
    responsaveis: Array.from(nomesGrupo),
  };
  const match = matchUmPagamentoPlanilhaBanco(sintetico, bancoItens, usadosBanco, pilatesNomePagadorRows);
  if (match.status === 'nao') return { status: 'nao' };
  if (match.status === 'confirmado') return { status: 'possivel', candidatos: [match.banco] };
  return { status: 'possivel', candidatos: match.candidatos };
}
