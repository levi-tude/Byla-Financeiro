/**
 * Adapter: implementa IPlanilhaAlunosRepository usando Google Sheets API.
 * Planilha FLUXO DE CAIXA BYLA.
 * Abas com estrutura em blocos (BYLA DANÇA, PILATES MARINA, etc.): usa parser por blocos e limite de linha (ativos/inativos).
 * Demais abas: leitura com primeira linha como cabeçalho.
 */

import { readSheetRange, readSheetValues, readSheetValuesBySheetName, listSheetNames } from '../services/sheetsService.js';
import { config } from '../config.js';
import {
  parsearAbaEmBlocos,
  getLimiteAtivosParaAba,
  CONFIG_ABAS_BLOCOS,
} from '../logic/parsePlanilhaPorBlocos.js';
import type { IPlanilhaAlunosRepository, PlanilhaRow } from '../ports/IPlanilhaAlunosRepository.js';

/** Abas que não contêm listas de alunos. */
const ABAS_IGNORAR = new Set(['RESUMO', 'INSTRUÇÕES', 'LEIA-ME', 'CONFIG', 'DADOS', 'CÁLCULOS']);

/** Range A1: nome da aba; se tiver espaço, envolve em aspas (ex.: 'PILATES MARINA'!A:Z). */
function rangeAba(nomeAba: string, cols: string): string {
  const precisaAspas = /[\s']/.test(nomeAba);
  const aba = precisaAspas ? `'${String(nomeAba).replace(/'/g, "''")}'` : nomeAba;
  return `${aba}!${cols}`;
}

function abasComBlocos(): Set<string> {
  const set = new Set<string>();
  for (const c of CONFIG_ABAS_BLOCOS) {
    set.add(c.nomeAba.toUpperCase());
  }
  return set;
}

const ABAS_BLOCO_SET = abasComBlocos();

function normalizarLinha(row: PlanilhaRow, aba: string): PlanilhaRow {
  const out = { ...row, _aba: aba, _modalidade_aba: aba };
  const nome = (row['CLIENTE'] ?? row['Cliente'] ?? row['nome'] ?? row['Nome'] ?? row['ALUNO'] ?? '').toString().trim();
  if (nome && !out['nome']) (out as Record<string, unknown>)['nome'] = nome;
  if ((out as Record<string, unknown>)['_ativo'] === undefined) (out as Record<string, unknown>)['_ativo'] = true;
  return out;
}

export class PlanilhaAlunosAdapter implements IPlanilhaAlunosRepository {
  private readonly spreadsheetId = config.sheets.spreadsheetId;
  private readonly defaultRange = process.env.GOOGLE_SHEETS_ALUNOS_RANGE ?? process.env.GOOGLE_SHEETS_RANGE ?? 'ATENDIMENTOS!A:Z';

  async listar(range?: string): Promise<{ rows: PlanilhaRow[]; error?: string }> {
    const r = range ?? this.defaultRange;
    if (!this.spreadsheetId) return { rows: [], error: 'Spreadsheet ID não configurado' };
    let result = await readSheetRange(r, this.spreadsheetId);
    if (result.error && result.error.includes('Unable to parse range') && r === 'ATENDIMENTOS!A:Z') {
      result = await readSheetRange('Página1!A:Z', this.spreadsheetId);
    }
    return { rows: result.rows as PlanilhaRow[], error: result.error };
  }

  async listarTodasAbas(): Promise<{ rows: PlanilhaRow[]; abas: string[]; error?: string }> {
    if (!this.spreadsheetId) return { rows: [], abas: [], error: 'Spreadsheet ID não configurado' };
    const { names: abas, error: listError } = await listSheetNames(this.spreadsheetId);
    if (listError) return { rows: [], abas: [], error: listError };
    const todas: PlanilhaRow[] = [];
    const abasLidas: string[] = [];

    for (const aba of abas) {
      const nomeAba = aba.trim();
      if (!nomeAba || ABAS_IGNORAR.has(nomeAba.toUpperCase())) continue;

      const limite = getLimiteAtivosParaAba(nomeAba);
      if (limite != null && ABAS_BLOCO_SET.has(nomeAba.toUpperCase())) {
        let range = rangeAba(nomeAba, 'A:Z');
        let result = await readSheetValues(range, this.spreadsheetId);
        if (result.error) {
          result = await readSheetValuesBySheetName(nomeAba, this.spreadsheetId);
        }
        const { values, error } = result;
        if (error) continue;
        const parseadas = parsearAbaEmBlocos(values, nomeAba, limite);
        for (const { row } of parseadas) {
          todas.push(row as PlanilhaRow);
        }
        abasLidas.push(nomeAba);
        continue;
      }

      const range = rangeAba(nomeAba, 'A:Z');
      const { rows, error } = await readSheetRange(range, this.spreadsheetId);
      if (error) continue;
      for (const row of rows as PlanilhaRow[]) {
        if (Object.keys(row).length === 0) continue;
        todas.push(normalizarLinha(row, nomeAba));
      }
      abasLidas.push(nomeAba);
    }

    // Garantir que abas da config (ex.: PILATES MARINA) apareçam mesmo se a API não retornou ou a leitura falhou
    const abasSet = new Set(abasLidas.map((a) => a.toUpperCase()));
    for (const c of CONFIG_ABAS_BLOCOS) {
      const key = c.nomeAba.toUpperCase();
      if (!abasSet.has(key)) {
        abasLidas.push(c.nomeAba);
        abasSet.add(key);
      }
    }

    return { rows: todas, abas: abasLidas };
  }
}
