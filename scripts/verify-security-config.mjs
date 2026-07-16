#!/usr/bin/env node
/**
 * Checagens locais de segurança antes de push/deploy.
 * Uso: npm run verify:security
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg) {
  console.error(`\n[verify-security] BLOQUEADO: ${msg}\n`);
  process.exit(1);
}

function sh(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8', shell: true }).trim();
}

// 1) Nunca commitar chaves reais
const forbiddenInTracked = [
  /BEGIN (RSA|OPENSSH) PRIVATE KEY/,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]?[a-zA-Z0-9_-]{20,}/,
  /service_role['"]?\s*:\s*['"][a-zA-Z0-9._-]{20,}/i,
  /GOOGLE_SHEETS_CREDENTIALS_JSON\s*=\s*\{/,
];
let tracked;
try {
  tracked = sh('git ls-files').split(/\r?\n/).filter(Boolean);
} catch {
  fail('Execute dentro de um repositório Git.');
}

const codeExt = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.env', '.yaml', '.yml']);
for (const f of tracked) {
  if (f.includes('node_modules')) continue;
  const ext = path.extname(f).toLowerCase();
  if (!codeExt.has(ext)) continue;
  if (f.endsWith('.example') || /verify-(git-push-safety|security|vercel)/.test(f)) continue;
  const full = path.join(root, f);
  if (!fs.existsSync(full) || fs.statSync(full).size > 2_000_000) continue;
  const text = fs.readFileSync(full, 'utf8');
  for (const re of forbiddenInTracked) {
    if (re.test(text)) fail(`Possível segredo em arquivo versionado: ${f}`);
  }
}

// 2) Frontend não pode referenciar service_role
const frontEnvExample = path.join(root, 'frontend', '.env.example');
if (fs.existsSync(frontEnvExample)) {
  const ex = fs.readFileSync(frontEnvExample, 'utf8');
  // Só bloqueia atribuição real de chave; comentários de aviso (NUNCA use service_role) são OK.
  if (/^\s*(?:VITE_)?SUPABASE_SERVICE_ROLE(?:_KEY)?\s*=/im.test(ex)) {
    fail('frontend/.env.example não deve definir SUPABASE_SERVICE_ROLE_KEY.');
  }
}

for (const f of ['frontend/src', 'src']) {
  const dir = path.join(root, f);
  if (!fs.existsSync(dir)) continue;
  try {
    const hits = sh(`git grep -l "service_role" -- "${f}" 2>nul || exit 0`);
    if (hits) fail(`service_role no código do frontend: ${hits}`);
  } catch {
    /* nenhum match */
  }
}

// 3) Script de hardening Supabase presente
const hardening = path.join(root, 'scripts', 'supabase-security-hardening.sql');
if (!fs.existsSync(hardening)) {
  fail('Falta scripts/supabase-security-hardening.sql');
}
if (!fs.readFileSync(hardening, 'utf8').includes('ENABLE ROW LEVEL SECURITY')) {
  fail('supabase-security-hardening.sql incompleto.');
}

// 4) Headers de segurança na Vercel
const vercel = path.join(root, 'vercel.json');
if (fs.existsSync(vercel)) {
  const v = JSON.parse(fs.readFileSync(vercel, 'utf8'));
  const headers = v.headers ?? [];
  const names = new Set(
    headers.flatMap((h) => (h.headers ?? []).map((x) => x.key?.toLowerCase()))
  );
  if (!names.has('x-content-type-options') || !names.has('x-frame-options')) {
    fail('vercel.json deve definir X-Content-Type-Options e X-Frame-Options.');
  }
}

// 5) Backend exige auth por padrão
const authTs = path.join(root, 'backend', 'src', 'middleware', 'auth.ts');
if (fs.existsSync(authTs)) {
  const a = fs.readFileSync(authTs, 'utf8');
  if (!a.includes("BYLA_AUTH_ENFORCE ?? 'true'")) {
    fail('Backend deve manter BYLA_AUTH_ENFORCE=true por padrão.');
  }
}

console.log('[verify-security] OK — checagens locais de segurança passaram.');
