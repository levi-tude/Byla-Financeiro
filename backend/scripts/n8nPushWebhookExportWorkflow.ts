/**
 * Envia o workflow oficial (export Supabase → backend montar-linhas → Sheets) para o n8n
 * via Public API, mantendo credenciais e webhook já existentes no servidor.
 *
 * Requer no backend/.env:
 *   N8N_BASE_URL=https://n8n.seudominio.com  (sem barra no fim)
 *   N8N_API_KEY=...  (Settings → n8n API)
 *
 * Credencial Header Auth no n8n com nome exato: BYLA Backend Sync
 *
 * Uso:
 *   npm run n8n:push-export-workflow -- --dry-run
 *   npm run n8n:push-export-workflow -- --apply
 *
 * Opcional: --id=BGSexgUqk3iEmWtFfIPnv (padrão = esse ID do fluxo BYLA export)
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');

dotenv.config({ path: path.join(backendRoot, '.env'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env'), override: true });

const DEFAULT_WORKFLOW_ID = 'BGSexgUqk3iEmWtFfIPnv';
/** Usado só se `N8N_BASE_URL` estiver vazio no .env (instância BYLA). */
const DEFAULT_N8N_BASE_URL = 'https://n8n.espacobyla.online';
const TEMPLATE_REL = path.join(repoRoot, 'n8n-workflows', 'workflow-supabase-webhook-google-sheets-export.json');
const HEADER_CRED_NAME = 'BYLA Backend Sync';

type N8nNode = Record<string, unknown> & { name?: string; credentials?: Record<string, { id?: string; name?: string }> };

function parseArgs(): { dryRun: boolean; apply: boolean; workflowId: string } {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  let workflowId = DEFAULT_WORKFLOW_ID;
  for (const a of argv) {
    if (a.startsWith('--id=')) workflowId = a.slice(5).trim();
  }
  return { dryRun: !apply, apply, workflowId };
}

