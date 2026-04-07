#!/usr/bin/env node
/**
 * Verificações antes de git push: arquivos sensíveis, build/test backend, npm audit.
 * Uso (na raiz do repo): node scripts/verify-git-push-safety.mjs
 * Opções: --no-build  (pula npm ci / build / test no backend)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--no-build');

function fail(msg) {
  console.error(`\n[verify-git-push-safety] BLOQUEADO: ${msg}\n`);
  process.exit(1);
}

function warn(msg) {
  console.warn(`[verify-git-push-safety] AVISO: ${msg}`);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    shell: true,
    ...opts,
  }).trim();
}

console.log('[verify-git-push-safety] Procurando raiz do repositório Git…');
let root;
try {
  root = sh('git rev-parse --show-toplevel');
} catch {
  fail('Execute este script dentro de um repositório Git.');
}
process.chdir(root);
console.log(`[verify-git-push-safety] OK → ${root}\n`);

// 1) Arquivos rastreados que não devem estar no Git
let tracked;
try {
  tracked = sh('git ls-files').split(/\r?\n/).filter(Boolean);
} catch {
  fail('git ls-files falhou.');
}

for (const f of tracked) {
  const b = path.basename(f);
  if (b === '.env' || (b.startsWith('.env.') && b !== '.env.example')) {
    fail(`Arquivo sensível rastreado: ${f}`);
  }
  if (/\.(pem|p12|pfx)$/i.test(f)) {
    fail(`Certificado/chave rastreado: ${f}`);
  }
  if (/service-account.*\.json$/i.test(f) || /\.credentials\.json$/i.test(f)) {
    fail(`JSON de credencial rastreado: ${f}`);
  }
}

// 2) Chave privada no conteúdo versionado (git grep: exit 1 = nenhum match)
try {
  const matches = sh('git grep -n "BEGIN RSA PRIVATE KEY" -- .');
  if (matches) fail(`Chave privada detectada no repositório:\n${matches.slice(0, 800)}`);
} catch (e) {
  const code = e?.status ?? e?.code;
  if (code !== 1 && code !== '1') {
    warn(`git grep RSA falhou (code ${code}) — revise manualmente.`);
  }
}

try {
  const matches = sh('git grep -n "BEGIN OPENSSH PRIVATE KEY" -- .');
  if (matches) fail(`Chave OpenSSH detectada:\n${matches.slice(0, 800)}`);
} catch (e) {
  const code = e?.status ?? e?.code;
  if (code !== 1 && code !== '1') {
    warn(`git grep OpenSSH falhou (code ${code}).`);
  }
}

// 3) .gitignore
const giPath = path.join(root, '.gitignore');
if (fs.existsSync(giPath)) {
  const gi = fs.readFileSync(giPath, 'utf8');
  if (!gi.includes('.env')) {
    warn('.gitignore deveria listar .env — confira.');
  }
}

// 4) Backend: build + test
if (!skipBuild) {
  const backendDir = path.join(root, 'backend');
  if (!fs.existsSync(path.join(backendDir, 'package.json'))) {
    warn('Pasta backend/ não encontrada — pulando build.');
  } else {
    console.log('[verify-git-push-safety] backend: npm ci && npm run build && npm test …\n');
    try {
      execSync('npm ci && npm run build && npm test', {
        cwd: backendDir,
        stdio: 'inherit',
        shell: true,
      });
    } catch {
      fail('Build ou testes do backend falharam.');
    }
    console.log('\n[verify-git-push-safety] backend OK.\n');
  }
} else {
  warn('Build/test do backend ignorados (--no-build).');
}

// 5) npm audit (crítico)
for (const pkg of ['backend', 'frontend']) {
  const dir = path.join(root, pkg);
  if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
  try {
    execSync('npm audit --audit-level=critical', {
      cwd: dir,
      stdio: 'pipe',
      shell: true,
    });
    console.log(`[verify-git-push-safety] npm audit (${pkg}): OK (sem críticas).`);
  } catch {
    warn(`npm audit (${pkg}) — rode manualmente: cd ${pkg} && npm audit`);
  }
}

console.log(`
[verify-git-push-safety] Verificações automáticas concluídas.

Revise manualmente antes do push:
  git status
  git log origin/main..HEAD --oneline
  git diff --stat origin/main..HEAD

Push (quando estiver pronto):
  git push origin main
`);
