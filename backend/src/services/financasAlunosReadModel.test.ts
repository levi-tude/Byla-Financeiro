import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agruparFinancasAlunos,
  type FinancasAlunoAlunoFixture,
  type FinancasAlunoBancoFixture,
  type FinancasAlunoFluxoFixture,
} from './financasAlunosReadModel.js';

const MES = 7;
const ANO = 2026;

function fluxo(
  partial: Partial<FinancasAlunoFluxoFixture> & Pick<FinancasAlunoFluxoFixture, 'id' | 'aluno_nome'>,
): FinancasAlunoFluxoFixture {
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
    ...partial,
  };
}

function banco(partial: FinancasAlunoBancoFixture): FinancasAlunoBancoFixture {
  return partial;
}

function aluno(
  partial: Partial<FinancasAlunoAlunoFixture> & Pick<FinancasAlunoAlunoFixture, 'aluno_nome'>,
): FinancasAlunoAlunoFixture {
  return {
    aba: partial.aba ?? 'DANÇA',
    aluno_nome: partial.aluno_nome,
    venc: partial.venc ?? '08',
    plano: partial.plano ?? 'Mensal',
  };
}

test('agruparFinancasAlunos: agrupa por aluno/aba/modalidade e infere meio', () => {
  const grupos = agruparFinancasAlunos({
    mes: MES,
    ano: ANO,
    alunos: [aluno({ aluno_nome: 'Ana Silva' })],
    vinculos: [
      { planilha_id: 'fluxo::p1', banco_id: 't1' },
      { planilha_id: 'fluxo::p2', banco_id: 't2' },
    ],
    fluxo: [
      fluxo({ id: 'p1', aluno_nome: 'Ana Silva' }),
      fluxo({ id: 'p2', aluno_nome: 'Ana Silva', data_pagamento: '2026-07-15', forma: 'CREDITO' }),
    ],
    bancos: [
      banco({ id: 't1', data: '2026-07-08', pessoa: 'PIX ANA', descricao: null, valor: 200 }),
      banco({
        id: 't2',
        data: '2026-07-15',
        pessoa: 'ANA SILVA',
        descricao: 'CREDITO PARCELADO',
        valor: 200,
      }),
    ],
  });

  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].pagamentos.length, 2);
  assert.equal(grupos[0].pagamentos[0].meio, 'pix');
  assert.equal(grupos[0].pagamentos[0].banco_status, 'vinculo');
  assert.equal(grupos[0].pagamentos[0].status_conciliacao, 'em_dia');
  assert.equal(grupos[0].pagamentos[1].meio, 'credito_a_vista');
  assert.equal(grupos[0].pagamentos[1].banco_status, 'vinculo');
});

test('agruparFinancasAlunos: aviso quando data_banco ≠ competência', () => {
  const grupos = agruparFinancasAlunos({
    mes: MES,
    ano: ANO,
    alunos: [aluno({ aluno_nome: 'Bruno Costa', venc: '05' })],
    vinculos: [{ planilha_id: 'fluxo::p1', banco_id: 't1' }],
    fluxo: [fluxo({ id: 'p1', aluno_nome: 'Bruno Costa' })],
    bancos: [
      banco({ id: 't1', data: '2026-08-05', pessoa: 'PIX BRUNO', descricao: null, valor: 200 }),
    ],
  });

  const pg = grupos[0].pagamentos[0];
  assert.equal(pg.status_conciliacao, 'pendente');
  assert.ok(pg.aviso_competencia);
});

test('agruparFinancasAlunos: crédito recorrente via Vendas', () => {
  const grupos = agruparFinancasAlunos({
    mes: MES,
    ano: ANO,
    alunos: [aluno({ aluno_nome: 'Carla Rec' })],
    vinculos: [{ planilha_id: 'fluxo::p1', banco_id: 't1' }],
    fluxo: [fluxo({ id: 'p1', aluno_nome: 'Carla Rec', forma: null })],
    bancos: [
      banco({ id: 't1', data: '2026-07-12', pessoa: 'Vendas', descricao: null, valor: 243 }),
    ],
  });

  assert.equal(grupos[0].pagamentos[0].meio, 'credito_recorrente');
});

