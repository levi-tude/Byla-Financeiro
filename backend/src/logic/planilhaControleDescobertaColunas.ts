/**
 * Descobre blocos de SAÍDAS pela primeira linha da aba (layout varia entre meses)
 * e extrai pares rótulo + valor na coluna do bloco.
 */

import type { LinhaPlanilha, SaidaBlocoPlanilha } from '../domain/FluxoPlanilhaTotais.js';
import {
  isLinhaSubtotalOuTotalSecao,
  isLinhaTotalGeralPlanilha,
  normalizarTituloBlocoSaida,
  parseValor,
} from './planilhaControleSaidas.js';

function normalizeLabel(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\uFFFD/g, 'A')
    .toUpperCase()
    .trim();
}

function isNumericLike(cell: string): boolean {
  return parseValor(cell) != null;
}

function pickNumberAfterLabel(row: string[], labelIndex: number): number | null {
  const cells = row.map((c) => (c ?? '').toString().trim());
  for (let j = labelIndex + 1; j <= Math.min(labelIndex + 4, cells.length - 1); j++) {
    const n = parseValor(cells[j]);
    if (n != null) return n;
  }
  for (let j = labelIndex + 5; j < cells.length; j++) {
    const n = parseValor(cells[j]);
    if (n != null) return n;
  }
  for (let j = cells.length - 1; j >= 0; j--) {
    if (j === labelIndex) continue;
    const n = parseValor(cells[j]);
    if (n != null) return n;
  }
  return null;
}

export type TipoBlocoColuna = 'parceiros' | 'fixas' | 'aluguel';

function tituloPorTipo(t: TipoBlocoColuna): string {
  if (t === 'parceiros') return 'Saídas Parceiros';
  if (t === 'fixas') return 'Saídas Fixas';
  return 'Saídas Aluguel';
}

/** Classifica célula da linha 1 da aba CONTROLE (cabeçalho de bloco). */
export function classificarCabecalhoColunaSaida(text: string): TipoBlocoColuna | null {
  const u = normalizeLabel(text);
  if (!u || u.length < 4) return null;
  if (u.includes('ENTRADA') && !u.includes('SAIDA')) return null;
  if (u.includes('PARCEIRO') && u.includes('ENTRADA')) return null;

  if (u.includes('ALUGUEL') && u.includes('SAIDA') && !u.includes('ENTRADA')) return 'aluguel';

  if (u.includes('PARCEIRO') && (u.includes('SAIDA') || u.includes('SAIDAS'))) return 'parceiros';
  if (u.includes('TOTAL') && u.includes('SAIDA') && !u.includes('FIXA') && !u.includes('GASTO') && !u.includes('ENTRADA')) {
    return 'parceiros';
  }

  if (
    u.includes('GASTOS FIXOS') ||
    u.includes('SAIDAS FIXAS') ||
    u.includes('SAIDAS FIXA') ||
    (u.includes('FIXAS') && u.includes('SAIDA')) ||
    (u.includes('FIXO') && u.includes('SAIDA') && !u.includes('PARCEIRO'))
  ) {
    return 'fixas';
  }

  return null;
}

function descobrirColunasSaida(row0: string[]): { col: number; tipo: TipoBlocoColuna }[] {
  const out: { col: number; tipo: TipoBlocoColuna }[] = [];
  const seen = new Set<number>();
  for (let c = 0; c < row0.length; c++) {
    const t = classificarCabecalhoColunaSaida(row0[c] ?? '');
    if (!t) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push({ col: c, tipo: t });
  }
  return out;
}

function linhaValidaDetalhe(label: string): boolean {
  const t = label.trim();
  if (!t || isNumericLike(t)) return false;
  if (isLinhaTotalGeralPlanilha(t) || isLinhaSubtotalOuTotalSecao(t)) return false;
  const u = normalizeLabel(t);
  if (u === 'LUCRO' || u.includes('LUCRO TOTAL')) return false;
  if (u.includes('ENTRADA TOTAL') || u.includes('SAIDA TOTAL') || u.includes('SAIDAS TOTAL')) return false;
  return true;
}

function extrairLinhasDoBlocoColuna(values: string[][], col: number): LinhaPlanilha[] {
  const linhas: LinhaPlanilha[] = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r] ?? [];
    const label = (row[col] ?? '').trim();
    if (!linhaValidaDetalhe(label)) continue;
    let valorNum = parseValor((row[col + 1] ?? '').toString());
    if (valorNum == null) valorNum = pickNumberAfterLabel(row, col);
    if (valorNum == null || valorNum < 0) continue;
    linhas.push({ label, valor: String(valorNum), valorNum });
  }
  return linhas;
}

/** Extrai blocos de saída usando só a linha de cabeçalho + colunas pareadas (label | valor). */
export function extrairBlocosSaidasPorDescobertaColunas(values: string[][] | undefined): SaidaBlocoPlanilha[] {
  if (!values?.length) return [];
  const row0 = values[0] ?? [];
  const blocos = descobrirColunasSaida(row0);
  if (blocos.length === 0) return [];

  const out: SaidaBlocoPlanilha[] = [];
  for (const { col, tipo } of blocos) {
    const linhas = extrairLinhasDoBlocoColuna(values, col);
    if (linhas.length === 0) continue;
    out.push({
      titulo: normalizarTituloBlocoSaida(tituloPorTipo(tipo)),
      linhas,
    });
  }
  return out;
}
