import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { businessRules, DEFAULT_PADROES_EXTERNOS } from '../businessRules.js';

const sql = readFileSync(
  fileURLToPath(new URL('../../../scripts/migrations/2026-11-01-regras-externos-salario-samuel.sql', import.meta.url)),
  'utf8',
);

const codigo = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('paridade código × migração (regra salário Samuel)', () => {
  it('tolerância e janela da view = businessRules', () => {
    const tol = businessRules.transacoes.externalPairTolerance;
    const jan = businessRules.transacoes.externalPairJanelaDias;
    assert.strictEqual((codigo.match(new RegExp(`<= ${tol}\\b`, 'g')) ?? []).length, 2);
    assert.ok(codigo.includes(`abs(s.data - e.data) <= ${jan}`));
    assert.ok(codigo.includes(`abs(e.data - s.data) <= ${jan}`));
    assert.ok(!/<= 300\b/.test(codigo));
  });

  it('seed de regras_externos = fallback do código', () => {
    const seed = [...sql.matchAll(/^\s*\('([^']+)', '[^']*'\)[,\n]/gm)].map((m) => m[1]);
    assert.deepStrictEqual(seed, [...DEFAULT_PADROES_EXTERNOS]);
  });

  it('prefixo do Samuel igual', () => {
    assert.ok(sql.includes(`LIKE '${businessRules.transacoes.samuelNamePrefix}%'`));
  });
});
