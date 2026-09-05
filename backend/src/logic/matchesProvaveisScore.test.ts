import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BancoItem, PlanilhaItem } from './conciliacaoPagamentoMatch.js';
import { ranquearMatchesProvaveis } from './matchesProvaveisRanking.js';
import { normalizeText } from './conciliacaoTexto.js';
import {
  bucketMatchesProvaveis,
  rotulosRazoesAdmin,
  scoreParMatchesProvaveis,
} from './matchesProvaveisScore.js';

function planilha(partial: Partial<PlanilhaItem> & Pick<PlanilhaItem, 'id' | 'aluno'>): PlanilhaItem {
  return {
    aba: 'DANÇA',
    modalidade: 'Ballet',
    linha: 1,
    data: '2026-07-10',
    forma: 'PIX',
    valor: 200,
    mesCompetencia: 7,
    anoCompetencia: 2026,
    responsaveis: [],
    ...partial,
  };
}

function banco(partial: Partial<BancoItem> & Pick<BancoItem, 'id' | 'pessoa'>): BancoItem {
  return {
    data: '2026-07-10',
    descricao: null,
    valor: 200,
    ...partial,
  };
}

describe('scoreParMatchesProvaveis', () => {
  it('pontua alto PIX mesmo dia + nome + valor exato', () => {
    const p = planilha({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', aluno: 'MARIA SILVA DEMO' });
    const b = banco({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', pessoa: 'Maria Silva Demo' });
    const bd = scoreParMatchesProvaveis(p, b, new Set());
    assert.ok(bd);
    assert.ok(bd.total >= 75);
    assert.ok(bd.razoes.includes('data_mesmo_dia'));
    assert.ok(bd.razoes.includes('valor_exato'));
    assert.ok(bd.razoes.includes('nome_forte'));
  });

  it('descarta sem nome e sem sticky (não-Vendas)', () => {
    const p = planilha({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', aluno: 'MARIA SILVA DEMO' });
    const b = banco({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', pessoa: 'Joao Completamente Outro' });
    const bd = scoreParMatchesProvaveis(p, b, new Set());
    assert.equal(bd, null);
  });

  it('aceita sticky aluno→pagador com pagador diferente do aluno', () => {
    const p = planilha({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      aluno: 'MARIA SILVA DEMO',
    });
    const b = banco({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', pessoa: 'Carlos Pagador Demo' });
    const sticky = new Set([
      `${normalizeText('MARIA SILVA DEMO')}::${normalizeText('Carlos Pagador Demo')}`,
    ]);
    const bd = scoreParMatchesProvaveis(p, b, sticky);
    assert.ok(bd);
    assert.ok(bd.sticky > 0);
    assert.ok(bd.razoes.includes('sticky_aluno_pagador'));
  });
});

describe('bucketMatchesProvaveis', () => {
  it('rebaixa alto→médio quando ambíguo', () => {
    assert.equal(bucketMatchesProvaveis(83, false), 'alto');
    assert.equal(bucketMatchesProvaveis(83, true), 'medio');
    assert.equal(bucketMatchesProvaveis(60, false), 'medio');
    assert.equal(bucketMatchesProvaveis(45, false), 'baixo');
    assert.equal(bucketMatchesProvaveis(30, false), null);
  });
});

describe('rotulosRazoesAdmin', () => {
  it('traduz tags técnicas', () => {
    const labels = rotulosRazoesAdmin(['data_mesmo_dia', 'valor_exato', 'sticky_aluno_pagador']);
    assert.deepEqual(labels, ['Mesmo dia', 'Valor igual', 'Já reconhecido antes']);
  });
});

describe('ranquearMatchesProvaveis', () => {
  it('marca pode_confirmar só em alto inequívoco 1:1', () => {
    const pendentes = [
      planilha({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', aluno: 'ANA COSTA DEMO', valor: 150 }),
    ];
    const bancoLivres = [
      banco({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', pessoa: 'Ana Costa Demo', valor: 150 }),
    ];
    const r = ranquearMatchesProvaveis({
      pendentes,
      bancoLivres,
      stickyKeys: new Set(),
      flexDays: 7,
    });
    assert.equal(r.sugestoes.length, 1);
    assert.equal(r.sugestoes[0].bucket, 'alto');
    assert.equal(r.sugestoes[0].pode_confirmar, true);
    assert.equal(r.sugestoes[0].planilha_ids[0], 'fluxo::aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  });

  it('rebaixa quando há dois candidatos próximos', () => {
    const pendentes = [
      planilha({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', aluno: 'ANA COSTA DEMO', valor: 150 }),
    ];
    const bancoLivres = [
      banco({ id: 'b1bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', pessoa: 'Ana Costa Demo', valor: 150 }),
      banco({
        id: 'b2bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        pessoa: 'Ana Costa Demo Pix',
        valor: 150,
        data: '2026-07-10',
      }),
    ];
    const r = ranquearMatchesProvaveis({
      pendentes,
      bancoLivres,
      stickyKeys: new Set(),
      flexDays: 7,
    });
    assert.equal(r.sugestoes.length, 1);
    assert.equal(r.sugestoes[0].pode_confirmar, false);
    assert.ok(r.sugestoes[0].bucket === 'medio' || r.sugestoes[0].ambiguo);
    assert.equal(r.sugestoes[0].candidatos_alternativos.length, 2);
  });

  it('nunca chama de seguro quando existe um segundo candidato compatível, mesmo com gap amplo', () => {
    const r = ranquearMatchesProvaveis({
      pendentes: [
        planilha({ id: '55555555-5555-4555-8555-555555555555', aluno: 'ANA COSTA DEMO', valor: 150 }),
      ],
      bancoLivres: [
        banco({ id: 'banco-melhor', pessoa: 'Ana Costa Demo', valor: 150 }),
        banco({
          id: 'banco-segundo',
          pessoa: 'Ana C',
          valor: 150,
          data: '2026-07-17',
        }),
      ],
      stickyKeys: new Set(),
      flexDays: 7,
    });
    assert.ok((r.sugestoes[0].gap_2o ?? 0) > 8);
    assert.equal(r.sugestoes[0].ambiguo, true);
    assert.equal(r.sugestoes[0].pode_confirmar, false);
  });

  it('não libera dois pagamentos concorrendo pelo mesmo banco', () => {
    const pendentes = [
      planilha({ id: '11111111-1111-4111-8111-111111111111', aluno: 'ANA DEMO', valor: 150 }),
      planilha({ id: '22222222-2222-4222-8222-222222222222', aluno: 'ANA DEMO', valor: 150 }),
    ];
    const r = ranquearMatchesProvaveis({
      pendentes,
      bancoLivres: [banco({ id: 'banco-unico', pessoa: 'Ana Demo', valor: 150 })],
      stickyKeys: new Set(),
      flexDays: 7,
    });
    assert.equal(r.sugestoes.length, 2);
    assert.equal(r.sugestoes.some((s) => s.pode_confirmar), false);
    assert.equal(r.sugestoes.every((s) => s.ambiguo), true);
  });

  it('devolve os pagamentos sem candidato para a visão mensal', () => {
    const semBanco = planilha({
      id: '33333333-3333-4333-8333-333333333333',
      aluno: 'SEM CANDIDATO DEMO',
      valor: 987,
    });
    const r = ranquearMatchesProvaveis({
      pendentes: [semBanco],
      bancoLivres: [],
      stickyKeys: new Set(),
      flexDays: 7,
    });
    assert.deepEqual(r.semCandidato.map((p) => p.id), [semBanco.id]);
  });

  it('mantém candidato de baixa confiança fora da lista acionável', () => {
    const fraco = planilha({
      id: '44444444-4444-4444-8444-444444444444',
      aluno: 'ANA COSTA DEMO',
      valor: 150,
      forma: 'CREDITO',
    });
    const r = ranquearMatchesProvaveis({
      pendentes: [fraco],
      bancoLivres: [
        banco({
          id: 'banco-fraco',
          pessoa: 'Vendas',
          descricao: 'Vendas',
          valor: 150,
          data: '2026-07-17',
        }),
      ],
      stickyKeys: new Set(),
      flexDays: 7,
    });
    assert.equal(r.stats.baixo, 1);
    assert.deepEqual(r.semCandidato.map((p) => p.id), [fraco.id]);
  });
});
