import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { requireRoles, restrictGestor } from '../middleware/auth.js';
import { CONSULTA_ROLES, isAppRole } from './roles.js';
import { consultaChatBodySchema } from '../validation/apiQuery.js';

function run(mw: (req: Request, res: Response, next: NextFunction) => void, role: string, path: string) {
  let status = 200;
  let passed = false;
  const res = { status(s: number) { status = s; return this; }, json() { return this; } } as unknown as Response;
  mw({ authUser: { id: 'u', role }, path } as unknown as Request, res, () => { passed = true; });
  return passed ? 200 : status;
}

test('gestor é papel válido e acessa só o Consulta Byla', () => {
  assert.ok(isAppRole('gestor'));
  assert.deepEqual([...CONSULTA_ROLES], ['admin', 'gestor']);
  const g = restrictGestor(['/ai/consulta']);
  assert.equal(run(g, 'gestor', '/ai/consulta/chat'), 200);
  assert.equal(run(g, 'gestor', '/fluxo-operacional'), 403);
  assert.equal(run(g, 'gestor', '/migracao/fluxo/recuperar-vinculos-orfaos'), 403);
  assert.equal(run(g, 'admin', '/fluxo-operacional'), 200);
});

test('rotas admin/secretaria não aceitam gestor; consulta não aceita secretaria', () => {
  assert.equal(run(requireRoles(['admin']), 'gestor', '/x'), 403);
  assert.equal(run(requireRoles(['secretaria', 'admin']), 'gestor', '/x'), 403);
  assert.equal(run(requireRoles(CONSULTA_ROLES), 'secretaria', '/ai/consulta/chat'), 403);
  assert.equal(run(requireRoles(CONSULTA_ROLES), 'gestor', '/ai/consulta/chat'), 200);
});

test('histórico validado: máx. 10 mensagens e papéis fixos', () => {
  const h = (n: number) => Array.from({ length: n }, () => ({ role: 'user', content: 'oi' }));
  assert.ok(consultaChatBodySchema.safeParse({ message: 'a', history: h(10) }).success);
  assert.ok(!consultaChatBodySchema.safeParse({ message: 'a', history: h(11) }).success);
  assert.ok(!consultaChatBodySchema.safeParse({ message: 'a', history: [{ role: 'system', content: 'x' }] }).success);
  assert.ok(!consultaChatBodySchema.safeParse({ message: 'a', history: [{ role: 'user', content: 'x'.repeat(2001) }] }).success);
});
