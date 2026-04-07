import { describe, it } from 'node:test';
import assert from 'node:assert';
import { hayIndicaPilatesMari, hayIndicaSeguro, hayIndicaTelecom } from './classificacaoSaidaHeuristicas.js';

describe('hayIndicaPilatesMari', () => {
  it('Marina de Melo Rodrigues sem palavra Pilates no extrato', () => {
    const h = 'MARINA DE MELO RODRIGUES PIX HONORARIO';
    assert.strictEqual(hayIndicaPilatesMari(h), true);
  });
  it('Pilates explícito', () => {
    assert.strictEqual(hayIndicaPilatesMari('PILATES MARI PAGAMENTO'), true);
  });
  it('Marina genérica sem contexto', () => {
    assert.strictEqual(hayIndicaPilatesMari('MARINA SILVA LOJA'), false);
  });
});

describe('hayIndicaTelecom', () => {
  it('Telefônica', () => {
    assert.strictEqual(hayIndicaTelecom('TELEFONICA BRASIL S A'), true);
  });
  it('não confunde com Enel', () => {
    assert.strictEqual(hayIndicaTelecom('ENEL DISTRIBUICAO'), false);
  });
});

describe('hayIndicaSeguro', () => {
  it('seguro genérico', () => {
    assert.strictEqual(hayIndicaSeguro('PORTO SEGURO CIA'), true);
  });
});
