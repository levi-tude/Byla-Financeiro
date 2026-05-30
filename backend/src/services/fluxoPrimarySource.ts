/** Pagamentos na validação diária: fluxo operacional (Supabase) é a fonte oficial. */
export function isFluxoPrimaryForValidacao(): boolean {
  const v = (process.env.BYLA_SOURCE_FLUXO_PRIMARY ?? 'true').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}

/** Leitura da planilha Google (migração / divergências legado). */
export function isPlanilhaReadEnabled(): boolean {
  const v = (process.env.BYLA_PLANILHA_READ ?? 'false').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}

/** Fallback da planilha na validação/calendário — só migração explícita (não é o dia a dia). */
export function isPlanilhaFallbackForValidacao(): boolean {
  if (!isPlanilhaReadEnabled()) return false;
  const v = (process.env.BYLA_VALIDACAO_PLANILHA_FALLBACK ?? 'false').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}
