import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  matchUmPagamentoPlanilhaBanco,
  matchPagamentosAgrupadosPlanilhaBanco,
  resolverColisoesPossivelMatch,
  type BancoItem,
  type PlanilhaItem,
  type PilatesNomePagadorRow,
} from './conciliacaoPagamentoMatch.js';

function plBase(over: Partial<PlanilhaItem>): PlanilhaItem {
  return {
    id: 'p1',
    aba: 'BYLA DANÇA',
    modalidade: 'Dança',
    aluno: 'Maria Silva',
    linha: 10,
    data: '2026-03-10',
    forma: 'PIX',
    valor: 150,
    mesCompetencia: 3,
    anoCompetencia: 2026,
    responsaveis: [],
    ...over,
  };
}

function banco(over: Partial<BancoItem>): BancoItem {
  return {
    id: 'b1',
    data: '2026-03-10',
    pessoa: 'Maria Silva',
    descricao: null,
    valor: 150,
    ...over,
  };
}

describe('matchUmPagamentoPlanilhaBanco', () => {
  const vazios: PilatesNomePagadorRow[] = [];

  const table: Array<{
    name: string;
    planilha: PlanilhaItem;
    banco: BancoItem[];
    usados: string[];
    pilates: PilatesNomePagadorRow[];
    want: 'confirmado' | 'possivel' | 'nao';
    bancoId?: string;
  }> = [
    {
      name: 'confirma quando valor e nome batem com um banco',
      planilha: plBase({}),
      banco: [banco({ id: 'bx' })],
      usados: [],
      pilates: vazios,
      want: 'confirmado',
      bancoId: 'bx',
    },
    {
      name: 'nao quando valor difere acima da tolerancia',
      planilha: plBase({ valor: 150 }),
      banco: [banco({ id: 'bx', valor: 200 })],
      usados: [],
      pilates: vazios,
      want: 'nao',
    },
    {
      name: 'possivel quando dois bancos tem mesmo valor e nome compativel',
      planilha: plBase({ valor: 100 }),
      banco: [
        banco({ id: 'b1', valor: 100, pessoa: 'Maria Silva' }),
        banco({ id: 'b2', valor: 100, pessoa: 'Maria S' }),
      ],
      usados: [],
      pilates: vazios,
      want: 'possivel',
    },
    {
      name: 'ignora banco ja usado',
      planilha: plBase({}),
      banco: [banco({ id: 'bx' })],
      usados: ['bx'],
      pilates: vazios,
      want: 'nao',
    },
    {
      name: 'confirma com nome no campo descricao do banco',
      planilha: plBase({ aluno: 'João' }),
      banco: [banco({ id: 'b1', pessoa: 'X', descricao: 'João pagamento' })],
      usados: [],
      pilates: vazios,
      want: 'confirmado',
      bancoId: 'b1',
    },
    {
      name: 'Pilates usa pagador da view quando nome curto do aluno nao bate com pessoa no banco',
      planilha: plBase({
        aba: 'PILATES MARINA',
        modalidade: 'Pilates',
        aluno: 'Ana',
        valor: 80,
      }),
      banco: [banco({ id: 'b1', valor: 80, pessoa: 'Ana Costa' })],
      usados: [],
      pilates: [
        {
          aluno_nome: 'Ana',
          nome_pagador: 'Ana Costa',
          valor: 80,
          forma_pagamento: 'PIX',
          atividade_nome: 'PILATES MANHA',
        },
      ],
      want: 'confirmado',
      bancoId: 'b1',
    },
  ];

  for (const row of table) {
    it(row.name, () => {
      const usados = new Set(row.usados);
      const r = matchUmPagamentoPlanilhaBanco(row.planilha, row.banco, usados, row.pilates);
      assert.equal(r.status, row.want);
      if (row.want === 'confirmado' && row.bancoId) {
        assert.equal(r.status, 'confirmado');
        assert.equal(r.banco.id, row.bancoId);
      }
    });
  }

  it('marca como possivel quando soma de varios lancamentos bate com uma entrada unica no banco', () => {
    const usados = new Set<string>();
    const p1 = plBase({ id: 'p1', aluno: 'Lorrane da Franca Costa Santos', valor: 80, data: '2026-03-13' });
    const p2 = plBase({ id: 'p2', aluno: 'Lorrane da Franca Costa Santos', valor: 80, data: '2026-03-13' });
    const p3 = plBase({ id: 'p3', aluno: 'Lorrane da Franca Costa Santos', valor: 80, data: '2026-03-13' });
    const bancoItens = [banco({ id: 'b240', pessoa: 'Lorrane Costa Santos', valor: 240, data: '2026-03-13' })];
    const r = matchPagamentosAgrupadosPlanilhaBanco([p1, p2, p3], bancoItens, usados, vazios);
    assert.equal(r.status, 'possivel');
    assert.equal(r.candidatos.length, 1);
    assert.equal(r.candidatos[0].id, 'b240');
  });

  it('mesmo aluno em abas diferentes no mesmo dia: soma bate com uma entrada no banco', () => {
    const usados = new Set<string>();
    const p1 = plBase({ id: 'p1', aba: 'BYLA BALLET', valor: 100, data: '2026-03-20' });
    const p2 = plBase({ id: 'p2', aba: 'PILATES MARINA', valor: 100, data: '2026-03-20' });
    const bancoItens = [banco({ id: 'b200', pessoa: 'Maria Silva', valor: 200, data: '2026-03-20' })];
    const r = matchPagamentosAgrupadosPlanilhaBanco([p1, p2], bancoItens, usados, vazios);
    assert.equal(r.status, 'possivel');
    assert.equal(r.candidatos.length, 1);
    assert.equal(r.candidatos[0].id, 'b200');
  });

  it('agrupa pagador unico para dois alunos diferentes (mesmo PIX) contra uma entrada no banco', () => {
    const usados = new Set<string>();
    const p1 = plBase({
      id: 'p1',
      aluno: 'João Filho',
      valor: 120,
      data: '2026-03-15',
      pagadorPix: 'Carlos Silva Santos',
      responsaveis: [],
    });
    const p2 = plBase({
      id: 'p2',
      aluno: 'Maria Filha',
      valor: 120,
      data: '2026-03-15',
      pagadorPix: 'Carlos Silva Santos',
      responsaveis: [],
    });
    const bancoItens = [banco({ id: 'b240', pessoa: 'Carlos Silva', valor: 240, data: '2026-03-15' })];
    const r = matchPagamentosAgrupadosPlanilhaBanco([p1, p2], bancoItens, usados, vazios);
    assert.equal(r.status, 'possivel');
    assert.equal(r.candidatos.length, 1);
    assert.equal(r.candidatos[0].id, 'b240');
  });
});

