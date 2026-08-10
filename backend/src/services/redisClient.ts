/**
 * Cliente Redis/Valkey lazy. Soft-fail se REDIS_URL ausente ou conexão falhar.
 */

import { createClient, type RedisClientType } from 'redis';
import { log } from './logger.js';

let client: RedisClientType | null = null;
let connectAttempted = false;
let unavailable = false;

export function redisConfigured(): boolean {
  return Boolean((process.env.REDIS_URL ?? '').trim());
}

export async function getRedis(): Promise<RedisClientType | null> {
  if (unavailable) return null;
  const url = (process.env.REDIS_URL ?? '').trim();
  if (!url) return null;

  if (client?.isOpen) return client;

  if (connectAttempted && !client?.isOpen) {
    return null;
  }

  connectAttempted = true;
  try {
    const c = createClient({ url }) as RedisClientType;
    c.on('error', (err) => {
      log('warn', { msg: 'redis_error', error: err instanceof Error ? err.message : String(err) });
    });
    await c.connect();
    client = c;
    log('info', { msg: 'redis_connected' });
    return client;
  } catch (e) {
    unavailable = true;
    client = null;
    log('warn', {
      msg: 'redis_unavailable',
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** Só para testes. */
export function _resetRedisClientForTests(): void {
  client = null;
  connectAttempted = false;
  unavailable = false;
}
