import { normalizeText } from '../../logic/conciliacaoTexto.js';

export type AbaControleHint = {
  templateKeyPreferido: string;
  labelEsperado: string;
};

function normAba(s: string): string {
  return normalizeText(s);
}

/**
 * Sugere template_key de Entradas Parceiros a partir da aba/modalidade do fluxo.
 */
export function hintAbaFluxoParaControle(aba: string, modalidade?: string | null): AbaControleHint | null {
  const a = normAba(aba);
  const m = normAba(modalidade ?? '');

  if (a.includes('INFANTIL') || m.includes('INFANTIL')) {
    if (a.includes('TEATRO') || m.includes('TEATRO')) {
      return { templateKeyPreferido: 'ent_parc_teatro_infantil', labelEsperado: 'Teatro Infantil' };
    }
  }
  if (a.includes('TEATRO') || m.includes('TEATRO')) {
    return { templateKeyPreferido: 'ent_parc_teatro', labelEsperado: 'Teatro' };
  }
  if (a.includes('PILATES') || m.includes('PILATES') || m.includes('MARINA') || m.includes('MARI')) {
    return { templateKeyPreferido: 'ent_parc_pilates_mari', labelEsperado: 'Pilates Mari' };
  }
  if (a.includes('YOGA') || m.includes('YOGA')) {
    return { templateKeyPreferido: 'ent_parc_yoga', labelEsperado: 'Yoga' };
  }
  if (a.includes('DANCA') || a.includes('DANÇA') || m.includes('DANCA') || m.includes('BYLA DAN')) {
    return { templateKeyPreferido: 'ent_parc_danca', labelEsperado: 'Dança' };
  }
  if ((a.includes('BRUNA') && a.includes('GR')) || a === 'GR' || m.includes('BRUNA GR')) {
    return { templateKeyPreferido: 'ent_parc_bruna_gr', labelEsperado: 'Bruna GR' };
  }
  if (a.includes(' GR') || a.endsWith('GR')) {
    return { templateKeyPreferido: 'ent_parc_bruna_gr', labelEsperado: 'Bruna GR' };
  }
  return null;
}
