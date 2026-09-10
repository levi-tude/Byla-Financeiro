import assert from 'node:assert/strict';
import test from 'node:test';
import { rotuloConciliacaoExtratoFluxo } from './conciliacaoExtratoFluxoLabels.js';

test('rótulo: extrato ok + fluxo pendente ≠ não pagou', () => {
  assert.equal(
    rotuloConciliacaoExtratoFluxo({
      status: 'em_dia',
      extrato: 'confirmado',
      fluxo: 'pendente',
    }),
    'Pago no banco · Fluxo pendente',
  );
});

test('rótulo: ambos ok', () => {
  assert.equal(
    rotuloConciliacaoExtratoFluxo({
      status: 'em_dia',
      extrato: 'confirmado',
      fluxo: 'ok',
    }),
    'Pago · Fluxo ok',
  );
});

test('rótulo: sem extrato + fluxo com data', () => {
  assert.equal(
    rotuloConciliacaoExtratoFluxo({
      status: 'pendente',
      extrato: 'nao',
      fluxo: 'ok',
    }),
    'Fluxo com data · extrato sem vínculo',
  );
});

test('rótulo: pendente real', () => {
  assert.equal(
    rotuloConciliacaoExtratoFluxo({
      status: 'pendente',
      extrato: 'nao',
      fluxo: 'pendente',
    }),
    'Pendente',
  );
});
