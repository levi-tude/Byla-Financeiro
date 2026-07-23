import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitizePayloadForIa } from './sanitizePayloadForIa.js';

describe('sanitizePayloadForIa', () => {
  it('returns payload unchanged when disabled', () => {
    const payload = {
      banco_entradas: { top_pessoas_entradas: [{ pessoa: 'Ana', total: 10 }] },
    };
    const out = sanitizePayloadForIa(payload, false);
    assert.equal(out, payload);
    assert.equal((out.banco_entradas as { top_pessoas_entradas: unknown[] }).top_pessoas_entradas.length, 1);
  });

  it('strips top_pessoas when enabled', () => {
    const payload = {
      tipo: 'mensal_operacional',
      banco_entradas: {
        top_pessoas_entradas: [{ pessoa: 'Ana Silva', total: 100 }],
        top_pessoas_saidas: [{ pessoa: 'Bob', total: 50 }],
        dias_maior_entrada: [{ data: '2026-05-01', total: 20 }],
      },
    };
    const out = sanitizePayloadForIa(payload, true);
    const banco = out.banco_entradas as {
      top_pessoas_entradas: unknown[];
      top_pessoas_saidas: unknown[];
      dias_maior_entrada: unknown[];
      pii_omitido?: boolean;
    };
    assert.equal(banco.top_pessoas_entradas.length, 0);
    assert.equal(banco.top_pessoas_saidas.length, 0);
    assert.equal(banco.dias_maior_entrada.length, 1);
    assert.equal(banco.pii_omitido, true);
    assert.equal(out.pii_minimizado, true);
  });
});
