/**
 * Recupera vínculos órfãos (planilha_id aponta para pagamento que não existe mais)
 * casando 1:1 com pagamentos atuais por data_ref ±1 dia e valor,
 * com desambiguação via sticky aluno↔pagador quando há colisão.
 *
 * Usado no Cadastro (leitura) e em jobs de remap persistente.
 */

import { normalizePessoa } from './normalizePessoa.js';

export type PagamentoParaHeuristicaOrfao = {
  id: string;
  alunoKey: string;
  /** normalizeText(aluno_nome) — alinhado a mapeamento_aluno_pagador. */
  alunoNorm: string;
  data_pagamento: string | null;
  valor: number;
};

export type OrfaoParaHeuristica = {
  planilha_id: string;
  data_ref: string;
  valor: number;
  pessoa_banco?: string | null;
};

export type MatchOrfaoHeuristica = {
  oldPlanilhaId: string;
  newPagamentoId: string;
  alunoKey: string;
  pessoa_banco: string | null;
};

function diaIso(s: string | null | undefined): string | null {
  const t = String(s ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function diasAbs(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`));
  return Math.round(ms / 86_400_000);
}

export type AnaliseCasamentoOrfaos = {
  matches: MatchOrfaoHeuristica[];
  /** Órfãos com candidato(s) que não passaram no filtro 1:1 inequívoco. */
  ambiguosIgnorados: number;
  /** Órfãos sem nenhum pagamento na janela data±1 + valor. */
  semCandidato: number;
};

/** pessoa_banco_normalizada → alunos já vinculados a esse pagador. */
export function buildStickyPagadorIndex(
  regras: Array<{ pessoa_banco_normalizada: string; aluno_normalizado: string }>,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const r of regras) {
    const p = String(r.pessoa_banco_normalizada ?? '').trim();
    const a = String(r.aluno_normalizado ?? '').trim();
    if (!p || !a) continue;
    if (!map.has(p)) map.set(p, new Set());
    map.get(p)!.add(a);
  }
  return map;
}

function stickyAlunosParaPessoa(
  pessoa: string | null | undefined,
  index: Map<string, Set<string>>,
): Set<string> {
  const p = normalizePessoa(pessoa ?? '');
  if (!p) return new Set();
  return index.get(p) ?? new Set();
}

type Cand = { orfao: OrfaoParaHeuristica; pag: PagamentoParaHeuristicaOrfao };

function candsDataValor(
  orfaos: OrfaoParaHeuristica[],
  pagamentos: PagamentoParaHeuristicaOrfao[],
  tolDias: number,
  tolValor: number,
): Cand[] {
  const out: Cand[] = [];
  for (const o of orfaos) {
    const dRef = diaIso(o.data_ref);
    if (!dRef || !Number.isFinite(o.valor)) continue;
    for (const p of pagamentos) {
      const dPag = diaIso(p.data_pagamento);
      if (!dPag || !Number.isFinite(p.valor)) continue;
      if (Math.abs(p.valor - o.valor) > tolValor) continue;
      if (diasAbs(dPag, dRef) > tolDias) continue;
      out.push({ orfao: o, pag: p });
    }
  }
  return out;
}

function filtrarPorSticky(list: Cand[], alunosSticky: Set<string>): Cand[] {
  if (alunosSticky.size === 0) return list;
  return list.filter((c) => alunosSticky.has(c.pag.alunoNorm));
}

function escolherUnicoStrict(
  list: Cand[],
  usedOrfao: Set<string>,
  usedPag: Set<string>,
  byPag: Map<string, Cand[]>,
): Cand | null {
  if (list.length !== 1) return null;
  const c = list[0]!;
  if (usedOrfao.has(c.orfao.planilha_id) || usedPag.has(c.pag.id)) return null;
  const rival = byPag.get(c.pag.id) ?? [];
  if (rival.length !== 1) return null;
  return c;
}

function escolherUnicoAmplo(
  list: Cand[],
  usedOrfao: Set<string>,
  usedPag: Set<string>,
): Cand | null {
  if (list.length !== 1) return null;
  const c = list[0]!;
  if (usedOrfao.has(c.orfao.planilha_id) || usedPag.has(c.pag.id)) return null;
  return c;
}

/**
 * Só aceita pares inequívocos: 1 órfão → 1 pagamento e 1 pagamento → 1 órfão.
 * Não cria vínculos novos — só casa órfãos já confirmados com pagamentos vivos.
 */
export function analisarCasamentoOrfaosPorDataValor(args: {
  orfaos: OrfaoParaHeuristica[];
  pagamentos: PagamentoParaHeuristicaOrfao[];
  toleranciaDias?: number;
  toleranciaValor?: number;
  stickyPagadorIndex?: Map<string, Set<string>>;
  /** Janela extra (dias) quando sticky desambigua órfão sem par óbvio. */
  toleranciaDiasSticky?: number;
}): AnaliseCasamentoOrfaos {
  const tolDias = args.toleranciaDias ?? 1;
  const tolDiasSticky = args.toleranciaDiasSticky ?? 7;
  const tolValor = args.toleranciaValor ?? 0.02;
  const stickyIndex = args.stickyPagadorIndex ?? new Map();

  const cands = candsDataValor(args.orfaos, args.pagamentos, tolDias, tolValor);
  const byOrfao = new Map<string, Cand[]>();
  const byPag = new Map<string, Cand[]>();
  for (const c of cands) {
    const ok = byOrfao.get(c.orfao.planilha_id) ?? [];
    ok.push(c);
    byOrfao.set(c.orfao.planilha_id, ok);
    const pk = byPag.get(c.pag.id) ?? [];
    pk.push(c);
    byPag.set(c.pag.id, pk);
  }

  const matches: MatchOrfaoHeuristica[] = [];
  const usedPag = new Set<string>();
  const usedOrfao = new Set<string>();
  let ambiguosIgnorados = 0;
  let semCandidato = 0;

  const ordenados = [...args.orfaos].sort((a, b) => {
    const la = byOrfao.get(a.planilha_id)?.length ?? 0;
    const lb = byOrfao.get(b.planilha_id)?.length ?? 0;
    return la - lb;
  });

  for (const o of ordenados) {
    const stickyAlunos = stickyAlunosParaPessoa(o.pessoa_banco, stickyIndex);
    let list = byOrfao.get(o.planilha_id) ?? [];

    if (list.length > 1 && stickyAlunos.size > 0) {
      const narrowed = filtrarPorSticky(list, stickyAlunos);
      if (narrowed.length > 0) list = narrowed;
    }

    let chosen = escolherUnicoStrict(list, usedOrfao, usedPag, byPag);

    if (!chosen && stickyAlunos.size > 0) {
      const amplos = candsDataValor([o], args.pagamentos, tolDiasSticky, tolValor).filter(
        (c) => !usedPag.has(c.pag.id) && stickyAlunos.has(c.pag.alunoNorm),
      );
      chosen = escolherUnicoAmplo(amplos, usedOrfao, usedPag);
    }

    if (!chosen) {
      if (list.length === 0) semCandidato += 1;
      else ambiguosIgnorados += 1;
      continue;
    }

    usedOrfao.add(o.planilha_id);
    usedPag.add(chosen.pag.id);
    matches.push({
      oldPlanilhaId: o.planilha_id,
      newPagamentoId: chosen.pag.id,
      alunoKey: chosen.pag.alunoKey,
      pessoa_banco: o.pessoa_banco?.trim() || null,
    });
  }

  return { matches, ambiguosIgnorados, semCandidato };
}

export function casarVinculosOrfaosPorDataValor(args: {
  orfaos: OrfaoParaHeuristica[];
  pagamentos: PagamentoParaHeuristicaOrfao[];
  toleranciaDias?: number;
  toleranciaValor?: number;
}): MatchOrfaoHeuristica[] {
  return analisarCasamentoOrfaosPorDataValor(args).matches;
}
