import { config } from '../config.js';
import { readSheetValues, readSheetValuesBySheetName } from './sheetsService.js';
import { parsearAbaEmBlocos, getLimiteAtivosParaAba, type LinhaParseada } from '../logic/parsePlanilhaPorBlocos.js';
import { extrairDiaVencimento } from '../logic/vencimentoPlanilha.js';

export interface PagamentoPlanilha {
  data: string; // YYYY-MM-DD
  forma: string;
  valor: number;
  mes: number; // 1-12
  ano: number;
  /** Competencia do pagamento (mês/ano baseado na coluna do calendário da planilha). */
  mesCompetencia: number; // 1-12
  anoCompetencia: number;
  /** Responsáveis declarados na planilha (quando houver). */
  responsaveis: string[];
  /** Nome do pagador/pix declarado na planilha (quando houver). */
  pagadorPix?: string;
}

export interface PagamentosAluno {
  aluno: string;
  modalidade: string;
  linha: number; // 1-based (planilha)
  /** Dia do mês (1–31) conforme coluna de vencimento na planilha; null se não encontrado. */
  diaVencimento: number | null;
  pagamentos: PagamentoPlanilha[];
}

export interface PagamentosPorAba {
  aba: string;
  ano: number;
  alunos: PagamentosAluno[];
}

function normKey(s: string): string {
  const normalized = s
    .trim()
    .replace(/\u00A0/g, ' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  return normalized.replace(/\s+/g, ' ').toUpperCase();
}

function getCaseInsensitive(obj: Record<string, unknown>, candidates: string[]): unknown | undefined {
  const cand = new Set(candidates.map(normKey));
  for (const k of Object.keys(obj)) {
    const nk = normKey(k);
    if (cand.has(nk)) return obj[k];
  }
  return undefined;
}

function parseMoney(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const raw = String(v).trim();
  if (!raw) return null;

  // Remove currency symbols/letters, keep digits, comma and dot and minus.
  const cleaned = raw.replace(/[^\d,.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === ',' || cleaned === '.') return null;

  // Heurística pt-BR: "1.234,56" -> "1234.56"
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;
  if (hasComma && hasDot) normalized = cleaned.replace(/\./g, '').replace(',', '.');
  else if (hasComma && !hasDot) normalized = cleaned.replace(',', '.');

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return n;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toISODate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseDateParts(v: unknown): { iso: string; year: number; month: number; day: number } | null {
  if (v == null) return null;

  // Google sometimes returns dates as strings (formattedValue). We support the common layouts.
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel/Sheets serial date -> JS Date (base 1899-12-30 => 25569 for Unix)
    const ms = (v - 25569) * 86400 * 1000;
    const dt = new Date(ms);
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth() + 1;
    const day = dt.getUTCDate();
    return { iso: toISODate(year, month, day), year, month, day };
  }

  const raw = String(v).trim();
  if (!raw) return null;

  // YYYY-MM-DD or YYYY-M-D
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    return { iso: toISODate(year, month, day), year, month, day };
  }

  // DD/MM/YYYY
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    return { iso: toISODate(year, month, day), year, month, day };
  }

  // DD-MM-YYYY
  m = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    return { iso: toISODate(year, month, day), year, month, day };
  }

  // YYYY/MM/DD
  m = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    return { iso: toISODate(year, month, day), year, month, day };
  }

  // Fallback: try Date.parse and only accept if we can re-derive year/month/day.
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    const dt = new Date(parsed);
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth() + 1;
    const day = dt.getUTCDate();
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return { iso: toISODate(year, month, day), year, month, day };
    }
  }

  return null;
}

