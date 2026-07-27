import assert from 'node:assert/strict';
import test from 'node:test';
import { montarCadastroAlunosResumo } from './cadastroAlunosResumoReadModel.js';

test('montarCadastroAlunosResumo: agrupa por aba/modalidade e separa vínculo', () => {
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
    gruposFamilia: [],
  });

  assert.equal(result.totais.alunos, 2);
  assert.equal(result.totais.com_vinculo, 1);
  assert.equal(result.totais.sem_vinculo, 1);
  assert.equal(result.secoes.length, 1);
  assert.equal(result.secoes[0].alunos_com_vinculo.length, 1);
  assert.equal(result.secoes[0].alunos_sem_vinculo.length, 1);
  assert.equal(result.secoes[0].por_forma.length, 2);
  assert.equal(result.secoes[0].alunos_sem_vinculo[0].meio, 'debito');
});

test('montarCadastroAlunosResumo: sticky conta como vínculo aprendido', () => {
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
    gruposFamilia: [],
  });

  assert.equal(result.totais.com_vinculo, 1);
  assert.equal(result.secoes[0].alunos_com_vinculo[0].vinculo_status, 'aprendido');
  assert.equal(result.secoes[0].alunos_com_vinculo[0].pagador_vinculo, 'PIX CARLA MÃE');
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
    stickyByAluno: new Map(),
    gruposFamilia: [],
    filtroVinculo: 'sem_vinculo',
  });

  assert.equal(result.totais.alunos, 1);
  assert.equal(result.secoes[0].alunos_sem_vinculo[0].aluno_nome, 'Bruno Sem Vinculo');
});
