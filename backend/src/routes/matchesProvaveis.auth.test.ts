import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { requireRoles } from '../middleware/auth.js';
import matchesProvaveisRoutes from './matchesProvaveis.js';

function appComRole(role: 'admin' | 'secretaria') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authUser = { userId: 'user-test', email: null, role };
    next();
  });
  app.use('/validacao/matches-provaveis', requireRoles(['admin']));
  app.use(matchesProvaveisRoutes);
  return app;
}

test('secretária não pode aplicar vínculos mensais em lote', async () => {
  const res = await request(appComRole('secretaria'))
    .post('/validacao/matches-provaveis/aplicar-seguros')
    .send({ mes: 8, ano: 2026, analise_id: 'a'.repeat(24) });
  assert.equal(res.status, 403);
});

test('admin alcança a validação do endpoint de lote', async () => {
  const res = await request(appComRole('admin'))
    .post('/validacao/matches-provaveis/aplicar-seguros')
    .send({});
  assert.equal(res.status, 400);
});
