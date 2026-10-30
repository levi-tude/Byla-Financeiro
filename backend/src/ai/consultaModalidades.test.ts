import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolModalidades, toolEntradasModalidadePeriodo, type PagamentoFluxoRow } from '../services/consultaBylaTools.js';

const rows: PagamentoFluxoRow[] = [
  { aba: 'PILATES', modalidade: null, valor: 300 },
  { aba: 'PILATES', modalidade: 'Pilates Solo', valor: 200 },
  { aba: 'YOGA', modalidade: 'Yoga', valor: 150 },
];
const ctx = { mes: 9, ano: 2026 } as Parameters<typeof toolModalidades>[0];

test('resumo_modalidades agrupa por aba do fluxo e cita a fonte', async () => {
  const out = await toolModalidades(ctx, async () => rows);
  assert.match(out, /PILATES[^\n]*500,00/);
  assert.match(out, /YOGA[^\n]*150,00/);
  assert.match(out, /fluxo_pagamentos_operacionais|planilha|Fluxo/i);
});

test('resumo_modalidades sem dados → nenhum registro, nunca R$ 0', async () => {
  const out = await toolModalidades(ctx, async () => []);
  assert.match(out, /NENHUM REGISTRO ENCONTRADO/);
  assert.doesNotMatch(out, /R\$\s?0,00/);
});

test('entradas_modalidade_periodo filtra Pilates por mês', async () => {
  const out = await toolEntradasModalidadePeriodo('pilates', [{ mes: 8, ano: 2026 }, { mes: 9, ano: 2026 }], async () => rows);
  assert.match(out, /500,00/);
  assert.match(out, /1\.000,00/);
  assert.doesNotMatch(out, /150,00/);
});
