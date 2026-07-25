import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isCreditoGenericoExtrato,
  isDebitoGenericoExtrato,
  dataEsperadaCreditoRecorrente,
  janelaDatasCredito,
  janelaEsperadaCreditoRecorrente,
  valorBancoCompativel,
  valorPlanilhaBancoCompativel,
  escolherCandidatoCredito,
  offsetObservadoDias,
  FOLGA_DIAS_JANELA_VENDAS,
  OFFSET_DIAS_EXTRATO_PADRAO,
} from './creditoRecorrente.js';

test('isCreditoGenericoExtrato: Disponivel CREDITO VISA', () => {
  assert.equal(isCreditoGenericoExtrato('Disponivel CREDITO VISA'), true);
  assert.equal(isCreditoGenericoExtrato('PIX JOAO'), false);
});

test('isCreditoGenericoExtrato: Vendas PagBank', () => {
  assert.equal(isCreditoGenericoExtrato('Vendas'), true);
  assert.equal(isCreditoGenericoExtrato('VENDAS'), true);
  assert.equal(isCreditoGenericoExtrato('Recebimento', 'Liquidacao Vendas Cartao'), true);
  assert.equal(isCreditoGenericoExtrato('PIX MARIA'), false);
  assert.equal(isCreditoGenericoExtrato('Disponivel CREDITO VISA'), true);
});

test('débito maquininha: taxa ~5% (310 vs 306.74)', () => {
  assert.equal(isDebitoGenericoExtrato('Disponivel DEBITO VISA'), true);
  assert.equal(
    valorPlanilhaBancoCompativel({
      valorPlanilha: 310,
      valorBanco: 306.74,
      pessoa: 'Disponivel DEBITO VISA',
      descricao: 'Disponivel DEBITO VISA',
    }),
    true,
  );
  assert.equal(
    valorPlanilhaBancoCompativel({
      valorPlanilha: 310,
      valorBanco: 306.74,
      pessoa: 'Maria Silva',
    }),
    false,
  );
});

test('dataEsperada: dia 23 + 5 em março → 2026-03-28', () => {
  assert.equal(dataEsperadaCreditoRecorrente(2026, 3, 23, 5), '2026-03-28');
});

test('janelaEsperadaCreditoRecorrente: D+5 folga ±2', () => {
  const r = janelaEsperadaCreditoRecorrente({
    ano: 2026,
    mes: 3,
    diaPagamentoFluxo: 23,
    offsetDiasExtrato: OFFSET_DIAS_EXTRATO_PADRAO,
    folgaDias: FOLGA_DIAS_JANELA_VENDAS,
  });
  assert.equal(r.dataFluxo, '2026-03-23');
  assert.equal(r.dataEsperada, '2026-03-28');
  assert.deepEqual(r.janela, [
    '2026-03-26',
    '2026-03-27',
    '2026-03-28',
    '2026-03-29',
    '2026-03-30',
  ]);
});

test('janelaEsperadaCreditoRecorrente: legado D+30 folga ±2', () => {
  const r = janelaEsperadaCreditoRecorrente({
    ano: 2026,
    mes: 3,
    diaPagamentoFluxo: 23,
    offsetDiasExtrato: 30,
    folgaDias: 2,
  });
  assert.equal(r.dataFluxo, '2026-03-23');
  assert.equal(r.dataEsperada, '2026-04-22');
  assert.equal(r.janela.length, 5);
  assert.ok(r.janela.includes('2026-04-22'));
});

test('janela ±1 inclui vizinhos', () => {
  const j = janelaDatasCredito('2026-03-28', 1);
  assert.deepEqual(j, ['2026-03-27', '2026-03-28', '2026-03-29']);
});

test('valorPlanilhaBancoCompativel: Vendas 250 vs 240.02 (taxa)', () => {
  assert.equal(
    valorPlanilhaBancoCompativel({
      valorPlanilha: 250,
      valorBanco: 240.02,
      pessoa: 'Vendas',
    }),
    true,
  );
});

test('valorPlanilhaBancoCompativel: PIX exige ±0.01', () => {
  assert.equal(
    valorPlanilhaBancoCompativel({
      valorPlanilha: 250,
      valorBanco: 240.02,
      pessoa: 'PIX MARIA',
    }),
    false,
  );
  assert.equal(
    valorPlanilhaBancoCompativel({
      valorPlanilha: 250,
      valorBanco: 250,
      pessoa: 'PIX MARIA',
    }),
    true,
  );
});

test('240.02 compatível com soma 243 ou ultimo 240.02', () => {
  assert.equal(valorBancoCompativel({ valorBanco: 240.02, somaMensalidades: 243, valorBancoUltimo: null }), true);
  assert.equal(valorBancoCompativel({ valorBanco: 240.02, somaMensalidades: 243, valorBancoUltimo: 240.02 }), true);
  assert.equal(valorBancoCompativel({ valorBanco: 100, somaMensalidades: 243, valorBancoUltimo: null }), false);
});

test('offsetObservadoDias: D+5 e legado ~30', () => {
  assert.equal(offsetObservadoDias('2026-03-23', '2026-03-28'), 5);
  assert.equal(offsetObservadoDias('2026-03-23', '2026-04-22'), 30);
  assert.equal(offsetObservadoDias('2026-03-23', '2026-03-20'), 0); // clamp negativo → 0
});

test('escolher: 1 crédito na janela mesmo com valor longe → unico + avisoValor', () => {
  const r = escolherCandidatoCredito({
    candidatos: [{ id: 't1', data: '2026-03-28', valor: 100, pessoa: 'Disponivel CREDITO VISA', descricao: null }],
    somaMensalidades: 243,
    valorBancoUltimo: 240.02,
  });
  assert.equal(r.status, 'unico');
  assert.equal(r.avisoValor, true);
});
