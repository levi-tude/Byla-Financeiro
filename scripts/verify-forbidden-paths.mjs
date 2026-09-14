#!/usr/bin/env node
/**
 * Bloqueia commit/push se arquivos proibidos estiverem staged ou rastreados.
 * Uso: node scripts/verify-forbidden-paths.mjs [--staged-only]
 * Fonte: docs/NAO_COMMITAR.md
 */
import { execSync } from 'node:child_process';
import { findForbiddenInList } from './forbidden-git-paths.mjs';

const stagedOnly = process.argv.includes('--staged-only');

function fail(msg) {
  console.error(`\n[verify-forbidden-paths] BLOQUEADO: ${msg}\n`);
  console.error('Lista completa: docs/NAO_COMMITAR.md\n');
  process.exit(1);
}

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', shell: true }).trim();
}

let root;
try {
  root = sh('git rev-parse --show-toplevel');
} catch {
  fail('Execute dentro de um repositório Git.');
}
process.chdir(root);

const paths = new Set();

if (stagedOnly) {
  try {
    sh('git diff --cached --name-only').split(/\r?\n/).filter(Boolean).forEach((p) => paths.add(p));
  } catch {
    /* vazio */
  }
} else {
  try {
    sh('git ls-files').split(/\r?\n/).filter(Boolean).forEach((p) => paths.add(p));
  } catch {
    fail('git ls-files falhou.');
  }
  try {
    sh('git diff --cached --name-only').split(/\r?\n/).filter(Boolean).forEach((p) => paths.add(p));
  } catch {
    /* ok */
  }
}

const hits = findForbiddenInList([...paths]);
if (hits.length) {
  const lines = hits.map((h) => `  • ${h.path} — ${h.reason}`).join('\n');
  const scope = stagedOnly ? 'no stage (commit)' : 'rastreados ou no stage';
  fail(`Arquivo(s) proibido(s) ${scope}:\n${lines}`);
}

console.log('[verify-forbidden-paths] OK — nenhum caminho proibido detectado.');