function parseDateCellSmart(
  raw: unknown,
  fallback: { year: number; month: number },
): { iso: string; year: number; month: number; day: number } | null {
  if (raw == null) return null;
  const str = String(raw).trim().replace(/\s+/g, ' ');
  if (!str) return null;

  // Supported:
  // - dd/mm/yyyy, m/d/yyyy (also with missing leading zeros)
  // - dd-mm-yyyy
  // - If year isn't present, use fallback year/month (and treat first number as day)
  const cleaned = str.replace(/-/g, '/');
  const m = cleaned.match(/^(\d{1,3})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(y)) return null;

    // Decide if it's dd/mm or mm/dd.
    // If one side is >12 it must be day.
    let day: number;
    let month: number;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      month = a;
      day = b;
    } else {
      // Ambiguous: prefer using fallback month if it matches one side; otherwise assume dd/mm.
      if (a === fallback.month) {
        month = a;
        day = b;
      } else if (b === fallback.month) {
        month = b;
        day = a;
      } else {
        day = a;
        month = b;
      }
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { iso: toISODate(y, month, day), year: y, month, day };
  }

  // Day only (e.g. "10")
  const md = cleaned.match(/^(\d{1,3})$/);
  if (md) {
    const day = Number(md[1]);
    if (!Number.isFinite(day)) return null;
    if (day < 1 || day > 31) return null;
    const { year, month } = fallback;
    return { iso: toISODate(year, month, day), year, month, day };
  }

  return null;
}

function coerceForma(v: unknown): string {
  const s = v == null ? '' : String(v).trim();
  return s;
}

const MESES_PT: Record<string, number> = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARCO: 3,
  MARO: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
};

function normalizeCellText(s: unknown): string {
  const raw = s == null ? '' : String(s);
  const noDiacritics = raw.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return noDiacritics.trim().toUpperCase().replace(/\u00A0/g, ' ');
}

function normalizeMonthLabel(s: unknown): string {
  // "MARÇO" can come as "MAR�O" in Windows consoles -> remove non letters.
  const base = normalizeCellText(s);
  const lettersOnly = base.replace(/[^A-Z]/g, '');
  return lettersOnly;
}

/** Triplas de colunas por mês (3 = DATA|FORMA|VALOR; 2 = só DATA|FORMA no calendário, valor na coluna VALOR à esquerda). */
export type TripletColunas = { startIdx: number; month: number; year: number; colunas: 2 | 3 };

/** Uma região = um cabeçalho DATA/FORMA/VALOR + linha de meses acima (ex.: 2ª parte da aba YOGA). */
type TripletRegion = {
  paymentHeaderRowIdx: number;
  monthRowIdx: number;
  triplets: TripletColunas[];
};

function rowHasDataFormaValorHeader(norm: string[]): boolean {
  for (let i = 0; i + 2 < norm.length; i++) {
    if (norm[i] === 'DATA' && norm[i + 1] === 'FORMA' && (norm[i + 2] === 'VALOR' || norm[i + 2] === 'VALUE')) {
      return true;
    }
  }
  // YOGA (calendário à direita): às vezes só há DATA|FORMA, sem coluna VALOR no bloco do mês.
  for (let i = 0; i + 1 < norm.length; i++) {
    if (norm[i] === 'DATA' && norm[i + 1] === 'FORMA') return true;
  }
  return false;
}

function findAllPaymentHeaderRowIndices(valuesPadded: string[][]): number[] {
  const out: number[] = [];
  for (let r = 0; r < valuesPadded.length; r++) {
    const norm = (valuesPadded[r] ?? []).map(normalizeCellText);
    if (rowHasDataFormaValorHeader(norm)) out.push(r);
  }
  return out;
}

/** Linha de meses imediatamente acima do cabeçalho DATA/FORMA/VALOR (segunda parte da aba). */
function findMonthRowAbovePaymentHeader(valuesPadded: string[][], paymentHeaderIdx: number): number {
  for (let r = paymentHeaderIdx - 1; r >= 0 && r >= paymentHeaderIdx - 30; r--) {
    const row = valuesPadded[r] ?? [];
    const hasMonth = row.some((c) => {
      const k = normalizeMonthLabel(c);
      return Object.prototype.hasOwnProperty.call(MESES_PT, k);
    });
    if (hasMonth) return r;
  }
  return -1;
}

