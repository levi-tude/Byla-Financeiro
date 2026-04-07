/**
 * Uso: npm run inspect:controle (ou npx tsx scripts/inspectControleCaixa.ts)
 * Lê nomes de abas e amostra linhas da aba alvo (CONTROLE DE CAIXA) — sem logar credenciais.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { config, hasSheetsCredentials } from '../src/config.js';
import { listSheetNames, readSheetValues } from '../src/services/sheetsService.js';
import { mesAnoParaAbaControleDeCaixa, nomeAbaControleDeCaixa } from '../src/domain/MesAno.js';

async function main() {
  const id = config.sheets.fluxoSpreadsheetId;
  if (!hasSheetsCredentials()) {
    console.error('Sem credenciais Google (GOOGLE_SHEETS_CREDENTIALS_JSON ou GOOGLE_APPLICATION_CREDENTIALS).');
    process.exit(1);
  }
  if (!id) {
    console.error('Sem GOOGLE_SHEETS_FLUXO_ID.');
    process.exit(1);
  }

  const { names, error } = await listSheetNames(id);
  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log('=== PLANILHAS (CONTROLE / FLUXO ID) ===');
  console.log(names.join('\n'));

  const argvMes = process.argv[2];
  const argvAno = process.argv[3];
  const mes = argvMes
    ? Number(argvMes)
    : Number(process.env.INSPECT_MES ?? new Date().getMonth() + 1);
  const ano = argvAno
    ? Number(argvAno)
    : Number(process.env.INSPECT_ANO ?? new Date().getFullYear());
  const abaRef = mesAnoParaAbaControleDeCaixa(mes, ano);
  const nomeAba = nomeAbaControleDeCaixa(abaRef);
  const range = `'${nomeAba.replace(/'/g, "''")}'!A1:Z150`;

  console.log(`\n=== ABA SUGERIDA (mês referência UI ${mes}/${ano} → aba ${nomeAba}) ===`);
  let { values, error: e2 } = await readSheetValues(range, id);
  if (e2 || values.length === 0) {
    const alt = names.find((n) => /MARÇO|ABRIL|FEV|JAN|CONTROLE/i.test(n));
    if (alt) {
      console.log(`Fallback aba: ${alt}`);
      const r2 = await readSheetValues(`'${alt.replace(/'/g, "''")}'!A1:Z150`, id);
      values = r2.values;
      e2 = r2.error;
    }
  }
  if (e2) {
    console.error('Leitura:', e2);
    process.exit(1);
  }

  console.log('\n=== LINHAS (primeiras 120, colunas A–J resumidas) ===');
  for (let i = 0; i < Math.min(values.length, 120); i++) {
    const row = values[i] ?? [];
    const slice = row.slice(0, 10).map((c) => String(c).replace(/\s+/g, ' ').slice(0, 48));
    console.log(String(i + 1).padStart(4) + '|' + slice.join('\t'));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
