/**
 * Testes unitários da lógica de merge (planilha prevalece / fallback Supabase).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mergePriorizarPlanilha } from './merge.js';
import type { SheetRow } from '../services/sheetsService.js';

describe('mergePriorizarPlanilha', () => {
  const regra = 'Teste: planilha prevalece';

  it('retorna dados da planilha quando ela tem linhas', () => {
    const planilha = [{ nome: 'A', valor: 1 }, { nome: 'B', valor: 2 }];
    const supabase = [{ id: 1, nome: 'X' }];
    const result = mergePriorizarPlanilha(planilha, supabase, regra);
    assert.strictEqual(result.origem, 'planilha');
    assert.strictEqual(result.combinado.length, 2);
    assert.deepStrictEqual(result.combinado[0], { nome: 'A', valor: 1 });
  });

  it('retorna dados do Supabase quando planilha está vazia', () => {
    const planilha: SheetRow[] = [];
    const supabase = [{ id: 1, nome: 'X' }, { id: 2, nome: 'Y' }];
    const result = mergePriorizarPlanilha(planilha, supabase, regra);
    assert.strictEqual(result.origem, 'supabase');
    assert.strictEqual(result.combinado.length, 2);
    assert.strictEqual((result.combinado[0] as { id: number }).id, 1);
  });

  it('sempre inclui regra_usada', () => {
    const r1 = mergePriorizarPlanilha([{ a: 1 }], [], regra);
    const r2 = mergePriorizarPlanilha([], [{ b: 2 }], regra);
    assert.strictEqual(r1.regra_usada, regra);
    assert.strictEqual(r2.regra_usada, regra);
  });
});
