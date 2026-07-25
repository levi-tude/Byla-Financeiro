import assert from 'node:assert/strict';
import test from 'node:test';
import { filtrarVendasSemVinculo, inferirDataFluxoSugerida } from './alertasVendasSemVinculo.js';

test('filtra só Vendas sem vínculo', () => {
  const out = filtrarVendasSemVinculo(
    [
      { id: 'b1', data: '2026-07-10', valor: 240.02, pessoa: 'Vendas', descricao: null },
      { id: 'b2', data: '2026-07-10', valor: 100, pessoa: 'PIX JOAO', descricao: null },
      { id: 'b3', data: '2026-07-11', valor: 50, pessoa: 'Vendas', descricao: null },
    ],
    new Set(['b3']),
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].banco_id, 'b1');
  assert.equal(out[0].data_fluxo_sugerida, '2026-07-05');
  assert.equal(out[0].possivel_nova_assinatura, true);
  assert.match(out[0].mensagem, /nova assinatura/i);
  assert.doesNotMatch(out[0].mensagem, /linha|UUID|planilha/i);
});

test('inferirDataFluxoSugerida com offset legado 30', () => {
  assert.equal(inferirDataFluxoSugerida('2026-04-22', 30), '2026-03-23');
});

test('não alerta crédito genérico sem VENDAS (ex.: Disponivel CREDITO VISA)', () => {
  const out = filtrarVendasSemVinculo(
    [
      {
        id: 'g1',
        data: '2026-07-10',
        valor: 120,
        pessoa: 'Disponivel',
        descricao: 'CREDITO VISA',
      },
    ],
    new Set(),
  );
  assert.equal(out.length, 0);
});
