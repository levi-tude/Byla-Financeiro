import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import express from 'express';
import request from 'supertest';
import { createSyncFluxoAutoRouter } from './syncFluxoAuto.js';
import { __resetLock, executarSyncSoInserir, type SyncDeps } from '../services/syncFluxoSoInserirAuto.js';

/** Fixtures fictícias. */
type Row = Record<string, unknown>;

function fakeDb(opts: { alunosPlanilha?: Row[]; pagsPlanilha?: Row[]; existAlunos?: Row[]; existPags?: Row[] } = {}) {
  const alunos: Row[] = [...(opts.existAlunos ?? [])];
  const pags: Row[] = [...(opts.existPags ?? [])];
  const ops: string[] = [];
  const deps: SyncDeps = {
    async contar() {
      return { alunos: alunos.length, pagamentos: pags.length, vinculos: 0, pagamentosComVinculo: 0 };
    },
    async lerPlanilha() {
      return {
        ano: 2026,
        abas: ['BYLA DANÇA'],
        alunosPlanilha: (opts.alunosPlanilha ?? []) as never,
        desiredPags: (opts.pagsPlanilha ?? []) as never,
        errosLeitura: [],
        errosParse: 0,
        datasCorrigidas: 0,
      };
    },
    async lerBanco() {
      return { existAlunos: [...alunos], existPags: [...pags] };
    },
    async inserirAluno(r) {
      ops.push('insert:aluno');
      alunos.push({ id: `a${alunos.length}`, ...r });
      return null;
    },
    async inserirPagamento(r) {
      ops.push('insert:pag');
      pags.push({ id: `p${pags.length}`, ...r });
      return null;
    },
  };
  return { deps, alunos, pags, ops };
}

const aluno = (nome: string, linha: number) => ({ aba: 'BYLA DANÇA', modalidade: 'BALLET', aluno_nome: nome, linha_planilha: linha, ativo: true });
const pag = (nome: string, linha: number, data = '2026-03-05', valor = 150) => ({
  aba: 'BYLA DANÇA', modalidade: 'BALLET', aluno_nome: nome, linha_planilha: linha,
  data_pagamento: data, forma: 'PIX', valor, mes_competencia: 3, ano_competencia: 2026,
});

const SECRET = 'segredo-de-teste-ficticio';
function app(deps: SyncDeps) {
  const a = express();
  a.use(express.json());
  a.use('/api', createSyncFluxoAutoRouter(() => deps));
  return a;
}

