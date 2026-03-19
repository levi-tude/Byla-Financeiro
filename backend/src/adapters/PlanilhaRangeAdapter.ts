/**
 * Adapter: lê qualquer aba/range da planilha FLUXO DE CAIXA BYLA.
 * Usado para Modalidades, Pendencias e outras abas.
 */

import { readSheetRange } from '../services/sheetsService.js';
import { config } from '../config.js';
import type { IPlanilhaRangeRepository, PlanilhaRow } from '../ports/IPlanilhaRangeRepository.js';

export class PlanilhaRangeAdapter implements IPlanilhaRangeRepository {
  private readonly spreadsheetId = config.sheets.spreadsheetId;

  async listar(range: string): Promise<{ rows: PlanilhaRow[]; error?: string }> {
    if (!this.spreadsheetId) return { rows: [], error: 'GOOGLE_SHEETS_SPREADSHEET_ID não configurado' };
    const result = await readSheetRange(range, this.spreadsheetId);
    return { rows: result.rows as PlanilhaRow[], error: result.error };
  }
}
