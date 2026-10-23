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

export function chavePagamento(p: PagamentoConteudo): string {
  return [
    normNome(p.aluno_nome),
    normNome(p.modalidade),
    String(p.data_pagamento ?? '').slice(0, 10),
    (Math.round(Number(p.valor) * 100) / 100).toFixed(2),
    `${Number(p.mes_competencia) || 0}/${Number(p.ano_competencia) || 0}`,
  ].join('|');
}

export function chaveAluno(a: AlunoConteudo): string {
  return [normNome(a.aba), normNome(a.modalidade), normNome(a.aluno_nome)].join('|');
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
