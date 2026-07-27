import assert from 'node:assert/strict';
import test from 'node:test';
import {
  indexVinculosList,
  statusExtratoForFluxoPagamento,
} from './fluxoExtratoValidacaoService.js';

test('statusExtratoForFluxoPagamento: vínculo persistido = validado', () => {
  const map = indexVinculosList([
    {
      id: 'v1',
      banco_id: 'b1',
      planilha_id: 'fluxo::aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    },
  ]);
  const st = statusExtratoForFluxoPagamento('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', map);
  assert.equal(st.status_extrato, 'validado');
  assert.equal(st.banco_id, 'b1');
  assert.equal(st.vinculo_id, 'v1');
});

test('statusExtratoForFluxoPagamento: sem vínculo = pendente', () => {
  const st = statusExtratoForFluxoPagamento('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', new Map());
  assert.equal(st.status_extrato, 'pendente');
  assert.equal(st.banco_id, null);
});

test('statusExtratoForFluxoPagamento: bolsa/exceção não entram como pendente', () => {
  const bolsa = statusExtratoForFluxoPagamento('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', new Map(), {
    forma: 'PIX',
    regime: 'bolsa',
  });
  assert.equal(bolsa.status_extrato, 'bolsa');
  const ex = statusExtratoForFluxoPagamento('ffffffff-ffff-4fff-8fff-ffffffffffff', new Map(), {
    forma: 'PIX',
    regime: 'excecao',
  });
  assert.equal(ex.status_extrato, 'excecao');
});

test('statusExtratoForFluxoPagamento: dinheiro conta como validado sem extrato', () => {
  const st = statusExtratoForFluxoPagamento(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    new Map(),
    { forma: 'Dinheiro' },
  );
  assert.equal(st.status_extrato, 'validado');
  assert.equal(st.banco_id, null);
  assert.equal(st.vinculo_id, null);
});

test('indexVinculosList: normaliza UUID bare no planilha_id do vínculo', () => {
  const map = indexVinculosList([
    {
      id: 'v-leg',
      banco_id: 'b-leg',
      planilha_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    },
  ]);
  const st = statusExtratoForFluxoPagamento('fluxo::dddddddd-dddd-4ddd-8ddd-dddddddddddd', map);
  assert.equal(st.status_extrato, 'validado');
  assert.equal(st.vinculo_id, 'v-leg');
});
