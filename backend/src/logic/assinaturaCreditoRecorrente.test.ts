import assert from 'node:assert/strict';
import test from 'node:test';
import {
  derivarStatusBylaInicial,
  elegivelAlertaParouDePagar,
  janelaEsperadaPagamentoAssinatura,
} from './assinaturaCreditoRecorrente.js';

test('assinatura ciclo completo → concluida', () => {
  assert.equal(
    derivarStatusBylaInicial({
      statusPagbank: 'Ativa',
      cicloAtual: 5,
      cicloTotal: 5,
      proximaCobranca: null,
    }),
    'concluida',
  );
  assert.equal(
    elegivelAlertaParouDePagar({
      statusByla: 'concluida',
      ativo: true,
      cicloAtual: 5,
      cicloTotal: 5,
      proximaCobranca: null,
    }),
    false,
  );
});

test('ativa ciclo aberto → elegível alerta', () => {
  assert.equal(
    elegivelAlertaParouDePagar({
      statusByla: 'ativa',
      ativo: true,
      cicloAtual: 3,
      cicloTotal: 5,
      proximaCobranca: '2026-08-08',
    }),
    true,
  );
});

test('cancelada / parou_de_pagar não realerta como elegível inicial', () => {
  assert.equal(
    elegivelAlertaParouDePagar({
      statusByla: 'cancelada',
      ativo: true,
      cicloAtual: 2,
      cicloTotal: 6,
      proximaCobranca: null,
    }),
    false,
  );
});

test('statusPagbank Cancelada → cancelada', () => {
  assert.equal(
    derivarStatusBylaInicial({
      statusPagbank: 'Cancelada',
      cicloAtual: 2,
      cicloTotal: 5,
      proximaCobranca: '2026-08-08',
    }),
    'cancelada',
  );
});

test('janelaEsperadaPagamentoAssinatura: folga padrão ±2', () => {
  const r = janelaEsperadaPagamentoAssinatura({
    ano: 2026,
    mes: 3,
    diaCobranca: 23,
    offsetDiasExtrato: 5,
  });
  assert.equal(r.dataEsperada, '2026-03-28');
  assert.deepEqual(r.janela, ['2026-03-26', '2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30']);
});

test('janelaEsperadaPagamentoAssinatura delega offset e folga explícita', () => {
  const r = janelaEsperadaPagamentoAssinatura({
    ano: 2026,
    mes: 3,
    diaCobranca: 23,
    offsetDiasExtrato: 5,
    folgaDias: 1,
  });
  assert.equal(r.dataEsperada, '2026-03-28');
  assert.deepEqual(r.janela, ['2026-03-27', '2026-03-28', '2026-03-29']);
});
