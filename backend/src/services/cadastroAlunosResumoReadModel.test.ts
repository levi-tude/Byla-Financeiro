import assert from 'node:assert/strict';
import test from 'node:test';
import { atribuirOrfaosAoCadastro, montarCadastroAlunosResumo } from './cadastroAlunosResumoReadModel.js';

test('montarCadastroAlunosResumo: pagador no Fluxo não conta como vínculo da Validação', () => {
  const result = montarCadastroAlunosResumo({
    alunos: [
      {
        id: 'a1',
        aba: 'DANÇA',
        modalidade: 'Jazz',
        linha_planilha: 1,
        aluno_nome: 'Ana Com Pix',
        wpp: '71999990000',
        responsaveis: 'Mãe Ana',
        plano: 'Mensal',
        venc: '10',
        valor_referencia: 200,
        pagador_pix: 'PIX Ana',
        ativo: true,
      },
      {
        id: 'a2',
        aba: 'DANÇA',
        modalidade: 'Jazz',
        linha_planilha: 2,
        aluno_nome: 'Bruno Sem Vinculo',
        wpp: '71999990001',
        responsaveis: 'Pai Bruno',
        plano: 'Mensal',
        venc: '10',
        valor_referencia: 200,
        pagador_pix: null,
        ativo: true,
      },
    ],
    formaPorAluno: new Map([
      ['dança|1|ana com pix', 'PIX'],
      ['dança|2|bruno sem vinculo', 'DÉBITO'],
    ]),
    stickyByAluno: new Map(),
    alunosComVinculoValidacao: new Set(),
    gruposFamilia: [],
  });

  assert.equal(result.totais.alunos, 2);
  assert.equal(result.totais.com_vinculo, 0);
  assert.equal(result.totais.sem_vinculo, 2);
  assert.equal(result.secoes[0].alunos_com_vinculo.length, 0);
  assert.equal(result.secoes[0].alunos_sem_vinculo.length, 2);
  assert.equal(result.secoes[0].alunos_sem_vinculo[0].vinculo_status, 'cadastro');
  assert.equal(result.secoes[0].alunos_sem_vinculo[0].pagador_cadastro, 'PIX Ana');
});

test('montarCadastroAlunosResumo: sticky da Validação conta como com vínculo', () => {
  const result = montarCadastroAlunosResumo({
    alunos: [
      {
        id: 'a1',
        aba: 'YOGA',
        modalidade: 'Hatha',
        linha_planilha: 1,
        aluno_nome: 'Carla Sticky',
        wpp: '71999990002',
        responsaveis: 'Carla',
        plano: 'Mensal',
        venc: '05',
        valor_referencia: 180,
        pagador_pix: null,
        ativo: true,
      },
    ],
    formaPorAluno: new Map([['yoga|1|carla sticky', 'PIX']]),
    stickyByAluno: new Map([['CARLA STICKY', 'PIX CARLA MÃE']]),
    alunosComVinculoValidacao: new Set(),
    gruposFamilia: [],
  });

  assert.equal(result.totais.com_vinculo, 1);
  assert.equal(result.secoes[0].alunos_com_vinculo[0].vinculo_status, 'validacao');
  assert.equal(result.secoes[0].alunos_com_vinculo[0].pagador_vinculo, 'PIX CARLA MÃE');
});

test('montarCadastroAlunosResumo: vínculo confirmado na Validação conta mesmo sem sticky', () => {
  const result = montarCadastroAlunosResumo({
    alunos: [
      {
        id: 'a1',
        aba: 'DANÇA',
        modalidade: 'Jazz',
        linha_planilha: 1,
        aluno_nome: 'Diana Validada',
        wpp: '71999990003',
        responsaveis: 'Mãe Diana',
        plano: 'Mensal',
        venc: '15',
        valor_referencia: 200,
        pagador_pix: 'PIX Diana',
        ativo: true,
      },
    ],
    formaPorAluno: new Map([['dança|1|diana validada', 'PIX']]),
    stickyByAluno: new Map(),
    alunosComVinculoValidacao: new Set(['dança|1|diana validada']),
    gruposFamilia: [],
  });

  assert.equal(result.totais.com_vinculo, 1);
  assert.equal(result.secoes[0].alunos_com_vinculo[0].vinculo_status, 'validacao');
  assert.equal(result.secoes[0].alunos_com_vinculo[0].pagador_cadastro, 'PIX Diana');
});

