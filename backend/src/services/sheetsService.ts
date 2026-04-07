import { google, sheets_v4 } from 'googleapis';
import { config, hasSheetsCredentials } from '../config.js';

let sheets: sheets_v4.Sheets | null = null;

function normalizeSheetsError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const low = msg.toLowerCase();
  if (
    low.includes('enotfound') &&
    (low.includes('www.googleapis.com') || low.includes('oauth2.googleapis.com') || low.includes('googleapis.com'))
  ) {
    return 'Falha de rede ao acessar Google APIs (DNS/Internet indisponível para www.googleapis.com). Confira conexão e DNS e tente novamente.';
  }
  if (low.includes('eai_again') && low.includes('googleapis.com')) {
    return 'Falha temporária de DNS ao acessar Google APIs. Tente novamente em alguns segundos.';
  }
  return msg;
}

function getAuth() {
  if (!hasSheetsCredentials()) return null;
  try {
    if (config.sheets.credentialsJson) {
      const cred = JSON.parse(config.sheets.credentialsJson) as { client_email?: string; private_key?: string };
      return new google.auth.GoogleAuth({
        credentials: cred,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
    }
    if (config.sheets.credentialsPath) {
      return new google.auth.GoogleAuth({
        keyFile: config.sheets.credentialsPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
    }
  } catch {
    return null;
  }
  return null;
}

export function getSheets(): sheets_v4.Sheets | null {
  const auth = getAuth();
  if (!auth) return null;
  if (!sheets) {
    google.options({ timeout: 15000 });
    sheets = google.sheets({ version: 'v4', auth });
  }
  return sheets;
}

export interface SheetRow {
  [key: string]: string | number;
}

/** Lê uma aba (range A1 notação) e retorna linhas como objetos com chaves da primeira linha. */
export async function readSheetRange(
  range: string,
  spreadsheetId?: string
): Promise<{ rows: SheetRow[]; error?: string }> {
  const id = spreadsheetId ?? config.sheets.spreadsheetId;
  if (!id) return { rows: [], error: 'Spreadsheet ID não configurado (GOOGLE_SHEETS_SPREADSHEET_ID ou parâmetro)' };
  const api = getSheets();
  if (!api) return { rows: [], error: 'Credenciais Google Sheets não configuradas' };
  try {
    const res = await api.spreadsheets.values.get({
      spreadsheetId: id,
      range,
    });
    const values = (res.data.values ?? []) as string[][];
    if (values.length === 0) return { rows: [] };
    const headers = values[0].map((h, i) => (h ?? '').trim() || `col_${i}`);
    const rows: SheetRow[] = values.slice(1).map((row) => {
      const obj: SheetRow = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] ?? '';
      });
      return obj;
    });
    return { rows };
  } catch (e) {
    const msg = normalizeSheetsError(e);
    return { rows: [], error: msg };
  }
}

/** Lista os nomes (títulos) de todas as abas de uma planilha. */
export async function listSheetNames(
  spreadsheetId: string
): Promise<{ names: string[]; error?: string }> {
  const api = getSheets();
  if (!api) return { names: [], error: 'Credenciais Google Sheets não configuradas' };
  if (!spreadsheetId) return { names: [], error: 'Spreadsheet ID não informado' };
  try {
    const res = await api.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title',
    });
    const names =
      (res.data.sheets ?? [])
        .map((s) => (s.properties?.title ?? '').trim())
        .filter(Boolean) ?? [];
    return { names };
  } catch (e) {
    const msg = normalizeSheetsError(e);
    return { names: [], error: msg };
  }
}

