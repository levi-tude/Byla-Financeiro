import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classificarStatusConciliacao,
  dataVencimentoEfetiva,
  parseDiaVencimentoCadastro,
} from './conciliacaoStatusExtrato.js';
import { isFeriadoBrasilBahia, pascoaDomingo, toIsoDate } from './feriadosBrasilBahia.js';

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

test('exceção não entra como pendente', () => {
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 10,
      dataCreditoIso: null,
      mes: 7,
      ano: 2026,
      regime: 'excecao',
    }),
    'excecao',
  );
});

test('sem crédito → pendente; crédito no dia útil do vencimento → em_dia; depois → atrasado', () => {
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
  // 2026-07-10 é sexta (útil)
  assert.equal(dataVencimentoEfetiva(2026, 7, 10), '2026-07-10');
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

test('crédito antes do mês de referência conta como pendente', () => {
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

test('vencimento sábado → efetiva segunda; paga segunda → em_dia', () => {
  // 2026-08-01 é sábado
  assert.equal(dataVencimentoEfetiva(2026, 8, 1), '2026-08-03');
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 1,
      dataCreditoIso: '2026-08-03',
      mes: 8,
      ano: 2026,
    }),
    'em_dia',
  );
});

test('vencimento domingo → efetiva segunda; paga segunda → em_dia', () => {
  // 2026-08-02 é domingo
  assert.equal(dataVencimentoEfetiva(2026, 8, 2), '2026-08-03');
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 2,
      dataCreditoIso: '2026-08-03',
      mes: 8,
      ano: 2026,
    }),
    'em_dia',
  );
});

test('vencimento sexta útil + paga sábado → atrasado', () => {
  // 2026-07-10 sexta
  assert.equal(dataVencimentoEfetiva(2026, 7, 10), '2026-07-10');
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 10,
      dataCreditoIso: '2026-07-11',
      mes: 7,
      ano: 2026,
    }),
    'atrasado',
  );
});

test('feriado nacional move vencimento (Tiradentes 21/04/2026 é terça)', () => {
  assert.equal(isFeriadoBrasilBahia('2026-04-21'), true);
  assert.equal(dataVencimentoEfetiva(2026, 4, 21), '2026-04-22');
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 21,
      dataCreditoIso: '2026-04-22',
      mes: 4,
      ano: 2026,
    }),
    'em_dia',
  );
});

test('feriado Bahia (Independência 02/07) move vencimento', () => {
  assert.equal(isFeriadoBrasilBahia('2026-07-02'), true);
  // 2026-07-02 é quinta
  assert.equal(dataVencimentoEfetiva(2026, 7, 2), '2026-07-03');
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 2,
      dataCreditoIso: '2026-07-03',
      mes: 7,
      ano: 2026,
    }),
    'em_dia',
  );
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 2,
      dataCreditoIso: '2026-07-04',
      mes: 7,
      ano: 2026,
    }),
    'atrasado',
  );
});

test('páscoa 2026 conhecida (5 abr) — sexta santa é feriado', () => {
  const p = pascoaDomingo(2026);
  assert.equal(toIsoDate(p.ano, p.mes, p.dia), '2026-04-05');
  assert.equal(isFeriadoBrasilBahia('2026-04-03'), true); // sexta santa
});
