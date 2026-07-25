import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inferirMeioPagamentoVinculo,
  inferirMeioPagamentoFluxo,
  formaFluxoCompativelComBanco,
  fluxoPermiteSugestaoVendasCredito,
} from './meioPagamentoVinculo.js';

test('meios', () => {
  assert.equal(inferirMeioPagamentoVinculo({ pessoa: 'Vendas' }), 'credito_recorrente');
  assert.equal(inferirMeioPagamentoVinculo({ pessoa: 'Disponivel CREDITO VISA' }), 'credito_recorrente');
  assert.equal(inferirMeioPagamentoVinculo({ pessoa: 'PIX ANA' }), 'pix');
  assert.equal(inferirMeioPagamentoVinculo({ pessoa: 'Disponivel DEBITO VISA' }), 'debito');
});

test('inferirMeioPagamentoFluxo', () => {
  assert.equal(inferirMeioPagamentoFluxo('DEBITO'), 'debito');
  assert.equal(inferirMeioPagamentoFluxo('débito'), 'debito');
  assert.equal(inferirMeioPagamentoFluxo('PIX'), 'pix');
  assert.equal(inferirMeioPagamentoFluxo('Crédito recorrente'), 'credito_recorrente');
});

test('formaFluxoCompativelComBanco: debito não casa com crédito', () => {
  assert.equal(
    formaFluxoCompativelComBanco('DEBITO', {
      pessoa: 'Disponivel DEBITO VISA',
      descricao: 'Disponivel DEBITO VISA',
    }),
    true,
  );
  assert.equal(
    formaFluxoCompativelComBanco('DEBITO', {
      pessoa: 'Disponivel CREDITO MASTERCARD',
      descricao: 'Disponivel CREDITO MASTERCARD',
    }),
    false,
  );
  assert.equal(fluxoPermiteSugestaoVendasCredito('DEBITO'), false);
  assert.equal(fluxoPermiteSugestaoVendasCredito('Crédito'), true);
});
