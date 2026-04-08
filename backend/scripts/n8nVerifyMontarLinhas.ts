/**
 * Testa o mesmo endpoint que o n8n chama: POST .../montar-linhas
 * com X-Byla-Sync-Secret (igual ao fluxo HTTP Request).
 *
 * backend/.env: BYLA_SYNC_SECRET (obrigatório)
 * Opcional: BYLA_TEST_BACKEND_URL (padrão https://byla-backend.onrender.com)
 *
 * Uso: npm run n8n:verify-montar-linhas
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(backendRoot, '.env'), override: true });

const DEFAULT_BACKEND = 'https://byla-backend.onrender.com';

async function main(): Promise<void> {
  const base = (process.env.BYLA_TEST_BACKEND_URL ?? DEFAULT_BACKEND).replace(/\/$/, '');
  const secret = (process.env.BYLA_SYNC_SECRET ?? '').trim();
  if (!secret) {
    console.error('[n8n:verify] Defina BYLA_SYNC_SECRET no backend/.env (mesmo valor no servidor n8n).');
    process.exit(1);
  }

  const row = {
    id: 'n8n-verify-smoke',
    data: '2026-01-15',
    tipo: 'entrada',
    pessoa: 'Verificação n8n',
    valor: 0.01,
    descricao: 'Teste automatizado montar-linhas',
    categoria_sugerida: null,
    subcategoria_sugerida: null,
    modalidade: null,
    nome_aluno: null,
    origem_categoria: null,
  };

  const url = `${base}/api/planilha-entrada-saida/montar-linhas`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Byla-Sync-Secret': secret,
    },
    body: JSON.stringify({ rows: [row] }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[n8n:verify] HTTP ${res.status}: ${text.slice(0, 500)}`);
    process.exit(1);
  }
  let j: unknown;
  try {
    j = JSON.parse(text) as { ok?: boolean; linhas?: unknown[] };
  } catch {
    console.error('[n8n:verify] Resposta não-JSON:', text.slice(0, 300));
    process.exit(1);
  }
  const body = j as { ok?: boolean; linhas?: unknown[] };
  if (!body.ok || !Array.isArray(body.linhas) || body.linhas.length < 1) {
    console.error('[n8n:verify] Resposta inesperada:', text.slice(0, 500));
    process.exit(1);
  }
  console.log('[n8n:verify] OK — backend aceitou o segredo e montou linhas.');
  console.log('  URL:', url);
  console.log('  Colunas (primeira linha):', Object.keys((body.linhas[0] as object) ?? {}).join(', '));
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
