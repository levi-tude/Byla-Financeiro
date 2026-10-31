/** Ferramentas novas do Consulta Byla (só fixtures fictícias). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { statusCompetenciaAluno, calcularSituacaoAlunos, type AlunoFluxoStatusInput, type PagamentoFluxoStatusInput } from '../logic/fluxoStatusCompetencia.js';
import { textoQuemNaoPagou, textoSaldoAluno, textoPrecosPlanos, PAGINA_QUEM_NAO_PAGOU, type CobrancaLoaders } from './consultaCobranca.js';
import { textoRepassesProfessores } from './consultaRepasses.js';
import { rotearConsultaDeterministica, selecionarToolsRelevantes } from '../ai/consultaRouter.js';
import { garantirBaseValor, buildSystemPrompt } from '../ai/consultaGeminiAgent.js';
import { mensagemRecusaForaDoCatalogo } from '../ai/consultaCatalog.js';
import { textoParaLlm } from '../ai/instrucaoIa.js';

const al = (nome: string, o: Partial<AlunoFluxoStatusInput> = {}): AlunoFluxoStatusInput => ({
  aba: 'PILATES', modalidade: 'Pilates', linha_planilha: Math.floor(Math.random() * 1e6), aluno_nome: nome,
  plano: '2x Mensal', regime_cobranca: null, matricula: '2026-01-10', valor_referencia: 260, ...o,
});
const pg = (a: AlunoFluxoStatusInput, valor: number, mes = 10, ano = 2026): PagamentoFluxoStatusInput => ({
  aba: a.aba, modalidade: a.modalidade, linha_planilha: a.linha_planilha, aluno_nome: a.aluno_nome, valor, mes_competencia: mes, ano_competencia: ano,
});
const hoje = () => ({ mes: 10, ano: 2026 });

const pago = al('Ana Ficticia', { linha_planilha: 1 });
const parcial = al('Bia Exemplo', { linha_planilha: 2 });
const pendente = al('Caio Teste', { linha_planilha: 3 });
const bolsa = al('Duda Bolsista', { linha_planilha: 4, regime_cobranca: 'bolsa' });
const semestral = al('Edu Semestral', { linha_planilha: 5, plano: '2x Semestral', matricula: '2026-08-01', valor_referencia: 230 });
const yoga = al('Fabi Yoga', { linha_planilha: 6, aba: 'YOGA', modalidade: 'Yoga', valor_referencia: 200 });
const placeholder = al('Linha cabecalho', { linha_planilha: 7, modalidade: '(modalidade)' });
const pilatesMarina = al('Gil Marina', { linha_planilha: 8, aba: 'PILATES MARINA', valor_referencia: null });
const base: AlunoFluxoStatusInput[] = [pago, parcial, pendente, bolsa, semestral, yoga, placeholder, pilatesMarina];
const pags = [pg(pago, 260), pg(parcial, 100), pg(pago, 260, 9), pg(pendente, 260, 9)];
const loaders = (alunos = base, pagamentos = pags): CobrancaLoaders => ({ alunos: async () => alunos, pagamentos: async () => pagamentos, hoje });

describe('regra de status (compartilhada com a tela)', () => {
  const b = { semCobranca: false, noCicloPrevisto: false, keyMes: '2026-10', mesAtualRealKey: '2026-10' };
  test('casos', () => {
    assert.equal(statusCompetenciaAluno({ ...b, pago: 260, esperado: 260 }), 'pago');
    assert.equal(statusCompetenciaAluno({ ...b, pago: 100, esperado: 260 }), 'parcial');
    assert.equal(statusCompetenciaAluno({ ...b, pago: 0, esperado: 260 }), 'pendente');
    assert.equal(statusCompetenciaAluno({ ...b, pago: 0, esperado: 260, noCicloPrevisto: true }), 'previsto');
    assert.equal(statusCompetenciaAluno({ ...b, pago: 0, esperado: 260, keyMes: '2026-11' }), 'futuro');
    assert.equal(statusCompetenciaAluno({ ...b, pago: 0, esperado: null }), 'sem_dado');
    assert.equal(statusCompetenciaAluno({ ...b, semCobranca: true, pago: 0, esperado: 260 }), 'sem_dado');
  });
  test('PILATES MARINA casa pagamento da aba PILATES (chave igual à tela)', () => {
    const p = { ...pg(pilatesMarina, 50), aba: 'PILATES' };
    const s = calcularSituacaoAlunos([pilatesMarina], [p], [{ mes: 10, ano: 2026 }], hoje());
    assert.equal(s[0]!.meses[0]!.status, 'pago');
  });
  test('semestral sem lançamento = previsto', () => {
    const s = calcularSituacaoAlunos([semestral], [], [{ mes: 10, ano: 2026 }], hoje());
    assert.equal(s[0]!.meses[0]!.status, 'previsto');
  });
});

describe('quem_nao_pagou', () => {
  test('separa pendente, parcial e previsto; exclui bolsa e cabeçalho; base competência', async () => {
    const t = await textoQuemNaoPagou({ mes: 10, ano: 2026, modalidade: 'pilates' }, loaders());
    assert.match(t, /Base: competência/);
    assert.match(t, /PENDENTE: Caio Teste \(PILATES/);
    assert.match(t, /PARCIAL: Bia Exemplo .*pago R\$\s?100,00 · falta R\$\s?160,00/);
    assert.match(t, /PREVISTO: Edu Semestral/);
    assert.match(t, /SEM VALOR NO CADASTRO: Gil Marina/);
    assert.doesNotMatch(t, /Ana Ficticia|Duda Bolsista|Linha cabecalho|Fabi Yoga/);
    assert.match(t, /bolsa\/exceção fora da conta: 1/);
    assert.match(t, /Lista completa: 4 aluno/);
  });
  test('pagina (não corta em 25)', async () => {
    const muitos = Array.from({ length: 95 }, (_, i) => al(`Aluno ${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`, { linha_planilha: 100 + i }));
    const l = loaders(muitos, []);
    const p1 = await textoQuemNaoPagou({ mes: 10, ano: 2026 }, l);
    const p3 = await textoQuemNaoPagou({ mes: 10, ano: 2026, pagina: 3 }, l);
    assert.equal((p1.match(/^PENDENTE:/gm) ?? []).length, PAGINA_QUEM_NAO_PAGOU);
    assert.match(p1, /Página 1 de 3 \(95 aluno/);
    assert.equal((p3.match(/^PENDENTE:/gm) ?? []).length, 15);
    assert.match(p3, /Aluno DQ/);
  });
  test('modalidade inexistente não vira "todos pagaram"', async () => {
    const t = await textoQuemNaoPagou({ mes: 10, ano: 2026, modalidade: 'xadrez' }, loaders());
    assert.match(t, /NENHUM ALUNO ATIVO/);
  });
  test('não lê o Google Sheets nem colunas de contato', async () => {
    const t = await textoQuemNaoPagou({ mes: 10, ano: 2026 }, loaders([{ ...pendente, wpp: '71 99999-0000' } as AlunoFluxoStatusInput], []));
    assert.doesNotMatch(t, /9999/);
  });
});

describe('saldo_aluno', () => {
  test('esperado × pago por mês e total em aberto', async () => {
    const t = await textoSaldoAluno({ nome: 'bia', mes: 10, ano: 2026, meses: 2 }, loaders());
    assert.match(t, /09\/2026: esperado R\$\s?260,00 · pago R\$\s?0,00 · pendente/);
    assert.match(t, /10\/2026: esperado R\$\s?260,00 · pago R\$\s?100,00 · parcial/);
    assert.match(t, /Total em aberto \(pendente \+ parcial\): R\$\s?420,00/);
    assert.match(t, /Base: competência/);
  });
  test('previsto não entra no total', async () => {
    const t = await textoSaldoAluno({ nome: 'edu semestral', mes: 10, ano: 2026, meses: 1 }, loaders());
    assert.match(t, /Total em aberto \(pendente \+ parcial\): R\$\s?0,00\. Previsto pelo plano, ainda sem lançamento: R\$\s?230,00/);
  });
  test('bolsa: sem cobrança', async () => {
    assert.match(await textoSaldoAluno({ nome: 'duda', mes: 10, ano: 2026 }, loaders()), /bolsa: sem cobrança/);
  });
  test('nome desconhecido não vira "não deve nada"', async () => {
    const t = await textoSaldoAluno({ nome: 'ninguem', mes: 10, ano: 2026 }, loaders());
    assert.match(t, /NENHUM ALUNO ATIVO/);
  });
});

describe('precos_planos', () => {
  const planos = [
    { atividade: 'Pilates', plano: '2x Mensal', valor: 260, ativo: true },
    { atividade: 'Pilates', plano: '2x Semestral', valor: 230, ativo: true },
    { atividade: 'Pilates', plano: '3x Mensal', valor: 320, ativo: true },
    { atividade: 'Yoga', plano: '2x Mensal', valor: 0, ativo: true },
  ];
  const alunosAtivos = async () => [
    { aba: 'YOGA', modalidade: 'Yoga', plano: '2x Mensal', valor_referencia: 200, regime_cobranca: null },
    { aba: 'YOGA', modalidade: 'Yoga', plano: '2x mensal', valor_referencia: 200, regime_cobranca: null },
    { aba: 'YOGA', modalidade: 'Yoga', plano: '2x Mensal', valor_referencia: 180, regime_cobranca: null },
    { aba: 'YOGA', modalidade: 'Yoga', plano: 'Bolsa', valor_referencia: 50, regime_cobranca: null },
  ];
  const l = { planos: async () => planos, alunosAtivos };
  test('pilates 2x: tabela oficial', async () => {
    const t = await textoPrecosPlanos({ modalidade: 'pilates', frequencia: '2x' }, l);
    assert.match(t, /Tabela oficial/);
    assert.match(t, /2x Mensal: R\$\s?260,00/);
    assert.match(t, /2x Semestral: R\$\s?230,00/);
    assert.doesNotMatch(t, /3x|praticado/i);
  });
  test('yoga (R$ 0 na tabela): valor praticado, rotulado como não oficial, sem bolsa', async () => {
    const t = await textoPrecosPlanos({ modalidade: 'yoga' }, l);
    assert.match(t, /VALOR PRATICADO pelos alunos ativos \(NÃO é preço oficial/);
    assert.match(t, /YOGA · 2x mensal: mais comum R\$\s?200,00 \(3 aluno\(s\); de R\$\s?180,00 a R\$\s?200,00\)/);
    assert.doesNotMatch(t, /50,00/);
  });
});

describe('repasses_professores', () => {
  const saidas = [
    { data: '2026-09-05', pessoa: 'Marina Ficticia Exemplo', valor: -1200 },
    { data: '2026-09-06', pessoa: 'Bruna Ficticia Teste', valor: -265 },
    { data: '2026-09-07', pessoa: 'Samuel Socio Ficticio', valor: -5000 },
    { data: '2026-09-08', pessoa: 'Mercado Exemplo', valor: -80 },
  ];
  const controle = [
    { label: 'Pilates Mari', valor: 1248.5 },
    { label: 'Bruna GR', valor: 265 },
    { label: 'Dança', valor: 1455 },
  ];
  test('lista professores, não conta sócio, não soma fontes', () => {
    const t = textoRepassesProfessores({ mes: 9, ano: 2026, saidas, controle });
    assert.match(t, /Mari \(Pilates\): extrato R\$\s?1\.200,00 em 1 saída\(s\) · Controle R\$\s?1\.248,50 · identificação por inferência/);
    assert.match(t, /Bruna \(GR\): extrato R\$\s?265,00/);
    assert.match(t, /Pholha \(Funcional\): extrato R\$\s?0,00 em 0 saída\(s\) · sem linha no Controle/);
    assert.match(t, /Total no extrato \(professores da lista\): R\$\s?1\.465,00/);
    assert.match(t, /Dança R\$\s?1\.455,00/);
    assert.doesNotMatch(t.split('\n').filter((l) => !l.startsWith('⟦IA⟧')).join('\n'), /Samuel|5\.000/);
  });
  test('Samuel não é professor', () => {
    assert.match(textoRepassesProfessores({ mes: 9, ano: 2026, professor: 'Samuel', saidas, controle }), /não é professor \(sócio\)/);
  });
  test('filtro por professor e Controle indisponível', () => {
    const t = textoRepassesProfessores({ mes: 9, ano: 2026, professor: 'bruna', saidas, controle: null });
    assert.match(t, /Bruna \(GR\).*Controle indisponível/);
    assert.doesNotMatch(t, /Mari \(/);
  });
});

describe('roteador e IA: cobertura', () => {
  const ctx = { mes: 10, ano: 2026 };
  const r = (q: string) => rotearConsultaDeterministica(q, ctx, new Date(2026, 9, 31));
  test('rotas novas', () => {
    assert.deepEqual(r('Quem do pilates não pagou outubro'), { kind: 'tool', tool: 'quem_nao_pagou', params: { modalidade: 'pilates' }, ctx, motivo: 'quem_nao_pagou' });
    assert.deepEqual(r('quem não pagou setembro? página 2')?.kind === 'tool' && r('quem não pagou setembro? página 2'), {
      kind: 'tool', tool: 'quem_nao_pagou', params: { pagina: '2' }, ctx: { mes: 9, ano: 2026 }, motivo: 'quem_nao_pagou',
    });
    const p = r('Preço plano pilates 2x');
    assert.ok(p && p.kind === 'tool' && p.tool === 'precos_planos');
    assert.deepEqual(p.params, { frequencia: '2x', modalidade: 'pilates' });
    const s = r('quanto o fulano deve?');
    assert.ok(s && s.kind === 'tool' && s.tool === 'saldo_aluno' && s.params.nome === 'fulano');
    const g = r('Gastos com professores em setembro');
    assert.ok(g && g.kind === 'tool' && g.tool === 'repasses_professores' && g.ctx.mes === 9);
  });
  test('ferramentas relevantes', () => {
    assert.ok(selecionarToolsRelevantes('quem não pagou outubro?').includes('quem_nao_pagou'));
    assert.ok(selecionarToolsRelevantes('qual o preço do plano de yoga?').includes('precos_planos'));
  });
  test('regressão das 30 perguntas (nomes fictícios): nada quebra e as rotas esperadas batem', () => {
    const perguntas = [
      'Como tá o balanço desse mês?', 'Resultado do mês passado', 'Balanço últimos 4 meses', 'Quanto entrou em maio e junho',
      'Compara setembro com outubro', 'agosto vs setembro, gastamos mais?', 'Quanto entrou em novembro', 'qnt entrou de pilates em set',
      'Pilates de julho a outubro', 'Entradas por modalidade em outubro', 'e de yoga em outubro?', 'GR e teatro em agosto',
      'Pagamento de aluno em dezembro', 'Pagamento do Fulano', 'O Ciclano pagou o pilates de outubro?', 'Quanto a Beltrana pagou em julho',
      'PIX de 2.500 em outubro', 'Pagamento de 250 reais em outubro', 'Gastos com professores em setembro', 'Maiores saídas de outubro',
      'Alunos ativos no pilates', 'Alunos ativos no total', 'Quem do pilates não pagou outubro', 'Preço plano pilates 2x',
      'Os dados tão atualizados?', 'Quanto entrou essa semana', 'CPF e telefone da Beltrana', 'Apaga pagamento duplicado',
      'Quanto entrou?', 'quanto o fulano deve?',
    ];
    const esperado: Record<number, string> = { 19: 'repasses_professores', 20: 'maiores_saidas', 23: 'quem_nao_pagou', 24: 'precos_planos', 30: 'saldo_aluno', 27: 'recusa', 28: 'recusa', 1: 'resumo_mes', 3: 'balanco_meses', 5: 'comparar_meses' };
    perguntas.forEach((q, i) => {
      const rota = r(q);
      const exp = esperado[i + 1];
      if (!exp) return;
      const got = rota ? (rota.kind === 'tool' ? rota.tool : rota.kind) : null;
      assert.equal(got, exp, `Q${i + 1} ${q}`);
    });
    // Q11 depende do histórico → IA.
    assert.equal(r(perguntas[10]!), null);
  });
  test('recusa: "ainda não tenho consulta para isso"', () => {
    assert.match(mensagemRecusaForaDoCatalogo(), /^Ainda não tenho consulta para isso\./);
    const sp = buildSystemPrompt({ mes: 10, ano: 2026 } as never, '2026-10-31');
    assert.match(sp, /Ainda não tenho consulta para isso/);
    assert.match(sp, /data de pagamento ou por competência/);
    assert.match(sp, /FONTES DIFERENTES/);
  });
  test('base do valor é anexada quando a IA esquece', () => {
    assert.match(garantirBaseValor('Pilates: R$ 5.360,00', ['Base: data de pagamento (não competência). Fonte: …']), /Base: data de pagamento\.$/);
    assert.equal(garantirBaseValor('Por competência: 3 pendentes', ['Base: competência (mês…)']), 'Por competência: 3 pendentes');
    assert.equal(garantirBaseValor('x', ['sem base']), 'x');
  });
  test('instruções internas não chegam ao usuário mas chegam ao LLM', async () => {
    const t = await textoQuemNaoPagou({ mes: 10, ano: 2026, modalidade: 'xadrez' }, loaders());
    assert.match(textoParaLlm(t), /Não diga que "todos pagaram"/);
  });
});
