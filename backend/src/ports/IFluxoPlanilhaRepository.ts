/**
 * Porta: leitura de totais da planilha CONTROLE DE CAIXA (aba do mês).
 * Implementada por adapter que usa Google Sheets API.
 */

import type { FluxoPlanilhaTotais } from '../domain/FluxoPlanilhaTotais.js';
import type { MesAno } from '../domain/MesAno.js';

export interface IFluxoPlanilhaRepository {
  obterTotais(
    mesAno: MesAno
  ): Promise<{ totais: FluxoPlanilhaTotais; error?: string; fallbackMessage?: string; origem?: 'supabase' | 'planilha' | 'erro' }>;
}