test('atribuirOrfaosAoCadastro: órfão 1:1 marca alunoKey e pagador', () => {
  const { alunoKeys, pagadorPorAlunoNorm } = atribuirOrfaosAoCadastro({
    pagamentos: [
      {
        id: 'new-demo',
        aba: 'PILATES',
        linha_planilha: 4,
        aluno_nome: 'Aluno Demo Silva',
        forma: 'PIX',
        data_pagamento: '2026-05-04',
        valor: 250,
      },
    ],
    orfaos: [
      {
        planilha_id: 'fluxo::old-demo',
        data_ref: '2026-05-04',
        valor: 250,
        pessoa_banco: 'Pagador Demo',
      },
    ],
  });
  assert.ok(alunoKeys.has('pilates|4|aluno demo silva'));
  assert.equal(pagadorPorAlunoNorm.get('ALUNO DEMO SILVA'), 'Pagador Demo');
});

test('montarCadastroAlunosResumo: filtro sem_vinculo', () => {
  const result = montarCadastroAlunosResumo({
    alunos: [
      {
        id: 'a1',
        aba: 'DANÇA',
        modalidade: 'Jazz',
        linha_planilha: 1,
        aluno_nome: 'Ana Com Pix',
        wpp: '71999990000',
        responsaveis: 'Mãe Ana',
        plano: 'Mensal',
        venc: '10',
        valor_referencia: 200,
        pagador_pix: 'PIX Ana',
        ativo: true,
      },
      {
        id: 'a2',
        aba: 'DANÇA',
        modalidade: 'Jazz',
        linha_planilha: 2,
        aluno_nome: 'Bruno Sem Vinculo',
        wpp: '71999990001',
        responsaveis: 'Pai Bruno',
        plano: 'Mensal',
        venc: '10',
        valor_referencia: 200,
        pagador_pix: null,
        ativo: true,
      },
    ],
    formaPorAluno: new Map(),
    stickyByAluno: new Map([['ANA COM PIX', 'PIX ANA EXTRATO']]),
    alunosComVinculoValidacao: new Set(),
    gruposFamilia: [],
    filtroVinculo: 'sem_vinculo',
  });

  assert.equal(result.totais.alunos, 1);
  assert.equal(result.secoes[0].alunos_sem_vinculo[0].aluno_nome, 'Bruno Sem Vinculo');
});

test('montarCadastroAlunosResumo: filtra por dia de vencimento e lista dias disponíveis', () => {
  const result = montarCadastroAlunosResumo({
    alunos: [
      {
        id: 'a1',
        aba: 'DANÇA',
        modalidade: 'Jazz',
        linha_planilha: 1,
        aluno_nome: 'Ana Dia 5',
        wpp: '71999990000',
        responsaveis: 'Mãe Ana',
        plano: 'Mensal',
        venc: '5',
        valor_referencia: 200,
        pagador_pix: 'PIX Ana',
        ativo: true,
      },
      {
        id: 'a2',
        aba: 'DANÇA',
        modalidade: 'Jazz',
        linha_planilha: 2,
        aluno_nome: 'Bruno Dia 10',
        wpp: '71999990001',
        responsaveis: 'Pai Bruno',
        plano: 'Mensal',
        venc: '10',
        valor_referencia: 200,
        pagador_pix: null,
        ativo: true,
      },
      {
        id: 'a3',
        aba: 'DANÇA',
        modalidade: 'Jazz',
        linha_planilha: 3,
        aluno_nome: 'Carla Sem Venc',
        wpp: '71999990002',
        responsaveis: 'Carla',
        plano: 'Mensal',
        venc: null,
        valor_referencia: 200,
        pagador_pix: null,
        ativo: true,
      },
    ],
    formaPorAluno: new Map(),
    stickyByAluno: new Map(),
    alunosComVinculoValidacao: new Set(),
    gruposFamilia: [],
    filtroDiaVencimento: 10,
  });

  assert.deepEqual(result.totais.por_dia_vencimento, [
    { dia: 5, count: 1 },
    { dia: 10, count: 1 },
  ]);
  assert.equal(result.totais.sem_vencimento_cadastrado, 1);
  assert.equal(result.totais.alunos, 1);
  assert.equal(result.secoes[0].alunos_sem_vinculo[0].aluno_nome, 'Bruno Dia 10');
  assert.equal(result.secoes[0].alunos_sem_vinculo[0].dia_vencimento, 10);
});
