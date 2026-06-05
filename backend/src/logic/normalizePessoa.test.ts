import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizePessoa } from './normalizePessoa.js';

describe('normalizePessoa', () => {
  it('lowercase trim e colapsa espaços', () => {
    assert.equal(normalizePessoa('  LUCIANA   COSTA  '), 'luciana costa');
  });

  it('string vazia', () => {
    assert.equal(normalizePessoa(''), '');
    assert.equal(normalizePessoa(null), '');
  });
});
