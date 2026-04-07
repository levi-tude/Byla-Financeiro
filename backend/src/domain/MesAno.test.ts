import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureQuotedA1Range,
  mesAnoParaAbaControleDeCaixa,
  nomeAbaControleDeCaixa,
  rangeA1ProbeFromFullRange,
  rangeA1Quoted,
  rangeA1ZQuoted,
  tituloAbaControleParaMesReferencia,
} from './MesAno.js';

test('controle de caixa: período fev/26 → título da aba MARÇO 26', () => {
  const aba = mesAnoParaAbaControleDeCaixa(2, 2026);
  assert.equal(nomeAbaControleDeCaixa(aba), 'MARÇO 26');
});

test('controle de caixa: período mar/26 → título da aba ABRIL 26', () => {
  const aba = mesAnoParaAbaControleDeCaixa(3, 2026);
  assert.equal(nomeAbaControleDeCaixa(aba), 'ABRIL 26');
});

test('controle de caixa: período dez/26 → título da aba JANEIRO 27', () => {
  const aba = mesAnoParaAbaControleDeCaixa(12, 2026);
  assert.equal(nomeAbaControleDeCaixa(aba), 'JANEIRO 27');
});

test('controle de caixa: período jan/26 → título da aba FEVEREIRO 26', () => {
  const aba = mesAnoParaAbaControleDeCaixa(1, 2026);
  assert.equal(nomeAbaControleDeCaixa(aba), 'FEVEREIRO 26');
});

test('tituloAbaControleParaMesReferencia: mar/26 → ABRIL 26', () => {
  assert.equal(tituloAbaControleParaMesReferencia(3, 2026), 'ABRIL 26');
});

test('range A1 com aspas para API Google Sheets (aba com espaço)', () => {
  assert.equal(rangeA1ZQuoted('MARÇO 26'), "'MARÇO 26'!A:Z");
  assert.equal(rangeA1Quoted("O'Brien", 'A1'), "'O''Brien'!A1");
});

test('ensureQuotedA1Range normaliza env sem aspas', () => {
  assert.equal(ensureQuotedA1Range('MARÇO 26!A:Z'), "'MARÇO 26'!A:Z");
  assert.equal(ensureQuotedA1Range("'MARÇO 26'!A:Z"), "'MARÇO 26'!A:Z");
});

test('rangeA1ProbeFromFullRange → mesma aba, célula A1', () => {
  assert.equal(rangeA1ProbeFromFullRange('MARÇO 26!A:Z'), "'MARÇO 26'!A1");
  assert.equal(rangeA1ProbeFromFullRange("'ABRIL 26'!A:Z"), "'ABRIL 26'!A1");
});
