/**
 * Adapter: implementa IFluxoPlanilhaRepository usando Google Sheets API.
 * Planilha CONTROLE DE CAIXA, aba do mês (ex.: MARÇO 26).
 */

import { readSheetValues } from '../services/sheetsService.js';
import { config } from '../config.js';
import { rangeA1ZQuoted, tituloAbaControleParaMesReferencia } from '../domain/MesAno.js';
import { criarFluxoPlanilhaVazio } from '../domain/FluxoPlanilhaTotais.js';
import {
  extrairBlocosSaidasPorColunas,
  extrairBlocosSaidasPorOrdemLinhas,
  mergeBlocosSaidasPorTitulo,
  normalizarTituloBlocoSaida,
  parseValor,
  somaSaidasParceirosEFixas,
} from '../logic/planilhaControleSaidas.js';
import { extrairBlocosSaidasPorDescobertaColunas } from '../logic/planilhaControleDescobertaColunas.js';
import { filtrarEntradasQueColidemComSaidas, mergeEntradasColunaEOrdem } from '../logic/planilhaControleEntradas.js';
import type { IFluxoPlanilhaRepository } from '../ports/IFluxoPlanilhaRepository.js';
import type { FluxoPlanilhaTotais } from '../domain/FluxoPlanilhaTotais.js';
import type { MesAno } from '../domain/MesAno.js';

function normalizeLabel(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\uFFFD/g, 'A')
    .toUpperCase()
    .trim();
}

function isEntradaTotalLabel(label: string): boolean {
  const l = normalizeLabel(label);
  return l.includes('ENTRADA TOTAL') || l.includes('TOTAL ENTRADA') || l.includes('TOTAL DE ENTRADA');
}

function isSaidaTotalLabel(label: string): boolean {
  const l = normalizeLabel(label);
  return l.includes('SAIDA TOTAL') || l.includes('TOTAL SAIDA') || l.includes('TOTAL DE SAIDA');
}

function isLucroTotalLabel(label: string): boolean {
  const l = normalizeLabel(label);
  return l.includes('LUCRO TOTAL') || l.includes('RESULTADO TOTAL') || l === 'LUCRO';
}

function pickFirstNumberInRow(row: string[], preferredIndex?: number): number | null {
  if (preferredIndex != null) {
    for (let i = preferredIndex + 1; i < row.length; i++) {
      const n = parseValor((row[i] ?? '').toString());
      if (n != null) return n;
    }
  }
  for (let i = row.length - 1; i >= 0; i--) {
    const n = parseValor((row[i] ?? '').toString());
    if (n != null) return n;
  }
  return null;
}

function isNumericLike(cell: string): boolean {
  return parseValor(cell) != null;
}

function isLikelyHeader(label: string): boolean {
  const l = normalizeLabel(label);
  return (
    l.includes('ENTRADA') ||
    l.includes('SAIDA') ||
    l.includes('GASTO') ||
    l.includes('DESPESA') ||
    l.includes('ALUGUEL') ||
    l.includes('PARCEIRO') ||
    l.includes('COWORKING')
  );
}

function isDetailLineLabel(label: string): boolean {
  const l = normalizeLabel(label);
  if (!l) return false;
  if (isEntradaTotalLabel(l) || isSaidaTotalLabel(l) || isLucroTotalLabel(l)) return false;
  if (l === 'TOTAL' || l.includes('SUBTOTAL')) return false;
  if (l.includes('ENTRADA') && l.includes('TOTAL')) return false;
  if (l.includes('SAIDA') && l.includes('TOTAL')) return false;
  return true;
}

function classifySectionLabel(label: string): 'entrada' | 'saida' | null {
  const l = normalizeLabel(label);
  const isEntrada =
    (l.includes('ENTRADA') && !l.includes('SAIDA')) ||
    l.includes('RECEITA') ||
    l.includes('MENSALIDADE');
  const isSaida = l.includes('SAIDA') || l.includes('DESPESA') || l.includes('GASTO') || l.includes('CUSTO');
  if (isEntrada && !isSaida) return 'entrada';
  if (isSaida) return 'saida';
  return null;
}

