import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cortarBlocosNaLinhaTotal, checarConsistenciaControle } from './planilhaControleCorteTotal.js';

// Aba fictícia no formato do CONTROLE DE CAIXA.
const aba = (): string[][] => [
  ['ENTRADAS X', '', 'ENTRADAS Y', '', '', 'SAÍDAS A', '', 'SAÍDAS B', ''],
  ['Item1', '100', 'Sala1', '50', '', 'Item1', '60', 'Luz', '10'],
  ['Item2', '200', 'TOTAL', '50', '', 'TOTAL', '60', 'Agua', '20'],
  ['TOTAL', '300', 'Entrada Total', '350', '', '', '', 'TOTAL', '30'],
  ['', '', 'Saída Total', '90', '', '', '', '', ''],
  ['', '', 'LUCRO TOTAL', '', '', '', '', '', ''],
  ['', '', '260', '', '', '', '', '', '999'],
  ['', '', '', '', '', '', '', '13º', '77'],
];

test('corta tudo abaixo do TOTAL de cada bloco, inclusive 13º e números sem rótulo', () => {
  const { values, totaisBlocos } = cortarBlocosNaLinhaTotal(aba());
  assert.equal(values[7][7], '');
  assert.equal(values[7][8], '');
  assert.equal(values[6][8], '');
  assert.deepEqual(totaisBlocos.map((t) => [t.titulo, t.total]), [
    ['ENTRADAS X', 300], ['ENTRADAS Y', 50], ['SAÍDAS A', 60], ['SAÍDAS B', 30],
  ]);
});

test('mantém rótulos de total geral e o número logo abaixo do Lucro', () => {
  const { values } = cortarBlocosNaLinhaTotal(aba());
  assert.equal(values[3][2], 'Entrada Total');
  assert.equal(values[3][3], '350');
  assert.equal(values[4][2], 'Saída Total');
  assert.equal(values[5][2], 'LUCRO TOTAL');
  assert.equal(values[6][2], '260');
});

const blocosOk = [
  { tipo: 'entrada' as const, titulo: 'ENTRADAS X', linhas: [{ valorNum: 100 }, { valorNum: 200 }] },
  { tipo: 'entrada' as const, titulo: 'ENTRADAS Y', linhas: [{ valorNum: 50 }] },
  { tipo: 'saida' as const, titulo: 'SAÍDAS A', linhas: [{ valorNum: 60 }] },
  { tipo: 'saida' as const, titulo: 'SAÍDAS B', linhas: [{ valorNum: 10 }, { valorNum: 20 }] },
];
const totaisBlocos = [
  { titulo: 'ENTRADAS X', total: 300 }, { titulo: 'ENTRADAS Y', total: 50 },
  { titulo: 'Saídas A', total: 60 }, { titulo: 'SAÍDAS B', total: 30 },
];

test('sem divergência quando tudo bate', () => {
  assert.deepEqual(checarConsistenciaControle({ blocos: blocosOk, totaisBlocos, entradaTotal: 350, saidaTotal: 90, lucroLido: 260 }), []);
});

test('tolerância de 1 centavo', () => {
  assert.deepEqual(checarConsistenciaControle({ blocos: blocosOk, totaisBlocos, entradaTotal: 350.01, saidaTotal: 90, lucroLido: 260.01 }), []);
});

test('aponta bloco e totais gerais divergentes', () => {
  const blocos = blocosOk.map((b) => (b.titulo === 'SAÍDAS B' ? { ...b, linhas: [...b.linhas, { valorNum: 77 }] } : b));
  const d = checarConsistenciaControle({ blocos, totaisBlocos, entradaTotal: 350, saidaTotal: 90, lucroLido: 250 });
  assert.deepEqual(d.map((x) => [x.item, x.diferenca]), [['bloco SAÍDAS B', 77], ['Saída total', 77], ['Lucro total', 10]]);
});
