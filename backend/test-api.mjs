#!/usr/bin/env node
const BASE = 'http://localhost:3001';
async function get(path) {
  const res = await fetch(BASE + path);
  const data = await res.json();
  return { status: res.status, data };
}
async function main() {
  await new Promise(r => setTimeout(r, 2000));
  console.log('=== /health ===');
  const h = await get('/health');
  console.log('Status:', h.status, JSON.stringify(h.data, null, 2));
  console.log('\n=== /api/alunos-completo ===');
  const a = await get('/api/alunos-completo');
  console.log('Status:', a.status);
  console.log('Origem:', a.data?.origem);
  console.log('Linhas combinado:', a.data?.combinado?.length ?? 0);
  if (a.data?.sheet_error) console.log('sheet_error:', a.data.sheet_error);
  else console.log('Amostra (primeiras 2):', JSON.stringify((a.data?.combinado || []).slice(0, 2), null, 2));
  console.log('\n=== /api/fluxo-completo ===');
  const f = await get('/api/fluxo-completo');
  console.log('Status:', f.status);
  console.log('Origem:', f.data?.origem);
  console.log('Entrada Total:', f.data?.combinado?.entradaTotal);
  console.log('Saída Total:', f.data?.combinado?.saidaTotal);
  console.log('Lucro Total:', f.data?.combinado?.lucroTotal);
  if (f.data?.sheet_error) console.log('sheet_error:', f.data.sheet_error);
}
main().catch(e => { console.error(e); process.exit(1); });
