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

export type PossivelMatchRow = { planilha: PlanilhaItem; candidatos: BancoItem[] };

function nomesPlanilhaCompativelComBanco(planilha: PlanilhaItem, banco: BancoItem): boolean {
  const nomes = [planilha.aluno, ...(planilha.responsaveis ?? []), planilha.pagadorPix].filter(Boolean) as string[];
  const bancoNames = [banco.pessoa, banco.descricao ?? ''].filter(Boolean) as string[];
  return bancoNames.some((bn) => nomes.some((n) => isNameCompatible(n, bn)));
}

function scoreNomePlanilhaBanco(planilha: PlanilhaItem, banco: BancoItem): number {
  if (nomesPlanilhaCompativelComBanco(planilha, banco)) return 2;
  return 0;
}

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

/**
 * Vários itens "possível" não podem compartilhar o mesmo lançamento no banco a menos que
 * a **soma** dos valores no fluxo bata com o valor do banco (N fluxo → 1 banco).
 * Caso contrário, no máximo **um** fluxo individual (valor = banco) mantém aquele candidato.
 */
export function resolverColisoesPossivelMatch(rows: PossivelMatchRow[], tol: number): {
  rows: PossivelMatchRow[];
  demovidos: PlanilhaItem[];
} {
  const porBanco = new Map<string, { banco: BancoItem; planilhaIds: Set<string> }>();
  for (const row of rows) {
    for (const c of row.candidatos) {
      let entry = porBanco.get(c.id);
      if (!entry) {
        entry = { banco: c, planilhaIds: new Set() };
        porBanco.set(c.id, entry);
      }
      entry.planilhaIds.add(row.planilha.id);
    }
  }

  const remover = new Map<string, Set<string>>();

  const marcarRemover = (planilhaId: string, bancoId: string) => {
    const set = remover.get(planilhaId) ?? new Set<string>();
    set.add(bancoId);
    remover.set(planilhaId, set);
  };

  for (const [bancoId, { banco, planilhaIds }] of porBanco) {
    if (planilhaIds.size <= 1) continue;

    const items = rows.filter((r) => planilhaIds.has(r.planilha.id));
    const sum = items.reduce((s, r) => s + Number(r.planilha.valor || 0), 0);
    const bVal = Number(banco.valor || 0);
    if (Math.abs(sum - bVal) <= tol) continue;

    const individualMatches = items.filter((r) => Math.abs(Number(r.planilha.valor || 0) - bVal) <= tol);
    if (individualMatches.length === 0) {
      for (const id of planilhaIds) marcarRemover(id, bancoId);
      continue;
    }

    const winner = individualMatches
      .slice()
      .sort((a, b) => scoreNomePlanilhaBanco(b.planilha, banco) - scoreNomePlanilhaBanco(a.planilha, banco))[0];
    for (const id of planilhaIds) {
      if (id !== winner.planilha.id) marcarRemover(id, bancoId);
    }
  }

  const demovidos: PlanilhaItem[] = [];
  const out: PossivelMatchRow[] = [];
  for (const row of rows) {
    const removeSet = remover.get(row.planilha.id);
    const candidatos = removeSet ? row.candidatos.filter((c) => !removeSet.has(c.id)) : [...row.candidatos];
    if (candidatos.length === 0) demovidos.push(row.planilha);
    else out.push({ planilha: row.planilha, candidatos });
  }
  return { rows: out, demovidos };
}
