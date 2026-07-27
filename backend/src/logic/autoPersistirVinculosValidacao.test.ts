import assert from 'node:assert/strict';
import test from 'node:test';
import { selecionarConfirmadosParaAutoPersistir } from './autoPersistirVinculosValidacao.js';

test('selecionarConfirmadosParaAutoPersistir: grava só quem ainda não tem vínculo', () => {
  const out = selecionarConfirmadosParaAutoPersistir({
    confirmados: [
      { planilhaId: 'fluxo::11111111-1111-4111-8111-111111111111', bancoId: 'b1' },
      { planilhaId: 'fluxo::22222222-2222-4222-8222-222222222222', bancoId: 'b2' },
    ],
    vinculosExistentes: [
      { planilha_id: 'fluxo::11111111-1111-4111-8111-111111111111', banco_id: 'b1' },
    ],
  });
  assert.deepEqual(out, [
    { planilhaId: 'fluxo::22222222-2222-4222-8222-222222222222', bancoId: 'b2' },
  ]);
});

test('selecionarConfirmadosParaAutoPersistir: normaliza UUID bare vs fluxo::', () => {
  const out = selecionarConfirmadosParaAutoPersistir({
    confirmados: [{ planilhaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bancoId: 'b1' }],
    vinculosExistentes: [
      { planilha_id: 'fluxo::aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', banco_id: 'b1' },
    ],
  });
  assert.equal(out.length, 0);
});

test('selecionarConfirmadosParaAutoPersistir: não reusa banco já vinculado a outra planilha', () => {
  const out = selecionarConfirmadosParaAutoPersistir({
    confirmados: [{ planilhaId: 'fluxo::bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', bancoId: 'b-shared' }],
    vinculosExistentes: [
      { planilha_id: 'fluxo::cccccccc-cccc-4ccc-8ccc-cccccccccccc', banco_id: 'b-shared' },
    ],
  });
  assert.equal(out.length, 0);
});

test('selecionarConfirmadosParaAutoPersistir: no mesmo batch um banco só uma planilha', () => {
  const out = selecionarConfirmadosParaAutoPersistir({
    confirmados: [
      { planilhaId: 'fluxo::dddddddd-dddd-4ddd-8ddd-dddddddddddd', bancoId: 'b-dup' },
      { planilhaId: 'fluxo::eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', bancoId: 'b-dup' },
    ],
    vinculosExistentes: [],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].bancoId, 'b-dup');
  assert.equal(out[0].planilhaId, 'fluxo::dddddddd-dddd-4ddd-8ddd-dddddddddddd');
});
