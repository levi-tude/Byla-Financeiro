/** Pagamentos na validação diária: fluxo operacional (Supabase) ou planilha Google. */
export function isFluxoPrimaryForValidacao(): boolean {
  const v = (process.env.BYLA_SOURCE_FLUXO_PRIMARY ?? 'true').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}

/** Leitura da planilha Google (consulta legada / divergências). */
export function isPlanilhaReadEnabled(): boolean {
  const v = (process.env.BYLA_PLANILHA_READ ?? 'true').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}
