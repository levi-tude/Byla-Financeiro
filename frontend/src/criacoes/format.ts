import type { Formato } from './types';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const num = new Intl.NumberFormat('pt-BR');

export function fmtMes(v: string | number): string {
  const m = String(v).match(/^(\d{4})-(\d{2})$/);
  return m ? `${MESES[Number(m[2]) - 1]}/${m[1].slice(2)}` : String(v);
}
export function fmt(v: string | number | undefined, f: Formato, compact = false): string {
  if (v == null) return '—';
  if (f === 'brl' && typeof v === 'number') return compact ? brlCompact.format(v) : brl.format(v);
  if (f === 'numero' && typeof v === 'number') return num.format(v);
  if (f === 'mes') return fmtMes(v);
  return String(v);
}
