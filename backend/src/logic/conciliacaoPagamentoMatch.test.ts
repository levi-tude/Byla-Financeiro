import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  matchUmPagamentoPlanilhaBanco,
  matchPagamentosAgrupadosPlanilhaBanco,
  reconciliarAmbiguidadeValorValidacao,
  resolverColisoesPossivelMatch,
  scoreNomePlanilhaBanco,
  candidatosVendasCreditoRecorrente,
  datasCarregamentoBancoValidacaoDiaria,
  aplicarVinculosEExclusividadeBanco,
  detectarGruposRateioMesmoAluno,
  filtrarCandidatosPorVinculosExclusivos,
  indexVinculosPorBanco,
  type BancoItem,
  type PlanilhaItem,
  type PilatesNomePagadorRow,
} from './conciliacaoPagamentoMatch.js';
import {
  withGruposFamiliaCatalogo,
  type GrupoFamiliaPagamento,
} from './gruposFamiliaPagamento.js';

/** Fixtures fictícias — sem nomes reais de clientes. */
const CATALOGO_FAMILIA_TESTE: GrupoFamiliaPagamento[] = [
  {
    chave: 'marina_sofia_costa',
    rotulo: 'mãe e filha',
    membros: [
      ['MARINA', 'COSTA'],
      ['SOFIA', 'COSTA'],
    ],
  },
  {
    chave: 'carla_pedro_almeida',
    rotulo: 'casal',
    membros: [
      ['CARLA', 'ALMEIDA'],
      ['PEDRO', 'ALMEIDA'],
    ],
  },
];

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

  it('Vendas: possível match com taxa ~4% (250 vs 240.02) sem nome', () => {
    const usados = new Set<string>();
    const planilha = plBase({
      valor: 250,
      data: '2026-03-23',
      forma: 'Crédito recorrente',
      aluno: 'Aluna Assinatura',
    });
    const bancoItens = [
      banco({
        id: 'bv',
        valor: 240.02,
        pessoa: 'Vendas',
        descricao: 'Liquidacao Vendas',
        data: '2026-03-28',
      }),
    ];
    const r = matchUmPagamentoPlanilhaBanco(planilha, bancoItens, usados, vazios);
    assert.equal(r.status, 'possivel');
    assert.equal(r.candidatos.length, 1);
    assert.equal(r.candidatos[0].id, 'bv');
  });

  it('Vendas legado D+30: candidato na janela esperada', () => {
    const usados = new Set<string>();
    const planilha = plBase({
      valor: 250,
      data: '2026-03-23',
      aluno: 'Legado',
      forma: 'Crédito recorrente',
    });
    const bancoItens = [
      banco({
        id: 'b30',
        valor: 240.02,
        pessoa: 'Vendas',
        data: '2026-04-22',
      }),
    ];
    const r = matchUmPagamentoPlanilhaBanco(planilha, bancoItens, usados, vazios);
    assert.equal(r.status, 'possivel');
    assert.equal(r.candidatos[0].id, 'b30');
  });

  it('PIX continua exigindo ±0.01 (250 vs 240.02 rejeita)', () => {
    const usados = new Set<string>();
    const planilha = plBase({ valor: 250, data: '2026-03-10', aluno: 'Maria Silva' });
    const bancoItens = [banco({ id: 'bpix', valor: 240.02, pessoa: 'Maria Silva', data: '2026-03-10' })];
    const r = matchUmPagamentoPlanilhaBanco(planilha, bancoItens, usados, vazios);
    assert.equal(r.status, 'nao');
  });

  it('DÉBITO: casa Disponivel DEBITO com taxa; não sugere CREDITO', () => {
    const usados = new Set<string>();
    const planilha = plBase({
      aluno: 'ROBERTO DIAS',
      aba: 'PILATES',
      modalidade: 'PILATES',
      valor: 310,
      data: '2026-07-06',
      forma: 'DEBITO',
    });
    const bancoItens = [
      banco({
        id: 'bcred',
        valor: 305.92,
        pessoa: 'Disponivel CREDITO MASTERCARD',
        descricao: 'Disponivel CREDITO MASTERCARD',
        data: '2026-07-08',
      }),
      banco({
        id: 'bdeb',
        valor: 306.74,
        pessoa: 'Disponivel DEBITO VISA',
        descricao: 'Disponivel DEBITO VISA',
        data: '2026-07-06',
      }),
    ];
    const r = matchUmPagamentoPlanilhaBanco(planilha, bancoItens, usados, vazios);
    assert.notEqual(r.status, 'nao');
    const cands = r.status === 'confirmado' ? [r.banco] : r.status === 'possivel' ? r.candidatos : [];
    assert.ok(cands.some((c) => c.id === 'bdeb'));
    assert.ok(!cands.some((c) => c.id === 'bcred'));
  });
});

