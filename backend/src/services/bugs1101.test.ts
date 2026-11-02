import { test } from 'node:test';
import assert from 'node:assert/strict';
import { specPreset } from './criacoesService.js';
import type { CriacaoToolDeps } from './criacoesDatasets.js';
import { meioParaResumo, MEIO_SAIDA_NAO_INFORMADO } from './transacoesFiltro.js';
import { sanitizeNarrativa } from '../ai/criacoesSpec.js';
import { rotearConsultaDeterministica, modalidadesCitadas } from '../ai/consultaRouter.js';
import { formatarRespostaUsuario } from '../ai/respostaUsuario.js';
import { textoAtualizacaoDados, toolEntradasModalidadePeriodo } from './consultaBylaTools.js';
import { textoDividaCoworking, textoRepassesProfessores } from './consultaRepasses.js';
import { casaModalidade } from '../logic/modalidadeMatch.js';

const deps: CriacaoToolDeps = {
  resumoMes: async (mes) => ({ entradas: 1000 * mes, saidas: 500 * mes }),
  modalidades: async (mes) =>
    new Map([
      ['PILATES', { total: 100 * mes, qtd: mes }],
      ['TEATRO', { total: 50, qtd: 1 }],
      ['G.R.', { total: 70, qtd: 2 }],
    ]),
  meios: async () => new Map([['PIX', { entradas: 700, saidas: 0, qtd: 5 }], [MEIO_SAIDA_NAO_INFORMADO, { entradas: 0, saidas: 300, qtd: 3 }]]),
};
const ref = { mes: 10, ano: 2026 };

test('1) saída sem meio no extrato → "Não informado no extrato"; entrada continua PIX', () => {
  assert.equal(meioParaResumo('Aluno Demo Um', 'saida'), MEIO_SAIDA_NAO_INFORMADO);
  assert.equal(meioParaResumo('Aluno Demo Um', 'entrada'), 'PIX');
  assert.equal(meioParaResumo('PIX ENVIADO Aluno Demo Um', 'saida'), 'PIX');
});

test('1) preset de meios não mostra ranking de saídas e avisa', async () => {
  const s = await specPreset('meios de pagamento', ref, deps);
  assert.ok(s);
  assert.ok(!s.secoes.some((x) => 'titulo' in x && x.titulo === 'Saídas por meio'));
  assert.ok(s.avisos.some((a) => /não informa o meio de pagamento das saídas/.test(a)));
});

test('3) "Pilates de julho a outubro" → série mensal de uma modalidade', async () => {
  const s = await specPreset('gráfico das entradas de Pilates de julho a outubro', ref, deps);
  assert.ok(s);
  assert.match(s.titulo, /Pilates/);
  const ds = s.datasets[0]!;
  assert.equal(ds.linhas.length, 4);
  assert.deepEqual(ds.linhas.map((l) => l.total), [700, 800, 900, 1000]);
  assert.ok(s.secoes.some((x) => x.type === 'bar_chart'));
  const l = await specPreset('linha de pilates de julho a outubro', ref, deps);
  assert.ok(l?.secoes.some((x) => x.type === 'line_chart'));
});

test('3) "compare pilates com funcional em outubro" → aviso de Funcional (coworking)', async () => {
  const s = await specPreset('compare modalidade pilates com funcional em outubro', ref, deps);
  assert.ok(s);
  assert.ok(s.avisos.some((a) => /Funcional.*coworking/.test(a)));
  assert.deepEqual(s.datasets[0]!.linhas.map((l) => l.modalidade), ['Pilates', 'Funcional']);
});

test('4) narrativa: frases com número saem inteiras, nunca "(ver gráfico)"', () => {
  const t = sanitizeNarrativa('As entradas subiram R$ 1.200,00. O mês foi bom (ver gráfico). Alta de 12%.');
  assert.equal(t, 'O mês foi bom.');
  assert.doesNotMatch(t, /ver gráfico/);
});

test('5) "os dados tão atualizados?" → rota de atualização com data por fonte', () => {
  const r = rotearConsultaDeterministica('os dados tão atualizados?', ref);
  assert.ok(r && r.kind === 'tool' && r.tool === 'atualizacao_dados');
  const t = textoAtualizacaoDados({ extrato: '2026-10-21', fluxo: '2026-10-30', controle: { mes: 9, ano: 2026 } }, '2026-11-01');
  assert.match(t, /Extrato bancário: último lançamento em 21\/10\/2026/);
  assert.match(t, /Fluxo de caixa .*30\/10\/2026/);
  assert.match(t, /Controle de caixa: último mês importado 09\/2026/);
  assert.match(t, /11 dias atrás/);
});

test('6) "quanto o weider deve?" → sem controle de dívida + pagamentos recentes', () => {
  const r = rotearConsultaDeterministica('quanto o weider deve?', ref);
  assert.ok(r && r.kind === 'tool' && r.tool === 'repasses_professores' && r.params.divida === '1');
  const t = textoDividaCoworking({
    professor: 'weider',
    meses: [
      { mes: 9, ano: 2026, entradas: [] },
      { mes: 10, ano: 2026, entradas: [{ data: '2026-10-19', pessoa: 'WEIDER DEMO UM', valor: 2500 } as never] },
    ],
  });
  assert.ok(t);
  assert.match(t, /não tem controle de dívida/);
  assert.match(t, /10\/2026: R\$\s?2\.500,00 \(1 pagamento\)/);
  assert.match(t, /09\/2026: nenhum pagamento/);
});

test('7) formatação "R$ 5 360,00 (20 pagamento s)" → "R$ 5.360,00 (20 pagamentos)"', async () => {
  assert.equal(formatarRespostaUsuario('R$ 5 360,00 (20 pagamento s)'), 'R$ 5.360,00 (20 pagamentos)');
  const t = await toolEntradasModalidadePeriodo('Pilates', [{ mes: 10, ano: 2026 }], async () => [
    { aba: 'PILATES', modalidade: null, valor: 50 },
    { aba: 'PILATES', modalidade: null, valor: 50 },
  ]);
  assert.match(t, /\(2 pagamentos\)/);
  assert.doesNotMatch(t, /\(s\)/);
});

test('8) "GR e teatro em agosto" → uma consulta com as duas modalidades; G.R. casa com GR', async () => {
  assert.deepEqual(modalidadesCitadas('gr e teatro em agosto'), ['GR', 'Teatro']);
  const r = rotearConsultaDeterministica('GR e teatro em agosto', ref);
  assert.ok(r && r.kind === 'tool' && r.tool === 'entradas_modalidade_periodo');
  assert.equal(r.params.modalidade, 'GR, Teatro');
  assert.ok(casaModalidade('G.R.', 'GR'));
  assert.ok(!casaModalidade('PROGRAMA', 'GR'));
  const t = await toolEntradasModalidadePeriodo('GR, Teatro', [{ mes: 8, ano: 2026 }], async () => [
    { aba: 'G.R.', modalidade: null, valor: 70 },
    { aba: 'TEATRO', modalidade: null, valor: 50 },
  ]);
  assert.match(t, /GR e Teatro/);
  assert.match(t, /GR:\n08\/2026: R\$\s?70,00/);
});

test('10) repasses: texto ao usuário sem "confirmado pelo Levi"', () => {
  const t = textoRepassesProfessores({ mes: 10, ano: 2026, saidas: [], controle: [] });
  assert.doesNotMatch(t, /confirmado pelo Levi|por inferência/);
});