test('agruparFinancasAlunos: match automático sem vínculo manual', () => {
  const grupos = agruparFinancasAlunos({
    mes: MES,
    ano: ANO,
    alunos: [aluno({ aluno_nome: 'João Silva', aba: 'YOGA', venc: '10' })],
    vinculos: [],
    fluxo: [
      fluxo({
        id: 'p1',
        aluno_nome: 'João Silva',
        aba: 'YOGA',
        modalidade: 'Hatha',
        data_pagamento: '2026-07-10',
        forma: 'PIX',
        valor: 180,
      }),
    ],
    bancos: [],
    entradas: [
      banco({ id: 't-auto', data: '2026-07-10', pessoa: 'João Silva', descricao: null, valor: 180 }),
    ],
  });

  const pg = grupos[0].pagamentos[0];
  assert.equal(pg.banco_status, 'match');
  assert.equal(pg.data_banco, '2026-07-10');
  assert.equal(pg.status_conciliacao, 'em_dia');
});

test('agruparFinancasAlunos: filtra por meio', () => {
  const grupos = agruparFinancasAlunos({
    mes: MES,
    ano: ANO,
    alunos: [aluno({ aluno_nome: 'Ana Silva' }), aluno({ aluno_nome: 'João Pix', aba: 'YOGA' })],
    vinculos: [
      { planilha_id: 'fluxo::p1', banco_id: 't1' },
      { planilha_id: 'fluxo::p2', banco_id: 't2' },
    ],
    fluxo: [
      fluxo({ id: 'p1', aluno_nome: 'Ana Silva', aba: 'DANÇA' }),
      fluxo({ id: 'p2', aluno_nome: 'João Pix', aba: 'YOGA', modalidade: 'Hatha' }),
    ],
    bancos: [
      banco({ id: 't1', data: '2026-07-08', pessoa: 'Vendas', descricao: null, valor: 200 }),
      banco({ id: 't2', data: '2026-07-09', pessoa: 'PIX JOAO', descricao: null, valor: 180 }),
    ],
    filtroMeio: 'pix',
  });

  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].aluno_exibicao, 'João Pix');
});

test('agruparFinancasAlunos: inclui pagamentos sem vínculo do Fluxo', () => {
  const grupos = agruparFinancasAlunos({
    mes: MES,
    ano: ANO,
    alunos: [aluno({ aluno_nome: 'Ana Silva' }), aluno({ aluno_nome: 'Pedro Sem Vinculo' })],
    vinculos: [{ planilha_id: 'fluxo::p1', banco_id: 't1' }],
    fluxo: [
      fluxo({ id: 'p1', aluno_nome: 'Ana Silva' }),
      fluxo({ id: 'p2', aluno_nome: 'Pedro Sem Vinculo', forma: 'PIX', data_pagamento: '2026-07-10' }),
    ],
    bancos: [
      banco({ id: 't1', data: '2026-07-08', pessoa: 'PIX ANA', descricao: null, valor: 200 }),
    ],
  });

  assert.equal(grupos.length, 2);
  const pedro = grupos.find((g) => g.aluno_exibicao === 'Pedro Sem Vinculo');
  assert.equal(pedro!.pagamentos[0].banco_status, 'nenhum');
  assert.equal(pedro!.pagamentos[0].status_conciliacao, 'pendente');
});

test('agruparFinancasAlunos: total de grupos inclui fluxo além de só vínculos', () => {
  const fluxoRows = [
    fluxo({ id: 'p1', aluno_nome: 'Ana Silva' }),
    fluxo({ id: 'p2', aluno_nome: 'Bruno B' }),
    fluxo({ id: 'p3', aluno_nome: 'Carla C' }),
    fluxo({ id: 'p4', aluno_nome: 'Diego D' }),
    fluxo({ id: 'p5', aluno_nome: 'Elena E' }),
  ];

  const soReconhecidos = agruparFinancasAlunos({
    mes: MES,
    ano: ANO,
    vinculos: [{ planilha_id: 'fluxo::p1', banco_id: 't1' }],
    fluxo: fluxoRows,
    bancos: [
      banco({ id: 't1', data: '2026-07-08', pessoa: 'PIX ANA', descricao: null, valor: 200 }),
    ],
    filtroVinculo: 'vinculado',
  });

  const todosFluxo = agruparFinancasAlunos({
    mes: MES,
    ano: ANO,
    vinculos: [{ planilha_id: 'fluxo::p1', banco_id: 't1' }],
    fluxo: fluxoRows,
    bancos: [
      banco({ id: 't1', data: '2026-07-08', pessoa: 'PIX ANA', descricao: null, valor: 200 }),
    ],
  });

  assert.equal(soReconhecidos.length, 1);
  assert.equal(todosFluxo.length, 5);
});