describe('janela e pool Vendas', () => {
  it('datasCarregamentoBancoValidacaoDiaria inclui D+30 além de ±7', () => {
    const datas = datasCarregamentoBancoValidacaoDiaria('2026-03-23', 7);
    assert.ok(datas.has('2026-03-23'));
    assert.ok(datas.has('2026-03-28'));
    assert.ok(datas.has('2026-04-22'));
  });

  it('candidatosVendasCreditoRecorrente filtra janela e taxa', () => {
    const planilha = plBase({ valor: 250, data: '2026-03-23', forma: 'Crédito recorrente' });
    const usados = new Set<string>();
    const pool = [
      banco({ id: 'ok', valor: 240.02, pessoa: 'Vendas', data: '2026-04-22' }),
      banco({ id: 'fora', valor: 240.02, pessoa: 'Vendas', data: '2026-05-01' }),
    ];
    const out = candidatosVendasCreditoRecorrente(planilha, pool, usados);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'ok');
  });
});

describe('resolverColisoesPossivelMatch', () => {
  it('sem pista de nome, varios alunos mantêm o mesmo banco para revisão manual', () => {
    const b250 = banco({ id: 'b250', valor: 250, pessoa: 'X' });
    const rows = [1, 2, 3, 4].map((n) => ({
      planilha: plBase({ id: `p${n}`, valor: 250, aluno: `Aluno ${n}` }),
      candidatos: [b250],
    }));
    const { rows: out, demovidos } = resolverColisoesPossivelMatch(rows, 0.01);
    assert.equal(out.length, 4);
    assert.equal(demovidos.length, 0);
    assert.ok(out.every((r) => r.candidatos.some((c) => c.id === 'b250')));
  });

  it('com nome, ambos alunos mesmo valor mantêm banco até confirmar manual', () => {
    const b195 = banco({
      id: 'bPixMae',
      valor: 195,
      pessoa: 'Clara Haydee Andrade Peres De Oliveira Fernato',
      data: '2026-03-03',
    });
    const rows = [
      {
        planilha: plBase({
          id: 'maria',
          valor: 195,
          aluno: 'MARIA LUISA FERNATORE',
          data: '2026-03-03',
          aba: 'TEATRO',
        }),
        candidatos: [b195],
      },
      {
        planilha: plBase({
          id: 'rafaela',
          valor: 195,
          aluno: 'RAFAELA OLIVARES DEMO',
          data: '2026-03-03',
          aba: 'TEATRO',
        }),
        candidatos: [b195],
      },
    ];
    const { rows: out, demovidos } = resolverColisoesPossivelMatch(rows, 0.01);
    const maria = out.find((r) => r.planilha.id === 'maria');
    const rafaela = out.find((r) => r.planilha.id === 'rafaela');
    assert.ok(maria?.candidatos.some((c) => c.id === 'bPixMae'));
    assert.ok(rafaela?.candidatos.some((c) => c.id === 'bPixMae'));
    assert.equal(demovidos.length, 0);
  });

  it('sobrenome truncado no PIX pontua acima de false friend OLIVARES', () => {
    const b195 = banco({
      id: 'bPixMae',
      valor: 195,
      pessoa: 'Clara Haydee Andrade Peres De Oliveira Fernato',
      data: '2026-03-03',
    });
    const maria = plBase({
      id: 'maria',
      valor: 195,
      aluno: 'MARIA LUISA FERNATORE',
      data: '2026-03-03',
      aba: 'TEATRO',
    });
    const rafaela = plBase({
      id: 'rafaela',
      valor: 195,
      aluno: 'RAFAELA OLIVARES DEMO',
      data: '2026-03-03',
      aba: 'TEATRO',
    });
    assert.ok(scoreNomePlanilhaBanco(maria, b195) > scoreNomePlanilhaBanco(rafaela, b195));
  });

  it('ambiguidade de valor rebaixa auto-confirmado para possível em ambos', () => {
    const b195 = banco({
      id: 'bPixMae',
      valor: 195,
      pessoa: 'Clara Haydee Andrade Peres De Oliveira Fernato',
      data: '2026-03-03',
    });
    const maria = plBase({
      id: 'maria',
      valor: 195,
      aluno: 'MARIA LUISA FERNATORE',
      data: '2026-03-03',
      aba: 'TEATRO',
    });
    const rafaela = plBase({
      id: 'rafaela',
      valor: 195,
      aluno: 'RAFAELA OLIVARES DEMO',
      data: '2026-03-03',
      aba: 'TEATRO',
    });
    const mMaria = matchUmPagamentoPlanilhaBanco(maria, [b195], new Set(), []);
    const mRafaela = matchUmPagamentoPlanilhaBanco(rafaela, [b195], new Set(), []);
    assert.equal(mMaria.status, 'confirmado');
    assert.equal(mRafaela.status, 'possivel');

    const rec = reconciliarAmbiguidadeValorValidacao(
      [
        { status: 'confirmado', planilha: maria, banco: b195 },
        { status: 'possivel', planilha: rafaela, candidatos: [b195] },
      ],
      0.01,
    );
    assert.equal(rec.confirmados.length, 0);
    assert.equal(rec.possiveis.length, 2);
    assert.ok(rec.possiveis.every((r) => r.candidatos.some((c) => c.id === 'bPixMae')));
  });

  it('mantem grupo quando soma bate com valor do banco', () => {
    const b500 = banco({ id: 'b500', valor: 500, pessoa: 'Pedro' });
    const rows = [
      { planilha: plBase({ id: 'p1', valor: 250, aluno: 'Pedro', pagadorPix: 'Pedro Almeida' }), candidatos: [b500] },
      { planilha: plBase({ id: 'p2', valor: 250, aluno: 'Carla', pagadorPix: 'Pedro Almeida' }), candidatos: [b500] },
    ];
    const { rows: out, demovidos } = resolverColisoesPossivelMatch(rows, 0.01);
    assert.equal(out.length, 2);
    assert.equal(demovidos.length, 0);
    assert.ok(out.every((r) => r.candidatos.some((c) => c.id === 'b500')));
  });
});

