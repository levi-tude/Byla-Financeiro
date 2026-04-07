/**
 * Layout “profissional” na planilha Entrada/Saída (export n8n):
 * - Aba Listas com categorias (referência + uso em validações)
 * - Cabeçalho Movimentações: cor, negrito, centralizado
 * - Linha 1 congelada, filtro automático, faixas zebradas
 * - Larguras de coluna, formato data (B), moeda (D), quebra de linha (F)
 * - Dropdowns (tipo, categoria sugerida, origem) — strict OFF para não bloquear o que o n8n grava
 *
 * Uso: npm run sheets:movimentacoes-pro
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

const ABA_MOV = 'Movimentações';
const ABA_LISTAS = 'Listas';
const N_COLS = 14;
const MAX_ROW = 5000;

/** docs/N8N_WEBHOOK_EXPORT_PLANILHA.md — união entrada + saída para sugestão manual */
const CATEGORIAS_UNIAO = [
  'Mensalidade',
  'Matrícula / taxa',
  'Aluguel / Locação (externo)',
  'Coworking',
  'Repasse / recebimento diverso',
  'Outros',
  'A classificar',
  'Pagamentos (fornecedores)',
  'Folha / pessoal',
  'Impostos / taxas bancárias',
  'Repasse / compensação',
  'Pagamentos gerais',
] as const;

const ORIGENS = [
  'mapeamento_manual',
  'regra_aluguel_externo',
  'regra_repasse_samuel',
  'cadastro_mensalidade',
  'fallback',
] as const;

const TIPOS = ['entrada', 'saida'] as const;

function resolveKeyFile(raw: string): string {
  const p = raw.trim();
  if (!p) return '';
  return path.isAbsolute(p) ? p : path.resolve(backendRoot, p);
}

function rgb(r: number, g: number, b: number) {
  return { red: r / 255, green: g / 255, blue: b / 255 };
}

