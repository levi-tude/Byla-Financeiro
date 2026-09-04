/**
 * Sync incremental do Fluxo (não apaga/recria pagamentos).
 *
 *   npm run sync:fluxo-incremental -- 2026
 *   npm run sync:fluxo-incremental -- 2026 --dry-run
 *   npm run sync:fluxo-incremental -- --alunos-only
 *   npm run sync:fluxo-incremental -- 2026 --abas="BYLA DANÇA,YOGA"
 *
 * Requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no backend/.env
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { parseAbasArg } from '../src/logic/fluxoPlanilhaImport.js';
import { getSupabase } from '../src/services/supabaseClient.js';
import { syncFluxoIncremental } from '../src/services/syncFluxoIncremental.js';

function printUso(): void {
  console.error(`Uso:
  npm run sync:fluxo-incremental -- <ano> [--dry-run] [--abas="ABA1,ABA2"]
  npm run sync:fluxo-incremental -- --alunos-only [--abas="ABA1"]

Rotina: este comando. NÃO use migrate:fluxo-operacional (apaga e recria IDs).`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUso();
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const alunosOnly = args.includes('--alunos-only');
  const anoArg = args.find((a) => /^\d{4}$/.test(a));
  const ano = Number(anoArg ?? new Date().getFullYear());
  const abasFlag = args.find((a) => a.startsWith('--abas='));
  const abas = parseAbasArg(abasFlag ? abasFlag.slice('--abas='.length) : undefined);

  if (!alunosOnly && (!Number.isFinite(ano) || ano < 2000)) {
    printUso();
    process.exit(1);
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.error('Supabase não configurado (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');
    process.exit(1);
  }

  const report = await syncFluxoIncremental(supabase, {
    ano,
    dryRun,
    alunosOnly,
    abas,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok || report.erros.length > 0) process.exit(2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
