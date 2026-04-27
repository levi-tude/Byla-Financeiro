/**
 * Caso de uso: obter lista de modalidades/atividades completas.
 * Regra: planilha prevalece (REGRAS_FONTES_SUPABASE_PLANILHAS); fallback Supabase.
 */

import { mergePriorizarPlanilha, mergePriorizarSupabase } from '../logic/merge.js';
import type { IAtividadesRepository } from '../ports/IAtividadesRepository.js';
import type { IPlanilhaRangeRepository } from '../ports/IPlanilhaRangeRepository.js';
import type { OrigemDados } from '../domain/OrigemDados.js';

const REGRA_PLANILHA = 'Modalidades: planilhas prevalecem (modo legado). docs/REGRAS_FONTES_SUPABASE_PLANILHAS.md';
const REGRA_SUPABASE = 'Modalidades: Supabase prevalece (fonte principal); planilha apenas fallback temporário.';

function useSupabaseAsPrimary(): boolean {
  return (process.env.BYLA_SOURCE_CADASTRO_PRIMARY ?? 'supabase').trim().toLowerCase() === 'supabase';
}

export interface GetModalidadesCompletoResult {
  combinado: Record<string, unknown>[];
  origem: OrigemDados;
  regra_usada: string;
  sheet_error?: string;
}

export class GetModalidadesCompletoUseCase {
  constructor(
    private readonly atividadesRepo: IAtividadesRepository,
    private readonly planilhaRepo: IPlanilhaRangeRepository
  ) {}

  async execute(range?: string): Promise<GetModalidadesCompletoResult> {
    const rangeToUse = range ?? process.env.GOOGLE_SHEETS_MODALIDADES_RANGE ?? process.env.GOOGLE_SHEETS_RANGE ?? 'Modalidades!A:Z';
    const supabaseRows = await this.atividadesRepo.listar();
    const { rows: planilhaRows, error: sheetError } = await this.planilhaRepo.listar(rangeToUse);
    const merged = useSupabaseAsPrimary()
      ? mergePriorizarSupabase(
          planilhaRows as { [key: string]: string | number }[],
          supabaseRows as Record<string, unknown>[],
          REGRA_SUPABASE
        )
      : mergePriorizarPlanilha(
          planilhaRows as { [key: string]: string | number }[],
          supabaseRows as Record<string, unknown>[],
          REGRA_PLANILHA
        );
    return {
      combinado: merged.combinado,
      origem: merged.origem,
      regra_usada: merged.regra_usada,
      sheet_error: sheetError,
    };
  }
}
