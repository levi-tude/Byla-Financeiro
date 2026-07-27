/**
 * Recupera vínculos órfãos (planilha_id aponta para pagamento que não existe mais)
 * casando 1:1 com pagamentos atuais por data_ref ±1 dia e valor.
 *
 * Usado no Cadastro (leitura) e em jobs de remap persistente.
 */

export type PagamentoParaHeuristicaOrfao = {
  id: string;
  alunoKey: string;
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

/**
 * Só aceita pares inequívocos: 1 órfão → 1 pagamento e 1 pagamento → 1 órfão.
 * Não cria vínculos novos — só casa órfãos já confirmados com pagamentos vivos.
 */
export function analisarCasamentoOrfaosPorDataValor(args: {
  orfaos: OrfaoParaHeuristica[];
  pagamentos: PagamentoParaHeuristicaOrfao[];
  toleranciaDias?: number;
  toleranciaValor?: number;
}): AnaliseCasamentoOrfaos {
  const tolDias = args.toleranciaDias ?? 1;
  const tolValor = args.toleranciaValor ?? 0.02;

  type Cand = { orfao: OrfaoParaHeuristica; pag: PagamentoParaHeuristicaOrfao };
  const cands: Cand[] = [];

  for (const o of args.orfaos) {
    const dRef = diaIso(o.data_ref);
    if (!dRef || !Number.isFinite(o.valor)) continue;
    for (const p of args.pagamentos) {
      const dPag = diaIso(p.data_pagamento);
      if (!dPag || !Number.isFinite(p.valor)) continue;
      if (Math.abs(p.valor - o.valor) > tolValor) continue;
      if (diasAbs(dPag, dRef) > tolDias) continue;
      cands.push({ orfao: o, pag: p });
    }
  }

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

  for (const o of args.orfaos) {
    const list = byOrfao.get(o.planilha_id) ?? [];
    if (list.length === 0) {
      semCandidato += 1;
      continue;
    }
    if (list.length !== 1) {
      ambiguosIgnorados += 1;
      continue;
    }
    const c = list[0]!;
    if (usedOrfao.has(o.planilha_id) || usedPag.has(c.pag.id)) {
      ambiguosIgnorados += 1;
      continue;
    }
    const rival = byPag.get(c.pag.id) ?? [];
    if (rival.length !== 1) {
      ambiguosIgnorados += 1;
      continue;
    }
    usedOrfao.add(o.planilha_id);
    usedPag.add(c.pag.id);
    matches.push({
      oldPlanilhaId: o.planilha_id,
      newPagamentoId: c.pag.id,
      alunoKey: c.pag.alunoKey,
      pessoa_banco: c.orfao.pessoa_banco?.trim() || null,
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