describe('resolverColisoesPossivelMatch', () => {
  it('nao deixa quatro linhas de 250 compartilharem um unico banco de 250', () => {
    const b250 = banco({ id: 'b250', valor: 250, pessoa: 'X' });
    const rows = [1, 2, 3, 4].map((n) => ({
      planilha: plBase({ id: `p${n}`, valor: 250, aluno: `Aluno ${n}` }),
      candidatos: [b250],
    }));
    const { rows: out, demovidos } = resolverColisoesPossivelMatch(rows, 0.01);
    const comB250 = out.filter((r) => r.candidatos.some((c) => c.id === 'b250'));
    assert.equal(comB250.length, 1);
    assert.equal(demovidos.length, 3);
  });

  it('mantem grupo quando soma bate com valor do banco', () => {
    const b500 = banco({ id: 'b500', valor: 500, pessoa: 'Luciano' });
    const rows = [
      { planilha: plBase({ id: 'p1', valor: 250, aluno: 'Luciano', pagadorPix: 'Luciano Vasconcelos' }), candidatos: [b500] },
      { planilha: plBase({ id: 'p2', valor: 250, aluno: 'Lilian', pagadorPix: 'Luciano Vasconcelos' }), candidatos: [b500] },
    ];
    const { rows: out, demovidos } = resolverColisoesPossivelMatch(rows, 0.01);
    assert.equal(out.length, 2);
    assert.equal(demovidos.length, 0);
    assert.ok(out.every((r) => r.candidatos.some((c) => c.id === 'b500')));
  });
});
