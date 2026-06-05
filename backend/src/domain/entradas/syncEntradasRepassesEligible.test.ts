import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mesPermiteSincronizarEntradasRepasses } from './syncEntradasRepassesEligible.js';

describe('mesPermiteSincronizarEntradasRepasses', () => {
  it('bloqueia meses anteriores a jun/2026', () => {
    assert.equal(mesPermiteSincronizarEntradasRepasses(5, 2026), false);
    assert.equal(mesPermiteSincronizarEntradasRepasses(1, 2026), false);
    assert.equal(mesPermiteSincronizarEntradasRepasses(12, 2025), false);
  });

  it('permite jun/2026 em diante', () => {
    assert.equal(mesPermiteSincronizarEntradasRepasses(6, 2026), true);
    assert.equal(mesPermiteSincronizarEntradasRepasses(7, 2026), true);
    assert.equal(mesPermiteSincronizarEntradasRepasses(1, 2027), true);
  });
});
