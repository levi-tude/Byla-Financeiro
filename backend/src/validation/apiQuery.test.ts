import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mesAnoQuerySchema,
  parseQuery,
  transacoesQuerySchema,
  fluxoCompletoQuerySchema,
} from './apiQuery.js';

describe('apiQuery', () => {
  it('mesAno aceita strings de query', () => {
    const r = parseQuery(mesAnoQuerySchema, { mes: '3', ano: '2026' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.data.mes, 3);
      assert.equal(r.data.ano, 2026);
    }
  });

  it('transacoes exige tipo entrada ou saida', () => {
    const bad = parseQuery(transacoesQuerySchema, { mes: '3', ano: '2026', tipo: 'xyz' });
    assert.equal(bad.ok, false);
    const ok = parseQuery(transacoesQuerySchema, { mes: '3', ano: '2026', tipo: 'Entrada' });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.data.tipo, 'entrada');
  });

  it('fluxo permite omitir mes e ano', () => {
    const r = parseQuery(fluxoCompletoQuerySchema, {});
    assert.equal(r.ok, true);
  });

  it('fluxo rejeita so mes sem ano', () => {
    const r = parseQuery(fluxoCompletoQuerySchema, { mes: '3' });
    assert.equal(r.ok, false);
  });
});
