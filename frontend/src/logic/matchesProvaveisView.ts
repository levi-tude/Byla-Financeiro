export type GrupoUiMatch = 'seguro' | 'medio' | 'ambiguo';

export function podeConfirmarIndividualmente(item: {
  grupo_ui: GrupoUiMatch;
  n_para_1: boolean;
  planilha_ids: string[];
}): boolean {
  return (
    item.grupo_ui !== 'ambiguo' &&
    !item.n_para_1 &&
    item.planilha_ids.length === 1
  );
}

export function rotuloGrupoMatch(grupo: GrupoUiMatch): string {
  if (grupo === 'seguro') return 'Seguro para vincular';
  if (grupo === 'ambiguo') return 'Ambíguo';
  return 'Precisa confirmar';
}
