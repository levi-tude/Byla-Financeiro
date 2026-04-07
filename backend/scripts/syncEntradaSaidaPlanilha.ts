/**
 * Sincroniza a aba Movimentações no contrato final (8 colunas).
 *
 * Requer: backend/.env com GOOGLE_SHEETS_ENTRADA_SAIDA_ID, GOOGLE_APPLICATION_CREDENTIALS (ou JSON),
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, e a service account como editor da planilha.
 *
 * Uso (pasta backend): npm run sync:entrada-saida
 */
import '../src/loadEnv.js';
import { syncEntradaSaidaPlanilhaCompleto } from '../src/services/entradaSaidaPlanilhaSync.js';

async function main(): Promise<void> {
  const { sync } = await syncEntradaSaidaPlanilhaCompleto();
  console.log('[sync]', sync.ok ? 'OK' : 'FALHA', sync);
  if (!sync.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
