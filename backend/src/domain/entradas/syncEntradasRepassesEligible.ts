/**
 * Meses anteriores a jun/2026 no Controle de Caixa foram preenchidos manualmente.
 * Sincronização extrato → Entradas Parceiros + repasses só a partir daí.
 */
export const SYNC_ENTRADAS_REPASSE_PRIMEIRO_MES = 6;
export const SYNC_ENTRADAS_REPASSE_PRIMEIRO_ANO = 2026;

export const SYNC_ENTRADAS_REPASSE_BLOQUEADO_MSG =
  'Sincronização disponível apenas a partir de junho/2026. Meses anteriores permanecem com os valores manuais do Controle de Caixa.';

export function mesPermiteSincronizarEntradasRepasses(mes: number, ano: number): boolean {
  if (ano > SYNC_ENTRADAS_REPASSE_PRIMEIRO_ANO) return true;
  if (ano < SYNC_ENTRADAS_REPASSE_PRIMEIRO_ANO) return false;
  return mes >= SYNC_ENTRADAS_REPASSE_PRIMEIRO_MES;
}