describe('vinculos exclusivos e rateio mesmo aluno', () => {
  it('banco ja vinculado nao aparece para outro aluno', () => {
    const bJorge = banco({ id: 'bJorge', valor: 195, pessoa: 'Jorge Silva', data: '2026-07-10' });
    const planilhas = [
      plBase({ id: 'fluxo::jorge', aluno: 'Jorge Demo', valor: 195, data: '2026-07-10' }),
      plBase({ id: 'fluxo::maria', aluno: 'Ana Demo', valor: 195, data: '2026-07-10' }),
    ];
    const planilhasById = new Map(planilhas.map((p) => [p.id, p]));
    const vinculosPorBanco = indexVinculosPorBanco([
      { planilha_id: 'fluxo::jorge', banco_id: 'bJorge' },
    ]);
    const mariaCandidatos = filtrarCandidatosPorVinculosExclusivos(
      planilhas[1],
      [bJorge],
      vinculosPorBanco,
      planilhasById,
    );
    assert.equal(mariaCandidatos.length, 0);
  });

  it('mesmo aluno 80+260 detecta rateio ~340 no mesmo dia', () => {
    const p1 = plBase({
      id: 'g1',
      aluno: 'Camila Rocha Ferreira',
      aba: 'PILATES',
      modalidade: 'Reformer',
      valor: 80,
      data: '2026-07-06',
    });
    const p2 = plBase({
      id: 'g2',
      aluno: 'Camila Rocha Ferreira',
      aba: 'BYLA DANÇA',
      modalidade: 'Contemporânea',
      valor: 260,
      data: '2026-07-06',
    });
    const b340 = banco({ id: 'b340', valor: 340, pessoa: 'Camila Ferreira', data: '2026-07-06' });
    const grupos = detectarGruposRateioMesmoAluno([p1, p2], new Set(), [b340], 0.02);
    assert.equal(grupos.length, 1);
    assert.equal(grupos[0].soma, 340);
    assert.deepEqual(grupos[0].planilha_ids.sort(), ['g1', 'g2']);
    assert.deepEqual(grupos[0].banco_ids, ['b340']);
  });

  it('dois alunos mesmo valor compartilham banco ate confirmar; depois exclusivo', () => {
    const b195 = banco({ id: 'b195', valor: 195, pessoa: 'Pagador X', data: '2026-03-03' });
    const maria = plBase({ id: 'maria', valor: 195, aluno: 'Ana Demo', data: '2026-03-03' });
    const rafaela = plBase({ id: 'rafaela', valor: 195, aluno: 'RAFAELA DEMO', data: '2026-03-03' });
    const rows = [
      { planilha: maria, candidatos: [b195] },
      { planilha: rafaela, candidatos: [b195] },
    ];
    const { rows: antes } = resolverColisoesPossivelMatch(rows, 0.01);
    assert.equal(antes.length, 2);
    assert.ok(antes.every((r) => r.candidatos.some((c) => c.id === 'b195')));

    const posVinculo = aplicarVinculosEExclusividadeBanco({
      vinculos: [{ planilha_id: 'maria', banco_id: 'b195' }],
      planilhas: [maria, rafaela],
      bancoItens: [b195],
      confirmados: [],
      possiveis: antes,
      nao: [],
      tol: 0.01,
    });
    assert.equal(posVinculo.confirmados.length, 1);
    assert.equal(posVinculo.confirmados[0].planilha.id, 'maria');
    const raf = posVinculo.possiveis.find((r) => r.planilha.id === 'rafaela');
    assert.ok(!raf?.candidatos.some((c) => c.id === 'b195'));
  });

  it('N→1 mesmo aluno: banco vinculado a uma linha permanece candidato para irma do grupo', () => {
    const p1 = plBase({ id: 'g1', aluno: 'Camila Rocha Ferreira', valor: 80, data: '2026-07-06' });
    const p2 = plBase({ id: 'g2', aluno: 'Camila Rocha Ferreira', valor: 260, data: '2026-07-06' });
    const b340 = banco({ id: 'b340', valor: 340, pessoa: 'Camila', data: '2026-07-06' });
    const posVinculo = aplicarVinculosEExclusividadeBanco({
      vinculos: [{ planilha_id: 'g1', banco_id: 'b340' }],
      planilhas: [p1, p2],
      bancoItens: [b340],
      confirmados: [],
      possiveis: [{ planilha: p2, candidatos: [b340] }],
      nao: [],
      tol: 0.02,
    });
    assert.equal(posVinculo.confirmados.length, 1);
    const p2Row = posVinculo.possiveis.find((r) => r.planilha.id === 'g2');
    assert.ok(p2Row?.candidatos.some((c) => c.id === 'b340'));
  });

  it('N→1 família sticky: soma 210+210 → banco 420 sem depender de pagador_pix', () => {
    withGruposFamiliaCatalogo(CATALOGO_FAMILIA_TESTE, () => {
      const marina = plBase({
        id: 't1',
        aluno: 'MARINA COSTA SILVA',
        valor: 210,
        data: '2026-07-20',
        pagadorPix: undefined,
        responsaveis: [],
      });
      const sofia = plBase({
        id: 's1',
        aluno: 'SOFIA COSTA',
        valor: 210,
        data: '2026-07-20',
        pagadorPix: undefined,
        responsaveis: [],
      });
      const b420 = banco({ id: 'b420', valor: 420, pessoa: 'Clara', data: '2026-07-20' });
      const grupos = detectarGruposRateioMesmoAluno([marina, sofia], new Set(), [b420], 0.02);
      assert.equal(grupos.length, 1);
      assert.equal(grupos[0].soma, 420);
      assert.deepEqual(grupos[0].planilha_ids.sort(), ['s1', 't1']);

      const pos = aplicarVinculosEExclusividadeBanco({
        vinculos: [],
        planilhas: [marina, sofia],
        bancoItens: [b420],
        confirmados: [],
        possiveis: [
          { planilha: marina, candidatos: [] },
          { planilha: sofia, candidatos: [] },
        ],
        nao: [],
        tol: 0.02,
      });
      const rowT = pos.possiveis.find((r) => r.planilha.id === 't1');
      assert.ok(rowT?.grupo_familia_pagamento);
      assert.equal(rowT?.grupo_familia_rotulo, 'mãe e filha');
      assert.ok(rowT?.candidatos.some((c) => c.id === 'b420'));
      assert.deepEqual(rowT?.grupo_rateio_ids?.slice().sort(), ['s1', 't1']);
    });
  });

  it('N→1 família: agrupa mesmo sem banco ≈ soma (sobe de não-confirmado)', () => {
    withGruposFamiliaCatalogo(CATALOGO_FAMILIA_TESTE, () => {
      const marina = plBase({
        id: 't1',
        aluno: 'MARINA COSTA SILVA',
        valor: 210,
        data: '2026-07-20',
      });
      const sofia = plBase({
        id: 's1',
        aluno: 'SOFIA COSTA',
        valor: 210,
        data: '2026-07-20',
      });
      const grupos = detectarGruposRateioMesmoAluno([marina, sofia], new Set(), [], 0.02);
      assert.equal(grupos.length, 1);
      assert.equal(grupos[0].banco_ids.length, 0);

      const pos = aplicarVinculosEExclusividadeBanco({
        vinculos: [],
        planilhas: [marina, sofia],
        bancoItens: [],
        confirmados: [],
        possiveis: [],
        nao: [marina, sofia],
        tol: 0.02,
      });
      assert.equal(pos.nao.length, 0);
      assert.equal(pos.possiveis.length, 2);
      assert.ok(pos.possiveis.every((r) => r.grupo_familia_pagamento));
      assert.ok(pos.possiveis.every((r) => (r.grupo_rateio_ids ?? []).length === 2));
    });
  });

  it('N→1 mesmo aluno: agrupa 80+260 mesmo sem banco 340', () => {
    const p1 = plBase({
      id: 'g1',
      aluno: 'CAMILA ROCHA FERREIRA',
      valor: 80,
      data: '2026-07-06',
      modalidade: 'Ballet',
    });
    const p2 = plBase({
      id: 'g2',
      aluno: 'CAMILA ROCHA FERREIRA',
      valor: 260,
      data: '2026-07-06',
      modalidade: 'Contemp',
    });
    const grupos = detectarGruposRateioMesmoAluno([p1, p2], new Set(), [], 0.02);
    assert.equal(grupos.length, 1);
    assert.equal(grupos[0].soma, 340);

    const pos = aplicarVinculosEExclusividadeBanco({
      vinculos: [],
      planilhas: [p1, p2],
      bancoItens: [],
      confirmados: [],
      possiveis: [],
      nao: [p1, p2],
      tol: 0.02,
    });
    assert.equal(pos.nao.length, 0);
    assert.equal(pos.possiveis.length, 2);
    assert.ok(pos.possiveis.every((r) => r.possivel_rateio_mesmo_aluno));
    assert.deepEqual(pos.possiveis[0].grupo_rateio_ids?.slice().sort(), ['g1', 'g2']);
  });

  it('N→1 casal sticky: 250+250 → PIX 500 via responsável', () => {
    withGruposFamiliaCatalogo(CATALOGO_FAMILIA_TESTE, () => {
      const carla = plBase({
        id: 'lil',
        aluno: 'CARLA ALMEIDA',
        valor: 250,
        data: '2026-07-04',
        responsaveis: ['PEDRO'],
        pagadorPix: undefined,
      });
      const pedro = plBase({
        id: 'luc',
        aluno: 'PEDRO ALMEIDA',
        valor: 250,
        data: '2026-07-04',
        responsaveis: ['PEDRO'],
        pagadorPix: undefined,
      });
      const b500 = banco({
        id: 'b500',
        valor: 500,
        pessoa: 'Pedro Souza Almeida',
        data: '2026-07-04',
      });
      const grupos = detectarGruposRateioMesmoAluno([carla, pedro], new Set(), [b500], 0.02);
      assert.ok(grupos.some((g) => g.soma === 500 && g.banco_ids.includes('b500')));

      const pos = aplicarVinculosEExclusividadeBanco({
        vinculos: [],
        planilhas: [carla, pedro],
        bancoItens: [b500],
        confirmados: [],
        possiveis: [],
        nao: [carla, pedro],
        tol: 0.02,
      });
      assert.equal(pos.nao.length, 0);
      assert.equal(pos.possiveis.length, 2);
      assert.ok(pos.possiveis.every((r) => r.grupo_familia_pagamento || r.mesmo_pagador_multi_aluno));
      assert.ok(pos.possiveis.every((r) => r.candidatos.some((c) => c.id === 'b500')));
    });
  });

  it('vínculo com planilha_id bare UUID casa com id fluxo::', () => {
    const aluno = plBase({
      id: 'fluxo::e50f2063-7078-4bdd-a301-673d84b1acfc',
      aluno: 'ROBERTO DIAS',
      valor: 310,
      data: '2026-06-08',
      forma: 'DEBITO',
    });
    const bdeb = banco({
      id: 'e7116b7e-8f01-4ee0-a547-0645e2a62db5',
      valor: 306.74,
      pessoa: 'Disponivel DEBITO VISA',
      data: '2026-06-08',
    });
    const pos = aplicarVinculosEExclusividadeBanco({
      vinculos: [
        {
          planilha_id: 'e50f2063-7078-4bdd-a301-673d84b1acfc',
          banco_id: 'e7116b7e-8f01-4ee0-a547-0645e2a62db5',
        },
      ],
      planilhas: [aluno],
      bancoItens: [bdeb],
      confirmados: [],
      possiveis: [],
      nao: [aluno],
      tol: 0.02,
    });
    assert.equal(pos.confirmados.length, 1);
    assert.equal(pos.confirmados[0].planilha.id, aluno.id);
    assert.equal(pos.nao.length, 0);
  });
});
