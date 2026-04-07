/** Normalização de texto para comparação de nomes (conciliação planilha × banco). */

export function normalizeText(s: string): string {
  const raw = (s ?? '').toString().trim();
  if (!raw) return '';
  const withoutDiacritics = raw.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const upper = withoutDiacritics.toUpperCase();
  const cleaned = upper.replace(/[^\p{L}\p{N}]+/gu, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}

export function isNameCompatible(planilhaNome: string, bancoNome: string): boolean {
  const p = normalizeText(planilhaNome);
  const b = normalizeText(bancoNome);
  if (!p || !b) return false;
  return p.includes(b) || b.includes(p);
}

export function sameDayISO(a: string, b: string): boolean {
  return (a ?? '').slice(0, 10) === (b ?? '').slice(0, 10);
}

export function shiftISODate(dateStr: string, deltaDays: number): string {
  const m = (dateStr ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const y = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}
