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

  it('transacoes: tipo inválido falha; omitido vira todos; entrada normaliza', () => {
    const bad = parseQuery(transacoesQuerySchema, { mes: '3', ano: '2026', tipo: 'xyz' });
    assert.equal(bad.ok, false);
    const ok = parseQuery(transacoesQuerySchema, { mes: '3', ano: '2026', tipo: 'Entrada' });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.data.tipo, 'entrada');
    const semTipo = parseQuery(transacoesQuerySchema, { mes: '3', ano: '2026' });
    assert.equal(semTipo.ok, true);
    if (semTipo.ok) assert.equal(semTipo.data.tipo, 'todos');
    const diaVazio = parseQuery(transacoesQuerySchema, { mes: '3', ano: '2026', tipo: 'todos', dia: '' });
    assert.equal(diaVazio.ok, true);
    if (diaVazio.ok) assert.equal(diaVazio.data.dia, undefined);
    const soFim = parseQuery(transacoesQuerySchema, { mes: '3', ano: '2026', tipo: 'todos', dia_fim: '2026-03-10' });
    assert.equal(soFim.ok, false);
    const periodo = parseQuery(transacoesQuerySchema, {
      mes: '3',
      ano: '2026',
      tipo: 'todos',
      dia: '2026-03-20',
      dia_fim: '2026-03-05',
    });
    assert.equal(periodo.ok, true);
    if (periodo.ok) {
      assert.equal(periodo.data.dia, '2026-03-20');
      assert.equal(periodo.data.dia_fim, '2026-03-05');
    }
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
