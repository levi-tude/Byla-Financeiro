/**
 * Adapter: implementa IFluxoPlanilhaRepository usando Google Sheets API.
 * Planilha CONTROLE DE CAIXA, aba do mês (ex.: MARÇO 26).
 */

import { readSheetValues } from '../services/sheetsService.js';
import { config } from '../config.js';
import { nomeAbaControleDeCaixa, mesAnoParaAbaControleDeCaixa, mesAnoAnterior } from '../domain/MesAno.js';
import { criarFluxoPlanilhaVazio } from '../domain/FluxoPlanilhaTotais.js';
import type { IFluxoPlanilhaRepository } from '../ports/IFluxoPlanilhaRepository.js';
import type { FluxoPlanilhaTotais } from '../domain/FluxoPlanilhaTotais.js';
import type { MesAno } from '../domain/MesAno.js';

function parseValor(s: string): number | null {
  const n = s.replace(/\s/g, '').replace(/R\$\s?/i, '').replace(/\./g, '').replace(',', '.');
  const v = parseFloat(n);
  return Number.isFinite(v) ? v : null;
}

/** Parse "0-1,2-3,4-5,7-8" -> [[0,1],[2,3],[4,5],[7,8]]. Coluna G (6) fica de fora se usar 7-8. */
function parseParesColunas(s: string): [number, number][] {
  if (!s.trim()) return [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]];
  const out: [number, number][] = [];
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    const [a, b] = p.split('-').map((x) => parseInt(x.trim(), 10));
    if (Number.isFinite(a) && Number.isFinite(b)) out.push([a, b]);
  }
  return out.length > 0 ? out : [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]];
}

export class PlanilhaFluxoAdapter implements IFluxoPlanilhaRepository {
  private readonly fluxoSpreadsheetId = config.sheets.fluxoSpreadsheetId;

  async obterTotais(mesAno: MesAno): Promise<{ totais: FluxoPlanilhaTotais; error?: string; fallbackMessage?: string }> {
    if (!this.fluxoSpreadsheetId) {
      return { totais: criarFluxoPlanilhaVazio(), error: 'GOOGLE_SHEETS_FLUXO_ID não configurado' };
    }
    const mesAnoAba = mesAnoParaAbaControleDeCaixa(mesAno.mes, mesAno.ano);
    let range = `${nomeAbaControleDeCaixa(mesAnoAba)}!A:Z`;
    let { values, error: sheetError } = await readSheetValues(range, this.fluxoSpreadsheetId);
    let fallbackMessage: string | undefined;

    if (sheetError && (sheetError.includes('Unable to parse range') || sheetError.includes('not found') || sheetError.includes('ABRIL') || sheetError.includes('MAIO'))) {
      const abaAnterior = mesAnoAnterior(mesAnoAba);
      const rangeFallback = `${nomeAbaControleDeCaixa(abaAnterior)}!A:Z`;
      const resFallback = await readSheetValues(rangeFallback, this.fluxoSpreadsheetId);
      if (!resFallback.error && (resFallback.values?.length ?? 0) > 0) {
        values = resFallback.values;
        sheetError = undefined;
        range = rangeFallback;
        fallbackMessage = `Aba ${nomeAbaControleDeCaixa(mesAnoAba)} ainda não existe na planilha. Exibindo dados da aba ${nomeAbaControleDeCaixa(abaAnterior)} (mês anterior).`;
      }
    }

    const totais = criarFluxoPlanilhaVazio();
    totais.mes = mesAno.mes;
    totais.ano = mesAno.ano;
    totais.aba = range.split('!')[0] ?? null;

    let entradaTotal: number | null = null;
    let saidaTotal: number | null = null;
    let lucroTotal: number | null = null;

    const paresColunas = parseParesColunas(config.sheets.fluxoParesColunas);
    const porColuna: { label: string; valor: string; valorNum?: number }[][] = [];

    for (const row of values) {
      paresColunas.forEach(([colLabel, colValor], pairIndex) => {
        const label = (row[colLabel] ?? '').toString().trim();
        const valorStr = (row[colValor] ?? '').toString().trim();
        if (!label && !valorStr) return;
        const labelFinal = label || valorStr;
        const valorNum = parseValor(valorStr);
        if (!porColuna[pairIndex]) porColuna[pairIndex] = [];
        const item = { label: labelFinal, valor: valorStr, valorNum: valorNum ?? undefined };
        totais.linhas.push(item);
        porColuna[pairIndex].push(item);
        const l = labelFinal.toUpperCase();
        if (l.includes('ENTRADA TOTAL') && !l.includes('SAÍDA') && !l.includes('SAIDA')) entradaTotal = valorNum;
        if (l.includes('SAÍDA TOTAL') || l.includes('SAIDA TOTAL')) saidaTotal = valorNum;
        if (l.includes('LUCRO TOTAL')) lucroTotal = valorNum;
      });
    }

    totais.porColuna = porColuna;

    totais.entradaTotal = entradaTotal;
    totais.saidaTotal = saidaTotal;
    totais.lucroTotal = lucroTotal;

    if (lucroTotal == null && entradaTotal != null && saidaTotal != null) {
      totais.lucroTotal = entradaTotal - saidaTotal;
    }

    return { totais, error: sheetError, fallbackMessage };
  }
}
