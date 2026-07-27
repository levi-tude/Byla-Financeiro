import assert from 'node:assert/strict';
import test from 'node:test';
import {
  exigeValidacaoExtratoPorForma,
  isFormaPagamentoDinheiro,
} from './pagamentoDinheiroFluxo.js';

test('isFormaPagamentoDinheiro reconhece variantes do Fluxo', () => {
  assert.equal(isFormaPagamentoDinheiro('Dinheiro'), true);
  assert.equal(isFormaPagamentoDinheiro('DINHEIRO'), true);
  assert.equal(isFormaPagamentoDinheiro('Espécie'), true);
  assert.equal(isFormaPagamentoDinheiro('PIX'), false);
  assert.equal(isFormaPagamentoDinheiro('Débito'), false);
});

test('exigeValidacaoExtratoPorForma', () => {
  assert.equal(exigeValidacaoExtratoPorForma('Dinheiro'), false);
  assert.equal(exigeValidacaoExtratoPorForma('Crédito'), true);
});
