/**
 * Extrai o dia de vencimento (1–31) da primeira parte das abas FLUXO BYLA.
 * Colunas aceitas (case-insensitive, com/sem acentos): VENC, VENC., VEN, VENCIMENTO,
 * DATA VENC, DATA VEN, DATA VENC., "DATA \VEN", etc.
 * Abas TEATRO: coluna "DATA" no primeiro bloco pode ser só o dia de vencimento.
 * YOGA / G.R.: "data venc", "data ven" conforme cabeçalho da planilha.
 */

function normKeyAlias(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCaseInsensitive(obj: Record<string, unknown>, candidates: string[]): unknown | undefined {
  const cand = new Set(candidates.map(normKeyAlias));
  for (const k of Object.keys(obj)) {
    if (cand.has(normKeyAlias(k))) return obj[k];
  }
  return undefined;
}

/** Interpreta célula como dia 1–31 ou data e devolve o dia do mês de vencimento. */
export function parseDiaVencimentoCell(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.trunc(raw);
    if (n >= 1 && n <= 31) return n;
    return null;
  }
  const s = String(raw).trim();
  if (!s) return null;

  const onlyDay = s.match(/^(\d{1,2})$/);
  if (onlyDay) {
    const d = Number(onlyDay[1]);
    if (d >= 1 && d <= 31) return d;
  }

  const br = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (br) {
    const a = Number(br[1]);
    const b = Number(br[2]);
    if (a >= 1 && a <= 31 && b >= 1 && b <= 12) return a;
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = Number(iso[3]);
    if (d >= 1 && d <= 31) return d;
  }

  return null;
}

function keyLooksLikeVencimento(key: string): boolean {
  const u = normKeyAlias(key);
  if (u === 'VENC' || u === 'VENC.' || u === 'VEN' || u === 'VENCIMENTO') return true;
  if (u.includes('VENC') && u.includes('DATA')) return true;
  if (u === 'DATA VENC' || u === 'DATA VEN' || u === 'DATA VENC.' || u === 'DATA VENCIMENTO') return true;
  if (u.replace(/\\/g, '') === 'DATA VEN' || u.replace(/\s/g, '') === 'DATAVEN') return true;
  return false;
}

/**
 * @param nomeAba Nome da aba (ex.: TEATRO, YOGA)
 * @param row Linha do bloco de cadastro (objeto com ALUNO, colunas do cabeçalho, col_N)
 */
export function extrairDiaVencimento(row: Record<string, unknown>, nomeAba: string): number | null {
  const abaU = nomeAba.toUpperCase().trim();

  for (const key of Object.keys(row)) {
    if (key.startsWith('_') || key.startsWith('col_')) continue;
    if (!keyLooksLikeVencimento(key)) continue;
    const d = parseDiaVencimentoCell(row[key]);
    if (d != null) return d;
  }

  const tryKeys = [
    'VENC',
    'VENC.',
    'VEN',
    'VENCIMENTO',
    'DATA VENC',
    'DATA VEN',
    'DATA VENC.',
    'DATA \\VEN',
    'DATA VENCIMENTO',
  ];
  const v = getCaseInsensitive(row, tryKeys);
  if (v != null) {
    const d = parseDiaVencimentoCell(v);
    if (d != null) return d;
  }

  // TEATRO (primeira parte): coluna "DATA" = dia de vencimento mensal
  if (abaU.includes('TEATRO')) {
    const dataCol = getCaseInsensitive(row, ['DATA']);
    if (dataCol != null) {
      const d = parseDiaVencimentoCell(dataCol);
      if (d != null) return d;
    }
  }

  // YOGA / G.R.: cabeçalhos "data venc" / "data ven" em colunas espelhadas (col_N)
  for (const key of Object.keys(row)) {
    if (!key.startsWith('col_')) continue;
    const nk = normKeyAlias(key.replace(/^col_/i, ''));
    if ((nk.includes('VENC') || nk.includes('VEN')) && nk.includes('DATA')) {
      const d = parseDiaVencimentoCell(row[key]);
      if (d != null) return d;
    }
  }

  return null;
}

/** Data de vencimento no mês (ano-mes-dia), respeitando último dia do mês. */
export function dataVencimentoNoMes(ano: number, mes: number, diaPreferido: number): string {
  const ultimo = new Date(ano, mes, 0).getDate();
  const dia = Math.min(Math.max(1, diaPreferido), ultimo);
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Diferença em dias (a - b), strings YYYY-MM-DD. */
export function diffDiasISO(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00');
  const db = new Date(b + 'T12:00:00');
  return Math.round((da.getTime() - db.getTime()) / (24 * 3600 * 1000));
}
