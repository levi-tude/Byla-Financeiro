import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import express from 'express';
import request from 'supertest';

/**
 * Sobe o router real de api.ts com auth enforce ligado.
 * Sem token → 401 em /api/entradas/*.
 */
describe('entradas authorization', () => {
  let app: express.Express;

  before(async () => {
    process.env.BYLA_AUTH_ENFORCE = 'true';
    const { default: apiRoutes } = await import('./api.js');
    app = express();
    app.use(express.json());
    app.use('/api', apiRoutes);
  });

  const paths = [
    '/api/entradas/categorias',
    '/api/entradas/resumo',
    '/api/entradas/grupos',
  ];

  for (const path of paths) {
    it(`GET ${path} returns 401 without auth`, async () => {
      const res = await request(app).get(path);
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Autenticação obrigatória.');
    });
  }

  it('PUT /api/entradas/mapeamento returns 401 without auth', async () => {
    const res = await request(app).put('/api/entradas/mapeamento').send({});
    assert.equal(res.status, 401);
  });

  it('DELETE /api/entradas/mapeamento/fake-id returns 401 without auth', async () => {
    const res = await request(app).delete('/api/entradas/mapeamento/fake-id');
    assert.equal(res.status, 401);
  });
});
