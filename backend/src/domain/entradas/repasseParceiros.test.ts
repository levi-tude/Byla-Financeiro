import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcularRepasse } from './repasseParceiros.js';

describe('calcularRepasse', () => {
  it('Dança: 60% da entrada', () => {
    assert.equal(calcularRepasse('ent_parc_danca', 1000), 600);
  });

  it('Yoga: (E + 480) / 2', () => {
    assert.equal(calcularRepasse('ent_parc_yoga', 2000), 1240);
  });

  it('Pilates Mari: 55% × (E + 460)', () => {
    assert.equal(calcularRepasse('ent_parc_pilates_mari', 3000), 1903);
  });

  it('Teatro / Infantil / GR: 50%', () => {
    assert.equal(calcularRepasse('ent_parc_teatro', 800), 400);
    assert.equal(calcularRepasse('ent_parc_teatro_infantil', 800), 400);
    assert.equal(calcularRepasse('ent_parc_bruna_gr', 800), 400);
  });
});
