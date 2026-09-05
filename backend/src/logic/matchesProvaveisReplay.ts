export type ParReplayMatch = { planilhaId: string; bancoId: string };

export type RelatorioReplayMatches = {
  total_vinculos_humanos: number;
  seguros_sugeridos: number;
  acertos: number;
  falsos_positivos: number;
  colisoes: number;
  cobertura_pct: number;
  precisao_pct: number;
  aprovado_para_aplicacao: boolean;
};

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

export function avaliarReplayMatchesProvaveis(args: {
  vinculosHumanos: ParReplayMatch[];
  segurosSugeridos: ParReplayMatch[];
}): RelatorioReplayMatches {
  const esperadoPorPlanilha = new Map(
    args.vinculosHumanos.map((par) => [par.planilhaId, par.bancoId]),
  );
  const acertos = args.segurosSugeridos.filter(
    (par) => esperadoPorPlanilha.get(par.planilhaId) === par.bancoId,
  ).length;
  const falsosPositivos = args.segurosSugeridos.length - acertos;
  const contagemBanco = new Map<string, number>();
  for (const par of args.segurosSugeridos) {
    contagemBanco.set(par.bancoId, (contagemBanco.get(par.bancoId) ?? 0) + 1);
  }
  const colisoes = [...contagemBanco.values()].reduce(
    (total, quantidade) => total + Math.max(0, quantidade - 1),
    0,
  );
  return {
    total_vinculos_humanos: args.vinculosHumanos.length,
    seguros_sugeridos: args.segurosSugeridos.length,
    acertos,
    falsos_positivos: falsosPositivos,
    colisoes,
    cobertura_pct: pct(acertos, args.vinculosHumanos.length),
    precisao_pct: pct(acertos, args.segurosSugeridos.length),
    aprovado_para_aplicacao:
      args.segurosSugeridos.length > 0 && falsosPositivos === 0 && colisoes === 0,
  };
}
