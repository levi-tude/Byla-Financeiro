export type CasoReplayClassificacao = {
  esperado: string;
  sugestao: {
    template_key: string | null;
    pode_confirmar: boolean;
    confianca: string;
  } | null;
};

export type RelatorioReplayClassificacao = {
  totalConfirmados: number;
  comSugestao: number;
  sugestoesCorretas: number;
  elegiveisConfirmacao: number;
  elegiveisCorretas: number;
  elegiveisIncorretas: number;
  coberturaPct: number;
  acuraciaSugestoesPct: number;
  precisaoConfirmacaoPct: number;
};

function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;
}

/** Compara sugestões com decisões humanas já confirmadas, sem alterar qualquer dado. */
export function avaliarReplayClassificacao(casos: CasoReplayClassificacao[]): RelatorioReplayClassificacao {
  const comSugestao = casos.filter((c) => Boolean(c.sugestao?.template_key));
  const corretas = comSugestao.filter((c) => c.sugestao?.template_key === c.esperado);
  const elegiveis = comSugestao.filter((c) => c.sugestao?.pode_confirmar);
  const elegiveisCorretas = elegiveis.filter((c) => c.sugestao?.template_key === c.esperado);

  return {
    totalConfirmados: casos.length,
    comSugestao: comSugestao.length,
    sugestoesCorretas: corretas.length,
    elegiveisConfirmacao: elegiveis.length,
    elegiveisCorretas: elegiveisCorretas.length,
    elegiveisIncorretas: elegiveis.length - elegiveisCorretas.length,
    coberturaPct: pct(comSugestao.length, casos.length),
    acuraciaSugestoesPct: pct(corretas.length, comSugestao.length),
    precisaoConfirmacaoPct: pct(elegiveisCorretas.length, elegiveis.length),
  };
}
