/**
 * Adapter com cache em memória (TTL) para IFluxoPlanilhaRepository.
 * Reduz chamadas à API do Google; TTL configurável.
 */

import type { IFluxoPlanilhaRepository } from '../ports/IFluxoPlanilhaRepository.js';
import type { FluxoPlanilhaTotais } from '../domain/FluxoPlanilhaTotais.js';
import type { MesAno } from '../domain/MesAno.js';

const TTL_MS = Number(process.env.FLUXO_PLANILHA_CACHE_TTL_MS) || 5 * 60 * 1000; // 5 min

function cacheKey(m: MesAno): string {
  return `${m.mes}-${m.ano}`;
}

export class CacheFluxoPlanilhaAdapter implements IFluxoPlanilhaRepository {
  private readonly inner: IFluxoPlanilhaRepository;
  private readonly cache = new Map<string, { totais: FluxoPlanilhaTotais; error?: string; expires: number }>();

  constructor(inner: IFluxoPlanilhaRepository) {
    this.inner = inner;
  }

  async obterTotais(mesAno: MesAno): Promise<{ totais: FluxoPlanilhaTotais; error?: string; fallbackMessage?: string }> {
    const key = cacheKey(mesAno);
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && hit.expires > now) {
      return { totais: hit.totais, error: hit.error };
    }
    const result = await this.inner.obterTotais(mesAno);
    this.cache.set(key, {
      totais: result.totais,
      error: result.error,
      expires: now + TTL_MS,
    });
    return result;
  }
}
