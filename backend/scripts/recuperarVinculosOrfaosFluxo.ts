/**
 * Job P0: recupera vínculos órfãos pós-remigração + backfill sticky.
 *
 * Uso:
 *   npm run recuperar:vinculos-orfaos -- 2026
 *   npm run recuperar:vinculos-orfaos -- 2026 --dry-run
 *
 * Requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no backend/.env
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { getSupabase } from '../src/services/supabaseClient.js';
import { recuperarVinculosOrfaosFluxoAno } from '../src/services/recuperarVinculosOrfaosFluxo.js';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const anoArg = args.find((a) => /^\d{4}$/.test(a));
  const ano = Number(anoArg ?? new Date().getFullYear());

  if (!Number.isFinite(ano) || ano < 2000) {
    console.error('Uso: npm run recuperar:vinculos-orfaos -- <ano> [--dry-run]');
    process.exit(1);
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.error('Supabase não configurado (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');
    process.exit(1);
  }

  const report = await recuperarVinculosOrfaosFluxoAno(supabase, { ano, dryRun });
  console.log(JSON.stringify(report, null, 2));

  if (report.erros.length > 0) process.exit(2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
