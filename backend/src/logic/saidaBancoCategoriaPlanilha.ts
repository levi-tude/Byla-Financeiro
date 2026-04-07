import { normalizeText } from './conciliacaoTexto.js';

export type SugestaoCategoriaPlanilha = {
  grupo_planilha: string | null;
  linha_planilha_ref: string | null;
  confianca: 'alta' | 'media' | 'baixa';
};

type LinhaPl = { titulo: string; label: string; valor: number };

const TOL = 0.02;

/**
 * Cruza saída do banco com linhas do CONTROLE DE CAIXA (texto e, em último caso, valor).
 */
export function sugerirCategoriaPlanilhaParaSaida(
  pessoa: string,
  descricao: string | null,
  valor: number,
  planilhaLinhas: LinhaPl[],
): SugestaoCategoriaPlanilha {
  const hay = normalizeText(`${pessoa} ${descricao ?? ''}`);
  if (!hay || planilhaLinhas.length === 0) {
    return { grupo_planilha: null, linha_planilha_ref: null, confianca: 'baixa' };
  }

  let best: SugestaoCategoriaPlanilha | null = null;

  for (const pl of planilhaLinhas) {
    const lab = normalizeText(pl.label);
    if (lab.length < 3) continue;
    if (hay.includes(lab) || lab.includes(hay.slice(0, Math.min(24, hay.length)))) {
      const conf: 'alta' | 'media' = lab.length >= 8 ? 'alta' : 'media';
      if (!best || conf === 'alta') {
        best = {
          grupo_planilha: pl.titulo,
          linha_planilha_ref: pl.label,
          confianca: conf,
        };
      }
    }
  }
  if (best?.confianca === 'alta') return best;
  if (best) return best;

  const av = Math.abs(Number(valor) || 0);
  for (const pl of planilhaLinhas) {
    if (Math.abs(pl.valor - av) <= TOL) {
      return {
        grupo_planilha: pl.titulo,
        linha_planilha_ref: pl.label,
        confianca: 'media',
      };
    }
  }

  return { grupo_planilha: null, linha_planilha_ref: null, confianca: 'baixa' };
}
