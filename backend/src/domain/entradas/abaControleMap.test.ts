import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hintAbaFluxoParaControle } from './abaControleMap.js';

describe('hintAbaFluxoParaControle', () => {
  it('mapeia BYLA DANÇA', () => {
    const h = hintAbaFluxoParaControle('BYLA DANÇA', 'Contemporânea');
    assert.equal(h?.templateKeyPreferido, 'ent_parc_danca');
  });

  it('separa Teatro Infantil', () => {
    const h = hintAbaFluxoParaControle('TEATRO INFANTIL', '');
    assert.equal(h?.templateKeyPreferido, 'ent_parc_teatro_infantil');
  });

  it('mapeia Pilates Mari', () => {
    const h = hintAbaFluxoParaControle('PILATES MARINA', '');
    assert.equal(h?.templateKeyPreferido, 'ent_parc_pilates_mari');
  });
});