async function api(
  method: string,
  url: string,
  key: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const r = await fetch(url, {
    method,
    headers: {
      'X-N8N-API-KEY': key,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  return { ok: r.ok, status: r.status, json, text };
}

function unwrapWorkflow(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  const o = payload as Record<string, unknown>;
  if (o.data && typeof o.data === 'object') return o.data as Record<string, unknown>;
  if (Array.isArray(o.data) && o.data[0]) return o.data[0] as Record<string, unknown>;
  if (o.id && o.nodes) return o;
  return null;
}

function nodeCredKey(n: N8nNode): string | null {
  const c = n.credentials;
  if (!c || typeof c !== 'object') return null;
  const keys = Object.keys(c);
  return keys[0] ?? null;
}

function mergeCredentialsFromOld(templateNodes: N8nNode[], oldNodes: N8nNode[]): void {
  const byName = new Map<string, N8nNode>();
  for (const n of oldNodes) {
    if (n.name) byName.set(n.name, n);
  }
  for (const n of templateNodes) {
    const name = n.name;
    if (!name) continue;
    const old = byName.get(name);
    if (!old?.credentials) continue;
    n.credentials = JSON.parse(JSON.stringify(old.credentials)) as N8nNode['credentials'];
  }
}

async function findHeaderAuthCredentialId(base: string, key: string): Promise<string | null> {
  const { ok, json, text, status } = await api('GET', `${base}/api/v1/credentials`, key);
  if (!ok) {
    console.warn(`[n8n:push] GET /credentials → ${status} ${text.slice(0, 200)}`);
    return null;
  }
  const root = json as { data?: unknown[] } | unknown[];
  const list = Array.isArray(root) ? root : (root.data ?? []);
  if (!Array.isArray(list)) return null;
  for (const c of list as { id?: string; name?: string; type?: string }[]) {
    if (c?.name === HEADER_CRED_NAME && c?.id) return c.id;
  }
  for (const c of list as { id?: string; name?: string; type?: string }[]) {
    if (
      (c?.type === 'httpHeaderAuth' || String(c?.type ?? '').includes('header')) &&
      c?.name === HEADER_CRED_NAME &&
      c?.id
    ) {
      return c.id;
    }
  }
  return null;
}

function attachHttpHeaderCredential(nodes: N8nNode[], credId: string): void {
  for (const n of nodes) {
    if (n.name !== 'HTTP POST montar-linhas (backend)') continue;
    n.credentials = {
      httpHeaderAuth: { id: credId, name: HEADER_CRED_NAME },
    };
  }
}

/** O GET devolve chaves que o PUT rejeita (ex.: availableInMCP, timeSavedMode). */
function settingsForPut(raw: unknown): { executionOrder: string } {
  const eo =
    raw &&
    typeof raw === 'object' &&
    'executionOrder' in raw &&
    typeof (raw as { executionOrder?: unknown }).executionOrder === 'string'
      ? (raw as { executionOrder: string }).executionOrder
      : 'v1';
  return { executionOrder: eo };
}

async function main(): Promise<void> {
  const { dryRun, apply, workflowId } = parseArgs();
  const rawBase = (process.env.N8N_BASE_URL ?? '').trim();
  const base = (rawBase || DEFAULT_N8N_BASE_URL).replace(/\/$/, '');
  const apiKey = (process.env.N8N_API_KEY ?? '').trim();
  if (!apiKey) {
    console.error('Defina N8N_API_KEY no backend/.env (Settings → n8n API). Opcional: N8N_BASE_URL.');
    process.exit(1);
  }
  if (!rawBase) {
    console.warn(`N8N_BASE_URL vazio; usando ${DEFAULT_N8N_BASE_URL}`);
  }
  if (!fs.existsSync(TEMPLATE_REL)) {
    console.error('Template não encontrado:', TEMPLATE_REL);
    process.exit(1);
  }

  const templateRaw = JSON.parse(fs.readFileSync(TEMPLATE_REL, 'utf8')) as Record<string, unknown>;
  const templateNodes = templateRaw.nodes as N8nNode[];
  const templateConnections = templateRaw.connections;

  const getUrl = `${base}/api/v1/workflows/${workflowId}`;
  const got = await api('GET', getUrl, apiKey);
  if (!got.ok) {
    console.error(`GET workflow falhou ${got.status}: ${got.text.slice(0, 600)}`);
    process.exit(1);
  }
  const current = unwrapWorkflow(got.json);
  if (!current?.nodes || !Array.isArray(current.nodes)) {
    console.error('Resposta GET workflow inesperada:', JSON.stringify(got.json).slice(0, 400));
    process.exit(1);
  }

  const oldNodes = current.nodes as N8nNode[];
  mergeCredentialsFromOld(templateNodes, oldNodes);

  const headerCredId = await findHeaderAuthCredentialId(base, apiKey);
  if (headerCredId) {
    attachHttpHeaderCredential(templateNodes, headerCredId);
    console.log(`Credencial "${HEADER_CRED_NAME}" encontrada (id=${headerCredId.slice(0, 8)}…).`);
  } else {
    console.warn(
      `Credencial "${HEADER_CRED_NAME}" não listada na API. O PUT pode falhar no node HTTP até você criar/renomear a credencial e rodar de novo.`,
    );
  }

  // Apenas campos aceitos pelo schema público (evita 400 "must NOT have additional properties").
  const putBody: Record<string, unknown> = {
    name: templateRaw.name ?? current.name,
    nodes: templateNodes,
    connections: templateConnections,
    settings: settingsForPut(current.settings ?? templateRaw.settings),
  };

  if (dryRun) {
    console.log('[n8n:push] DRY-RUN — nada foi enviado. Rode com --apply para gravar no n8n.\n');
    console.log(`Workflow id: ${workflowId}`);
    console.log(`Nodes no template: ${templateNodes.length}`);
    for (const n of templateNodes) {
      const ck = nodeCredKey(n);
      const cid = ck && n.credentials?.[ck]?.id ? `id=${String(n.credentials![ck]!.id).slice(0, 8)}…` : 'sem id';
      console.log(`  - ${n.name}  [${cid}]`);
    }
    process.exit(0);
  }

  const putUrl = `${base}/api/v1/workflows/${workflowId}`;
  const put = await api('PUT', putUrl, apiKey, putBody);
  if (!put.ok) {
    console.error(`PUT falhou ${put.status}: ${put.text.slice(0, 1200)}`);
    process.exit(1);
  }

  console.log('[n8n:push] Workflow atualizado com sucesso via API.');
  console.log('  Abra o n8n, confira o fluxo, teste uma execução e ligue Active se estiver off.');
  console.log('  Webhook produção:', `${base}/webhook/byla-transacao-export`);
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
