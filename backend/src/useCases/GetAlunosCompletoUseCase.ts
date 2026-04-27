/**
 * Caso de uso: obter lista de alunos completos.
 * Regra: planilha prevalece (REGRAS_FONTES_SUPABASE_PLANILHAS); fallback Supabase.
 * Retorna dados agrupados por aba e, dentro de cada aba, por modalidade.
 */

import { mergePriorizarPlanilha, mergePriorizarSupabase } from '../logic/merge.js';
import type { IAlunosRepository } from '../ports/IAlunosRepository.js';
import type { IPlanilhaAlunosRepository } from '../ports/IPlanilhaAlunosRepository.js';
import type { OrigemDados } from '../domain/OrigemDados.js';

const REGRA_PLANILHA = 'Alunos: planilhas prevalecem (modo legado). docs/REGRAS_FONTES_SUPABASE_PLANILHAS.md';
const REGRA_SUPABASE = 'Alunos: Supabase prevalece (fonte principal); planilha apenas fallback temporário.';

function useSupabaseAsPrimary(): boolean {
  return (process.env.BYLA_SOURCE_CADASTRO_PRIMARY ?? 'supabase').trim().toLowerCase() === 'supabase';
}

/** Colunas que indicam modalidade (ou vinda do parser de blocos: _modalidade). */
const COLS_MODALIDADE = ['_modalidade', 'MODALIDADE', 'MODALIDADE ', 'Modalidade', 'TIPO', 'Tipo', 'ATIVIDADE', 'Atividade'];

function obterModalidade(row: Record<string, unknown>): string {
  for (const col of COLS_MODALIDADE) {
    const v = row[col];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

/** Agrupa linhas por aba e, dentro de cada aba, por modalidade. */
function agruparPorAbaEModalidade(rows: Record<string, unknown>[]): GetAlunosCompletoResult['por_aba'] {
  const porAba: GetAlunosCompletoResult['por_aba'] = {};
  for (const row of rows) {
    const aba = String(row['_aba'] ?? row['_modalidade_aba'] ?? '').trim() || 'Geral';
    if (!porAba[aba]) {
      porAba[aba] = { rows: [], colunas: [], por_modalidade: {} };
    }
    porAba[aba].rows.push(row);
    const mod = obterModalidade(row);
    const modKey = mod || '(sem modalidade)';
    if (!porAba[aba].por_modalidade[modKey]) porAba[aba].por_modalidade[modKey] = [];
    porAba[aba].por_modalidade[modKey].push(row);
  }
  for (const aba of Object.keys(porAba)) {
    const allKeys = new Set<string>();
    for (const r of porAba[aba].rows) Object.keys(r).forEach((k) => allKeys.add(k));
    porAba[aba].colunas = [...allKeys].sort((a, b) => {
      if (a === '_aba') return -1;
      if (b === '_aba') return 1;
      return a.localeCompare(b);
    });
  }
  return porAba;
}

export interface GetAlunosCompletoResult {
  combinado: Record<string, unknown>[];
  origem: OrigemDados;
  regra_usada: string;
  sheet_error?: string;
  abas_lidas?: string[];
  /** Dados agrupados por aba e, dentro de cada aba, por modalidade. */
  por_aba: Record<string, { rows: Record<string, unknown>[]; colunas: string[]; por_modalidade: Record<string, Record<string, unknown>[]> }>;
}

export class GetAlunosCompletoUseCase {
  constructor(
    private readonly alunosRepo: IAlunosRepository,
    private readonly planilhaRepo: IPlanilhaAlunosRepository
  ) {}

  async execute(range?: string, useTodasAbas = false): Promise<GetAlunosCompletoResult> {
    const supabaseRows = await this.alunosRepo.listar();
    let planilhaRows: { [key: string]: string | number }[];
    let sheetError: string | undefined;
    let abasLidas: string[] | undefined;
    if (useTodasAbas && typeof this.planilhaRepo.listarTodasAbas === 'function') {
      const res = await this.planilhaRepo.listarTodasAbas();
      planilhaRows = res.rows as { [key: string]: string | number }[];
      sheetError = res.error;
      abasLidas = res.abas;
    } else {
      const rangeToUse = range ?? 'ATENDIMENTOS!A:Z';
      const res = await this.planilhaRepo.listar(rangeToUse);
      planilhaRows = res.rows as { [key: string]: string | number }[];
      sheetError = res.error;
    }
    const merged = useSupabaseAsPrimary()
      ? mergePriorizarSupabase(planilhaRows, supabaseRows as Record<string, unknown>[], REGRA_SUPABASE)
      : mergePriorizarPlanilha(planilhaRows, supabaseRows as Record<string, unknown>[], REGRA_PLANILHA);
    let porAba = agruparPorAbaEModalidade(merged.combinado as Record<string, unknown>[]);
    if (abasLidas?.length) {
      for (const nomeAba of abasLidas) {
        if (!porAba[nomeAba]) {
          porAba = { ...porAba, [nomeAba]: { rows: [], colunas: [], por_modalidade: {} } };
        }
      }
    }
    return {
      combinado: merged.combinado,
      origem: merged.origem,
      regra_usada: merged.regra_usada,
      sheet_error: sheetError,
      abas_lidas: abasLidas,
      por_aba: porAba,
    };
  }
}
