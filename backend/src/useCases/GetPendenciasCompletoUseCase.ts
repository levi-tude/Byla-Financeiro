/**
 * Caso de uso: obter lista de pendências de pagamento.
 * Regra: planilha prevalece (mais verificada); fallback Supabase.
 */

import { mergePriorizarPlanilha, mergePriorizarSupabase } from '../logic/merge.js';
import type { IPendenciasRepository } from '../ports/IPendenciasRepository.js';
import type { IPlanilhaRangeRepository } from '../ports/IPlanilhaRangeRepository.js';
import type { OrigemDados } from '../domain/OrigemDados.js';

const REGRA_PLANILHA = 'Pendências: planilhas prevalecem (modo legado). docs/REGRAS_FONTES_SUPABASE_PLANILHAS.md';
const REGRA_SUPABASE = 'Pendências: Supabase prevalece (fonte principal); planilha apenas fallback temporário.';

function useSupabaseAsPrimary(): boolean {
  return (process.env.BYLA_SOURCE_CADASTRO_PRIMARY ?? 'supabase').trim().toLowerCase() === 'supabase';
}

export interface GetPendenciasCompletoResult {
  combinado: Record<string, unknown>[];
  origem: OrigemDados;
  regra_usada: string;
  sheet_error?: string;
}

export class GetPendenciasCompletoUseCase {
  constructor(
    private readonly pendenciasRepo: IPendenciasRepository,
    private readonly planilhaRepo: IPlanilhaRangeRepository
  ) {}

  async execute(range?: string): Promise<GetPendenciasCompletoResult> {
    const rangeToUse = range ?? process.env.GOOGLE_SHEETS_PENDENCIAS_RANGE ?? process.env.GOOGLE_SHEETS_RANGE ?? 'Pendencias!A:Z';
    const supabaseRows = await this.pendenciasRepo.listarPendentes();
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
