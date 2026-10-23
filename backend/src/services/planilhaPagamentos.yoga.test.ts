import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTripletsFromMonthAndPaymentRows } from './planilhaPagamentos.js';

test('YOGA: ano sem cabeçalho Data/forma/Valor ainda gera triplas (ex. 2026)', () => {
  const monthRow: string[] = [];
  const header: string[] = [];
  monthRow[7] = 'JANEIRO';
  header[7] = 'Data';
  header[8] = 'forma';
  header[9] = 'Valor';
  monthRow[10] = 'FEVEREIRO';
  header[10] = 'Data';
  header[11] = 'forma';
  header[12] = 'Valor';
  monthRow[43] = '2024';
  monthRow[44] = 'JANEIRO';
  header[44] = 'Data';
  header[45] = 'forma';
  header[46] = 'Valor';
  monthRow[117] = '2026';
  const meses2026 = [
    'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
  ];
  meses2026.forEach((m, k) => {
    monthRow[118 + k * 3] = m;
  });
  // 2026 sem Data/forma/Valor no cabeçalho

  const triplets = buildTripletsFromMonthAndPaymentRows(monthRow, header, 2026);
  const y2026 = triplets.filter((t) => t.year === 2026);
  assert.ok(y2026.length >= 3, `esperava meses 2026, veio ${y2026.length}`);
  assert.equal(y2026.find((t) => t.month === 1)?.startIdx, 118);
  assert.equal(y2026.find((t) => t.month === 8)?.startIdx, 139);
});

test('célula solta com nome de mês numa linha de aluno não vira coluna de pagamento', () => {
  const linhaAluno: string[] = [];
  const header: string[] = [];
  linhaAluno[0] = 'Aluna Fictícia';
  linhaAluno[123] = 'MARÇO';
  header[9] = 'Data';
  header[10] = 'forma';
  header[11] = 'Valor';

  const triplets = buildTripletsFromMonthAndPaymentRows(linhaAluno, header, 2026);
  assert.equal(triplets.length, 0);
});

test('aba com cabeçalho completo em todos os anos não ganha colunas extras', () => {
  const monthRow: string[] = [];
  const header: string[] = [];
  const meses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO'];
  meses.forEach((m, k) => {
    const i = 9 + k * 3;
    monthRow[i] = m;
    header[i] = 'Data';
    header[i + 1] = 'forma';
    header[i + 2] = 'Valor';
  });

  const triplets = buildTripletsFromMonthAndPaymentRows(monthRow, header, 2026);
  assert.deepEqual(
    triplets.map((t) => t.startIdx),
    [9, 12, 15, 18, 21, 24],
  );
});
