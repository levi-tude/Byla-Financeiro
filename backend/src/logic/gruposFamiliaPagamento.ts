/**
 * Pares/grupos familiares que pagam juntos (N→1):
 * várias linhas do Fluxo → um lançamento no banco com a soma.
 *
 * Catálogo operacional vem do Supabase (setGruposFamiliaCatalogo).
 * O Git público não guarda nomes reais — só a lógica + fixtures fictícias nos testes.
 */

import { alunoNormKey } from './alunoPagadorMatch.js';

export type GrupoFamiliaPagamento = {
  /** Chave estável do grupo (usada em agrupamento). */
  chave: string;
  /** Rótulo curto para a UI (Secretária/Admin). */
  rotulo: string;
  /**
   * Cada membro é identificado por tokens que DEVEM aparecer no nome normalizado.
   * Ex.: ['MARINA','COSTA'] casa com "Marina Costa Silva";
   * "Ana Costa" não casa se faltar o token MARINA.
   */
  membros: string[][];
};

/** Catálogo em memória (preenchido pelo backend a partir do banco). */
let catalogoAtivo: GrupoFamiliaPagamento[] = [];

export function setGruposFamiliaCatalogo(grupos: GrupoFamiliaPagamento[]): void {
  catalogoAtivo = Array.isArray(grupos) ? grupos : [];
}

export function getGruposFamiliaCatalogo(): GrupoFamiliaPagamento[] {
  return catalogoAtivo;
}

/** Útil em testes: aplica catálogo e restaura depois. */
export function withGruposFamiliaCatalogo<T>(
  grupos: GrupoFamiliaPagamento[],
  fn: () => T,
): T {
  const prev = catalogoAtivo;
  catalogoAtivo = grupos;
  try {
    return fn();
  } finally {
    catalogoAtivo = prev;
  }
}

function membroCasaComAluno(tokens: string[], alunoNorm: string): boolean {
  return tokens.every((t) => alunoNorm.includes(t));
}

/** Chave do grupo familiar do aluno, ou null se não estiver em nenhum. */
export function familiaPagamentoChave(aluno: string): string | null {
  const n = alunoNormKey(aluno);
  if (!n) return null;
  for (const g of catalogoAtivo) {
    if (g.membros.some((m) => membroCasaComAluno(m, n))) return g.chave;
  }
  return null;
}

export function familiaPagamentoRotulo(aluno: string): string | null {
  const chave = familiaPagamentoChave(aluno);
  if (!chave) return null;
  return catalogoAtivo.find((g) => g.chave === chave)?.rotulo ?? null;
}

/** Dois alunos distintos do mesmo grupo familiar sticky. */
export function grupoFamiliaCompativel(alunoA: string, alunoB: string): boolean {
  const ka = familiaPagamentoChave(alunoA);
  const kb = familiaPagamentoChave(alunoB);
  return !!ka && ka === kb;
}