function conditionValues(list: readonly string[]) {
  return list.map((s) => ({ userEnteredValue: s }));
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
    console.error('Defina GOOGLE_APPLICATION_CREDENTIALS ou GOOGLE_SHEETS_CREDENTIALS_JSON no backend/.env');
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
    fields: 'properties.title,sheets(properties(sheetId,title,gridProperties))',
  });

  const entradaLista = [
    'Mensalidade',
    'Matrícula / taxa',
    'Aluguel / Locação (externo)',
    'Coworking',
    'Repasse / recebimento diverso',
    'Outros',
    'A classificar',
  ];
  const saidaLista = [
    'Pagamentos (fornecedores)',
    'Folha / pessoal',
    'Impostos / taxas bancárias',
    'Repasse / compensação',
    'Pagamentos gerais',
    'Outros',
    'A classificar',
  ];

  let sheetList = meta.data.sheets ?? [];
  const norm = (t: string | undefined) => (t ?? '').normalize('NFC').trim();
  const byName = (name: string) =>
    sheetList.find((s) => norm(s.properties?.title) === norm(name));

  if (!byName(ABA_LISTAS)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: ABA_LISTAS } } }],
      },
    });
  }

  const metaSheets = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title))',
  });
  sheetList = metaSheets.data.sheets ?? [];

  let mov = byName(ABA_MOV);
  if (mov?.properties?.sheetId == null) {
    mov = sheetList.find((s) => /^movimenta/i.test(norm(s.properties?.title)));
  }
  if (mov?.properties?.sheetId == null) {
    const titles = sheetList.map((s) => s.properties?.title).filter(Boolean);
    console.error(`Aba "${ABA_MOV}" não encontrada. Abas atuais: ${titles.join(' | ')}`);
    console.error('Rode: npm run sheets:movimentacoes-header');
    process.exit(1);
  }

  const listasSheet = byName(ABA_LISTAS);
  const sheetIdMov = mov.properties.sheetId as number;
  const sheetIdListas = listasSheet?.properties?.sheetId;

  if (sheetIdListas == null) {
    console.error('Não foi possível obter o sheetId da aba Listas.');
    process.exit(1);
  }

  const maxL = Math.max(entradaLista.length, saidaLista.length, ORIGENS.length, TIPOS.length);
  const listasRows: string[][] = [
    ['Referência BYLA — categorias (não apague; o n8n não grava nesta aba)'],
    [],
    ['Entradas (categorias)', '', 'Saídas (categorias)', '', 'origem_categoria', '', 'tipo'],
  ];
  for (let i = 0; i < maxL; i++) {
    listasRows.push([
      entradaLista[i] ?? '',
      '',
      saidaLista[i] ?? '',
      '',
      ORIGENS[i] ?? '',
      '',
      TIPOS[i] ?? '',
    ]);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${ABA_LISTAS.replace(/'/g, "''")}'!A1:G${listasRows.length}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: listasRows },
  });

  const requests: Record<string, unknown>[] = [];

  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetIdListas,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 7,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: rgb(245, 247, 250),
          textFormat: { bold: true, fontSize: 11 },
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat)',
    },
  });

  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetIdMov,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: N_COLS,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: rgb(26, 54, 93),
          textFormat: { foregroundColor: rgb(255, 255, 255), bold: true, fontSize: 10 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
          wrapStrategy: 'WRAP',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
    },
  });

  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: sheetIdMov,
        gridProperties: { frozenRowCount: 1 },
      },
      fields: 'gridProperties.frozenRowCount',
    },
  });

  const colWidths = [
    { idx: 0, w: 200 },
    { idx: 1, w: 110 },
    { idx: 2, w: 90 },
    { idx: 3, w: 110 },
    { idx: 4, w: 160 },
    { idx: 5, w: 280 },
    { idx: 6, w: 200 },
    { idx: 7, w: 180 },
    { idx: 8, w: 130 },
    { idx: 9, w: 160 },
    { idx: 10, w: 160 },
    { idx: 11, w: 180 },
    { idx: 12, w: 200 },
    { idx: 13, w: 180 },
  ];
  for (const { idx, w } of colWidths) {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: sheetIdMov,
          dimension: 'COLUMNS',
          startIndex: idx,
          endIndex: idx + 1,
        },
        properties: { pixelSize: w },
        fields: 'pixelSize',
      },
    });
  }

  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetIdMov,
        startRowIndex: 1,
        endRowIndex: MAX_ROW,
        startColumnIndex: 1,
        endColumnIndex: 2,
      },
      cell: {
        userEnteredFormat: {
          numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' },
          horizontalAlignment: 'CENTER',
        },
      },
      fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
    },
  });

  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetIdMov,
        startRowIndex: 1,
        endRowIndex: MAX_ROW,
        startColumnIndex: 3,
        endColumnIndex: 4,
      },
      cell: {
        userEnteredFormat: {
          numberFormat: { type: 'CURRENCY', pattern: '#,##0.00' },
          horizontalAlignment: 'RIGHT',
        },
      },
      fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
    },
  });

  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetIdMov,
        startRowIndex: 1,
        endRowIndex: MAX_ROW,
        startColumnIndex: 5,
        endColumnIndex: 6,
      },
      cell: {
        userEnteredFormat: {
          wrapStrategy: 'WRAP',
          verticalAlignment: 'TOP',
        },
      },
      fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)',
    },
  });

  const dv = (startCol: number, endCol: number, values: readonly string[]) => ({
    setDataValidation: {
      range: {
        sheetId: sheetIdMov,
        startRowIndex: 1,
        endRowIndex: MAX_ROW,
        startColumnIndex: startCol,
        endColumnIndex: endCol,
      },
      rule: {
        condition: {
          type: 'ONE_OF_LIST',
          values: conditionValues(values),
        },
        showCustomUi: true,
        strict: false,
      },
    },
  });

  requests.push(dv(2, 3, [...TIPOS]));
  requests.push(dv(6, 7, [...CATEGORIAS_UNIAO]));
  requests.push(dv(11, 12, [...ORIGENS]));

  requests.push({
    setBasicFilter: {
      filter: {
        range: {
          sheetId: sheetIdMov,
          startRowIndex: 0,
          endRowIndex: MAX_ROW,
          startColumnIndex: 0,
          endColumnIndex: N_COLS,
        },
      },
    },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  console.log('OK — layout aplicado.');
  console.log(`Planilha: ${meta.data.properties?.title ?? spreadsheetId}`);
  console.log(`- ${ABA_MOV}: cabeçalho escuro, linha 1 fixa, filtro, formatos data/moeda, dropdowns (tipo, categoria, origem).`);
  console.log(`- ${ABA_LISTAS}: textos de referência das categorias (documentação interna).`);
  console.log('');
  console.log('Obs.: validações com strict=false para o n8n poder gravar qualquer valor sugerido pela view.');
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
