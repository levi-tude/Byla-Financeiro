import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import calendarioRoutes from './calendario.js';
import transacoesRoutes from './transacoes.js';
import conciliacaoRoutes from './conciliacao.js';
import { createRelatoriosRouter } from './relatorios.js';
import { PROMPT_VERSION_RELATORIOS } from '../relatorios/relatoriosPrompts.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(calendarioRoutes);
  app.use(transacoesRoutes);
  app.use(conciliacaoRoutes);
  app.use(
    createRelatoriosRouter({
      execute: async () => ({
        combinado: {
          entradaTotal: 0,
          saidaTotal: 0,
          lucroTotal: 0,
          linhas: [],
          porColuna: [],
          mes: null,
          ano: null,
          aba: null,
        },
        origem: 'planilha',
        regra_usada: 'test',
      }),
    } as any)
  );
  return app;
}

describe('routes validation (integration)', () => {
  const app = makeApp();

  it('GET /transacoes returns 400 for invalid tipo', async () => {
    const res = await request(app).get('/transacoes?mes=3&ano=2026&tipo=foo');
    assert.equal(res.status, 400);
    assert.ok(typeof res.body.error === 'string');
  });

  it('GET /calendario-financeiro returns 400 for invalid mes', async () => {
    const res = await request(app).get('/calendario-financeiro?mes=13&ano=2026');
    assert.equal(res.status, 400);
    assert.ok(typeof res.body.error === 'string');
  });

  it('GET /conciliacao-vencimentos returns 400 for invalid ano', async () => {
    const res = await request(app).get('/conciliacao-vencimentos?mes=3&ano=1999');
    assert.equal(res.status, 400);
    assert.ok(typeof res.body.error === 'string');
  });

  it('GET /relatorios/mensal returns 400 for missing params', async () => {
    const res = await request(app).get('/relatorios/mensal');
    assert.equal(res.status, 400);
    assert.ok(typeof res.body.error === 'string');
  });

  it('POST /relatorios/gerar-texto-ia returns 400 for invalid body', async () => {
    const res = await request(app).post('/relatorios/gerar-texto-ia').send({ payload: 123 });
    assert.equal(res.status, 400);
    assert.ok(typeof res.body.error === 'string');
  });

  it('GET /relatorios/mensal-operacional returns 200 and contract R2', async () => {
    const res = await request(app).get('/relatorios/mensal-operacional?mes=3&ano=2026');
    assert.equal(res.status, 200);
    assert.equal(res.body.tipo, 'mensal_operacional');
    assert.equal(res.body.prompt_version, PROMPT_VERSION_RELATORIOS);
    assert.ok(typeof res.body.periodo_label === 'string');
    assert.ok(res.body.resumo_financeiro_oficial);
    assert.equal(res.body.resumo_financeiro_oficial.fonte, 'banco');
  });

  it('GET /relatorios/alunos-panorama returns 200 and tipo alunos_panorama', async () => {
    const res = await request(app).get('/relatorios/alunos-panorama?mes=3&ano=2026');
    assert.equal(res.status, 200);
    assert.equal(res.body.tipo, 'alunos_panorama');
    assert.ok(Array.isArray(res.body.por_aba) || res.body.aviso);
  });

  it('GET /validacao-vinculos returns 400 for invalid query', async () => {
    const res = await request(app).get('/validacao-vinculos?data=foo');
    assert.equal(res.status, 400);
    assert.ok(typeof res.body.error === 'string');
  });

  it('POST /validacao-vinculos returns 400 for invalid body', async () => {
    const res = await request(app).post('/validacao-vinculos').send({ data: '2026-03-10' });
    assert.equal(res.status, 400);
    assert.ok(typeof res.body.error === 'string');
  });

  it('DELETE /validacao-vinculos returns 400 for invalid body', async () => {
    const res = await request(app).delete('/validacao-vinculos').send({});
    assert.equal(res.status, 400);
    assert.ok(typeof res.body.error === 'string');
  });
});
