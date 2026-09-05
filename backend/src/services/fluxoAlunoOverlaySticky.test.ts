import assert from 'node:assert/strict';
import test from 'node:test';
import type { FluxoAlunoOverlay } from '../logic/fluxoRemigracaoOverlays.js';
import { mesclarOverlays } from './fluxoAlunoOverlaySticky.js';

function o(p: Partial<FluxoAlunoOverlay> & Pick<FluxoAlunoOverlay, 'aluno_nome'>): FluxoAlunoOverlay {
  return {
    aba: 'DANÇA',
    linha_planilha: 1,
    ativo: true,
    regime_cobranca: 'normal',
    pendencia_campos_ignorados: [],
    cobranca_tentativas: [],
    ...p,
  };
}

test('planilha ativa não reativa quem o site marcou inativo', () => {
  const merged = mesclarOverlays(
    [o({ aluno_nome: 'Ana', ativo: true })],
    [o({ aluno_nome: 'Ana', ativo: false })],
  );
  assert.equal(merged[0].ativo, false);
});

test('bolsa/exceção do caderninho não some se a planilha vier normal', () => {
  const merged = mesclarOverlays(
    [o({ aluno_nome: 'Bia', regime_cobranca: 'normal' })],
    [o({ aluno_nome: 'Bia', regime_cobranca: 'excecao' })],
  );
  assert.equal(merged[0].regime_cobranca, 'excecao');
});
