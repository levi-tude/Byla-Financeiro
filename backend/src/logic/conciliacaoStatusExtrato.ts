export type ConciliacaoPagamentoStatus =
  | 'em_dia'
  | 'atrasado'
  | 'pendente'
  | 'sem_vencimento'
  | 'bolsa';

export function parseDiaVencimentoCadastro(venc: string | null | undefined): number | null {
  const raw = String(venc ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // Prefer last 1–2 digit group that looks like a day (1–31)
  const m = raw.match(/\b([12]?\d|3[01])\b/);
  const n = m ? Number(m[1]) : Number(digits.slice(0, 2));
  if (!Number.isFinite(n) || n < 1 || n > 31) return null;
  return n;
}

export function isPlanoBolsaConciliacao(plano: string | null | undefined): boolean {
  const n = String(plano ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
  return n === 'bolsa' || n.includes('bolsa');
}

export function classificarStatusConciliacao(input: {
  diaVencimento: number | null;
  dataCreditoIso: string | null;
  mes: number;
  ano: number;
  planoBolsa: boolean;
}): ConciliacaoPagamentoStatus {
  if (input.planoBolsa) return 'bolsa';
  if (input.diaVencimento == null) return 'sem_vencimento';
  const iso = (input.dataCreditoIso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'pendente';
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (y !== input.ano || m !== input.mes) return 'pendente';
  if (d <= input.diaVencimento) return 'em_dia';
  return 'atrasado';
}
