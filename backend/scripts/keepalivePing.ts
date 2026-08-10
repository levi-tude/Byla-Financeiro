/**
 * Keep-alive do backend Render Free: GET /health.
 * Uso local/cron: BYLA_BACKEND_URL=https://byla-backend.onrender.com npx tsx scripts/keepalivePing.ts
 */
const base = (process.env.BYLA_BACKEND_URL ?? 'https://byla-backend.onrender.com').replace(/\/$/, '');
const url = `${base}/health`;

const res = await fetch(url, { method: 'GET', headers: { accept: 'application/json' } });
if (!res.ok) {
  console.error(`[keepalive] FAIL ${url} status=${res.status}`);
  process.exit(1);
}
const body = await res.text();
console.log(`[keepalive] OK ${url} ${body.slice(0, 120)}`);
