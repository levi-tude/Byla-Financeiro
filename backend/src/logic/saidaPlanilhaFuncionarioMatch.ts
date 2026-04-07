import type { EntidadeByla } from '../domain/funcionariosByla.js';
import { getEntidadesByla } from '../domain/funcionariosByla.js';
import { normalizeText } from './conciliacaoTexto.js';

export type MatchEntidadeResult = {
  entidade: EntidadeByla;
  /** Trecho do label que motivou o match (melhor esforço). */
  via: 'nome' | 'alias' | 'substring';
} | null;

/** Verifica se o texto normalizado contém o token (palavra ou frase). */
function contemToken(haystack: string, needle: string): boolean {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!n) return false;
  return h.includes(n) || n.includes(h);
}

/**
 * Associa uma linha de saída da planilha (rótulo/descrição) a uma pessoa ou à subempresa Byla Dança.
 * Ordem: matches mais longos primeiro para evitar que "Maria" pegue antes de "Maria Eduarda".
 */
export function matchEntidadeBylaNaLinha(
  labelOuDescricao: string,
  entidades: EntidadeByla[] = getEntidadesByla(),
): MatchEntidadeResult {
  const texto = (labelOuDescricao ?? '').trim();
  if (!texto) return null;

  const candidatos: { e: EntidadeByla; via: 'nome' | 'alias' | 'substring'; peso: number }[] = [];

  for (const e of entidades) {
    if (contemToken(texto, e.nome)) {
      candidatos.push({ e, via: 'nome', peso: e.nome.length * 10 });
    }
    for (const a of e.aliases) {
      if (contemToken(texto, a)) {
        candidatos.push({ e, via: 'alias', peso: a.length * 10 + 1 });
      }
    }
  }

  if (candidatos.length === 0) return null;

  candidatos.sort((a, b) => b.peso - a.peso);
  const best = candidatos[0];
  return { entidade: best.e, via: best.via };
}
