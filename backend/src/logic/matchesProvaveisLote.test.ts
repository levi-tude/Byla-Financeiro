import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analiseIdParaSeguros,
  executarPlanoConfirmacao,
  grupoUiParaMatch,
  planejarConfirmacaoLote,
  type MatchSeguroLote,
} from './matchesProvaveisLote.js';

function item(partial: Partial<MatchSeguroLote> = {}): MatchSeguroLote {
  return {
    pode_confirmar: true,
    ambiguo: false,
    n_para_1: false,
    planilha_ids: ['fluxo::11111111-1111-4111-8111-111111111111'],
    banco_id: 'banco-1',
    data_fluxo: '2026-08-10',
    score: 90,
    ...partial,
  };
}

test('grupo mensal separa seguro, médio e ambíguo', () => {
  assert.equal(grupoUiParaMatch(item()), 'seguro');
  assert.equal(grupoUiParaMatch(item({ pode_confirmar: false })), 'medio');
  assert.equal(grupoUiParaMatch(item({ pode_confirmar: false, ambiguo: true })), 'ambiguo');
  assert.equal(grupoUiParaMatch(item({ pode_confirmar: false, n_para_1: true })), 'ambiguo');
});

test('lote nunca inclui médio, ambíguo ou N→1', () => {
  const seguros = [item()];
  const todos = [
    ...seguros,
    item({ banco_id: 'banco-2', pode_confirmar: false }),
    item({ banco_id: 'banco-3', ambiguo: true }),
    item({
      banco_id: 'banco-4',
      n_para_1: true,
      planilha_ids: [
        'fluxo::22222222-2222-4222-8222-222222222222',
        'fluxo::33333333-3333-4333-8333-333333333333',
      ],
    }),
  ];
  const plano = planejarConfirmacaoLote({
    itensAtuais: todos,
    analiseId: analiseIdParaSeguros(seguros),
    vinculosExistentes: [],
  });
  assert.equal(plano.status, 'ok');
  assert.deepEqual(plano.pares, [
    {
      planilhaId: 'fluxo::11111111-1111-4111-8111-111111111111',
      bancoId: 'banco-1',
      dataFluxo: '2026-08-10',
    },
  ]);
});

test('lote não sobrescreve vínculo existente nem reutiliza banco', () => {
  const seguros = [
    item(),
    item({
      planilha_ids: ['fluxo::22222222-2222-4222-8222-222222222222'],
      banco_id: 'banco-usado',
    }),
  ];
  const plano = planejarConfirmacaoLote({
    itensAtuais: seguros,
    analiseId: analiseIdParaSeguros(seguros),
    vinculosExistentes: [
      {
        planilha_id: 'fluxo::99999999-9999-4999-8999-999999999999',
        banco_id: 'banco-usado',
      },
    ],
  });
  assert.deepEqual(plano.pares.map((p) => p.bancoId), ['banco-1']);
  assert.equal(plano.ignorados, 1);
});

test('lote recusa análise desatualizada antes de gravar', () => {
  const antes = [item()];
  const depois = [item({ score: 70, pode_confirmar: false })];
  const plano = planejarConfirmacaoLote({
    itensAtuais: depois,
    analiseId: analiseIdParaSeguros(antes),
    vinculosExistentes: [],
  });
  assert.equal(plano.status, 'desatualizado');
  assert.equal(plano.pares.length, 0);
});

test('segunda execução é idempotente', () => {
  const seguros = [item()];
  const plano = planejarConfirmacaoLote({
    itensAtuais: seguros,
    analiseId: analiseIdParaSeguros(seguros),
    vinculosExistentes: [
      {
        planilha_id: seguros[0].planilha_ids[0],
        banco_id: seguros[0].banco_id,
      },
    ],
  });
  assert.equal(plano.status, 'ok');
  assert.equal(plano.pares.length, 0);
  assert.equal(plano.ignorados, 1);
});

test('aplicação revalida cada caso e ignora o que mudou após a análise', async () => {
  const gravados: string[] = [];
  const resultado = await executarPlanoConfirmacao({
    pares: [
      {
        planilhaId: 'fluxo::11111111-1111-4111-8111-111111111111',
        bancoId: 'banco-livre',
        dataFluxo: '2026-08-10',
      },
      {
        planilhaId: 'fluxo::22222222-2222-4222-8222-222222222222',
        bancoId: 'banco-mudou',
        dataFluxo: '2026-08-11',
      },
    ],
    revalidar: async (par) => par.bancoId !== 'banco-mudou',
    gravar: async (par) => {
      gravados.push(par.bancoId);
    },
  });
  assert.deepEqual(gravados, ['banco-livre']);
  assert.equal(resultado.aplicados.length, 1);
  assert.equal(resultado.ignorados.length, 1);
});

test('falha individual não interrompe o restante do lote', async () => {
  const resultado = await executarPlanoConfirmacao({
    pares: [
      {
        planilhaId: 'fluxo::11111111-1111-4111-8111-111111111111',
        bancoId: 'banco-falha',
        dataFluxo: '2026-08-10',
      },
      {
        planilhaId: 'fluxo::22222222-2222-4222-8222-222222222222',
        bancoId: 'banco-ok',
        dataFluxo: '2026-08-11',
      },
    ],
    revalidar: async () => true,
    gravar: async (par) => {
      if (par.bancoId === 'banco-falha') throw new Error('conflito simulado');
    },
  });
  assert.equal(resultado.aplicados.length, 1);
  assert.equal(resultado.erros.length, 1);
  assert.equal(resultado.erros[0].bancoId, 'banco-falha');
});