function findFirstMonthRowIndex(valuesPadded: string[][]): number {
  return valuesPadded.findIndex((row) =>
    (row ?? []).some((c) => Object.prototype.hasOwnProperty.call(MESES_PT, normalizeMonthLabel(c))),
  );
}

/**
 * Com células mescladas na linha de meses, o nome do mês pode estar à esquerda do índice
 * onde começa DATA/FORMA/VALOR (ex.: YOGA com calendário em DM+).
 */
function resolveMonthNumberAtIndex(monthRow: string[], tripletStartIdx: number): number | null {
  const maxLook = 80;
  for (let j = tripletStartIdx; j >= 0 && j >= tripletStartIdx - maxLook; j--) {
    const key = normalizeMonthLabel(monthRow[j]);
    if (key && Object.prototype.hasOwnProperty.call(MESES_PT, key)) {
      return MESES_PT[key as keyof typeof MESES_PT];
    }
  }
  return null;
}

function monthNumFromCell(monthRow: string[], idx: number): number | null {
  const fromLeft = resolveMonthNumberAtIndex(monthRow, idx);
  if (fromLeft != null) return fromLeft;
  const k = normalizeMonthLabel(monthRow[idx]);
  if (!k || !Object.prototype.hasOwnProperty.call(MESES_PT, k)) return null;
  return MESES_PT[k] ?? null;
}

function buildTripletsFromMonthAndPaymentRows(
  monthRow: string[],
  paymentHeaderRow: string[],
  anoFallback: number,
): TripletColunas[] {
  const yearLabels = monthRow
    .map((cell, idx) => ({ cell, idx }))
    .filter((x) => /^\d{4}$/.test(normalizeCellText(x.cell)))
    .map((x) => ({ year: Number(normalizeCellText(x.cell)), idx: x.idx }))
    .sort((a, b) => a.idx - b.idx);

  const firstYear = yearLabels.length ? yearLabels[0].year : anoFallback;

  function yearForStartIndex(startIdx: number): number {
    let last: { year: number; idx: number } | null = null;
    for (const y of yearLabels) {
      if (y.idx < startIdx) last = y;
      else break;
    }
    if (last) return last.year;
    // Sem células "2026" na linha de meses: antes caía em (firstYear - 1) e competência virava ano errado (ex.: 2025 com consulta 2026).
    if (yearLabels.length === 0) return anoFallback;
    return firstYear - 1;
  }

  const triplets: TripletColunas[] = [];
  const seenStart = new Set<number>();

  // Padrão completo: DATA | FORMA | VALOR (3 colunas por mês)
  for (let i = 0; i + 2 < paymentHeaderRow.length; i++) {
    const a = normalizeCellText(paymentHeaderRow[i]);
    const b = normalizeCellText(paymentHeaderRow[i + 1]);
    const c = normalizeCellText(paymentHeaderRow[i + 2]);
    if (a === 'DATA' && b === 'FORMA' && (c === 'VALOR' || c === 'VALUE')) {
      const monthNum = monthNumFromCell(monthRow, i);
      if (monthNum == null) continue;
      const year = yearForStartIndex(i);
      triplets.push({ startIdx: i, month: monthNum, year, colunas: 3 });
      seenStart.add(i);
    }
  }

  // YOGA (e similares): só DATA | FORMA no calendário; valor fica na coluna VALOR à esquerda (A–G).
  for (let i = 0; i + 1 < paymentHeaderRow.length; i++) {
    if (seenStart.has(i)) continue;
    const a = normalizeCellText(paymentHeaderRow[i]);
    const b = normalizeCellText(paymentHeaderRow[i + 1]);
    const c = i + 2 < paymentHeaderRow.length ? normalizeCellText(paymentHeaderRow[i + 2]) : '';
    if (a !== 'DATA' || b !== 'FORMA') continue;
    if (c === 'VALOR' || c === 'VALUE') continue;

    const monthNum = monthNumFromCell(monthRow, i);
    if (monthNum == null) continue;
    const year = yearForStartIndex(i);
    triplets.push({ startIdx: i, month: monthNum, year, colunas: 2 });
  }

  return triplets;
}

