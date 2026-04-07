/**
 * Verifica localmente os pré-requisitos do export Supabase → Google Sheets (n8n).
 * Usa backend/.env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ou anon com leitura na view),
 * opcional GOOGLE_SHEETS_ENTRADA_SAIDA_ID + GOOGLE_APPLICATION_CREDENTIALS para checar a planilha.
 *
 * Uso: npm run verify:export-prereqs  (na pasta backend)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(backendRoot, '.env'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env'), override: true });

function resolveKeyFile(raw: string): string {
  const p = raw.trim();
  if (!p) return '';
  return path.isAbsolute(p) ? p : path.resolve(backendRoot, p);
}

async function checkSupabase(): Promise<{ ok: boolean; detail: string }> {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const key =
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim() ||
    (process.env.SUPABASE_ANON_KEY ?? '').trim();
  if (!url || !key) {
    return {
      ok: false,
      detail: 'Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (recomendado) ou SUPABASE_ANON_KEY no backend/.env',
    };
  }
  const isAnon = !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const rest = `${url}/rest/v1/v_transacoes_export?select=id&limit=1`;
  const res = await fetch(rest, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, detail: `REST ${res.status}: ${t.slice(0, 200)}` };
  }
  const j = await res.json();
  const row = Array.isArray(j) ? j[0] : j;
  const suffix = isAnon ? ' (usando anon — prefira service_role para igualar o n8n)' : '';
  return {
    ok: true,
    detail: `GET v_transacoes_export OK; amostra id=${row?.id ?? 'n/a'}${suffix}`,
  };
}

async function checkGoogleSheet(): Promise<{ ok: boolean; detail: string; skipped: boolean }> {
  const spreadsheetId = (process.env.GOOGLE_SHEETS_ENTRADA_SAIDA_ID ?? '').trim();
  const keyFile = resolveKeyFile(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '');
  const credJson = (process.env.GOOGLE_SHEETS_CREDENTIALS_JSON ?? '').trim();
  if (!spreadsheetId) {
    return { ok: true, detail: 'GOOGLE_SHEETS_ENTRADA_SAIDA_ID ausente — ignorando checagem Google', skipped: true };
  }
  if (!keyFile && !credJson) {
    return {
      ok: true,
      detail: 'Credencial Google ausente — não foi possível validar a planilha (ok se só o n8n acessa)',
      skipped: true,
    };
  }
  if (keyFile && !fs.existsSync(keyFile)) {
    return { ok: false, detail: `Arquivo de credencial não encontrado: ${keyFile}`, skipped: false };
  }
  const auth = credJson
    ? new google.auth.GoogleAuth({
        credentials: JSON.parse(credJson) as { client_email?: string; private_key?: string },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      })
    : new google.auth.GoogleAuth({
        keyFile,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
  const sheets = google.sheets({ version: 'v4', auth });
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets(properties(title))',
  });
  const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean);
  const hasMov = titles.some((t) => /movimenta/i.test(t ?? ''));
  return {
    ok: hasMov,
    detail: hasMov
      ? `Planilha "${meta.data.properties?.title}" — aba Movimentações encontrada entre: ${titles.join(', ')}`
      : `Planilha "${meta.data.properties?.title}" — não achei aba "Movimentações" (abas: ${titles.join(', ')})`,
    skipped: false,
  };
}

async function main(): Promise<void> {
  console.log('=== Verificação pré-requisitos export n8n (repo Byla) ===\n');

  const s = await checkSupabase();
  console.log('[Supabase REST / v_transacoes_export]', s.ok ? 'OK' : 'FALHA');
  console.log(' ', s.detail);

  const g = await checkGoogleSheet();
  if (!g.skipped) {
    console.log('\n[Google Sheets]', g.ok ? 'OK' : 'ATENÇÃO');
    console.log(' ', g.detail);
  } else {
    console.log('\n[Google Sheets]', 'pulado');
    console.log(' ', g.detail);
  }

  console.log('\n--- Itens só no n8n (confirme manualmente na UI) ---');
  console.log('  • Settings → Variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_SHEETS_ENTRADA_SAIDA_ID');
  console.log('  • Workflows importados com $vars e Append mapeado (JSON em n8n-workflows/)');
  console.log('  • Workflow webhook ATIVO; URL do webhook no Supabase → Database Webhooks → transacoes INSERT');
  console.log('  • Carga inicial: executar UMA vez se ainda não populou o histórico');
  console.log('\nDoc: docs/N8N_PLANO_IMPLEMENTACAO_VERIFICACAO.md');
  console.log('Status remoto Supabase (projeto): ver seção em docs/N8N_STATUS_VERIFICACAO.md\n');

  if (!s.ok || (!g.ok && !g.skipped)) process.exit(1);
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
