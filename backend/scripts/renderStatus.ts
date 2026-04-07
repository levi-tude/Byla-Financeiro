/**
 * Status do deploy no Render via API oficial (não depende do MCP do Cursor).
 *
 * Requer no backend/.env: RENDER_API_KEY (Render → Account → API Keys)
 *
 * Uso (pasta backend): npm run render:status
 * Opcional: RENDER_SERVICE_NAME=byla-backend (padrão)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(backendRoot, '.env'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env'), override: true });

const RENDER_API = 'https://api.render.com/v1';

type RenderService = {
  id: string;
  name: string;
  type?: string;
  serviceDetails?: { url?: string; region?: string; plan?: string };
  suspended?: string;
};

type Deploy = {
  id: string;
  status: string;
  createdAt?: string;
  finishedAt?: string;
  commit?: { message?: string; id?: string };
  trigger?: string;
};

function getKey(): string {
  const k = (process.env.RENDER_API_KEY ?? '').trim();
  if (k) return k;
  const envPath = path.join(backendRoot, '.env');
  const onDisk = fs.existsSync(envPath);
  const raw = onDisk ? fs.readFileSync(envPath, 'utf8') : '';
  const mentioned = /\bRENDER_API_KEY\s*=/m.test(raw);
  console.error('[render:status] RENDER_API_KEY não carregada no processo.');
  if (mentioned) {
    console.error(
      '  O texto "RENDER_API_KEY=" existe no arquivo .env do disco, mas a variável não entrou no ambiente.\n' +
        '  Verifique aspas/quebras de linha no valor ou salve o arquivo (Ctrl+S) e rode de novo.',
    );
  } else if (onDisk) {
    console.error(
      '  O backend/.env no disco não define RENDER_API_KEY.\n' +
        '  Se você colou no Cursor, salve o arquivo (Ctrl+S). O terminal só lê o que está gravado no disco.',
    );
  }
  console.error(
    '  Render Dashboard → Account → API Keys → Create API Key\n' +
      '  Depois no backend/.env: RENDER_API_KEY=rnd_...',
  );
  process.exit(1);
}

async function apiGet<T>(pathWithQuery: string, key: string): Promise<T> {
  const url = `${RENDER_API}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}: ${text.slice(0, 800)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Resposta não-JSON (${text.slice(0, 200)})`);
  }
}

function extractServices(payload: unknown): RenderService[] {
  if (!payload || typeof payload !== 'object') return [];
  const o = payload as Record<string, unknown>;
  if (Array.isArray(o.services)) {
    return o.services.map((item: unknown) => {
      if (item && typeof item === 'object' && 'service' in item) {
        return (item as { service: RenderService }).service;
      }
      return item as RenderService;
    });
  }
  if (Array.isArray(payload)) {
    return (payload as Array<{ service?: RenderService } & RenderService>).map((x) => x.service ?? x);
  }
  return [];
}

function extractCursor(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'cursor' in payload) {
    const c = (payload as { cursor?: string | null }).cursor;
    return typeof c === 'string' ? c : '';
  }
  return '';
}

async function listAllServices(key: string): Promise<RenderService[]> {
  const all: RenderService[] = [];
  let cursor = '';
  for (let page = 0; page < 50; page++) {
    const q = new URLSearchParams({ limit: '100' });
    if (cursor) q.set('cursor', cursor);
    const payload = await apiGet<unknown>(`/services?${q}`, key);
    all.push(...extractServices(payload));
    const next = extractCursor(payload);
    if (!next || next === cursor) break;
    cursor = next;
  }
  return all;
}

function extractDeploys(payload: unknown): Deploy[] {
  if (!payload || typeof payload !== 'object') return [];
  const o = payload as Record<string, unknown>;
  if (Array.isArray(o.deploys)) {
    return o.deploys.map((item: unknown) => {
      if (item && typeof item === 'object' && 'deploy' in item) {
        return (item as { deploy: Deploy }).deploy;
      }
      return item as Deploy;
    });
  }
  if (Array.isArray(payload)) {
    return (payload as Array<{ deploy?: Deploy } & Deploy>).map((x) => x.deploy ?? x);
  }
  return [];
}

function extractDeployCursor(payload: unknown): string {
  return extractCursor(payload);
}

async function listDeploys(serviceId: string, key: string, limit = 10): Promise<Deploy[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  const payload = await apiGet<unknown>(`/services/${serviceId}/deploys?${q}`, key);
  return extractDeploys(payload);
}

async function main(): Promise<void> {
  const key = getKey();
  const wantName = (process.env.RENDER_SERVICE_NAME ?? 'byla-backend').trim().toLowerCase();

  console.log('[render:status] Listando serviços...\n');
  let services: RenderService[];
  try {
    services = await listAllServices(key);
  } catch (e) {
    console.error('[render:status] Falha na API:', e instanceof Error ? e.message : e);
    process.exit(1);
  }

  if (services.length === 0) {
    console.log('Nenhum serviço retornado (conta sem recursos ou filtro de workspace na API).');
    process.exit(0);
  }

  const match =
    services.find((s) => s.name.toLowerCase() === wantName) ??
    services.find((s) => s.name.toLowerCase().includes(wantName));

  if (!match) {
    console.log(`Nenhum serviço com nome "${wantName}". Serviços encontrados (${services.length}):`);
    for (const s of services.slice(0, 30)) {
      console.log(`  • ${s.name} (${s.id})`);
    }
    if (services.length > 30) console.log(`  … +${services.length - 30} outros`);
    console.log('\nDefina RENDER_SERVICE_NAME=nome-exato no .env se o serviço tiver outro nome.');
    process.exit(0);
  }

  const url = match.serviceDetails?.url ?? '(sem URL — veja o painel)';
  console.log(`Serviço: ${match.name}`);
  console.log(`ID:      ${match.id}`);
  console.log(`URL:     ${url}`);
  console.log(`Tipo:    ${match.type ?? '—'}  |  Suspenso: ${match.suspended ?? '—'}\n`);

  let deploys: Deploy[];
  try {
    deploys = await listDeploys(match.id, key, 8);
  } catch (e) {
    console.error('[render:status] Falha ao listar deploys:', e instanceof Error ? e.message : e);
    process.exit(1);
  }

  if (deploys.length === 0) {
    console.log('Nenhum deploy listado ainda.');
    process.exit(0);
  }

  console.log('Últimos deploys:');
  for (const d of deploys) {
    const commit = d.commit?.message ? d.commit.message.split('\n')[0].slice(0, 70) : '—';
    console.log(`  • ${d.status.padEnd(12)} ${d.id}  ${d.createdAt ?? ''}`);
    console.log(`    commit: ${commit}`);
  }

  const last = deploys[0];
  if (last && last.status !== 'live' && last.status !== 'deactivated') {
    console.log(
      '\n[render:status] Deploy mais recente não está live. Abra no painel:\n' +
        `  https://dashboard.render.com/web/${match.id}/deploys/${last.id}\n` +
        '  Veja Build logs e Deploy logs. Root Directory do serviço deve estar vazio (raiz do repo); build usa `cd backend`.',
    );
  } else if (last?.status === 'live') {
    console.log('\n[render:status] Último deploy está live. Teste GET /health na URL do serviço.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
