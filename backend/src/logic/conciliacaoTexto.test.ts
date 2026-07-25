import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNameCompatible, scoreNomeCompativel } from './conciliacaoTexto.js';

describe('isNameCompatible', () => {
  it('aceita substring integral como antes', () => {
    assert.equal(isNameCompatible('Maria Silva', 'Maria Silva Santos'), true);
  });

  it('liga sobrenome truncado no PIX (prefixo ≥5)', () => {
    assert.equal(
      isNameCompatible(
        'MARIA LUISA FERNATORE',
        'Clara Haydee Andrade Peres De Oliveira Fernato',
      ),
      true,
    );
  });

  it('liga sobrenome igual em token', () => {
    assert.equal(isNameCompatible('RAFAELA MOREIRA DEMO', 'Aleksandra Moreira'), true);
  });

  it('nao liga alunos diferentes sem token em comum', () => {
    assert.equal(
      isNameCompatible('MARIA LUISA FERNATORE', 'RAFAELA OLIVARES DEMO'),
      false,
    );
  });

  it('nao liga OLIVARES com OLIVEIRA do PIX (false friend)', () => {
    assert.equal(
      isNameCompatible(
        'RAFAELA OLIVARES DEMO',
        'Clara Haydee Andrade Peres De Oliveira Fernato',
      ),
      false,
    );
  });

  it('scoreNomeCompativel prioriza prefixo do sobrenome sobre OLIVEIRA', () => {
    const pix = 'Clara Haydee Andrade Peres De Oliveira Fernato';
    assert.ok(scoreNomeCompativel('MARIA LUISA FERNATORE', pix) > 0);
    assert.equal(scoreNomeCompativel('RAFAELA OLIVARES DEMO', pix), 0);
  });
});
