/** Normalização de texto para comparação de nomes (conciliação planilha × banco). */

export function normalizeText(s: string): string {
  const raw = (s ?? '').toString().trim();
  if (!raw) return '';
  const withoutDiacritics = raw.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const upper = withoutDiacritics.toUpperCase();
  const cleaned = upper.replace(/[^\p{L}\p{N}]+/gu, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}

export function tokensNomeCompat(nome: string): string[] {
  return normalizeText(nome)
    .split(' ')
    .filter((t) => t.length >= 4);
}

/** Sobrenome com typo truncado (ex.: Fernato vs Fernatore no PIX). */
export function tokensNomeCompatPrefix(a: string, b: string): boolean {
  if (a === b) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 5 && shorter.length < longer.length && longer.startsWith(shorter);
}

/** Pares de sobrenome parecidos que não devem contar como match (ex.: OLIVEIRA no PIX vs OLIVARES no aluno). */
export function isFalseFriendSurnameToken(a: string, b: string): boolean {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y || x === y) return false;
  const pair = [x, y].sort((p, q) => p.localeCompare(q)).join('|');
  return pair === 'OLIVEIRA|OLIVARES';
}

function tokensNomeCompatCore(planilhaNome: string, bancoNome: string): boolean {
  const pt = tokensNomeCompat(planilhaNome);
  const bt = tokensNomeCompat(bancoNome);
  for (const a of pt) {
    for (const c of bt) {
      if (isFalseFriendSurnameToken(a, c)) continue;
      if (a.length >= 6 && c.length >= 6 && a === c) return true;
      if (tokensNomeCompatPrefix(a, c)) return true;
    }
  }
  return false;
}

/** Score para ordenar candidatos: prefixo sobrenome > token igual > substring. */
export function scoreNomeCompativel(planilhaNome: string, bancoNome: string): number {
  const p = normalizeText(planilhaNome);
  const b = normalizeText(bancoNome);
  if (!p || !b) return 0;
  if (p.includes(b) || b.includes(p)) return 4;

  const pt = tokensNomeCompat(planilhaNome);
  const bt = tokensNomeCompat(bancoNome);
  let best = 0;
  for (const a of pt) {
    for (const c of bt) {
      if (isFalseFriendSurnameToken(a, c)) continue;
      if (a.length >= 6 && c.length >= 6 && a === c) best = Math.max(best, 3);
      else if (tokensNomeCompatPrefix(a, c)) best = Math.max(best, 5);
    }
  }
  return best;
}

export function isNameCompatible(planilhaNome: string, bancoNome: string): boolean {
  const p = normalizeText(planilhaNome);
  const b = normalizeText(bancoNome);
  if (!p || !b) return false;
  if (p.includes(b) || b.includes(p)) return true;
  return tokensNomeCompatCore(planilhaNome, bancoNome);
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