/** Aluno pertence ao último bloco DATA/FORMA/VALOR que está acima da linha dele (2ª parte = 2º bloco). */
function pickRegionForLine(regions: TripletRegion[], linha1Based: number): TripletRegion | null {
  if (regions.length === 0) return null;
  const below = regions.filter((r) => r.paymentHeaderRowIdx < linha1Based);
  if (below.length === 0) return regions[0];
  return below.reduce((a, b) => (a.paymentHeaderRowIdx > b.paymentHeaderRowIdx ? a : b));
}

function rangeAba(nomeAba: string, cols: string): string {
  const precisaAspas = /[\s']/.test(nomeAba);
  const aba = precisaAspas ? `'${String(nomeAba).replace(/'/g, "''")}'` : nomeAba;
  return `${aba}!${cols}`;
}

export async function lerPagamentosPorAbaEAno(
  aba: string,
  ano: number,
): Promise<{ alunos: PagamentosAluno[]; error?: string }> {
  const spreadsheetId = config.sheets.spreadsheetId;
  if (!spreadsheetId) return { alunos: [], error: 'Planilha FLUXO BYLA não configurada (GOOGLE_SHEETS_SPREADSHEET_ID).' };

  const limiteAtivos = getLimiteAtivosParaAba(aba) ?? 999999; // se não souber o limite, não corta

  // Precisamos ler mais colunas para capturar os blocos por mês (ex.: JANEIRO / Data / forma / Valor ...).
  // A:ZZZ cobre calendários à direita (ex.: coluna DM+) com folga; override via GOOGLE_SHEETS_PAGAMENTOS_COLS.
  const cols = process.env.GOOGLE_SHEETS_PAGAMENTOS_COLS ?? 'A:ZZZ';
  const range = rangeAba(aba, cols);

  let { values, error } = await readSheetValues(range, spreadsheetId);
  if (error || !values || values.length === 0) {
    // Fallback (algumas abas têm caracteres/acentos que quebram ranges).
    const fb = await readSheetValuesBySheetName(aba, spreadsheetId);
    values = fb.values;
    error = fb.error;
  }
  if (error) return { alunos: [], error };
  if (!values || values.length === 0) return { alunos: [] };

  // Importante: o Google Sheets API pode devolver linhas com comprimentos diferentes
  // (corta colunas vazias no fim). Para o parser transformar colunas de meses em `col_XX`,
  // precisamos padronizar para o mesmo tamanho.
  const maxLen = values.reduce((m, row) => Math.max(m, row.length), 0);
  const valuesPadded = values.map((row) => {
    if (row.length >= maxLen) return row;
    return [...row, ...Array(maxLen - row.length).fill('')];
  });

  // Várias abas (ex.: YOGA) têm duas partes: dois blocos com linha de meses + DATA/FORMA/VALOR.
  // Antes só liamos o primeiro bloco; cada aluno usa o último bloco imediatamente acima da sua linha.
  const paymentHeaderRows = findAllPaymentHeaderRowIndices(valuesPadded);
  if (paymentHeaderRows.length === 0) return { alunos: [] };

  const regions: TripletRegion[] = [];
  const fallbackMonthRowIdx = findFirstMonthRowIndex(valuesPadded);

  for (const ph of paymentHeaderRows) {
    let monthRowIdx = findMonthRowAbovePaymentHeader(valuesPadded, ph);
    if (monthRowIdx < 0) monthRowIdx = fallbackMonthRowIdx;
    if (monthRowIdx < 0) continue;

    const monthRow = valuesPadded[monthRowIdx] ?? [];
    const paymentHeaderRow = valuesPadded[ph] ?? [];
    const triplets = buildTripletsFromMonthAndPaymentRows(monthRow, paymentHeaderRow, ano);
    if (triplets.length === 0) continue;
    regions.push({ paymentHeaderRowIdx: ph, monthRowIdx, triplets });
  }

  if (regions.length === 0) return { alunos: [] };

  // Agora parseia as linhas de alunos/modalidades usando o mesmo array de valores.
  const parsed = parsearAbaEmBlocos(valuesPadded, aba, limiteAtivos) as LinhaParseada[];
  if (!parsed.length) return { alunos: [] };

  const byStudent: Record<string, PagamentosAluno> = {};

  for (const l of parsed) {
    // Conciliação e telas derivadas devem considerar somente alunos ativos da aba.
    if (!l.ativo) continue;

    const row = l.row as Record<string, unknown>;
    const aluno = coerceForma(getCaseInsensitive(row, ['NOME', 'ALUNO', 'CLIENTE']) ?? row['nome']);
    if (!aluno) continue;

    const modalidade = String(l.modalidade ?? aba).trim() || aba;
    const linhaNum = Number(l.linha1Based ?? row['_linha'] ?? 0);

    const studentKey = `${aluno}::${modalidade}::${linhaNum}`;
    if (!byStudent[studentKey]) {
      const diaV = extrairDiaVencimento(row as Record<string, unknown>, aba);
      byStudent[studentKey] = { aluno, modalidade, linha: linhaNum, diaVencimento: diaV, pagamentos: [] };
    }

    const responsaveisRaw = coerceForma(
      getCaseInsensitive(row, ['RESPONSÁVEIS', 'RESPONSAVEIS', 'RESPONS.', 'RESP.']) ?? ''
    );
    const responsaveis = responsaveisRaw
      ? responsaveisRaw
          .split(/[;,|/]+/g)
          .map((x) => x.trim())
          .filter(Boolean)
      : [];

    const pagadorPix = coerceForma(
      getCaseInsensitive(row, ['PRÓ', 'PRO', 'PAGADOR', 'PIX', 'NOME PAGADOR']) ?? ''
    );

    const region = pickRegionForLine(regions, linhaNum);
    if (!region) continue;

    const existing = new Set<string>();

    for (const t of region.triplets) {
      const dateRaw = row[`col_${t.startIdx}`] ?? '';
      const formaRaw = row[`col_${t.startIdx + 1}`] ?? '';
      const valorRaw = t.colunas === 3 ? String(row[`col_${t.startIdx + 2}`] ?? '') : '';

      let valorNum = parseMoney(valorRaw);
      if (valorNum == null && t.colunas === 2) {
        const vCol = parseMoney(getCaseInsensitive(row, ['VALOR']) ?? '');
        if (vCol != null) valorNum = vCol;
      }
      if (valorNum == null) continue;

      const parsedDate = parseDateCellSmart(dateRaw, { year: t.year, month: t.month });
      if (!parsedDate) continue;
      if (parsedDate.year !== ano) continue;

      const forma = coerceForma(formaRaw);
      const pagamento: PagamentoPlanilha = {
        data: parsedDate.iso,
        forma,
        valor: valorNum,
        mes: parsedDate.month,
        ano: parsedDate.year,
        mesCompetencia: t.month,
        anoCompetencia: t.year,
        responsaveis,
        pagadorPix: pagadorPix || undefined,
      };

      // Dedupe apenas dentro do mesmo bloco de mês/coluna; evita perder lançamentos
      // iguais em colunas diferentes (caso real em BYLA DANÇA).
      const dedupeKey = `${t.colunas}::${t.startIdx}::${pagamento.data}::${pagamento.forma}::${pagamento.valor}`;
      if (existing.has(dedupeKey)) continue;
      existing.add(dedupeKey);
      byStudent[studentKey].pagamentos.push(pagamento);
    }
  }

  const alunos = Object.values(byStudent);
  for (const a of alunos) {
    a.pagamentos.sort((x, y) => x.data.localeCompare(y.data));
  }

  return { alunos };
}

