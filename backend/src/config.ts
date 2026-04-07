import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ensureQuotedA1Range } from './domain/MesAno.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const backendDir = path.resolve(__dirname, '..');

// Carregar .env (loadEnv já rodou; reforço para quem importar config antes de loadEnv)
dotenv.config({ path: path.resolve(backendDir, '.env'), override: true });
dotenv.config({ path: path.resolve(cwd, '.env') });
dotenv.config({ path: path.resolve(cwd, 'backend', '.env') });

const env = process.env;

/** Lê GEMINI_API_KEY do .env do backend se process.env não tiver (BOM/encoding). */
function readGeminiFromEnvFile(): string {
  const candidates = [
    path.resolve(backendDir, '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend', '.env'),
  ];
  for (const envPath of candidates) {
    try {
      if (!fs.existsSync(envPath)) continue;
      const content = fs.readFileSync(envPath, 'utf8');
      const line = content.split(/\r?\n/).find((l) => /GEMINI_API_KEY\s*=/.test(l.replace(/\uFEFF/g, '').trim()));
      if (!line) continue;
      const match = line.match(/GEMINI_API_KEY\s*=\s*(.*)/);
      let val = (match?.[1] ?? '').trim();
      val = val.replace(/#.*$/, '').trim().replace(/^["']|["']$/g, '');
      if (val) return val;
    } catch {
      // next candidate
    }
  }
  return '';
}

function getGeminiKey(): string {
  const v = (env.GEMINI_API_KEY ?? env.gemini_api_key ?? '').trim();
  if (v) return v;
  for (const key of Object.keys(env)) {
    if (key.toUpperCase().replace(/-/g, '_') === 'GEMINI_API_KEY') return (env[key] ?? '').trim();
  }
  return readGeminiFromEnvFile();
}
function getOpenAIKey(): string {
  return (env.OPENAI_API_KEY ?? '').trim();
}
function getGroqKey(): string {
  return (env.GROQ_API_KEY ?? '').trim();
}

export const config = {
  port: Number(env.PORT) || 3001,
  /** Chave da API Google Gemini (grátis). Usada em /api/relatorios/gerar-texto-ia. */
  geminiApiKey: getGeminiKey(),
  /** Chave da API Groq (grátis, cota alta). Fallback quando Gemini dá limite. */
  groqApiKey: getGroqKey(),
  /** Chave da API OpenAI (pago). Usada como última opção. */
  openaiApiKey: getOpenAIKey(),
  supabase: {
    url: (env.SUPABASE_URL ?? '').trim(),
    serviceRoleKey: (env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY ?? '').trim(),
  },
  sheets: {
    /** Planilha Entrada/Saída (export n8n, aba Movimentações) — mesmo ID que variáveis n8n */
    entradaSaidaSpreadsheetId: (env.GOOGLE_SHEETS_ENTRADA_SAIDA_ID ?? '').trim(),
    /** Planilha FLUXO DE CAIXA BYLA – aba ATENDIMENTOS (alunos, modalidades) */
    spreadsheetId: (env.GOOGLE_SHEETS_SPREADSHEET_ID ?? '').trim(),
    /** Se true, alunos são lidos de TODAS as abas da planilha (modalidades); senão só a aba configurada. */
    alunosTodasAbas: (env.GOOGLE_SHEETS_ALUNOS_TODAS_ABAS ?? 'true').toLowerCase() === 'true',
    /** Planilha CONTROLE DE CAIXA – abas por mês (ex.: MARÇO 26) com totais Entrada/Saída/Lucro */
    fluxoSpreadsheetId: (env.GOOGLE_SHEETS_FLUXO_ID ?? '').trim(),
    /** Aba/range da planilha CONTROLE DE CAIXA (ex.: 'MARÇO 26'!A:Z; sem aspas no env é normalizado) */
    fluxoRange: ensureQuotedA1Range((env.GOOGLE_SHEETS_FLUXO_RANGE ?? '').trim() || 'MARÇO 26!A:Z').trim(),
    /** Pares de colunas (0-based). Padrão inclui G-H (6-7) para não perder bloco de gastos fixos. Sobrescreva com GOOGLE_SHEETS_FLUXO_PARES_COLUNAS. */
    fluxoParesColunas: (env.GOOGLE_SHEETS_FLUXO_PARES_COLUNAS ?? '0-1,2-3,4-5,6-7,8-9').trim(),
    credentialsJson: env.GOOGLE_SHEETS_CREDENTIALS_JSON?.trim() ?? '',
    credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ?? '',
  },
  corsOrigin: (env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
} as const;

export function hasSupabase(): boolean {
  return !!config.supabase.url && !!config.supabase.serviceRoleKey;
}

export function hasSheetsCredentials(): boolean {
  return !!config.sheets.credentialsJson || !!config.sheets.credentialsPath;
}
