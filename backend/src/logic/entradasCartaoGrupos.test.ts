import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGruposCartaoEntrada,
  formaFluxoCompativelCartao,
  isEntradaCartaoAgregada,
  isNomeGenericoMaquininha,
  matchFluxoCartaoParaTransacao,
} from './entradasCartaoGrupos.js';
import type { PlanilhaItem } from './conciliacaoPagamentoMatch.js';
import type { TransacaoEntradaClassificada } from './entradasAgrupamento.js';

describe('isEntradaCartaoAgregada', () => {
  it('detecta maquininha VISA como agregada', () => {
    assert.equal(isEntradaCartaoAgregada('Cartão VISA', null), true);
    assert.equal(isNomeGenericoMaquininha('Cartão VISA'), true);
  });

  it('PIX com nome de pessoa não é cartão agregado', () => {
    assert.equal(isEntradaCartaoAgregada('Maria Silva Santos', 'PIX recebido'), false);
  });
});

describe('matchFluxoCartaoParaTransacao', () => {
  const txn: TransacaoEntradaClassificada = {
    id: 'b1',
    data: '2026-06-05',
    pessoa: 'Cartão VISA',
    valor: 240,
    descricao: 'Crédito',
    categoria_sugerida: null,
    origem_categoria: null,
    modalidade: null,
    nome_aluno: null,
    pessoa_normalizada: 'cartao visa',
    categoria_efetiva: null,
    template_key_efetivo: null,
    origem_efetiva: 'pendente',
  };

  const fluxo: PlanilhaItem[] = [
    {
      id: 'fluxo::f1',
      aba: 'BYLA DANÇA',
      modalidade: 'Infantil',
      aluno: 'Joana',
      linha: 1,
      data: '2026-06-05',
      forma: 'crédito',
      valor: 240,
      mesCompetencia: 6,
      anoCompetencia: 2026,
      responsaveis: ['Joana Borges'],
    },
  ];

  it('casa valor, data e forma', () => {
    assert.equal(formaFluxoCompativelCartao('crédito', 'Crédito'), true);
    const m = matchFluxoCartaoParaTransacao(txn, 'Crédito', fluxo, new Set());
    assert.equal(m?.aluno, 'Joana');
  });
});

describe('buildGruposCartaoEntrada', () => {
  it('não acumula várias transações de cartão num grupo', () => {
    const txns: TransacaoEntradaClassificada[] = [
      {
        id: 'b1',
        data: '2026-06-05',
        pessoa: 'Cartão VISA',
        valor: 100,
        descricao: null,
        categoria_sugerida: null,
        origem_categoria: null,
        modalidade: null,
        nome_aluno: null,
        pessoa_normalizada: 'cartao visa',
        categoria_efetiva: null,
        template_key_efetivo: null,
        origem_efetiva: 'pendente',
      },
      {
        id: 'b2',
        data: '2026-06-06',
        pessoa: 'Cartão ELO',
        valor: 200,
        descricao: null,
        categoria_sugerida: null,
        origem_categoria: null,
        modalidade: null,
        nome_aluno: null,
        pessoa_normalizada: 'cartao elo',
        categoria_efetiva: null,
        template_key_efetivo: null,
        origem_efetiva: 'pendente',
      },
    ];
    const grupos = buildGruposCartaoEntrada(txns, [], new Map(), [], 6, 2026, []);
    assert.equal(grupos.length, 2);
    assert.notEqual(grupos[0].grupo_key, grupos[1].grupo_key);
  });
});
