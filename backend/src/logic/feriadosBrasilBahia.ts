/**
 * Feriados nacionais (Brasil) + Bahia/Salvador para Conciliação (dias não úteis).
 * Datas em calendário civil America/Sao_Paulo (trabalhamos com Y-M-D, sem TZ de instante).
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIsoDate(ano: number, mes: number, dia: number): string {
  return `${ano}-${pad2(mes)}-${pad2(dia)}`;
}

/** Domingo de Páscoa (algoritmo gregoriano anônimo). */
export function pascoaDomingo(ano: number): { ano: number; mes: number; dia: number } {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { ano, mes, dia };
}

function addDaysIso(iso: string, delta: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12, 0, 0));
  return toIsoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function feriadosFixosNoAno(ano: number): string[] {
  return [
    // Nacionais
    toIsoDate(ano, 1, 1),
    toIsoDate(ano, 4, 21),
    toIsoDate(ano, 5, 1),
    toIsoDate(ano, 9, 7),
    toIsoDate(ano, 10, 12),
    toIsoDate(ano, 11, 2),
    toIsoDate(ano, 11, 15),
    toIsoDate(ano, 11, 20), // Consciência Negra (nacional)
    toIsoDate(ano, 12, 25),
    // Bahia / Salvador
    toIsoDate(ano, 2, 2), // N. Sra. da Conceição da Praia (Salvador)
    toIsoDate(ano, 6, 24), // São João (BA)
    toIsoDate(ano, 7, 2), // Independência da Bahia
    toIsoDate(ano, 12, 8), // N. Sra. da Conceição (BA)
  ];
}

function feriadosMoveisNoAno(ano: number): string[] {
  const p = pascoaDomingo(ano);
  const pascoa = toIsoDate(p.ano, p.mes, p.dia);
  return [
    addDaysIso(pascoa, -48), // Carnaval (segunda)
    addDaysIso(pascoa, -47), // Carnaval (terça)
    addDaysIso(pascoa, -2), // Sexta-feira Santa
    addDaysIso(pascoa, 60), // Corpus Christi
  ];
}

const cacheFeriados = new Map<number, Set<string>>();

/** Conjunto ISO YYYY-MM-DD de feriados BR + BA no ano. */
export function feriadosBrasilBahiaNoAno(ano: number): Set<string> {
  const cached = cacheFeriados.get(ano);
  if (cached) return cached;
  const set = new Set<string>([...feriadosFixosNoAno(ano), ...feriadosMoveisNoAno(ano)]);
  cacheFeriados.set(ano, set);
  return set;
}

export function isFeriadoBrasilBahia(iso: string): boolean {
  const y = Number(String(iso).slice(0, 4));
  if (!Number.isFinite(y)) return false;
  return feriadosBrasilBahiaNoAno(y).has(String(iso).slice(0, 10));
}

/** 0=domingo … 6=sábado (UTC noon do Y-M-D). */
export function diaDaSemanaIso(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

export function isFimDeSemanaIso(iso: string): boolean {
  const dow = diaDaSemanaIso(iso);
  return dow === 0 || dow === 6;
}

export function isDiaNaoUtilBrasilBahia(iso: string): boolean {
  return isFimDeSemanaIso(iso) || isFeriadoBrasilBahia(iso);
}

/** Próximo dia útil (não sáb/dom/feriado BR+BA), inclusive se `iso` já for útil. */
export function proximoDiaUtilBrasilBahia(iso: string): string {
  let cur = String(iso).slice(0, 10);
  for (let i = 0; i < 15; i += 1) {
    if (!isDiaNaoUtilBrasilBahia(cur)) return cur;
    cur = addDaysIso(cur, 1);
  }
  return cur;
}
