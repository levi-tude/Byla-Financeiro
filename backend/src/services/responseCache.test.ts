import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CACHE_PREFIX,
  cacheGetOrSet,
  cacheInvalidate,
  cacheKeyConciliacao,
  cacheKeyFinancasAlunos,
} from './responseCache.js';
import { _resetRedisClientForTests } from './redisClient.js';

test('cacheKeyConciliacao e financas são estáveis e sem PII', () => {
  assert.equal(cacheKeyConciliacao(8, 2026, 'admin'), 'byla:v1:conciliacao:2026-8:admin');
  assert.equal(
    cacheKeyFinancasAlunos(8, 2026, 'pix', 'todos'),
    'byla:v1:financas-alunos:2026-8:pix:todos',
  );
  assert.ok(CACHE_PREFIX.conciliacao.startsWith('byla:v1:'));
});

test('cacheGetOrSet sem REDIS_URL chama loader e soft-fail', async () => {
  _resetRedisClientForTests();
  const prev = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  let calls = 0;
  const a = await cacheGetOrSet('byla:v1:test:x', 90, async () => {
    calls += 1;
    return { ok: true, n: 1 };
  });
  const b = await cacheGetOrSet('byla:v1:test:x', 90, async () => {
    calls += 1;
    return { ok: true, n: 2 };
  });
  assert.deepEqual(a, { ok: true, n: 1 });
  assert.deepEqual(b, { ok: true, n: 2 });
  assert.equal(calls, 2);
  if (prev !== undefined) process.env.REDIS_URL = prev;
});

test('cacheInvalidate sem Redis não lança', async () => {
  _resetRedisClientForTests();
  const prev = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  await cacheInvalidate(CACHE_PREFIX.conciliacao);
  if (prev !== undefined) process.env.REDIS_URL = prev;
});
