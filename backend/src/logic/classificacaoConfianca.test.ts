import assert from 'node:assert/strict';
import test from 'node:test';
import { criarConfiancaClassificacao, nivelConfiancaClassificacao } from './classificacaoConfianca.js';

test('confiança alta só permite confirmar quando não há ambiguidade', () => {
  assert.equal(nivelConfiancaClassificacao(85), 'alta');
  assert.equal(nivelConfiancaClassificacao(85, true), 'media');

  const segura = criarConfiancaClassificacao({
    scoreBase: 84,
    motivos: ['Histórico confirmado', 'Nome compatível'],
  });
  assert.equal(segura.pode_confirmar, true);

  const ambigua = criarConfiancaClassificacao({
    scoreBase: 90,
    ambiguo: true,
    motivos: ['Dois candidatos possíveis'],
  });
  assert.equal(ambigua.pode_confirmar, false);
});

test('repetição tem boost limitado e não torna evidência fraca automaticamente segura', () => {
  const resultado = criarConfiancaClassificacao({
    scoreBase: 45,
    repeticoes: 20,
    motivos: ['Repete em outros meses'],
  });
  assert.equal(resultado.score, 51);
  assert.equal(resultado.confianca, 'baixa');
  assert.equal(resultado.pode_confirmar, false);
});
