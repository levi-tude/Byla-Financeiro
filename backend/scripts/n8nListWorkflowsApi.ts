/**
 * Lista workflows na instancia n8n via Public API (nao e o MCP).
 * Crie uma API Key em: n8n → Settings → n8n API
 *
 * backend/.env:
 *   N8N_BASE_URL=https://n8n.espacobyla.online
 *   N8N_API_KEY=...
 *
 * Uso: npm run n8n:list-workflows
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(backendRoot, '.env'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env'), override: true });

async function main(): Promise<void> {
  const base = (process.env.N8N_BASE_URL ?? '').replace(/\/$/, '');
  const key = (process.env.N8N_API_KEY ?? '').trim();
  if (!base || !key) {
    console.error('Defina N8N_BASE_URL e N8N_API_KEY no backend/.env (Settings → n8n API no painel).');
    process.exit(1);
  }
  const url = `${base}/api/v1/workflows`;
  const res = await fetch(url, {
    headers: {
      'X-N8N-API-KEY': key,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    process.exit(1);
  }
  const data = JSON.parse(text) as { data?: unknown[] } | unknown[];
  const list = Array.isArray(data) ? data : (data as { data?: unknown[] }).data ?? [];
  console.log(`Total: ${list.length} workflow(s)\n`);
  for (const w of list as { id?: string; name?: string; active?: boolean }[]) {
    console.log(`- [${w.active ? 'on' : 'off'}] ${w.name ?? '(sem nome)'}  (id=${w.id})`);
  }
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
