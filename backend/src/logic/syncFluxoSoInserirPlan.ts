/**
 * Plano do sync "só inserir" do Fluxo.
 * Duplicata é detectada pelo CONTEÚDO (nunca pela linha da planilha):
 *   aluno (nome normalizado) + modalidade + data + valor + competência.
 * Contagem por multiconjunto: se a planilha tem 2 lançamentos idênticos e o banco tem 1, insere 1.
 */
import { normFluxoImport } from './fluxoPlanilhaImport.js';

export type PagamentoConteudo = {
  aluno_nome: string;
  modalidade: string;
  data_pagamento: string;
  valor: number;
  mes_competencia: number;
  ano_competencia: number;
};

export type AlunoConteudo = { aba: string; modalidade: string; aluno_nome: string };

export function normNome(s: unknown): string {
  return normFluxoImport(s).replace(/\s+/g, ' ');
}

/** Nome de aluno para comparação: normalização + ignora TODOS os espaços ("Ana Paula" == "ANAPAULA"). */
export function normNomeAluno(s: unknown): string {
  return normNome(s).replace(/\s+/g, '');
}

/**
 * Casos em que ignorar espaços junta nomes que antes eram diferentes (mesma aba).
 * Retorna grupos com as variações distintas encontradas — revisar manualmente.
 */
export function colisoesSemEspaco(
  nomes: Array<{ aba: string; aluno_nome: string }>,
): Array<{ aba: string; chave: string; variacoes: string[] }> {
  const g = new Map<string, { aba: string; chave: string; v: Set<string> }>();
  for (const n of nomes) {
    const chave = normNomeAluno(n.aluno_nome);
    if (!chave) continue;
    const k = `${normNome(n.aba)}|${chave}`;
    if (!g.has(k)) g.set(k, { aba: n.aba, chave, v: new Set() });
    g.get(k)!.v.add(normNome(n.aluno_nome));
  }
  return [...g.values()]
    .filter((x) => x.v.size > 1)
    .map((x) => ({ aba: x.aba, chave: x.chave, variacoes: [...x.v].sort() }));
}

export function chavePagamento(p: PagamentoConteudo): string {
  return [
    normNomeAluno(p.aluno_nome),
    normNome(p.modalidade),
    String(p.data_pagamento ?? '').slice(0, 10),
    (Math.round(Number(p.valor) * 100) / 100).toFixed(2),
    `${Number(p.mes_competencia) || 0}/${Number(p.ano_competencia) || 0}`,
  ].join('|');
}

export function chaveAluno(a: AlunoConteudo): string {
  return [normNome(a.aba), normNome(a.modalidade), normNomeAluno(a.aluno_nome)].join('|');
}

export function planPagamentosSoInserir<T extends PagamentoConteudo>(
  desired: T[],
  existing: PagamentoConteudo[],
): { inserts: T[]; duplicados: number } {
  const saldo = new Map<string, number>();
  for (const e of existing) {
    const k = chavePagamento(e);
    saldo.set(k, (saldo.get(k) ?? 0) + 1);
  }
  const inserts: T[] = [];
  let duplicados = 0;
  for (const d of desired) {
    const k = chavePagamento(d);
    const n = saldo.get(k) ?? 0;
    if (n > 0) {
      saldo.set(k, n - 1);
      duplicados += 1;
    } else {
      inserts.push(d);
    }
  }
  return { inserts, duplicados };
}

export function planAlunosSoInserir<T extends AlunoConteudo>(
  desired: T[],
  existing: AlunoConteudo[],
): { inserts: T[]; existentes: number } {
  const vistos = new Set(existing.map(chaveAluno));
  const inserts: T[] = [];
  let existentes = 0;
  for (const d of desired) {
    const k = chaveAluno(d);
    if (vistos.has(k)) {
      existentes += 1;
      continue;
    }
    vistos.add(k);
    inserts.push(d);
  }
  return { inserts, existentes };
}
