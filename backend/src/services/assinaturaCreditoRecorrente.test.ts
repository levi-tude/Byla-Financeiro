import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decidirAlertaParouDePagar,
  resolverTemPagamentoNaJanela,
} from './assinaturaCreditoRecorrente.js';

test('não alerta se pagamento na janela', () => {
  assert.equal(
    decidirAlertaParouDePagar({
      assinatura: {
        id: 'a1',
        nome_exibicao: 'Helena',
        status_byla: 'ativa',
        ativo: true,
        ciclo_atual: 3,
        ciclo_total: 5,
        proxima_cobranca: '2026-08-08',
        dia_cobranca: 8,
        offset_dias_extrato: 5,
      },
      mes: 7,
      ano: 2026,
      temPagamentoNaJanela: true,
      hojeIso: '2026-07-20',
    }),
    null,
  );
});

test('alerta se janela passou sem pagamento', () => {
  const a = decidirAlertaParouDePagar({
    assinatura: {
      id: 'a1',
      nome_exibicao: 'Aluna Demo Recorrente',
      status_byla: 'ativa',
      ativo: true,
      ciclo_atual: 3,
      ciclo_total: 5,
      proxima_cobranca: '2026-08-08',
      dia_cobranca: 8,
      offset_dias_extrato: 5,
    },
    mes: 7,
    ano: 2026,
    temPagamentoNaJanela: false,
    hojeIso: '2026-07-20',
  });
  assert.ok(a);
  assert.match(a!.mensagem, /Parou de pagar/);
  assert.doesNotMatch(a!.mensagem, /linha|UUID|planilha/i);
});

test('concluida nunca alerta', () => {
  assert.equal(
    decidirAlertaParouDePagar({
      assinatura: {
        id: 'b',
        nome_exibicao: 'Aluna Demo Concluida',
        status_byla: 'concluida',
        ativo: true,
        ciclo_atual: 5,
        ciclo_total: 5,
        proxima_cobranca: null,
        dia_cobranca: 23,
        offset_dias_extrato: 5,
      },
      mes: 7,
      ano: 2026,
      temPagamentoNaJanela: false,
      hojeIso: '2026-07-30',
    }),
    null,
  );
});

test('não alerta enquanto janela ainda não passou', () => {
  assert.equal(
    decidirAlertaParouDePagar({
      assinatura: {
        id: 'a1',
        nome_exibicao: 'Aluna Demo Recorrente',
        status_byla: 'ativa',
        ativo: true,
        ciclo_atual: 3,
        ciclo_total: 5,
        proxima_cobranca: '2026-08-08',
        dia_cobranca: 8,
        offset_dias_extrato: 5,
      },
      mes: 7,
      ano: 2026,
      temPagamentoNaJanela: false,
      hojeIso: '2026-07-13',
    }),
    null,
  );
});

test('resolverTemPagamentoNaJanela: Vendas compatível único na janela', () => {
  const ok = resolverTemPagamentoNaJanela({
    assinatura: {
      valor_bruto: 135,
      regra_sticky_id: null,
      nome_exibicao: 'Aluna Demo Recorrente',
    },
    janela: ['2026-07-12', '2026-07-13', '2026-07-14'],
    vinculos: [{ banco_id: 'tx1', planilha_id: 'helena|danca|adulto' }],
    transacoes: [
      {
        id: 'tx1',
        data: '2026-07-13',
        valor: 130.5,
        pessoa: 'Vendas',
        descricao: 'Vendas PagBank',
      },
    ],
  });
  assert.equal(ok, true);
});

