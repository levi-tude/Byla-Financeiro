import assert from 'node:assert/strict';
import test from 'node:test';
import {
  montarItensConciliacaoPagamentos,
  stripCamposBancariosConciliacao,
  type ConciliacaoAlunoFixture,
  type ConciliacaoPagamentoFixture,
  type ConciliacaoTransacaoFixture,
} from './conciliacaoPagamentosMes.js';

const MES = 7;
const ANO = 2026;

function aluno(partial: Partial<ConciliacaoAlunoFixture> & Pick<ConciliacaoAlunoFixture, 'id' | 'aluno_nome'>): ConciliacaoAlunoFixture {
  return {
    aba: 'DANÇA',
    modalidade: 'Jazz',
    venc: '10',
    plano: 'Mensal',
    valor_referencia: 200,
    responsaveis: null,
    pagador_pix: null,
    ...partial,
  };
}

function pagamento(
  partial: Partial<ConciliacaoPagamentoFixture> & Pick<ConciliacaoPagamentoFixture, 'id' | 'aluno_nome'>,
): ConciliacaoPagamentoFixture {
  return {
    aba: 'DANÇA',
    modalidade: 'Jazz',
    data_pagamento: '2026-07-08',
    forma: 'PIX',
    valor: 200,
    mes_competencia: MES,
    ano_competencia: ANO,
    responsaveis: null,
    pagador_pix: null,
    linha_planilha: 1,
    ...partial,
  };
}

function tx(partial: ConciliacaoTransacaoFixture): ConciliacaoTransacaoFixture {
  return partial;
}

test('montarItens: em dia, atrasado, pendente e bolsa', () => {
  const alunos = [
    aluno({ id: 'a1', aluno_nome: 'Ana Em Dia', venc: '10' }),
    aluno({ id: 'a2', aluno_nome: 'Bruno Atrasado', venc: '10' }),
    aluno({ id: 'a3', aluno_nome: 'Carla Pendente', venc: '10' }),
    aluno({ id: 'a4', aluno_nome: 'Diana Bolsa', venc: '10', plano: 'Bolsa' }),
  ];

  const pagamentos = [
    pagamento({ id: 'p1', aluno_nome: 'Ana Em Dia', data_pagamento: '2026-07-08' }),
    pagamento({ id: 'p2', aluno_nome: 'Bruno Atrasado', data_pagamento: '2026-07-15' }),
    // Carla sem pagamento → pendente
  ];

  const entradas = [
    tx({ id: 't1', data: '2026-07-08', pessoa: 'Ana Em Dia', valor: 200, descricao: null, tipo: 'entrada' }),
    tx({ id: 't2', data: '2026-07-15', pessoa: 'Bruno Atrasado', valor: 200, descricao: null, tipo: 'entrada' }),
  ];

  const vinculosByPlanilha = new Map<string, { banco_id: string; id: string }>([
    ['fluxo::p1', { banco_id: 't1', id: 'v1' }],
    ['fluxo::p2', { banco_id: 't2', id: 'v2' }],
  ]);

  const result = montarItensConciliacaoPagamentos({
    mes: MES,
    ano: ANO,
    alunos,
    pagamentos,
    entradas,
    vinculosByPlanilha,
  });

  assert.equal(result.mes, MES);
  assert.equal(result.ano, ANO);
  assert.equal(result.totais.em_dia, 1);
  assert.equal(result.totais.atrasado, 1);
  assert.equal(result.totais.pendente, 1);
  assert.equal(result.totais.bolsa, 1);
  assert.equal(result.totais.sem_vencimento, 0);
  assert.equal(result.totais.total, 4);

  const byNome = Object.fromEntries(result.itens.map((i) => [i.aluno_nome, i]));
  assert.equal(byNome['Ana Em Dia'].status, 'em_dia');
  assert.equal(byNome['Ana Em Dia'].data_credito, '2026-07-08');
  assert.equal(byNome['Ana Em Dia'].banco_status, 'vinculo');

  assert.equal(byNome['Bruno Atrasado'].status, 'atrasado');
  assert.equal(byNome['Bruno Atrasado'].data_credito, '2026-07-15');

  assert.equal(byNome['Carla Pendente'].status, 'pendente');
  assert.equal(byNome['Carla Pendente'].data_credito, null);
  assert.equal(byNome['Carla Pendente'].banco_status, 'nenhum');

  assert.equal(byNome['Diana Bolsa'].status, 'bolsa');
});

