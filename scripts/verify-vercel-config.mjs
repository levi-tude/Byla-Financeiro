#!/usr/bin/env node
/**
 * Garante que o deploy na Vercel não volte a publicar a landing da raiz
 * em vez do painel em frontend/.
 * Uso (na raiz): node scripts/verify-vercel-config.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg) {
  console.error(`\n[verify-vercel-config] BLOQUEADO: ${msg}\n`);
  process.exit(1);
}

const vercelPath = path.join(root, 'vercel.json');
if (!fs.existsSync(vercelPath)) {
  fail('Falta vercel.json na raiz do repositório. Sem ele, a Vercel pode buildar a landing errada.');
}

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
} catch (e) {
  fail(`vercel.json inválido: ${e.message}`);
}

const output = cfg.outputDirectory ?? '';
const build = cfg.buildCommand ?? '';
const install = cfg.installCommand ?? '';

if (!output.includes('frontend/dist')) {
  fail(`outputDirectory deve ser "frontend/dist" (atual: "${output || '(vazio)'}").`);
}
if (!build.includes('frontend')) {
  fail(`buildCommand deve buildar frontend/ (atual: "${build || '(vazio)'}").`);
}
if (!install.includes('frontend')) {
  fail(`installCommand deve instalar em frontend/ (atual: "${install || '(vazio)'}").`);
}

const painelHtml = path.join(root, 'frontend', 'index.html');
const landingHtml = path.join(root, 'index.html');
if (!fs.existsSync(painelHtml)) fail('frontend/index.html não encontrado.');
const painelTitleOk = (html) =>
  html.includes('Byla Financeiro') || html.includes('Byla – Painel Financeiro');
if (!painelTitleOk(fs.readFileSync(painelHtml, 'utf8'))) {
  fail('frontend/index.html deve ter título "Byla Financeiro" (ou legado "Byla – Painel Financeiro").');
}
if (fs.existsSync(landingHtml)) {
  const landing = fs.readFileSync(landingHtml, 'utf8');
  if (landing.includes('Salas para locação') && !landing.includes('Painel Financeiro') && !landing.includes('Byla Financeiro')) {
    console.log('[verify-vercel-config] OK: landing de marketing isolada na raiz (não será o output do painel).');
  }
}

const distIndex = path.join(root, 'frontend', 'dist', 'index.html');
if (fs.existsSync(distIndex)) {
  const built = fs.readFileSync(distIndex, 'utf8');
  if (!painelTitleOk(built)) {
    fail('frontend/dist/index.html não é o painel — rode npm run build --prefix frontend antes do deploy.');
  }
  if (built.includes('Salas para locação')) {
    fail('frontend/dist/index.html parece ser a landing errada.');
  }
}

console.log('[verify-vercel-config] OK — Vercel configurada para publicar o painel em frontend/dist.');
