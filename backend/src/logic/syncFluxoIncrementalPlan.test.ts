import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  planAlunosIncremental,
  planPagamentosIncremental,
  type PagamentoDesiredIncremental,
  type PagamentoExistingIncremental,
} from './syncFluxoIncrementalPlan.js';

function desired(partial: Partial<PagamentoDesiredIncremental> & { aluno_nome: string }): PagamentoDesiredIncremental {
  return {
    aba: 'YOGA',
    modalidade: 'Yoga',
    linha_planilha: 4,
    ordem_lancamento: 1,
    data_pagamento: '2026-05-04',
    forma: 'PIX',
    valor: 250,
    mes_competencia: 5,
    ano_competencia: 2026,
    responsaveis: null,
    pagador_pix: null,
    ...partial,
  };
}

function existing(
  id: string,
  partial: Partial<PagamentoExistingIncremental> & { aluno_nome: string },
): PagamentoExistingIncremental {
  return {
    ...desired(partial),
    id,
    origem: partial.origem ?? 'migracao_planilha',
  };
}

test('pagamento idêntico → inalterado, uuid igual', () => {
  const plan = planPagamentosIncremental({
    desired: [desired({ aluno_nome: 'Aluno Demo Silva' })],
    existing: [existing('uuid-demo-1', { aluno_nome: 'Aluno Demo Silva' })],
    vinculadosIds: new Set(['uuid-demo-1']),
  });
  assert.deepEqual(plan.inalterados, ['uuid-demo-1']);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.ausentesSemVinculo.length, 0);
  assert.equal(plan.obsoletosComVinculo.length, 0);
});

test('valor mudou na planilha → update no mesmo uuid', () => {
  const plan = planPagamentosIncremental({
    desired: [desired({ aluno_nome: 'Aluno Demo Silva', valor: 260 })],
    existing: [existing('uuid-demo-1', { aluno_nome: 'Aluno Demo Silva', valor: 250 })],
    vinculadosIds: new Set(['uuid-demo-1']),
  });
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0]?.id, 'uuid-demo-1');
  assert.equal(plan.updates[0]?.patch.valor, 260);
  assert.equal(plan.updates[0]?.motivo, 'slot');
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.ausentesSemVinculo.length, 0);
  assert.equal(plan.obsoletosComVinculo.length, 0);
});

test('pagamento novo na linha → insert', () => {
  const plan = planPagamentosIncremental({
    desired: [
      desired({ aluno_nome: 'Aluno Demo Silva', ordem_lancamento: 1 }),
      desired({
        aluno_nome: 'Aluno Demo Silva',
        ordem_lancamento: 2,
        data_pagamento: '2026-06-04',
        mes_competencia: 6,
      }),
    ],
    existing: [existing('uuid-demo-1', { aluno_nome: 'Aluno Demo Silva', ordem_lancamento: 1 })],
    vinculadosIds: new Set(),
  });
  assert.equal(plan.inalterados.length, 1);
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0]?.ordem_lancamento, 2);
  assert.equal(plan.ausentesSemVinculo.length, 0);
});

test('pagamento removido sem vínculo → preserva para revisão', () => {
  const plan = planPagamentosIncremental({
    desired: [],
    existing: [existing('uuid-demo-1', { aluno_nome: 'Aluno Demo Silva' })],
    vinculadosIds: new Set(),
  });
  assert.deepEqual(plan.ausentesSemVinculo, ['uuid-demo-1']);
  assert.equal(plan.obsoletosComVinculo.length, 0);
});

test('pagamento removido com vínculo → obsoleto, row mantida', () => {
  const plan = planPagamentosIncremental({
    desired: [],
    existing: [existing('uuid-demo-1', { aluno_nome: 'Aluno Demo Silva' })],
    vinculadosIds: new Set(['uuid-demo-1']),
  });
  assert.deepEqual(plan.obsoletosComVinculo, ['uuid-demo-1']);
  assert.equal(plan.ausentesSemVinculo.length, 0);
});

test('sistema_editor no mesmo ano → ignorado', () => {
  const plan = planPagamentosIncremental({
    desired: [desired({ aluno_nome: 'Aluno Demo Silva' })],
    existing: [
      existing('uuid-editor', {
        aluno_nome: 'Aluno Demo Silva',
        origem: 'sistema_editor',
      }),
    ],
    vinculadosIds: new Set(),
  });
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.ausentesSemVinculo.length, 0);
  assert.ok(!plan.ausentesSemVinculo.includes('uuid-editor'));
});

test('segunda execução idêntica → tudo inalterado', () => {
  const first = planPagamentosIncremental({
    desired: [desired({ aluno_nome: 'Aluno Demo Silva' })],
    existing: [existing('uuid-demo-1', { aluno_nome: 'Aluno Demo Silva' })],
    vinculadosIds: new Set(),
  });
  const second = planPagamentosIncremental({
    desired: [desired({ aluno_nome: 'Aluno Demo Silva' })],
    existing: [existing('uuid-demo-1', { aluno_nome: 'Aluno Demo Silva' })],
    vinculadosIds: new Set(),
  });
  assert.deepEqual(first.inalterados, second.inalterados);
  assert.equal(second.updates.length, 0);
  assert.equal(second.inserts.length, 0);
  assert.equal(second.ausentesSemVinculo.length, 0);
});

test('só ordem mudou → inalterado, uuid igual, aviso', () => {
  const plan = planPagamentosIncremental({
    desired: [desired({ aluno_nome: 'Aluno Demo Silva', ordem_lancamento: 2 })],
    existing: [existing('uuid-demo-1', { aluno_nome: 'Aluno Demo Silva', ordem_lancamento: 1 })],
    vinculadosIds: new Set(['uuid-demo-1']),
  });
  assert.deepEqual(plan.inalterados, ['uuid-demo-1']);
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.ausentesSemVinculo.length, 0);
  assert.ok(plan.avisos.length >= 1);
});

test('alunos-only: planAlunosIncremental inativa quem sumiu e estava ativo', () => {
  const plan = planAlunosIncremental({
    desired: [{ aba: 'BYLA DANÇA', linha_planilha: 84 }],
    existing: [
      { aba: 'BYLA DANÇA', linha_planilha: 84, ativo: true },
      { aba: 'BYLA DANÇA', linha_planilha: 10, ativo: true },
      { aba: 'BYLA DANÇA', linha_planilha: 11, ativo: false },
    ],
  });
  assert.equal(plan.upsertCount, 1);
  assert.deepEqual(plan.inativar, [{ aba: 'BYLA DANÇA', linha_planilha: 10 }]);
});
