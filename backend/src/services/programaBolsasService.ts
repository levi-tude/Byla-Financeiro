/**
 * Carrega o Programa de Bolsas da planilha FLUXO (aba BYLA DANÇA).
 */
import { config } from '../config.js';
import {
  getDeteccaoAutomaticaParaAba,
  getLimiteAtivosParaAba,
  parsearAbaEmBlocos,
} from '../logic/parsePlanilhaPorBlocos.js';
import {
  mapLinhasParaProgramaBolsas,
  type ProgramaBolsasPayload,
} from '../logic/programaBolsasMap.js';
import { readSheetValues, readSheetValuesBySheetName } from './sheetsService.js';

const ABA_PADRAO = 'BYLA DANÇA';

function rangeAba(nomeAba: string, cols: string): string {
  const precisaAspas = /[\s']/.test(nomeAba);
  const aba = precisaAspas ? `'${String(nomeAba).replace(/'/g, "''")}'` : nomeAba;
  return `${aba}!${cols}`;
}

export async function carregarProgramaBolsas(
  aba = ABA_PADRAO,
): Promise<{ data?: ProgramaBolsasPayload; error?: string }> {
  const spreadsheetId = config.sheets.spreadsheetId;
  if (!spreadsheetId) {
    return { error: 'Planilha FLUXO BYLA não configurada (GOOGLE_SHEETS_SPREADSHEET_ID).' };
  }

  const cols = 'A:Z';
  let { values, error } = await readSheetValues(rangeAba(aba, cols), spreadsheetId);
  if (error || !values || values.length === 0) {
    const fb = await readSheetValuesBySheetName(aba, spreadsheetId);
    values = fb.values;
    error = fb.error;
  }
  if (error) return { error };
  if (!values || values.length === 0) {
    return {
      data: {
        aba,
        origem: 'programa_bolsas',
        atualizadoEm: new Date().toISOString(),
        itens: [],
      },
    };
  }

  const limite = getLimiteAtivosParaAba(aba) ?? Number.MAX_SAFE_INTEGER;
  const deteccao = getDeteccaoAutomaticaParaAba(aba);
  const parseadas = parsearAbaEmBlocos(values, aba, limite, deteccao);
  const data = mapLinhasParaProgramaBolsas({
    aba,
    linhas: parseadas.map((p) => ({
      row: p.row,
      secao: p.secao,
      modalidade: p.modalidade,
    })),
  });
  return { data };
}
