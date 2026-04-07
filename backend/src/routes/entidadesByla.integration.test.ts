import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import entidadesBylaRoutes from './entidadesByla.js';

describe('entidadesByla routes', () => {
  const app = express();
  app.use(express.json());
  app.use(entidadesBylaRoutes);

  it('GET /entidades-byla retorna cadastro', async () => {
    const res = await request(app).get('/entidades-byla');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.entidades));
    assert.ok(res.body.entidades.length >= 8);
  });

  it('POST /entidades-byla/match-linhas reconhece Samuel', async () => {
    const res = await request(app)
      .post('/entidades-byla/match-linhas')
      .send({ linhas: ['PIX Samuel Davi'] });
    assert.equal(res.status, 200);
    assert.equal(res.body.resultados[0].match?.nome, 'Samuel');
  });

  it('POST /entidades-byla/match-linhas 400 sem array', async () => {
    const res = await request(app).post('/entidades-byla/match-linhas').send({ linhas: 'x' });
    assert.equal(res.status, 400);
  });
});
