import { isNameCompatible, normalizeText } from '../../logic/conciliacaoTexto.js';
import type { CategoriaEntradaLinha } from './categoriasEntrada.js';
import { isCategoriaEntradaAluguelCoworking, isCategoriaEntradaParceiros } from './categoriasEntrada.js';

export type AluguelCoworkingMatch = {
  template_key: string;
  label: string;
  confianca: 'alta' | 'media' | 'baixa';
  motivo: string;
  score: number;
};

/** Pagadores conhecidos por linha do Controle (flexível — complementa tokens do label). */
const PAGADORES_POR_LINHA: Array<{ labelNeedle: string; tokens: string[] }> = [
  { labelNeedle: 'NETO', tokens: ['ORVILLE', 'NETO'] },
  { labelNeedle: 'PHOLHA', tokens: ['WENDEL', 'PHOLHA'] },
  { labelNeedle: 'FORRO', tokens: ['DEANE'] },
  { labelNeedle: 'ALMA', tokens: ['DEANE'] },
  { labelNeedle: 'PILATES FABI', tokens: ['FABIANA', 'FABI'] },
  { labelNeedle: 'FABI', tokens: ['FABIANA', 'FABI'] },
  { labelNeedle: 'EVERALDO', tokens: ['EVERALDO'] },
  { labelNeedle: 'LOJA', tokens: ['EVERALDO'] },
];

function tokensFromLabel(label: string): string[] {
  const norm = normalizeText(label.replace(/\([^)]*\)/g, ' '));
  const paren = label.match(/\(([^)]+)\)/);
  const fromParen = paren ? normalizeText(paren[1]).split(/\s+/).filter((t) => t.length >= 2) : [];
  const words = norm.split(/\s+/).filter((t) => t.length >= 3 && !['LOJA', 'SBA'].includes(t) || t.length >= 4);
  return [...new Set([...words, ...fromParen])];
}

function nomeContemToken(nomeNorm: string, token: string): boolean {
  if (!token || token.length < 3) return false;
  const parts = nomeNorm.split(/\s+/);
  if (parts.some((p) => p === token)) return true;
  if (token.length >= 5 && nomeNorm.includes(token)) return true;
  return isNameCompatible(token, nomeNorm);
}

function scoreNomePagador(pessoaExibida: string, label: string): { score: number; motivo: string | null } {
  const nomeNorm = normalizeText(pessoaExibida);
  if (!nomeNorm) return { score: 0, motivo: null };

  let score = 0;
  const hits: string[] = [];

  for (const { labelNeedle, tokens } of PAGADORES_POR_LINHA) {
    if (!normalizeText(label).includes(labelNeedle)) continue;
    for (const tok of tokens) {
      if (nomeContemToken(nomeNorm, tok)) {
        score += tok.length >= 6 ? 8 : 6;
        hits.push(tok);
      }
    }
  }

  for (const tok of tokensFromLabel(label)) {
    if (nomeContemToken(nomeNorm, tok)) {
      score += tok.length >= 5 ? 5 : 3;
      hits.push(tok);
    }
  }

  if (isNameCompatible(label, pessoaExibida)) {
    score += 4;
    hits.push('label');
  }

  return {
    score,
    motivo: hits.length ? `Nome: ${[...new Set(hits)].join(', ')}` : null,
  };
}

function scoreValor(totalMes: number, valorControle: number | null | undefined): { score: number; motivo: string | null } {
  if (valorControle == null || valorControle <= 0 || totalMes <= 0) return { score: 0, motivo: null };
  const diff = Math.abs(totalMes - valorControle);
  const pct = diff / valorControle;
  if (diff <= 30 || pct <= 0.08) return { score: 8, motivo: `Valor ≈ Controle (${valorControle.toFixed(0)})` };
  if (diff <= 80 || pct <= 0.15) return { score: 4, motivo: `Valor próximo Controle (${valorControle.toFixed(0)})` };
  return { score: 0, motivo: null };
}

function confiancaFromScore(score: number): 'alta' | 'media' | 'baixa' {
  if (score >= 10) return 'alta';
  if (score >= 6) return 'media';
  return 'baixa';
}

/**
 * Sugere linha de Aluguel/Coworking a partir do nome do pagador e valor vs Controle.
 */
export function matchAluguelCoworkingParaPagador(
  pessoaExibida: string,
  totalMes: number,
  catalog: CategoriaEntradaLinha[],
  valoresControle: Map<string, number>,
): AluguelCoworkingMatch | null {
  const linhas = catalog.filter(isCategoriaEntradaAluguelCoworking);
  if (linhas.length === 0) return null;

  let best: AluguelCoworkingMatch | null = null;

  for (const cat of linhas) {
    const nome = scoreNomePagador(pessoaExibida, cat.label);
    const valor = scoreValor(totalMes, valoresControle.get(cat.templateKey));
    const score = nome.score + valor.score;
    if (score < 5) continue;

    const motivos = [nome.motivo, valor.motivo].filter(Boolean).join(' · ');
    const cand: AluguelCoworkingMatch = {
      template_key: cat.templateKey,
      label: cat.label,
      confianca: confiancaFromScore(score),
      motivo: motivos || cat.label,
      score,
    };

    if (!best || cand.score > best.score) best = cand;
  }

  return best;
}

export type SegmentoEntrada = 'mensalidades' | 'aluguel_coworking';

export function resolverSegmentoEntradaGrupo(input: {
  bloco_template_key: string | null;
  bloco_titulo: string | null;
  template_key: string | null;
  aba_fluxo: string | null;
  aluno_nome: string | null;
  sugestao_fluxo: { template_key: string } | null;
  match_aluguel: AluguelCoworkingMatch | null;
}): SegmentoEntrada {
  const titulo = (input.bloco_titulo ?? '').toLowerCase();
  const bloco = (input.bloco_template_key ?? '').trim();

  if (bloco === 'entrada_aluguel_coworking' || titulo.includes('aluguel') || titulo.includes('coworking')) {
    return 'aluguel_coworking';
  }
  if (bloco === 'entrada_parceiros' || titulo.includes('parceir')) {
    return 'mensalidades';
  }

  if (input.aba_fluxo || input.aluno_nome) return 'mensalidades';

  if (input.sugestao_fluxo?.template_key) {
    return 'mensalidades';
  }

  if (input.match_aluguel && input.match_aluguel.score >= 5) {
    return 'aluguel_coworking';
  }

  return 'mensalidades';
}

export function isSugestaoParceiros(cat: CategoriaEntradaLinha | null): boolean {
  return cat != null && isCategoriaEntradaParceiros(cat);
}
