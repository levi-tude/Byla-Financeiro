import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import financasAlunosRoutes from './financasAlunos.js';
import { requireRoles } from '../middleware/auth.js';
import type { AppRole } from '../auth/roles.js';

function makeRbacApp(role?: AppRole) {
  const app = express();
  app.use((req, _res, next) => {
    if (role) {
      req.authUser = { userId: 'test-user', email: 'test@byla.local', role };
    }
    next();
  });
  app.use((req, res, next) => {
    if (!req.path.startsWith('/financas/alunos')) return next();
    return requireRoles(['admin'])(req, res, next);
  });
  app.use(financasAlunosRoutes);
  return app;
}

describe('GET /financas/alunos RBAC', () => {
  const prevEnforce = process.env.BYLA_AUTH_ENFORCE;

  it('secretaria receives 403', async () => {
    process.env.BYLA_AUTH_ENFORCE = 'true';
    try {
      const app = makeRbacApp('secretaria');
      const res = await request(app).get('/financas/alunos?mes=7&ano=2026');
      assert.equal(res.status, 403);
      assert.ok(typeof res.body.error === 'string');
    } finally {
      if (prevEnforce === undefined) delete process.env.BYLA_AUTH_ENFORCE;
      else process.env.BYLA_AUTH_ENFORCE = prevEnforce;
    }
  });

  it('admin passes guard (not 403)', async () => {
    process.env.BYLA_AUTH_ENFORCE = 'true';
    try {
      const app = makeRbacApp('admin');
      const res = await request(app).get('/financas/alunos?mes=7&ano=2026');
      assert.notEqual(res.status, 403);
      assert.ok([200, 503, 500].includes(res.status));
      if (res.status === 200) {
        assert.equal(res.body.mes, 7);
        assert.equal(res.body.ano, 2026);
        assert.ok(Array.isArray(res.body.grupos));
      }
    } finally {
      if (prevEnforce === undefined) delete process.env.BYLA_AUTH_ENFORCE;
      else process.env.BYLA_AUTH_ENFORCE = prevEnforce;
    }
  });

  it('unauthenticated receives 401 when enforce is on', async () => {
    process.env.BYLA_AUTH_ENFORCE = 'true';
    try {
      const app = makeRbacApp(undefined);
      const res = await request(app).get('/financas/alunos?mes=7&ano=2026');
      assert.equal(res.status, 401);
    } finally {
      if (prevEnforce === undefined) delete process.env.BYLA_AUTH_ENFORCE;
      else process.env.BYLA_AUTH_ENFORCE = prevEnforce;
    }
  });
});

describe('GET /financas/alunos validation', () => {
  const app = express();
  app.use(financasAlunosRoutes);

  it('returns 400 for invalid mes', async () => {
    const res = await request(app).get('/financas/alunos?mes=13&ano=2026');
    assert.equal(res.status, 400);
    assert.ok(typeof res.body.error === 'string');
  });

  it('returns 400 for invalid meio', async () => {
    const res = await request(app).get('/financas/alunos?mes=7&ano=2026&meio=foo');
    assert.equal(res.status, 400);
    assert.ok(typeof res.body.error === 'string');
  });

  it('returns 400 for invalid vinculo', async () => {
    const res = await request(app).get('/financas/alunos?mes=7&ano=2026&vinculo=foo');
    assert.equal(res.status, 400);
    assert.ok(typeof res.body.error === 'string');
  });
});
