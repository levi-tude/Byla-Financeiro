import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salvarCriacaoSchema, specTamanhoOk } from './criacoesSalvasService.js';

const spec = { versao: 1, titulo: 'Balanço', secoes: [{ type: 'table', titulo: 't', dataset: 'd' }], datasets: [], avisos: [] };

test('criacoes salvas: aceita privada e compartilhada', () => {
  for (const v of ['privada', 'compartilhada']) {
    assert.equal(salvarCriacaoSchema.safeParse({ titulo: 'Minha visão', visibilidade: v, spec }).success, true);
  }
});

test('criacoes salvas: rejeita visibilidade inválida, owner_id no corpo e spec que não é objeto', () => {
  assert.equal(salvarCriacaoSchema.safeParse({ titulo: 'Minha visão', visibilidade: 'publica', spec }).success, false);
  assert.equal(salvarCriacaoSchema.safeParse({ titulo: 'Minha visão', visibilidade: 'privada', spec, owner_id: 'x' }).success, false);
  assert.equal(salvarCriacaoSchema.safeParse({ titulo: 'Minha visão', visibilidade: 'privada', spec: 'alert(1)' }).success, false);
  assert.equal(salvarCriacaoSchema.safeParse({ titulo: 'ab', visibilidade: 'privada', spec }).success, false);
});

test('criacoes salvas: limita o spec a 64 KB', () => {
  assert.equal(specTamanhoOk(spec), true);
  assert.equal(specTamanhoOk({ ...spec, x: 'a'.repeat(70000) }), false);
});