test('resolverTemPagamentoNaJanela: vínculo validado (crédito Mastercard) silencia alerta', () => {
  // Fluxo pode ter BONFIM; cadastro da assinatura às vezes BOMFIM (1 typo).
  const alunoNormPorPlanilhaId = new Map<string, string>([
    ['fluxo::pag-demo', 'ALUNA DEMO BONFIM'],
  ]);
  const ok = resolverTemPagamentoNaJanela({
    assinatura: {
      valor_bruto: 250,
      regra_sticky_id: null,
      nome_exibicao: 'Aluna Demo Bomfim',
    },
    janela: ['2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08'],
    vinculos: [{ banco_id: 'tx-master', planilha_id: 'fluxo::pag-demo' }],
    transacoes: [
      {
        id: 'tx-master',
        data: '2026-08-07',
        valor: 240.02,
        pessoa: 'Disponivel CREDITO MASTERCARD',
        descricao: 'Disponivel CREDITO MASTERCARD',
      },
    ],
    alunoNormPorPlanilhaId,
  });
  assert.equal(ok, true);
});

test('resolverTemPagamentoNaJanela: sem Vendas e sem mapa de aluno continua false', () => {
  const ok = resolverTemPagamentoNaJanela({
    assinatura: {
      valor_bruto: 250,
      regra_sticky_id: null,
      nome_exibicao: 'Aluna Demo Bomfim',
    },
    janela: ['2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08'],
    vinculos: [{ banco_id: 'tx-master', planilha_id: 'fluxo::pag-demo' }],
    transacoes: [
      {
        id: 'tx-master',
        data: '2026-08-07',
        valor: 240.02,
        pessoa: 'Disponivel CREDITO MASTERCARD',
        descricao: 'Disponivel CREDITO MASTERCARD',
      },
    ],
  });
  assert.equal(ok, false);
});

test('resolverTemPagamentoNaJanela: ambíguo retorna false', () => {
  const ok = resolverTemPagamentoNaJanela({
    assinatura: {
      valor_bruto: 250,
      regra_sticky_id: null,
      nome_exibicao: 'Paloma Lima',
    },
    janela: ['2026-07-26', '2026-07-27', '2026-07-28'],
    vinculos: [
      { banco_id: 'tx1', planilha_id: 'paloma|danca|adulto' },
      { banco_id: 'tx2', planilha_id: 'vera|danca|adulto' },
    ],
    transacoes: [
      {
        id: 'tx1',
        data: '2026-07-27',
        valor: 240,
        pessoa: 'Vendas',
        descricao: 'Vendas',
      },
      {
        id: 'tx2',
        data: '2026-07-27',
        valor: 245,
        pessoa: 'Vendas',
        descricao: 'Vendas',
      },
    ],
  });
  assert.equal(ok, false);
});

test('resolverTemPagamentoNaJanela: sticky com itens completos', () => {
  const ok = resolverTemPagamentoNaJanela({
    assinatura: {
      valor_bruto: 243,
      regra_sticky_id: 'regra-demo',
      nome_exibicao: 'Aluna Demo A',
    },
    janela: ['2026-07-27', '2026-07-28', '2026-07-29'],
    vinculos: [
      { banco_id: 'tx1', planilha_id: 'ALUNA DEMO A|danca|adulto' },
      { banco_id: 'tx1', planilha_id: 'ALUNA DEMO B|danca|adulto' },
    ],
    transacoes: [
      {
        id: 'tx1',
        data: '2026-07-28',
        valor: 460,
        pessoa: 'Vendas',
        descricao: 'Vendas',
      },
    ],
    regraSticky: {
      id: 'regra-demo',
      rotulo: 'Demo A + Demo B',
      dia_pagamento_fluxo: 23,
      offset_dias_extrato: 5,
      itens: [
        {
          aluno_norm: 'ALUNA DEMO A',
          aluno_exibicao: 'Aluna Demo A',
          aba: 'danca',
          modalidade: 'adulto',
        },
        {
          aluno_norm: 'ALUNA DEMO B',
          aluno_exibicao: 'Aluna Demo B',
          aba: 'danca',
          modalidade: 'adulto',
        },
      ],
      valor_mensalidades_soma: 486,
      valor_banco_ultimo: 460,
      bandeira_pista: null,
      ativo: true,
    },
  });
  assert.equal(ok, true);
});
