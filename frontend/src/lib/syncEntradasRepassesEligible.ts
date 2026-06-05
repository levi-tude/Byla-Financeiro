/** Espelha backend/src/domain/entradas/syncEntradasRepassesEligible.ts */
export const SYNC_ENTRADAS_REPASSE_PRIMEIRO_MES = 6;
export const SYNC_ENTRADAS_REPASSE_PRIMEIRO_ANO = 2026;

export function mesPermiteSincronizarEntradasRepasses(mes: number, ano: number): boolean {
  if (ano > SYNC_ENTRADAS_REPASSE_PRIMEIRO_ANO) return true;
  if (ano < SYNC_ENTRADAS_REPASSE_PRIMEIRO_ANO) return false;
  return mes >= SYNC_ENTRADAS_REPASSE_PRIMEIRO_MES;
}