test('montarItens: Catarina Noronha PIX dia vencimento → em_dia (jul/2026)', () => {
  const alunos = [
    aluno({
      id: '3f1b8d0e-8a9f-4dfb-b296-794c4d2a3493',
      aba: 'PILATES',
      modalidade: 'PILATES',
      aluno_nome: 'CATARINA NORONHA VEIGA',
      venc: '20',
      plano: 'SEMESTRAL',
      valor_referencia: 250,
      responsaveis: 'CATARINA',
    }),
  ];
  const pagamentos = [
    pagamento({
      id: '664b5714-42d1-435e-ade7-2fe9ff21dfe4',
      aba: 'PILATES',
      modalidade: 'PILATES',
      aluno_nome: 'CATARINA NORONHA VEIGA',
      data_pagamento: '2026-07-20',
      forma: 'PIX',
      valor: 250,
      responsaveis: 'CATARINA',
      linha_planilha: 29,
    }),
  ];
  const entradas = [
    tx({
      id: '10362cfa-94a1-4399-8462-5dc18221f8cb',
      data: '2026-07-20',
      pessoa: 'Catarina Noronha Veiga',
      valor: 250,
      descricao: 'Catarina Noronha Veiga',
      tipo: 'entrada',
    }),
  ];

  const result = montarItensConciliacaoPagamentos({
    mes: MES,
    ano: ANO,
    alunos,
    pagamentos,
    entradas,
    vinculosByPlanilha: new Map(),
  });

  const item = result.itens[0];
  assert.equal(item.status, 'em_dia');
  assert.equal(item.dia_vencimento, 20);
  assert.equal(item.data_credito, '2026-07-20');
  assert.equal(item.banco_status, 'match');
  assert.equal(item.vinculo_id, null);
});

test('montarItens: sem pagamento na competência → pendente (mesmo com crédito no banco)', () => {
  const alunos = [
    aluno({
      id: '3f1b8d0e-8a9f-4dfb-b296-794c4d2a3493',
      aba: 'PILATES',
      modalidade: 'PILATES',
      aluno_nome: 'CATARINA NORONHA VEIGA',
      venc: '20',
    }),
  ];

  const result = montarItensConciliacaoPagamentos({
    mes: 6,
    ano: ANO,
    alunos,
    pagamentos: [],
    entradas: [
      tx({
        id: '10362cfa-94a1-4399-8462-5dc18221f8cb',
        data: '2026-06-20',
        pessoa: 'Catarina Noronha Veiga',
        valor: 250,
        descricao: null,
        tipo: 'entrada',
      }),
    ],
    vinculosByPlanilha: new Map(),
  });

  assert.equal(result.itens[0].status, 'pendente');
  assert.equal(result.itens[0].data_credito, null);
});

test('montarItens: pagamento em dinheiro usa data do Fluxo e não exige vínculo', () => {
  const result = montarItensConciliacaoPagamentos({
    mes: MES,
    ano: ANO,
    alunos: [aluno({ id: 'a1', aluno_nome: 'Eva Dinheiro', venc: '10' })],
    pagamentos: [
      pagamento({
        id: 'p-din',
        aluno_nome: 'Eva Dinheiro',
        forma: 'Dinheiro',
        data_pagamento: '2026-07-10',
      }),
    ],
    entradas: [],
    vinculosByPlanilha: new Map(),
  });

  assert.equal(result.itens.length, 1);
  assert.equal(result.itens[0].status, 'em_dia');
  assert.equal(result.itens[0].data_credito, '2026-07-10');
  assert.equal(result.itens[0].banco_status, 'dinheiro');
  assert.equal(result.itens[0].pessoa_banco, 'Pagamento em dinheiro');
});

test('stripCamposBancariosConciliacao: secretaria omite bancários; admin mantém', () => {
  const raw = montarItensConciliacaoPagamentos({
    mes: MES,
    ano: ANO,
    alunos: [aluno({ id: 'a1', aluno_nome: 'Ana Em Dia', venc: '10' })],
    pagamentos: [pagamento({ id: 'p1', aluno_nome: 'Ana Em Dia' })],
    entradas: [
      tx({ id: 't1', data: '2026-07-08', pessoa: 'Ana Em Dia', valor: 200, descricao: null, tipo: 'entrada' }),
    ],
    vinculosByPlanilha: new Map([['fluxo::p1', { banco_id: 't1', id: 'v1' }]]),
  });

  const itemAdmin = stripCamposBancariosConciliacao(raw, 'admin').itens[0];
  assert.equal(itemAdmin.data_credito, '2026-07-08');
  assert.equal(itemAdmin.valor_credito, 200);
  assert.equal(itemAdmin.pessoa_banco, 'Ana Em Dia');
  assert.equal(itemAdmin.transacao_id, 't1');

  const itemSec = stripCamposBancariosConciliacao(raw, 'secretaria').itens[0];
  assert.equal(itemSec.status, 'em_dia');
  assert.equal('data_credito' in itemSec, false);
  assert.equal('valor_credito' in itemSec, false);
  assert.equal('pessoa_banco' in itemSec, false);
  assert.equal('transacao_id' in itemSec, false);
});
