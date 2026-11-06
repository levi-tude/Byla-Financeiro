import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubPii, scrubString } from './scrubPii.js';

test('scrubString remove email, cpf e telefone', () => {
  const s = scrubString('Aluno Demo Um demo@exemplo.com 123.456.789-09 (71) 99999-0000');
  assert.ok(!s.includes('demo@exemplo.com'));
  assert.ok(!s.includes('123.456.789-09'));
  assert.ok(!s.includes('99999-0000'));
});

test('scrubPii remove chaves sensíveis e mantém o resto', () => {
  const r = scrubPii({ cpf: '1', nested: { email: 'x', msg: 'ok' }, valor: 250 });
  assert.deepEqual(r, { cpf: '[removido]', nested: { email: '[removido]', msg: 'ok' }, valor: 250 });
});
