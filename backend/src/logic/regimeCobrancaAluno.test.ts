import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alunoSemCobrancaObrigatoria,
  isPlanoBolsaTexto,
  parseRegimeCobranca,
  resolverRegimeCobranca,
} from './regimeCobrancaAluno.js';

test('parseRegimeCobranca: aceita normal, bolsa, excecao (com/sem acento)', () => {
  assert.equal(parseRegimeCobranca('normal'), 'normal');
  assert.equal(parseRegimeCobranca('Bolsa'), 'bolsa');
  assert.equal(parseRegimeCobranca('exceção'), 'excecao');
  assert.equal(parseRegimeCobranca('excecao'), 'excecao');
  assert.equal(parseRegimeCobranca('xyz'), null);
});

test('resolverRegimeCobranca: coluna ganha sobre plano', () => {
  assert.equal(resolverRegimeCobranca({ regime_cobranca: 'excecao', plano: 'Mensal' }), 'excecao');
  assert.equal(resolverRegimeCobranca({ regime_cobranca: 'bolsa', plano: 'Mensal' }), 'bolsa');
  assert.equal(resolverRegimeCobranca({ regime_cobranca: 'normal', plano: 'Bolsa integral' }), 'bolsa');
  assert.equal(resolverRegimeCobranca({ regime_cobranca: null, plano: 'Mensal' }), 'normal');
});

test('isPlanoBolsaTexto e alunoSemCobrancaObrigatoria', () => {
  assert.equal(isPlanoBolsaTexto('Bolsa'), true);
  assert.equal(isPlanoBolsaTexto('Mensal'), false);
  assert.equal(alunoSemCobrancaObrigatoria({ regime_cobranca: 'excecao' }), true);
  assert.equal(alunoSemCobrancaObrigatoria({ plano: 'bolsa 50%' }), true);
  assert.equal(alunoSemCobrancaObrigatoria({ regime_cobranca: 'normal', plano: 'Mensal' }), false);
});