test('agruparFinancasAlunos: meio desconhecido quando sem vínculo e sem forma', () => {
  const grupos = agruparFinancasAlunos({
    mes: MES,
    ano: ANO,
    alunos: [aluno({ aluno_nome: 'Maria', venc: '10' })],
    vinculos: [],
    fluxo: [fluxo({ id: 'p1', aluno_nome: 'Maria', forma: null })],
    bancos: [],
  });

  assert.equal(grupos[0].pagamentos[0].banco_status, 'nenhum');
  assert.equal(grupos[0].pagamentos[0].meio, 'desconhecido');
  assert.equal(grupos[0].pagamentos[0].status_conciliacao, 'pendente');
});

test('agruparFinancasAlunos: filtra só sem vínculo/match', () => {
  const grupos = agruparFinancasAlunos({
    mes: MES,
    ano: ANO,
    alunos: [
      aluno({ aluno_nome: 'Ana Silva' }),
      aluno({ aluno_nome: 'Pedro Pendente' }),
      aluno({ aluno_nome: 'João Match', aba: 'YOGA', venc: '10' }),
    ],
    vinculos: [{ planilha_id: 'fluxo::p1', banco_id: 't1' }],
    fluxo: [
      fluxo({ id: 'p1', aluno_nome: 'Ana Silva' }),
      fluxo({ id: 'p2', aluno_nome: 'Pedro Pendente' }),
      fluxo({
        id: 'p3',
        aluno_nome: 'João Match',
        aba: 'YOGA',
        modalidade: 'Hatha',
        data_pagamento: '2026-07-10',
        valor: 180,
      }),
    ],
    bancos: [
      banco({ id: 't1', data: '2026-07-08', pessoa: 'PIX ANA', descricao: null, valor: 200 }),
    ],
    entradas: [
      banco({ id: 't-match', data: '2026-07-10', pessoa: 'João Match', descricao: null, valor: 180 }),
    ],
    filtroVinculo: 'sem_vinculo',
  });

  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].aluno_exibicao, 'Pedro Pendente');
});

test('agruparFinancasAlunos: filtra com vínculo ou match', () => {
  const grupos = agruparFinancasAlunos({
    mes: MES,
    ano: ANO,
    alunos: [
      aluno({ aluno_nome: 'Ana Silva' }),
      aluno({ aluno_nome: 'João Match', aba: 'YOGA', venc: '10' }),
      aluno({ aluno_nome: 'Pedro Pendente' }),
    ],
    vinculos: [{ planilha_id: 'fluxo::p1', banco_id: 't1' }],
    fluxo: [
      fluxo({ id: 'p1', aluno_nome: 'Ana Silva' }),
      fluxo({
        id: 'p2',
        aluno_nome: 'João Match',
        aba: 'YOGA',
        modalidade: 'Hatha',
        data_pagamento: '2026-07-10',
        valor: 180,
      }),
      fluxo({ id: 'p3', aluno_nome: 'Pedro Pendente' }),
    ],
    bancos: [
      banco({ id: 't1', data: '2026-07-08', pessoa: 'PIX ANA', descricao: null, valor: 200 }),
    ],
    entradas: [
      banco({ id: 't-match', data: '2026-07-10', pessoa: 'João Match', descricao: null, valor: 180 }),
    ],
    filtroVinculo: 'vinculado',
  });

  assert.equal(grupos.length, 2);
  assert.deepEqual(
    grupos.map((g) => g.aluno_exibicao).sort(),
    ['Ana Silva', 'João Match'],
  );
});

test('agruparFinancasAlunos: status atrasado quando crédito após vencimento', () => {
  const grupos = agruparFinancasAlunos({
    mes: MES,
    ano: ANO,
    alunos: [aluno({ aluno_nome: 'Maria Atraso', venc: '05' })],
    vinculos: [{ planilha_id: 'fluxo::p1', banco_id: 't1' }],
    fluxo: [fluxo({ id: 'p1', aluno_nome: 'Maria Atraso', data_pagamento: '2026-07-05' })],
    bancos: [
      banco({ id: 't1', data: '2026-07-12', pessoa: 'PIX MARIA', descricao: null, valor: 200 }),
    ],
  });

  assert.equal(grupos[0].pagamentos[0].status_conciliacao, 'atrasado');
});

test('agruparFinancasAlunos: não expõe ids internos na resposta', () => {
  const grupos = agruparFinancasAlunos({
    mes: MES,
    ano: ANO,
    vinculos: [{ planilha_id: 'fluxo::p1', banco_id: 't1' }],
    fluxo: [fluxo({ id: 'p1', aluno_nome: 'Teste' })],
    bancos: [
      banco({ id: 't1', data: '2026-07-08', pessoa: 'PIX TESTE', descricao: null, valor: 200 }),
    ],
  });

  const json = JSON.stringify(grupos);
  assert.doesNotMatch(json, /fluxo::|planilha_id|banco_id|linha|ordem|uuid/i);
});
