import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aplicarOverlayAlunoMigracao,
  aplicarOverlaysNaMigracao,
  chaveOverlayPorNome,
  localizarOverlayAluno,
  indexarOverlaysAlunos,
  type FluxoAlunoOverlay,
} from './fluxoRemigracaoOverlays.js';

function overlay(partial: Partial<FluxoAlunoOverlay> & Pick<FluxoAlunoOverlay, 'aluno_nome'>): FluxoAlunoOverlay {
  return {
    aba: 'DANÇA',
    linha_planilha: 10,
    ativo: true,
    regime_cobranca: 'normal',
    pendencia_campos_ignorados: [],
    cobranca_tentativas: [],
    ...partial,
  };
}

test('match preferencial por aba+nome normalizado; fallback aba+linha', () => {
  const overlays = [
    overlay({ aluno_nome: 'Ana Silva', linha_planilha: 3, ativo: false, regime_cobranca: 'excecao' }),
    overlay({ aluno_nome: 'Bruno Costa', aba: 'YOGA', linha_planilha: 7, regime_cobranca: 'bolsa' }),
  ];
  const index = indexarOverlaysAlunos(overlays);

  const porNome = localizarOverlayAluno(
    { aba: 'Danca', aluno_nome: 'ANA  SILVA', linha_planilha: 99 },
    index,
  );
  assert.equal(porNome?.ativo, false);
  assert.equal(porNome?.regime_cobranca, 'excecao');

  const porLinha = localizarOverlayAluno(
    { aba: 'YOGA', aluno_nome: 'Nome Mudou', linha_planilha: 7 },
    index,
  );
  assert.equal(porLinha?.regime_cobranca, 'bolsa');
  assert.equal(chaveOverlayPorNome('DANÇA', 'Ana Silva'), chaveOverlayPorNome('Danca', 'ANA  SILVA'));
});

test('overlay ativo=false vence planilha ativo=true (nunca reativa)', () => {
  const row = aplicarOverlayAlunoMigracao(
    {
      aba: 'DANÇA',
      aluno_nome: 'Ana Silva',
      linha_planilha: 3,
      ativo: true,
      plano: 'Mensal',
    },
    overlay({ aluno_nome: 'Ana Silva', ativo: false, regime_cobranca: 'normal' }),
  );
  assert.equal(row.ativo, false);
});

test('preserva regime bolsa/exceção e campos operacionais do app', () => {
  const row = aplicarOverlayAlunoMigracao(
    {
      aba: 'DANÇA',
      aluno_nome: 'Carla Souza',
      linha_planilha: 4,
      ativo: true,
      plano: 'Mensal',
      regime_cobranca: 'normal',
    },
    overlay({
      aluno_nome: 'Carla Souza',
      regime_cobranca: 'bolsa',
      pendencia_campos_ignorados: ['wpp'],
      cobranca_tentativas: [{ nota: 'ligou', registrado_em: '2026-07-01T12:00:00.000Z' }],
    }),
  );
  assert.equal(row.regime_cobranca, 'bolsa');
  assert.deepEqual(row.pendencia_campos_ignorados, ['wpp']);
  assert.equal(Array.isArray(row.cobranca_tentativas), true);
});

test('sem overlay: plano com bolsa → regime bolsa; senão normal', () => {
  const bolsa = aplicarOverlayAlunoMigracao(
    { aba: 'A', aluno_nome: 'Dora', linha_planilha: 1, ativo: true, plano: 'Bolsa 50%' },
    null,
  );
  assert.equal(bolsa.regime_cobranca, 'bolsa');

  const normal = aplicarOverlayAlunoMigracao(
    { aba: 'A', aluno_nome: 'Eva', linha_planilha: 2, ativo: true, plano: 'Mensal' },
    null,
  );
  assert.equal(normal.regime_cobranca, 'normal');
});

test('aplicarOverlaysNaMigracao conta aplicados e inativos preservados', () => {
  const { rows, aplicados, inativosPreservados } = aplicarOverlaysNaMigracao(
    [
      { aba: 'DANÇA', aluno_nome: 'Ana Silva', linha_planilha: 3, ativo: true, plano: 'Mensal' },
      { aba: 'DANÇA', aluno_nome: 'Nova Aluna', linha_planilha: 99, ativo: true, plano: 'Mensal' },
    ],
    [overlay({ aluno_nome: 'Ana Silva', ativo: false, regime_cobranca: 'excecao' })],
  );
  assert.equal(aplicados, 1);
  assert.equal(inativosPreservados, 1);
  assert.equal(rows[0].ativo, false);
  assert.equal(rows[0].regime_cobranca, 'excecao');
  assert.equal(rows[1].ativo, true);
  assert.equal(rows[1].regime_cobranca, 'normal');
});
