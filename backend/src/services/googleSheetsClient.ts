import { google, sheets_v4 } from 'googleapis';
import { config, hasSheetsCredentials } from '../config.js';

/**
 * Cliente Google Sheets com escopos configuráveis (leitura ou escrita).
 * Evita misturar escopo readonly do sheetsService com scripts de sync.
 */
export function createSheetsApi(
  scopes: readonly string[] = ['https://www.googleapis.com/auth/spreadsheets.readonly'],
): sheets_v4.Sheets | null {
  if (!hasSheetsCredentials()) return null;
  try {
    if (config.sheets.credentialsJson) {
      const cred = JSON.parse(config.sheets.credentialsJson) as { client_email?: string; private_key?: string };
      const auth = new google.auth.GoogleAuth({
        credentials: cred,
        scopes: [...scopes],
      });
      google.options({ timeout: 60000 });
      return google.sheets({ version: 'v4', auth });
    }
    if (config.sheets.credentialsPath) {
      const auth = new google.auth.GoogleAuth({
        keyFile: config.sheets.credentialsPath,
        scopes: [...scopes],
      });
      google.options({ timeout: 60000 });
      return google.sheets({ version: 'v4', auth });
    }
  } catch {
    return null;
  }
  return null;
}
