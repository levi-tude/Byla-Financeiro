/**
 * Verificações locais antes do Blueprint Render (build + checklist de env).
 * Uso: npm run verify:render-deploy (na pasta backend)
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

function run(cmd: string, args: string[]): boolean {
  const r = spawnSync(cmd, args, {
    cwd: backendRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return r.status === 0;
}

console.log('[verify:render-deploy] Pasta backend:', backendRoot);
console.log('[verify:render-deploy] 1/2 — npm run build (mesmo comando do Render)...\n');

if (!run('npm', ['run', 'build'])) {
  console.error('\n[verify:render-deploy] FALHA: corrija o build antes do deploy.');
  process.exit(1);
}

console.log('\n[verify:render-deploy] 2/2 — Variáveis obrigatórias no painel Render (sync: false no render.yaml):\n');
const keys = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_SHEETS_ENTRADA_SAIDA_ID',
  'GOOGLE_SHEETS_CREDENTIALS_JSON',
  'BYLA_SYNC_SECRET',
  'GEMINI_API_KEY (opcional)',
];
for (const k of keys) {
  console.log(`  • ${k}`);
}
console.log('\n[verify:render-deploy] OK — próximo passo humano: git push do render.yaml e Apply no Blueprint.');
console.log('  Link: https://dashboard.render.com/blueprint/new?repo=https://github.com/levi-tude/Byla-Landingpage\n');
