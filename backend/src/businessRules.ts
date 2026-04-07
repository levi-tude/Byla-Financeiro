import { config } from './config.js';

function parseNumberEnv(v: string | undefined, fallback: number): number {
  const raw = String(v ?? '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseListEnv(v: string | undefined, fallback: string[]): string[] {
  const raw = String(v ?? '').trim();
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const DEFAULT_ELIGIBLE_SHEETS = [
  'BYLA DANÇA',
  'PILATES',
  'PILATES MARINA',
  'TEATRO',
  'YOGA',
  'G.R.',
  'TEATRO INFANTIL',
];
const DEFAULT_EXTERNAL_ENTRIES = ['EA ', 'BLEAD AD TECH'];

/** Regras centralizadas para facilitar ajustes sem editar rotas. */
export const businessRules = {
  planilha: {
    eligibleSheets: parseListEnv(process.env.BYLA_ELIGIBLE_SHEETS, DEFAULT_ELIGIBLE_SHEETS),
  },
  conciliacao: {
    bancoJanelaDias: parseNumberEnv(process.env.BYLA_BANCO_JANELA_DIAS, 7),
    valorTolerancia: parseNumberEnv(process.env.BYLA_MATCH_VALOR_TOLERANCIA, 0.01),
    graceDiasAposVencimento: parseNumberEnv(process.env.BYLA_GRACE_DIAS_APOS_VENCIMENTO, 5),
  },
  transacoes: {
    externalEntryNames: parseListEnv(process.env.BYLA_EXTERNAL_ENTRIES, DEFAULT_EXTERNAL_ENTRIES),
    samuelNamePrefix: (process.env.BYLA_SAMUEL_NAME_PREFIX ?? 'samuel davi tude silva').trim().toLowerCase(),
    /** Tolerância (R$) para parear entrada EA/Blead com saída Samuel no mesmo dia. */
    externalPairTolerance: parseNumberEnv(process.env.BYLA_EXTERNAL_PAIR_TOLERANCE, 800),
    /**
     * Saídas com nome Samuel nesta faixa de valor são sempre excluídas do extrato oficial
     * (repasse externo ~5k — não entram em totais nem relatórios que usam este filtro).
     */
    samuelRepasseValorMin: parseNumberEnv(process.env.BYLA_SAMUEL_REPASSE_VALOR_MIN, 4800),
    samuelRepasseValorMax: parseNumberEnv(process.env.BYLA_SAMUEL_REPASSE_VALOR_MAX, 6500),
  },
  docs: {
    sourceRule: 'docs/REGRAS_FONTES_SUPABASE_PLANILHAS.md',
    contratosApi: 'docs/API_CONTRATOS.md',
  },
  runtime: {
    backendPort: config.port,
  },
} as const;

/** Compara títulos de aba ignorando acentos e colapsando espaços (Sheets ≠ lista env). */
function normSheetTitle(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

export function isEligibleSheet(name: string): boolean {
  const n = normSheetTitle(name);
  if (!n) return false;
  const list = businessRules.planilha.eligibleSheets.map((s) => normSheetTitle(s));
  if (list.includes(n)) return true;
  // Ex.: "PILATES MARINA" ou "BYLA DANCA" (sem cedilha) vs entrada da lista.
  for (const el of list) {
    if (el.length < 2) continue;
    if (n === el || n.startsWith(`${el} `) || n.startsWith(`${el}/`)) return true;
  }
  return false;
}

