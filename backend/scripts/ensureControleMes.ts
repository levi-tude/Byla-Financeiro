/**
 * Garante que um mês existe no Controle (cria a partir do mês anterior se necessário).
 * Uso: npx tsx scripts/ensureControleMes.ts 6 2026
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { readControleCaixa } from '../src/services/controleCaixaRead.js';

async function main() {
  const mes = Number(process.argv[2]);
  const ano = Number(process.argv[3]);
  if (!Number.isFinite(mes) || !Number.isFinite(ano)) {
    console.error('Uso: npx tsx scripts/ensureControleMes.ts <mes> <ano>');
    process.exit(1);
  }

  const r = await readControleCaixa(mes, ano);
  if ('error' in r) {
    console.error(r.error);
    process.exit(1);
  }

  console.log(`OK ${mes}/${ano} origem=${r.data.origem}`);
  for (const b of r.data.blocos) {
    console.log(`  - ${b.titulo}: ${b.linhas.length} linhas`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
