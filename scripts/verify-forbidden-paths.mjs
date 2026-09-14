#!/usr/bin/env node
/**
 * Bloqueia paths da lista oficial (docs/NAO_COMMITAR.md) no Git.
 * Uso (raiz do repo):
 *   node scripts/verify-forbidden-paths.mjs
 *   node scripts/verify-forbidden-paths.mjs --staged-only
 */
import { execSync } from 'node:child_process';
import { findForbiddenInList } from './forbidden-git-paths.mjs';

const args = new Set(process.argv.slice(2));
const stagedOnly = args.has('--staged-only');

function fail(msg) {
  console.error(`\n[verify-forbidden-paths] BLOQUEADO: ${msg}\n`);
  process.exit(1);
}

function sh(cmd) {
  return execSync(cmd, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    shell: true,
  }).trim();
}

let root;
try {
  root = sh('git rev-parse --show-toplevel');
} catch {
  fail('Execute este script dentro de um repositório Git.');
}
process.chdir(root);

const cmd = stagedOnly
  ? 'git diff --cached --name-only --diff-filter=ACMR'
  : 'git ls-files';

let raw;
try {
  raw = sh(cmd);
} catch {
  fail(`${cmd} falhou.`);
}

const paths = raw ? raw.split(/\r?\n/).filter(Boolean) : [];
const hits = findForbiddenInList(paths);

if (hits.length) {
  const lines = hits.map((h) => `  - ${h.path}  (${h.id}: ${h.reason})`).join('\n');
  fail(
    `paths proibidos no ${stagedOnly ? 'stage' : 'Git'} (ver docs/NAO_COMMITAR.md):\n${lines}`,
  );
}

const scope = stagedOnly ? 'stage' : 'arquivos rastreados';
console.log(`[verify-forbidden-paths] OK — nenhum path proibido ${stagedOnly ? 'no' : 'nos'} ${scope}.`);
