/**
 * Liga saída do extrato às linhas do CONTROLE com lógica próxima à conciliação
 * pagamento planilha × banco: nomes compatíveis, texto agregado e valor (± tolerância).
 */

import { businessRules } from '../businessRules.js';
import { isNameCompatible, normalizeText } from './conciliacaoTexto.js';
import { hayIndicaPilatesMari, hayIndicaSeguro, hayIndicaTelecom } from './classificacaoSaidaHeuristicas.js';

export type LinhaControlePl = { titulo: string; label: string; valor: number };

export type MatchSaidaControleResult = {
  linha: LinhaControlePl;
  score: number;
  /** Indícios que subiram o score (debug / transparência). */
  motivos: string[];
};

const THRESHOLD_ALTA = 0.62;
const THRESHOLD_MEDIA = 0.38;

function tokensSignificativos(s: string): string[] {
  return normalizeText(s)
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

/** Quanto o extrato (hay) cobre o rótulo da linha (tokens do label). */
function scoreSobreposicaoLabel(hay: string, labelNorm: string): number {
  if (labelNorm.length < 3) return 0;
  if (labelNorm.length >= 5 && hay.includes(labelNorm)) return 0.88;
  if (labelNorm.length >= 4 && hay.includes(labelNorm)) return 0.62;
  const tokens = tokensSignificativos(labelNorm);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return 0.5 * (hits / tokens.length);
}

/** Título do bloco (ex.: Saídas Parceiros) como pista fraca. */
function scoreTituloBloco(hay: string, titulo: string): number {
  const t = normalizeText(titulo);
  if (t.length < 5) return 0;
  const tokens = tokensSignificativos(t).filter((x) => x.length >= 4);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((x) => hay.includes(x)).length;
  return 0.18 * (hits / tokens.length);
}

/** Mesma ideia de conciliacaoPagamentoMatch: planilha × pessoa/descrição. */
function scoreNomeCompativel(linha: LinhaControlePl, pessoa: string, descricao: string | null): number {
  const campos = [pessoa, descricao ?? ''].filter(Boolean) as string[];
  let best = 0;
  for (const bn of campos) {
    if (isNameCompatible(linha.label, bn)) best = Math.max(best, 0.82);
    if (linha.titulo && isNameCompatible(linha.titulo, bn)) best = Math.max(best, 0.28);
  }
  return best;
}

function scoreValorLinha(linha: LinhaControlePl, valorSaida: number): number {
  const TOL = businessRules.conciliacao.valorTolerancia;
  const av = Math.abs(Number(valorSaida) || 0);
  const pv = Math.abs(Number(linha.valor) || 0);
  if (pv <= 0) return 0;
  if (Math.abs(pv - av) <= TOL) return 0.22;
  return 0;
}

/** Boost quando o rótulo do CONTROLE e o extrato “falam a mesma língua” (utilidades, etc.). */
function scoreBoostSemanticoLinha(linha: LinhaControlePl, hay: string): number {
  const lab = normalizeText(linha.label);
  let b = 0;
  if (lab.includes('PILATES') && hayIndicaPilatesMari(hay)) b += 0.12;
  if (
    (lab.includes('TELEFONE') || lab.includes('TELECOM') || lab.includes('INTERNET') || lab.includes('CELULAR')) &&
    hayIndicaTelecom(hay)
  )
    b += 0.12;
  if (lab.includes('SEGURO') && hayIndicaSeguro(hay)) b += 0.12;
  if (
    lab.includes('ENERGIA') &&
    !lab.includes('SOLAR') &&
    (hay.includes('ENEL') || hay.includes('CEMIG') || hay.includes('LIGHT') || hay.includes('LUZ'))
  )
    b += 0.12;
  if (lab.includes('ENERGIA') && lab.includes('SOLAR') && hay.includes('SOLAR')) b += 0.12;
  if (lab.includes('AGUA') && (hay.includes('SABESP') || hay.includes('SANEAMENTO'))) b += 0.12;
  return Math.min(0.24, b);
}

/** Par forte extrato × rótulo (ex.: ENEL → linha Energia) — piso de score. */
function pisoParUtilidade(linha: LinhaControlePl, hay: string): { min: number; tag: string } | null {
  const lab = normalizeText(linha.label);
  if (lab.includes('ENERGIA') && !lab.includes('SOLAR') && (hay.includes('ENEL') || hay.includes('CEMIG') || hay.includes('LIGHT')))
    return { min: 0.58, tag: 'par_energia' };
  if (lab.includes('ENERGIA') && lab.includes('SOLAR') && hay.includes('SOLAR')) return { min: 0.58, tag: 'par_energia_solar' };
  if (lab.includes('AGUA') && (hay.includes('SABESP') || hay.includes('SANEAMENTO'))) return { min: 0.58, tag: 'par_agua' };
  if (lab.includes('SEGURO') && hayIndicaSeguro(hay)) return { min: 0.55, tag: 'par_seguro' };
  if (
    (lab.includes('TELEFONE') || lab.includes('TELECOM') || lab.includes('INTERNET') || lab.includes('CELULAR')) &&
    hayIndicaTelecom(hay)
  )
    return { min: 0.55, tag: 'par_telecom' };
  if (lab.includes('PILATES') && hayIndicaPilatesMari(hay)) return { min: 0.52, tag: 'par_pilates' };
  return null;
}

function pontuarLinha(
  linha: LinhaControlePl,
  pessoa: string,
  descricao: string | null,
  valorSaida: number,
  hay: string,
): { score: number; motivos: string[] } {
  const motivos: string[] = [];
  const lab = normalizeText(linha.label);

  const sNome = scoreNomeCompativel(linha, pessoa, descricao);
  if (sNome > 0.5) motivos.push('nome_compativel');

  const sSub = scoreSobreposicaoLabel(hay, lab);
  if (sSub > 0.4) motivos.push('texto_rotulo');

  const sTit = scoreTituloBloco(hay, linha.titulo);
  if (sTit > 0.08) motivos.push('bloco');

  const sVal = scoreValorLinha(linha, valorSaida);
  if (sVal > 0) motivos.push('valor');

  const sBoost = scoreBoostSemanticoLinha(linha, hay);
  if (sBoost > 0) motivos.push('semantica');

  const base = Math.max(sNome, sSub);
  let score = Math.min(1, base + sTit + sVal + sBoost);

  const piso = pisoParUtilidade(linha, hay);
  if (piso && score < piso.min) {
    score = piso.min;
    motivos.push(piso.tag);
  }

  return { score, motivos };
}

/**
 * Escolhe a melhor linha do CONTROLE para a saída.
 * Retorna null se nenhuma linha passa do mínimo fraco (evita lixo).
 */
export function melhorMatchControle(
  planilhaLinhas: LinhaControlePl[],
  pessoa: string,
  descricao: string | null,
  valorSaida: number,
  hay: string,
): MatchSaidaControleResult | null {
  if (!planilhaLinhas.length || !hay) return null;

  const scored = planilhaLinhas.map((linha) => {
    const { score, motivos } = pontuarLinha(linha, pessoa, descricao, valorSaida, hay);
    return { linha, score, motivos };
  });

  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));

  if (best.score < THRESHOLD_MEDIA) return null;

  const gap = 0.12;
  const sorted = [...scored.map((s) => s.score)].sort((a, b) => b - a);
  const segundoMelhor = sorted.length >= 2 ? sorted[1]! : 0;
  if (best.score - segundoMelhor < gap && best.score < THRESHOLD_ALTA) {
    return { linha: best.linha, score: best.score, motivos: [...best.motivos, 'ambiguo'] };
  }

  return { linha: best.linha, score: best.score, motivos: best.motivos };
}

export function confiancaParaScore(score: number, ambiguo: boolean): 'alta' | 'media' | 'baixa' {
  if (ambiguo) return 'media';
  if (score >= THRESHOLD_ALTA) return 'alta';
  if (score >= THRESHOLD_MEDIA) return 'media';
  return 'baixa';
}