describe('POST /api/sync/fluxo-so-inserir', () => {
  beforeEach(() => {
    process.env.SYNC_WEBHOOK_SECRET = SECRET;
    __resetLock();
  });

  it('401 sem header', async () => {
    const { deps, ops } = fakeDb({ alunosPlanilha: [aluno('Aluno Demo Um', 5)] });
    const res = await request(app(deps)).post('/api/sync/fluxo-so-inserir');
    assert.equal(res.status, 401);
    assert.equal(ops.length, 0);
  });

  it('401 com segredo errado (mesmo tamanho e tamanho diferente)', async () => {
    const { deps, ops } = fakeDb({ alunosPlanilha: [aluno('Aluno Demo Um', 5)] });
    for (const s of ['x'.repeat(SECRET.length), 'curto']) {
      const res = await request(app(deps)).post('/api/sync/fluxo-so-inserir').set('X-Sync-Webhook-Secret', s);
      assert.equal(res.status, 401);
    }
    assert.equal(ops.length, 0);
  });

  it('503 quando SYNC_WEBHOOK_SECRET não está configurado', async () => {
    delete process.env.SYNC_WEBHOOK_SECRET;
    const { deps } = fakeDb();
    const res = await request(app(deps)).post('/api/sync/fluxo-so-inserir').set('X-Sync-Webhook-Secret', SECRET);
    assert.equal(res.status, 503);
  });

  it('insere aluno e pagamento novos; segunda chamada é idempotente', async () => {
    const f = fakeDb({ alunosPlanilha: [aluno('Aluno Demo Um', 5)], pagsPlanilha: [pag('Aluno Demo Um', 5)] });
    const r1 = await request(app(f.deps)).post('/api/sync/fluxo-so-inserir').set('X-Sync-Webhook-Secret', SECRET);
    assert.equal(r1.status, 200);
    assert.equal(r1.body.status, 'inserido');
    assert.deepEqual(r1.body.inseridos, { alunos: 1, pagamentos: 1 });
    assert.equal(r1.body.contagens.antes.alunos, 0);
    assert.equal(r1.body.contagens.depois.pagamentos, 1);
    const r2 = await request(app(f.deps)).post('/api/sync/fluxo-so-inserir').set('X-Sync-Webhook-Secret', SECRET);
    assert.equal(r2.body.status, 'nada_a_inserir');
    assert.equal(f.alunos.length, 1);
    assert.equal(f.pags.length, 1);
  });

  it('conflito de linha → zero gravações', async () => {
    const f = fakeDb({
      existAlunos: [{ id: 'x', ...aluno('Aluno Demo Dois', 5) }],
      alunosPlanilha: [aluno('Aluno Demo Dois', 5), aluno('Aluno Demo Tres', 5)],
      pagsPlanilha: [pag('Aluno Demo Dois', 5, '2026-03-09')],
    });
    const res = await request(app(f.deps)).post('/api/sync/fluxo-so-inserir').set('X-Sync-Webhook-Secret', SECRET);
    assert.equal(res.body.status, 'bloqueado_conflito');
    assert.ok(res.body.conflitos.some((c: { tipo: string }) => c.tipo === 'aluno_novo_linha_ocupada'));
    assert.equal(f.ops.length, 0);
  });

  it('nome ambíguo (só difere por espaço) → zero gravações', async () => {
    const f = fakeDb({
      existAlunos: [{ id: 'x', ...aluno('Ana Demo', 3) }],
      alunosPlanilha: [aluno('AnaDemo', 3), aluno('Aluno Demo Quatro', 9)],
    });
    const res = await request(app(f.deps)).post('/api/sync/fluxo-so-inserir').set('X-Sync-Webhook-Secret', SECRET);
    assert.equal(res.body.status, 'bloqueado_conflito');
    assert.ok(res.body.conflitos.some((c: { tipo: string }) => c.tipo === 'nome_ambiguo_sem_espaco'));
    assert.equal(f.ops.length, 0);
  });

  it('nome duplicado na planilha / pagamento sem aluno → zero gravações', async () => {
    const f = fakeDb({
      alunosPlanilha: [aluno('Aluno Demo Cinco', 4), aluno('Aluno Demo Cinco', 8)],
      pagsPlanilha: [pag('Aluno Inexistente Demo', 20)],
    });
    const res = await request(app(f.deps)).post('/api/sync/fluxo-so-inserir').set('X-Sync-Webhook-Secret', SECRET);
    assert.equal(res.body.status, 'bloqueado_conflito');
    const tipos = res.body.conflitos.map((c: { tipo: string }) => c.tipo);
    assert.ok(tipos.includes('nome_duplicado_planilha'));
    assert.ok(tipos.includes('pagamento_sem_aluno'));
    assert.equal(f.ops.length, 0);
  });

  it('só INSERE: não existe caminho de update/delete e registros existentes ficam intactos', async () => {
    const existente = { id: 'x', ...aluno('Aluno Demo Seis', 2), ativo: true, observacao: 'manter' };
    const pagExist = { id: 'p0', ...pag('Aluno Demo Seis', 2), ordem_lancamento: 1 };
    const f = fakeDb({
      existAlunos: [existente],
      existPags: [pagExist],
      // aluno some da planilha (não pode inativar) e há pagamento novo dele
      alunosPlanilha: [aluno('Aluno Demo Seis', 2)],
      pagsPlanilha: [pag('Aluno Demo Seis', 2), pag('Aluno Demo Seis', 2, '2026-04-05')],
    });
    const snapshot = JSON.stringify(f.alunos) + JSON.stringify(f.pags);
    const res = await request(app(f.deps)).post('/api/sync/fluxo-so-inserir').set('X-Sync-Webhook-Secret', SECRET);
    assert.equal(res.body.status, 'inserido');
    assert.deepEqual(res.body.inseridos, { alunos: 0, pagamentos: 1 });
    assert.ok(f.ops.every((o) => o.startsWith('insert:')));
    assert.equal(JSON.stringify(f.alunos) + JSON.stringify(f.pags.slice(0, 1)), snapshot);
    assert.equal(f.pags[1].ordem_lancamento, 2);
    const keys = Object.keys(f.deps).sort();
    assert.deepEqual(keys, ['contar', 'inserirAluno', 'inserirPagamento', 'lerBanco', 'lerPlanilha']);
  });

  it('trava: duas execuções simultâneas → segunda retorna ocupado', async () => {
    const f = fakeDb({ alunosPlanilha: [aluno('Aluno Demo Sete', 6)] });
    let libera!: () => void;
    let primeira = true;
    const lento: SyncDeps = {
      ...f.deps,
      contar: async () => {
        if (primeira) {
          primeira = false;
          await new Promise<void>((r) => (libera = r));
        }
        return f.deps.contar();
      },
    };
    const p1 = executarSyncSoInserir(lento);
    const r2 = await executarSyncSoInserir(f.deps);
    assert.equal(r2.status, 'ocupado');
    libera();
    const r1 = await p1;
    assert.equal(r1.status, 'inserido');
    assert.equal(f.alunos.length, 1);
  });
});
