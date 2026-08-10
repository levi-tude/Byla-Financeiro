/**
 * Cache de respostas JSON (Redis) com soft-fail.
 */

import { getRedis } from './redisClient.js';
import { log } from './logger.js';

export const CACHE_TTL_SEC = 90;

export const CACHE_PREFIX = {
  conciliacao: 'byla:v1:conciliacao:',
  fluxoAlunos: 'byla:v1:fluxo:alunos:',
  fluxoPagamentos: 'byla:v1:fluxo:pagamentos:',
  cadastroResumo: 'byla:v1:cadastro:resumo:',
  financasAlunos: 'byla:v1:financas-alunos:',
} as const;

export function cacheKeyConciliacao(mes: number, ano: number, role: string): string {
  return `${CACHE_PREFIX.conciliacao}${ano}-${mes}:${role}`;
}

export function cacheKeyFluxoAlunos(parts: Record<string, string | number | boolean | null | undefined>): string {
  return `${CACHE_PREFIX.fluxoAlunos}${stableQuery(parts)}`;
}

export function cacheKeyFluxoPagamentos(parts: Record<string, string | number | boolean | null | undefined>): string {
  return `${CACHE_PREFIX.fluxoPagamentos}${stableQuery(parts)}`;
}

export function cacheKeyCadastroResumo(parts: Record<string, string | number | boolean | null | undefined>): string {
  return `${CACHE_PREFIX.cadastroResumo}${stableQuery(parts)}`;
}

export function cacheKeyFinancasAlunos(
  mes: number,
  ano: number,
  meio: string,
  vinculo: string,
): string {
  return `${CACHE_PREFIX.financasAlunos}${ano}-${mes}:${meio}:${vinculo}`;
}

function stableQuery(parts: Record<string, string | number | boolean | null | undefined>): string {
  const entries = Object.entries(parts)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join('&') || 'default';
}

export async function cacheGetOrSet<T>(
  key: string,
  ttlSec: number,
  loader: () => Promise<T>,
): Promise<T> {
  const redis = await getRedis();
  if (redis) {
    try {
      const hit = await redis.get(key);
      if (hit != null) {
        return JSON.parse(hit) as T;
      }
    } catch (e) {
      log('warn', {
        msg: 'redis_get_failed',
        key,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const value = await loader();

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), { EX: Math.max(1, Math.floor(ttlSec)) });
    } catch (e) {
      log('warn', {
        msg: 'redis_set_failed',
        key,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return value;
}

/** Apaga chaves por prefixo (SCAN + DEL). Soft-fail. */
export async function cacheInvalidate(...prefixes: string[]): Promise<void> {
  const unique = [...new Set(prefixes.filter(Boolean))];
  if (unique.length === 0) return;

  const redis = await getRedis();
  if (!redis) return;

  try {
    for (const prefix of unique) {
      let cursor = 0;
      do {
        const result = await redis.scan(cursor, { MATCH: `${prefix}*`, COUNT: 100 });
        cursor = result.cursor;
        if (result.keys.length > 0) {
          await redis.del(result.keys);
        }
      } while (cursor !== 0);
    }
  } catch (e) {
    log('warn', {
      msg: 'redis_invalidate_failed',
      prefixes: unique,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Invalidação das telas operacionais afetadas por vínculo/fluxo. */
export async function invalidateCachesOperacionais(): Promise<void> {
  await cacheInvalidate(
    CACHE_PREFIX.conciliacao,
    CACHE_PREFIX.fluxoAlunos,
    CACHE_PREFIX.fluxoPagamentos,
    CACHE_PREFIX.cadastroResumo,
    CACHE_PREFIX.financasAlunos,
  );
}
