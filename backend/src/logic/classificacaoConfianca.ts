export type NivelConfiancaClassificacao = 'alta' | 'media' | 'baixa';

export type ConfiancaClassificacao = {
  score: number;
  confianca: NivelConfiancaClassificacao;
  ambiguo: boolean;
  pode_confirmar: boolean;
  motivos: string[];
};

export function nivelConfiancaClassificacao(score: number, ambiguo = false): NivelConfiancaClassificacao {
  if (!ambiguo && score >= 80) return 'alta';
  if (score >= 55) return 'media';
  return 'baixa';
}

/**
 * Contrato comum para sugestões de Entradas e Despesas.
 * Repetição ajuda a ordenar, mas nunca transforma sozinha uma evidência fraca em confirmação segura.
 */
export function criarConfiancaClassificacao(args: {
  scoreBase: number;
  repeticoes?: number;
  ambiguo?: boolean;
  motivos: string[];
}): ConfiancaClassificacao {
  const repeticoes = Math.max(0, Math.floor(args.repeticoes ?? 0));
  const boostRepeticao = Math.min(6, repeticoes * 2);
  const score = Math.max(0, Math.min(100, Math.round((args.scoreBase + boostRepeticao) * 10) / 10));
  const ambiguo = Boolean(args.ambiguo);
  const confianca = nivelConfiancaClassificacao(score, ambiguo);
  return {
    score,
    confianca,
    ambiguo,
    pode_confirmar: confianca === 'alta' && !ambiguo,
    motivos: [...new Set(args.motivos.filter(Boolean))],
  };
}
