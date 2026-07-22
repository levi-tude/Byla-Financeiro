import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classificarStatusConciliacao,
  parseDiaVencimentoCadastro,
  isPlanoBolsaConciliacao,
} from './conciliacaoStatusExtrato.js';

test('parseDiaVencimentoCadastro: "10" e "todo dia 10" → 10', () => {
  assert.equal(parseDiaVencimentoCadastro('10'), 10);
  assert.equal(parseDiaVencimentoCadastro('todo dia 10'), 10);
  assert.equal(parseDiaVencimentoCadastro(''), null);
});

test('bolsa não entra como pendente', () => {
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 10,
      dataCreditoIso: null,
      mes: 7,
      ano: 2026,
      planoBolsa: true,
    }),
    'bolsa',
  );
});

test('sem crédito → pendente; crédito dia 10 com venc 10 → em_dia; dia 11 → atrasado', () => {
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 10,
      dataCreditoIso: null,
      mes: 7,
      ano: 2026,
      planoBolsa: false,
    }),
    'pendente',
  );
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 10,
      dataCreditoIso: '2026-07-10',
      mes: 7,
      ano: 2026,
      planoBolsa: false,
    }),
    'em_dia',
  );
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 10,
      dataCreditoIso: '2026-07-11',
      mes: 7,
      ano: 2026,
      planoBolsa: false,
    }),
    'atrasado',
  );
});

test('crédito fora do mês de referência conta como pendente (não usa outro mês)', () => {
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 10,
      dataCreditoIso: '2026-06-10',
      mes: 7,
      ano: 2026,
      planoBolsa: false,
    }),
    'pendente',
  );
});

test('sem dia de vencimento → sem_vencimento', () => {
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: null,
      dataCreditoIso: '2026-07-05',
      mes: 7,
      ano: 2026,
      planoBolsa: false,
    }),
    'sem_vencimento',
  );
});