/** Lê range como valores brutos (sem header). Útil para planilha Fluxo (layout com rótulos na coluna A). */
export async function readSheetValues(
  range: string,
  spreadsheetId: string
): Promise<{ values: string[][]; error?: string }> {
  const api = getSheets();
  if (!api) return { values: [], error: 'Credenciais Google Sheets não configuradas' };
  if (!spreadsheetId) return { values: [], error: 'Spreadsheet ID não informado' };
  try {
    const res = await api.spreadsheets.values.get({ spreadsheetId, range });
    const raw = (res.data.values ?? []) as string[][];
    const values = raw.map((row) =>
      row.map((c) => (c ?? '').toString().trim())
    );
    return { values };
  } catch (e) {
    const msg = normalizeSheetsError(e);
    if (msg.includes('Unable to parse range') && range.includes('!') && api) {
      const fallback = await readSheetValuesBatchGet(spreadsheetId, range);
      if (!fallback.error) return fallback;
      const bounded = range.replace(/!A:Z$/i, '!A1:Z1000');
      if (bounded !== range) {
        try {
          const res = await api.spreadsheets.values.get({ spreadsheetId, range: bounded });
          const raw = (res.data.values ?? []) as string[][];
          const values = raw.map((row) => row.map((c) => (c ?? '').toString().trim()));
          return { values };
        } catch {
          // ignore
        }
      }
      const quoted = range.match(/^'([^']*(?:''[^']*)*)'!/);
      const unquoted = range.match(/^([^!]+)!/);
      const sheetName = (quoted?.[1] ?? unquoted?.[1] ?? '').replace(/''/g, "'").trim();
      if (sheetName) {
        const rangeSemAspas = `${sheetName}!A1:Z1000`;
        try {
          const res = await api.spreadsheets.values.get({ spreadsheetId, range: rangeSemAspas });
          const raw = (res.data.values ?? []) as string[][];
          const values = raw.map((row) => row.map((c) => (c ?? '').toString().trim()));
          return { values };
        } catch {
          // ignore
        }
      }
    }
    return { values: [], error: msg };
  }
}

/** Normaliza título da aba para comparação (espaços, maiúsculas). */
function normalizeSheetTitle(t: string): string {
  return t
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\u00A0/g, ' ')
    .toUpperCase();
}

/** Converte gridData.rowData da API em string[][]. */
function gridRowDataToValues(
  rowData: { values?: { effectiveValue?: Record<string, unknown>; formattedValue?: string }[] }[] | undefined
): string[][] {
  if (!rowData) return [];
  const cellText = (c: { effectiveValue?: Record<string, unknown>; formattedValue?: string }): string => {
    if (c?.formattedValue) return String(c.formattedValue).trim();
    const ev = c?.effectiveValue;
    if (ev && typeof ev === 'object') {
      if ('stringValue' in ev && ev.stringValue != null) return String(ev.stringValue).trim();
      if ('numberValue' in ev && ev.numberValue != null) return String(ev.numberValue).trim();
      if ('boolValue' in ev) return String(ev.boolValue).trim();
    }
    return '';
  };
  return rowData.map((row) => {
    const cells = (row.values ?? []) as { effectiveValue?: Record<string, unknown>; formattedValue?: string }[];
    return cells.map(cellText);
  });
}

/**
 * Lê os dados de uma aba pelo título buscando na planilha inteira (sem passar o nome no range).
 * Contorna o erro "Unable to parse range" para abas como PILATES MARINA: a API retorna todas as abas
 * e nós localizamos a aba pelo título normalizado.
 */
export async function readSheetValuesByTitleFromFullSpreadsheet(
  spreadsheetId: string,
  sheetTitleToFind: string
): Promise<{ values: string[][]; error?: string }> {
  const api = getSheets();
  if (!api) return { values: [], error: 'Credenciais não configuradas' };
  const targetNorm = normalizeSheetTitle(sheetTitleToFind);
  try {
    const res = await api.spreadsheets.get({
      spreadsheetId,
      includeGridData: true,
      fields: 'sheets(properties(title),data(rowData(values(effectiveValue,formattedValue))))',
    });
    const sheets = (res.data.sheets ?? []) as {
      properties?: { title?: string };
      data?: { rowData?: { values?: { effectiveValue?: Record<string, unknown>; formattedValue?: string }[] }[] };
    }[];
    for (const sheet of sheets) {
      const title = (sheet.properties?.title ?? '').trim();
      if (normalizeSheetTitle(title) !== targetNorm) continue;
      const values = gridRowDataToValues(sheet.data?.rowData);
      return { values };
    }
    return { values: [], error: `Aba não encontrada: ${sheetTitleToFind}` };
  } catch (e) {
    return { values: [], error: normalizeSheetsError(e) };
  }
}

/** Fallback: tenta spreadsheets.get com range; se falhar, não usa. */
export async function readSheetValuesBySheetName(
  sheetName: string,
  spreadsheetId: string
): Promise<{ values: string[][]; error?: string }> {
  return readSheetValuesByTitleFromFullSpreadsheet(spreadsheetId, sheetName);
}

/** Fallback: lê via batchGet (às vezes aceita range com espaço no nome da aba). */
async function readSheetValuesBatchGet(
  spreadsheetId: string,
  range: string
): Promise<{ values: string[][]; error?: string }> {
  const api = getSheets();
  if (!api) return { values: [], error: 'Credenciais não configuradas' };
  try {
    const res = await api.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: [range],
    });
    const valueRanges = (res.data.valueRanges ?? []) as { values?: string[][] }[];
    const raw = valueRanges[0]?.values ?? [];
    const values = raw.map((row: string[]) =>
      row.map((c) => (c ?? '').toString().trim())
    );
    return { values };
  } catch (e) {
    return { values: [], error: normalizeSheetsError(e) };
  }
}
