import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chaveItemCredito,
  itensCompletosNoMes,
  montarPayloadAprendizadoCredito,
  setsChavesIguais,
  type CreditoRecorrenteItem,
} from './mapeamentoCreditoRecorrente.js';

test('chaveItemCredito estável', () => {
  assert.equal(
    chaveItemCredito({ aluno_norm: 'ALUNA DEMO A', aluno_exibicao: 'Aluna Demo A', aba: 'X', modalidade: 'Y' }),
    'ALUNA DEMO A|X|Y',
  );
});

test('chaveItemCredito faz trim em aba e modalidade', () => {
  assert.equal(
    chaveItemCredito({
      aluno_norm: 'ALUNA DEMO B',
      aluno_exibicao: 'Aluna Demo B',
      aba: '  BYLA DANÇA  ',
      modalidade: ' Contemporânea ',
    }),
    'ALUNA DEMO B|BYLA DANÇA|Contemporânea',
  );
});

test('montarPayloadAprendizadoCredito: itens, soma, dia majoritário e rótulo', () => {
  const payload = montarPayloadAprendizadoCredito([
    {
      aluno_nome: 'Aluna Demo A',
      aba: 'BYLA DANÇA',
      modalidade: 'Contemporânea',
      valor: 121.5,
      data_pagamento: '2026-03-23',
      pagador_pix: null,
    },
    {
      aluno_nome: 'Aluna Demo B',
      aba: 'BYLA DANÇA',
      modalidade: 'Contemporânea',
      valor: 121.5,
      data_pagamento: '2026-03-23',
      pagador_pix: null,
    },
  ]);

  assert.equal(payload.valor_mensalidades_soma, 243);
  assert.equal(payload.dia_pagamento_fluxo, 23);
  assert.equal(payload.rotulo, 'Aluna Demo A');
  assert.deepEqual(
    payload.itens.map((i) => chaveItemCredito(i)).sort(),
    ['ALUNA DEMO A|BYLA DANÇA|Contemporânea', 'ALUNA DEMO B|BYLA DANÇA|Contemporânea'].sort(),
  );
});

test('montarPayloadAprendizadoCredito: dia pela maioria e rótulo pelo pagador se sem aluno', () => {
  const payload = montarPayloadAprendizadoCredito([
    {
      aluno_nome: '',
      aba: 'A',
      modalidade: 'M',
      valor: 10,
      data_pagamento: '2026-03-10',
      pagador_pix: 'Pagador X',
    },
    {
      aluno_nome: '  ',
      aba: 'A',
      modalidade: 'M',
      valor: 20,
      data_pagamento: '2026-03-23',
      pagador_pix: null,
    },
    {
      aluno_nome: '',
      aba: 'A',
      modalidade: 'M',
      valor: 30,
      data_pagamento: '2026-03-23',
      pagador_pix: null,
    },
  ]);
  assert.equal(payload.dia_pagamento_fluxo, 23);
  assert.equal(payload.rotulo, 'Pagador X');
  assert.equal(payload.valor_mensalidades_soma, 60);
});

test('itensCompletosNoMes exige conjunto completo (dois alunos demo)', () => {
  const regraItens: CreditoRecorrenteItem[] = [
    { aluno_norm: 'ALUNA DEMO A', aluno_exibicao: 'Aluna Demo A', aba: 'BYLA DANÇA', modalidade: 'Contemporânea' },
    {
      aluno_norm: 'ALUNA DEMO B',
      aluno_exibicao: 'Aluna Demo B',
      aba: 'BYLA DANÇA',
      modalidade: 'Contemporânea',
    },
  ];
  const a = chaveItemCredito(regraItens[0]);
  const b = chaveItemCredito(regraItens[1]);

  assert.equal(itensCompletosNoMes(regraItens, [a, b]), true);
  assert.equal(itensCompletosNoMes(regraItens, [a]), false);
  assert.equal(itensCompletosNoMes(regraItens, []), false);
  assert.equal(itensCompletosNoMes([], [a]), false);
});

test('setsChavesIguais ignora ordem', () => {
  const a: CreditoRecorrenteItem[] = [
    { aluno_norm: 'A', aluno_exibicao: 'A', aba: 'X', modalidade: 'Y' },
    { aluno_norm: 'B', aluno_exibicao: 'B', aba: 'X', modalidade: 'Y' },
  ];
  const b: CreditoRecorrenteItem[] = [
    { aluno_norm: 'B', aluno_exibicao: 'B', aba: 'X', modalidade: 'Y' },
    { aluno_norm: 'A', aluno_exibicao: 'A', aba: 'X', modalidade: 'Y' },
  ];
  assert.equal(setsChavesIguais(a, b), true);
  assert.equal(
    setsChavesIguais(a, [{ aluno_norm: 'A', aluno_exibicao: 'A', aba: 'X', modalidade: 'Y' }]),
    false,
  );
});