function inferRowLabelAndValue(row: string[]): { label: string; value: number | null } | null {
  const cells = row.map((c) => (c ?? '').toString().trim());
  if (cells.every((c) => !c)) return null;

  let labelIndex = -1;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c || isNumericLike(c)) continue;
    if (labelIndex === -1) labelIndex = i;
    if (isLikelyHeader(c)) {
      labelIndex = i;
      break;
    }
  }
  if (labelIndex === -1) return null;
  const label = cells[labelIndex];
  const value = pickFirstNumberInRow(cells, labelIndex);
  return { label, value };
}

function inferTotalsFromStructure(rows: { label: string; value: number | null }[]): { entrada: number | null; saida: number | null } {
  let secao: 'entrada' | 'saida' | null = null;
  let somaEntrada = 0;
  let somaSaida = 0;

  for (const r of rows) {
    const label = r.label;
    const value = r.value;
    const secaoLabel = classifySectionLabel(label);
    if (secaoLabel) {
      secao = secaoLabel;
      continue;
    }
    if (!isDetailLineLabel(label) || value == null) continue;
    if (secao === 'entrada') somaEntrada += Math.abs(value);
    if (secao === 'saida') somaSaida += Math.abs(value);
  }

  return {
    entrada: somaEntrada > 0 ? round2(somaEntrada) : null,
    saida: somaSaida > 0 ? round2(somaSaida) : null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function reconcileLucro(
  entradaTotal: number | null,
  saidaTotal: number | null,
  lucroLido: number | null,
): number | null {
  if (entradaTotal == null || saidaTotal == null) return lucroLido;
  const calculado = round2(entradaTotal - saidaTotal);
  if (lucroLido == null) return calculado;

  // Se o valor lido divergir muito do fechamento matemático, prioriza o cálculo.
  const diff = Math.abs(lucroLido - calculado);
  const tolerancia = Math.max(0.05, Math.abs(calculado) * 0.02);
  return diff > tolerancia ? calculado : lucroLido;
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

  async obterTotais(
    mesAno: MesAno
  ): Promise<{ totais: FluxoPlanilhaTotais; error?: string; fallbackMessage?: string; origem?: 'supabase' | 'planilha' | 'erro' }> {
    if (!this.fluxoSpreadsheetId) {
      return { totais: criarFluxoPlanilhaVazio(), error: 'GOOGLE_SHEETS_FLUXO_ID não configurado', origem: 'erro' };
    }
    const tituloAba = tituloAbaControleParaMesReferencia(mesAno.mes, mesAno.ano);
    const range = rangeA1ZQuoted(tituloAba);
    const { values, error: sheetError } = await readSheetValues(range, this.fluxoSpreadsheetId);

    const totais = criarFluxoPlanilhaVazio();
    totais.mes = mesAno.mes;
    totais.ano = mesAno.ano;
    totais.aba = tituloAba;

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
        if (isEntradaTotalLabel(labelFinal)) entradaTotal = valorNum;
        if (isSaidaTotalLabel(labelFinal)) saidaTotal = valorNum;
        if (isLucroTotalLabel(labelFinal)) lucroTotal = valorNum;
      });
    }

    // Fallback para abas em que os rótulos ficam em uma coluna e o número em outra fora dos pares configurados.
    if (entradaTotal == null || saidaTotal == null || lucroTotal == null) {
      type Pending = 'entrada' | 'saida' | 'lucro' | null;
      let pending: Pending = null;
      for (const row of values) {
        let handled = false;
        for (let i = 0; i < row.length; i++) {
          const cell = (row[i] ?? '').toString().trim();
          if (!cell) continue;
          if (isEntradaTotalLabel(cell)) {
            const n = pickFirstNumberInRow(row, i);
            if (n != null) entradaTotal = n;
            else pending = 'entrada';
            handled = true;
            break;
          }
          if (isSaidaTotalLabel(cell)) {
            const n = pickFirstNumberInRow(row, i);
            if (n != null) saidaTotal = n;
            else pending = 'saida';
            handled = true;
            break;
          }
          if (isLucroTotalLabel(cell)) {
            const n = pickFirstNumberInRow(row, i);
            if (n != null) lucroTotal = n;
            else pending = 'lucro';
            handled = true;
            break;
          }
        }
        if (handled) continue;
        if (pending) {
          const rowHasTotal = row.some((c) => normalizeLabel((c ?? '').toString()) === 'TOTAL');
          if (rowHasTotal) {
            const n = pickFirstNumberInRow(row);
            if (n != null) {
              if (pending === 'entrada' && entradaTotal == null) entradaTotal = n;
              if (pending === 'saida' && saidaTotal == null) saidaTotal = n;
              if (pending === 'lucro' && lucroTotal == null) lucroTotal = n;
              pending = null;
            }
          }
        }
      }
    }

    // Fallback semântico: infere totais por estrutura da aba (seções entrada/saída + soma de linhas detalhe).
    const smartRows = values
      .map((row) => inferRowLabelAndValue(row))
      .filter((x): x is { label: string; value: number | null } => !!x);
    const inferred = inferTotalsFromStructure(smartRows);
    if (entradaTotal == null && inferred.entrada != null) entradaTotal = inferred.entrada;
    if (saidaTotal == null && inferred.saida != null) saidaTotal = inferred.saida;

    totais.porColuna = porColuna;

    const blocosPorDescoberta = extrairBlocosSaidasPorDescobertaColunas(values);
    const blocosPorLinha = extrairBlocosSaidasPorOrdemLinhas(values);
    const blocosPorColuna = extrairBlocosSaidasPorColunas(porColuna);
    totais.saidasBlocos = mergeBlocosSaidasPorTitulo(
      mergeBlocosSaidasPorTitulo(blocosPorDescoberta, blocosPorLinha),
      blocosPorColuna,
    );

    totais.entradasBlocos = filtrarEntradasQueColidemComSaidas(
      mergeEntradasColunaEOrdem(porColuna, values),
      totais.saidasBlocos,
    );

    const blocos = totais.saidasBlocos ?? [];
    const somaParceirosFixas = somaSaidasParceirosEFixas(blocos);
    let sumParc = 0;
    let sumFix = 0;
    for (const b of blocos) {
      const nt = normalizarTituloBlocoSaida(b.titulo);
      for (const l of b.linhas) {
        const v = Math.abs(l.valorNum ?? parseValor(l.valor) ?? 0);
        if (nt === 'Saídas Parceiros') sumParc += v;
        if (nt === 'Saídas Fixas') sumFix += v;
      }
    }
    const round2 = (n: number) => Math.round(n * 100) / 100;
    totais.saidaParceirosTotal = sumParc > 0 ? round2(sumParc) : null;
    totais.saidaFixasTotal = sumFix > 0 ? round2(sumFix) : null;
    totais.saidaSomaSecoesPrincipais = somaParceirosFixas > 0 ? round2(somaParceirosFixas) : null;

    if ((saidaTotal == null || saidaTotal === 0) && totais.saidaSomaSecoesPrincipais != null && totais.saidaSomaSecoesPrincipais > 0) {
      saidaTotal = totais.saidaSomaSecoesPrincipais;
    }

    totais.entradaTotal = entradaTotal;
    totais.saidaTotal = saidaTotal;
    totais.lucroTotal = reconcileLucro(entradaTotal, saidaTotal, lucroTotal);

    return { totais, error: sheetError, origem: sheetError ? 'erro' : 'planilha' };
  }
}
