/**
 * Caso de uso: obter totais da planilha CONTROLE DE CAIXA para um mês.
 */

import type { IFluxoPlanilhaRepository } from '../ports/IFluxoPlanilhaRepository.js';
import type { MesAno } from '../domain/MesAno.js';
import { criarMesAno } from '../domain/MesAno.js';

export interface GetFluxoCompletoResult {
  combinado: {
    entradaTotal: number | null;
    saidaTotal: number | null;
    saidaSomaSecoesPrincipais?: number | null;
    saidaParceirosTotal?: number | null;
    saidaFixasTotal?: number | null;
    lucroTotal: number | null;
    linhas: { label: string; valor: string; valorNum?: number }[];
    porColuna?: { label: string; valor: string; valorNum?: number }[][];
    saidasBlocos?: { titulo: string; linhas: { label: string; valor: string; valorNum?: number }[] }[];
    entradasBlocos?: { titulo: string; linhas: { label: string; valor: string; valorNum?: number }[] }[];
    mes: number | null;
    ano: number | null;
    aba: string | null;
  };
  origem: string;
  regra_usada: string;
  sheet_error?: string;
  fallback_message?: string;
}

const REGRA = 'CONTROLE DE CAIXA: Supabase como fonte principal, planilha como fallback temporário.';

export class GetFluxoCompletoUseCase {
  constructor(private readonly fluxoRepo: IFluxoPlanilhaRepository) {}

  async execute(mes?: number, ano?: number): Promise<GetFluxoCompletoResult> {
    let mesAno: MesAno | null = null;
    if (mes != null && ano != null && mes >= 1 && mes <= 12) {
      mesAno = criarMesAno(mes, ano);
    } else {
      const d = new Date();
      mesAno = criarMesAno(d.getMonth() + 1, d.getFullYear());
    }

    const { totais, error: sheetError, fallbackMessage, origem } = await this.fluxoRepo.obterTotais(mesAno);
    return {
      combinado: {
        entradaTotal: totais.entradaTotal,
        saidaTotal: totais.saidaTotal,
        saidaSomaSecoesPrincipais: totais.saidaSomaSecoesPrincipais ?? null,
        saidaParceirosTotal: totais.saidaParceirosTotal ?? null,
        saidaFixasTotal: totais.saidaFixasTotal ?? null,
        lucroTotal: totais.lucroTotal,
        linhas: totais.linhas,
        porColuna: totais.porColuna,
        saidasBlocos: totais.saidasBlocos,
        entradasBlocos: totais.entradasBlocos,
        mes: totais.mes,
        ano: totais.ano,
        aba: totais.aba,
      },
      origem: origem ?? (sheetError ? 'erro' : 'planilha'),
      regra_usada: REGRA,
      sheet_error: sheetError,
      fallback_message: fallbackMessage,
    };
  }
}
