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
/**
 * Pagadores externos (salário do outro trabalho do Samuel) — padrões LIKE em minúsculas,
 * aplicados a `pessoa` ou `descricao` (trim + lower). Fallback do código quando a tabela
 * `public.regras_externos` não existe ou não pôde ser lida. Manter igual ao seed da migração
 * `scripts/migrations/2026-11-01-regras-externos-salario-samuel.sql`.
 */
export const DEFAULT_PADROES_EXTERNOS: readonly string[] = ['ea %', '%blead ad tech%', 'rbc marketing%'];

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
    /** Fallback dos padrões de pagador externo (fonte principal: tabela regras_externos). */
    padroesExternosFallback: DEFAULT_PADROES_EXTERNOS,
    samuelNamePrefix: 'samuel davi tude silva',
    /**
     * Tolerância (R$) do par entrada externa × saída Samuel (1:1 ou soma do dia ±1).
     * FIXA (sem env) para ficar idêntica à view `v_resumo_mensal_oficial`; R$ 800 por decisão do Levi (30/10/2026).
     * Se mudar aqui, mude na migração também (teste `regraParidadeSql.test.ts` confere).
     */
    externalPairTolerance: 800,
    /** Janela em dias entre a entrada externa e a saída Samuel. */
    externalPairJanelaDias: 1,
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

