/**
 * Grava a linha 1 de cabeçalhos na planilha Entrada/Saída (export n8n).
 * Usa GOOGLE_SHEETS_ENTRADA_SAIDA_ID + GOOGLE_APPLICATION_CREDENTIALS do backend/.env
 *
 * Uso (na pasta backend):
 *   npx tsx scripts/setupMovimentacoesHeader.ts
 *
 * Requer escopo spreadsheets (escrita). A service account precisa ser editor da planilha.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(backendRoot, '.env'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env'), override: true });

const ABA = 'Movimentações';

/** Contrato da aba Movimentações (extrato + classificação em 2 níveis) */
const CABECALHOS = [
  'id',
  'data',
  'tipo_fluxo',
  'valor',
  'pessoa_extrato',
  'referencia_negocio',
  'categoria',
  'subcategoria',
] as const;

function resolveKeyFile(raw: string): string {
  const p = raw.trim();
  if (!p) return '';
  return path.isAbsolute(p) ? p : path.resolve(backendRoot, p);
}

async function main(): Promise<void> {
  const spreadsheetId = (process.env.GOOGLE_SHEETS_ENTRADA_SAIDA_ID ?? '').trim();
  const keyFile = resolveKeyFile(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '');
  const credJson = (process.env.GOOGLE_SHEETS_CREDENTIALS_JSON ?? '').trim();

  if (!spreadsheetId) {
    console.error('Defina GOOGLE_SHEETS_ENTRADA_SAIDA_ID no backend/.env');
    process.exit(1);
  }
  if (!keyFile && !credJson) {
    console.error('Defina GOOGLE_APPLICATION_CREDENTIALS (arquivo JSON) ou GOOGLE_SHEETS_CREDENTIALS_JSON no backend/.env');
    process.exit(1);
  }
  if (keyFile && !fs.existsSync(keyFile)) {
    console.error(`Arquivo de credencial não encontrado: ${keyFile}`);
    process.exit(1);
  }

  const auth = credJson
    ? new google.auth.GoogleAuth({
        credentials: JSON.parse(credJson) as { client_email?: string; private_key?: string },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      })
    : new google.auth.GoogleAuth({
        keyFile,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets(properties(sheetId,title))',
  });
  const titles = new Set(
    (meta.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean) as string[],
  );

  if (!titles.has(ABA)) {
    console.log(`Criando aba "${ABA}"…`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: ABA } } }],
      },
    });
  }

  const n = CABECALHOS.length;
  const lastCol =
    n <= 26
      ? String.fromCodePoint(64 + n)
      : (() => {
          throw new Error('Ajuste o range se passar de 26 colunas');
        })();
  const range = `'${ABA.replace(/'/g, "''")}'!A1:${lastCol}1`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[...CABECALHOS]] },
  });

  console.log('OK — cabeçalhos gravados na linha 1.');
  console.log(`Planilha: ${meta.data.properties?.title ?? spreadsheetId}`);
  console.log(`Aba: ${ABA}`);
  console.log(`Intervalo ${range}: ${CABECALHOS.join(' | ')}`);
  console.log('');
  console.log('Como funciona: a sincronização escreve 8 colunas finais com classificação em 2 níveis.');
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
