/** Regras de repasse: Saídas Parceiros derivadas de Entradas Parceiros (valores fixos Yoga/Pilates). */

export const YOGA_AJUSTE_FIXO = 480;
export const PILATES_MARI_AJUSTE_FIXO = 460;

export type RegraRepasse =
  | { tipo: 'percentual'; pct: number }
  | { tipo: 'percentual_base_ajustada'; pct: number; ajusteFixo: number }
  | { tipo: 'metade_base_ajustada'; ajusteFixo: number };

const REGRAS_POR_ENTRADA: Record<string, RegraRepasse> = {
  ent_parc_danca: { tipo: 'percentual', pct: 0.6 },
  ent_parc_yoga: { tipo: 'metade_base_ajustada', ajusteFixo: YOGA_AJUSTE_FIXO },
  ent_parc_pilates_mari: { tipo: 'percentual_base_ajustada', pct: 0.55, ajusteFixo: PILATES_MARI_AJUSTE_FIXO },
  ent_parc_pilates: { tipo: 'percentual_base_ajustada', pct: 0.55, ajusteFixo: PILATES_MARI_AJUSTE_FIXO },
  ent_parc_teatro: { tipo: 'percentual', pct: 0.5 },
  ent_parc_teatro_infantil: { tipo: 'percentual', pct: 0.5 },
  ent_parc_bruna_gr: { tipo: 'percentual', pct: 0.5 },
};

/** Par entrada → saída repasse (chaves estáveis). */
export const ENTRADA_PARA_SAIDA_REPASSE: Record<string, string> = {
  ent_parc_danca: 'sai_parc_danca',
  ent_parc_yoga: 'sai_parc_yoga',
  ent_parc_pilates_mari: 'sai_parc_pilates_mari',
  ent_parc_pilates: 'sai_parc_pilates_mari',
  ent_parc_teatro: 'sai_parc_teatro',
  ent_parc_teatro_infantil: 'sai_parc_teatro_infantil',
  ent_parc_bruna_gr: 'sai_parc_bruna_gr',
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcularRepasse(templateKeyEntrada: string, valorEntrada: number): number | null {
  const key = templateKeyEntrada.trim();
  const regra = REGRAS_POR_ENTRADA[key];
  if (!regra) return null;
  const E = Number(valorEntrada) || 0;
  if (regra.tipo === 'percentual') return round2(E * regra.pct);
  if (regra.tipo === 'metade_base_ajustada') return round2((E + regra.ajusteFixo) / 2);
  return round2(regra.pct * (E + regra.ajusteFixo));
}

export function templateKeySaidaRepasse(templateKeyEntrada: string): string | null {
  return ENTRADA_PARA_SAIDA_REPASSE[templateKeyEntrada.trim()] ?? null;
}

export type LinhaControleRepasse = {
  templateKey: string | null;
  valor: number | null;
  valorTexto?: string | null;
};

export function aplicarRepassesEmLinhasSaida(
  linhasSaida: LinhaControleRepasse[],
  valoresEntradaPorTemplateKey: Map<string, number>,
): void {
  for (const linha of linhasSaida) {
    const entKey = Object.entries(ENTRADA_PARA_SAIDA_REPASSE).find(([, sai]) => sai === (linha.templateKey ?? ''))?.[0];
    if (!entKey) continue;
    const entrada = valoresEntradaPorTemplateKey.get(entKey) ?? 0;
    const repasse = calcularRepasse(entKey, entrada);
    if (repasse == null) continue;
    linha.valor = repasse;
    linha.valorTexto = 'calculado_repasse';
  }
}

export function descricaoFormulaRepasse(templateKeyEntrada: string, valorEntrada: number): string | null {
  const key = templateKeyEntrada.trim();
  const regra = REGRAS_POR_ENTRADA[key];
  if (!regra) return null;
  const E = round2(Number(valorEntrada) || 0);
  const R = calcularRepasse(key, E);
  if (R == null) return null;
  if (regra.tipo === 'percentual') {
    return `Entrada ${E} × ${Math.round(regra.pct * 100)}% = ${R}`;
  }
  if (regra.tipo === 'metade_base_ajustada') {
    return `(Entrada ${E} + ${regra.ajusteFixo}) ÷ 2 = ${R}`;
  }
  return `(${E} + ${regra.ajusteFixo}) × ${Math.round(regra.pct * 100)}% = ${R}`;
}
