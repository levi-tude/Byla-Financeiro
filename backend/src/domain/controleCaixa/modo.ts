/** Modo de visualização/persistência do Controle de Caixa. */
export type ControleModo = 'oficial' | 'sistema';

export const CONTROLE_MODOS: readonly ControleModo[] = ['oficial', 'sistema'] as const;

export function isControleModo(v: unknown): v is ControleModo {
  return v === 'oficial' || v === 'sistema';
}

/** Rótulos curtos para UI (Secretária / Admin). */
export function labelControleModo(modo: ControleModo): string {
  return modo === 'oficial' ? 'Oficial (planilha)' : 'Sistema';
}

export function descricaoControleModo(modo: ControleModo): string {
  return modo === 'oficial'
    ? 'Fechamento migrado da planilha CONTROLE DE CAIXA — referência oficial.'
    : 'Valores gerados ou editados no sistema (sincronização do extrato classificado e ajustes manuais).';
}
