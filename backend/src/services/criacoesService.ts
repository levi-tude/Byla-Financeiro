/**
 * Criações da IA — orquestra IA (Groq/Gemini) → validação → fallback determinístico.
 */
import { GEMINI_MODELS, resolveLlmProviders, type LlmProviderConfig } from '../ai/llmProviders.js';
import { carregarNomesConhecidos, type NomeConhecido } from '../ai/pseudonimizacao.js';
import { todayIsoLocal } from '../ai/consultaCatalog.js';
import { runCriacoesAgent, type CriacoesAgentDeps } from '../ai/criacoesGeminiAgent.js';
import { mesPt, validarEHidratar, type CriacaoSpec } from '../ai/criacoesSpec.js';
import { extrairMeses, normRouter } from '../ai/consultaRouter.js';
import { datasetBalanco, datasetComparar, datasetMeios, datasetModalidades, parseYm, realDeps, type CriacaoToolDeps, type MesAno } from './criacoesDatasets.js';

export function mesesDoPrompt(prompt: string): number {
  const m = prompt.match(/(\d{1,2})\s*(?:meses|mês|mes)/i);
  const n = m ? Number(m[1]) : 4;
  return Math.min(12, Math.max(1, n));
}

/** Spec fixo (sem IA) — balanço de N meses + modalidades e meios do mês de referência. */
export async function specDeterministico(prompt: string, ref: MesAno, deps: CriacaoToolDeps, aviso?: string): Promise<CriacaoSpec> {
  const n = mesesDoPrompt(prompt);
  const [bal, mod, meio] = await Promise.all([datasetBalanco(ref, n, deps), datasetModalidades(ref, deps), datasetMeios(ref, deps)]);
  const datasets = [bal, mod, meio];
  const draft = {
    titulo: `Balanço dos últimos ${n} meses`,
    subtitulo: 'Modo automático (sem IA): extrato bancário oficial; modalidades do Fluxo de caixa',
    secoes: [
      {
        type: 'kpi_cards',
        titulo: 'Resumo do período',
        itens: [
          { label: 'Entradas', dataset: bal.id, linha: 'total', coluna: 'entradas' },
          { label: 'Saídas', dataset: bal.id, linha: 'total', coluna: 'saidas' },
          { label: 'Saldo', dataset: bal.id, linha: 'total', coluna: 'saldo' },
        ],
      },
      { type: 'bar_chart', titulo: 'Entradas × saídas por mês', dataset: bal.id, x: 'mes', series: ['entradas', 'saidas'] },
      { type: 'line_chart', titulo: 'Evolução do saldo', dataset: bal.id, x: 'mes', series: ['saldo'] },
      { type: 'donut', titulo: `Entradas por modalidade — ${mesPt(ymStr(ref))}`, dataset: mod.id, label: 'modalidade', valor: 'total' },
      { type: 'ranking', titulo: `Meios de pagamento — ${mesPt(ymStr(ref))}`, dataset: meio.id, label: 'meio', valor: 'entradas', top: 8 },
      { type: 'table', titulo: 'Tabela mês a mês', dataset: bal.id },
    ],
  };
  const r = validarEHidratar(draft, datasets, 'deterministico');
  if (!r.ok) throw new Error('Sem dados para montar a criação.');
  if (aviso) r.spec.avisos.unshift(aviso);
  return r.spec;
}

const ymStr = (m: MesAno) => `${m.ano}-${String(m.mes).padStart(2, '0')}`;
const anterior = (m: MesAno, k = 1): MesAno => {
  const i = m.ano * 12 + (m.mes - 1) - k;
  return { ano: Math.floor(i / 12), mes: (i % 12) + 1 };
};

/** Mês de referência efetivo: se o mês da tela ainda não tem extrato, usa o último mês com dados (até 3 atrás) e avisa. */
async function mesComDados(ref: MesAno, deps: CriacaoToolDeps): Promise<{ mes: MesAno; aviso?: string }> {
  if (await deps.resumoMes(ref.mes, ref.ano)) return { mes: ref };
  for (let k = 1; k <= 3; k++) {
    const m = anterior(ref, k);
    if (await deps.resumoMes(m.mes, m.ano)) {
      return { mes: m, aviso: `${mesPt(ymStr(ref))} ainda não tem extrato: mostrando ${mesPt(ymStr(m))}.` };
    }
  }
  return { mes: ref, aviso: `${mesPt(ymStr(ref))} ainda não tem extrato.` };
}

/**
 * Pedidos "de botão" (presets e perguntas simples) viram spec determinístico, sem IA (~ms em vez de ~15 s).
 * Devolve null quando o pedido não é reconhecido → segue para a IA.
 */
export async function specPreset(prompt: string, ref: MesAno, deps: CriacaoToolDeps): Promise<CriacaoSpec | null> {
  const n = normRouter(prompt);
  if (n.length > 120) return null;
  const montar = (draft: unknown, datasets: Parameters<typeof validarEHidratar>[1], avisos: (string | undefined)[]) => {
    const r = validarEHidratar(draft, datasets, 'deterministico');
    if (!r.ok) return null;
    r.spec.avisos.unshift(...avisos.filter((a): a is string => !!a));
    return r.spec;
  };

  if (/\bcompar/.test(n)) {
    const ms = extrairMeses(n);
    if (ms.length !== 2) return null;
    const anoDe = (mes: number) => (mes > ref.mes ? ref.ano - 1 : ref.ano);
    const a = { mes: ms[0]!, ano: anoDe(ms[0]!) };
    const b = { mes: ms[1]!, ano: anoDe(ms[1]!) };
    const ds = await datasetComparar(a, b, deps);
    const faltam = ds.linhas.filter((l) => l.entradas == null).map((l) => mesPt(l.mes));
    return montar(
      {
        titulo: `Comparação ${mesPt(ymStr(a))} × ${mesPt(ymStr(b))}`,
        secoes: [
          { type: 'comparison', titulo: 'Lado a lado', dataset: ds.id, x: 'mes', a: 0, b: 1, colunas: ['entradas', 'saidas', 'saldo'] },
          { type: 'bar_chart', titulo: 'Entradas, saídas e saldo', dataset: ds.id, x: 'mes', series: ['entradas', 'saidas', 'saldo'] },
          { type: 'table', titulo: 'Valores', dataset: ds.id },
        ],
      },
      [ds],
      [faltam.length ? `Sem extrato para ${faltam.join(' e ')}.` : undefined],
    );
  }

  if (/\bmodalidade/.test(n)) {
    const { mes, aviso } = await mesComDados(ref, deps);
    const ds = await datasetModalidades(mes, deps);
    const rot = mesPt(ymStr(mes));
    return montar(
      {
        titulo: `Entradas por modalidade — ${rot}`,
        secoes: [
          { type: 'kpi_cards', titulo: 'Resumo', itens: [{ label: 'Entradas com modalidade', dataset: ds.id, linha: 'total', coluna: 'total' }] },
          { type: 'donut', titulo: 'Participação por modalidade', dataset: ds.id, label: 'modalidade', valor: 'total' },
          { type: 'ranking', titulo: 'Ranking de modalidades', dataset: ds.id, label: 'modalidade', valor: 'total', top: 10 },
          { type: 'bar_chart', titulo: 'Entradas por modalidade', dataset: ds.id, x: 'modalidade', series: ['total'] },
          { type: 'table', titulo: 'Tabela', dataset: ds.id },
        ],
      },
      [ds],
      [aviso],
    );
  }

  if (/\bmeios?\s+de\s+pagamento|\bpix\b.*\bcartao|\bforma(s)?\s+de\s+pagamento/.test(n)) {
    const { mes, aviso } = await mesComDados(ref, deps);
    const ds = await datasetMeios(mes, deps);
    const rot = mesPt(ymStr(mes));
    return montar(
      {
        titulo: `Meios de pagamento — ${rot}`,
        secoes: [
          {
            type: 'kpi_cards',
            titulo: 'Resumo',
            itens: [
              { label: 'Entradas', dataset: ds.id, linha: 'total', coluna: 'entradas' },
              { label: 'Saídas', dataset: ds.id, linha: 'total', coluna: 'saidas' },
            ],
          },
          { type: 'donut', titulo: 'Entradas por meio', dataset: ds.id, label: 'meio', valor: 'entradas' },
          { type: 'ranking', titulo: 'Saídas por meio', dataset: ds.id, label: 'meio', valor: 'saidas', top: 8 },
          { type: 'bar_chart', titulo: 'Entradas × saídas por meio', dataset: ds.id, x: 'meio', series: ['entradas', 'saidas'] },
          { type: 'table', titulo: 'Tabela', dataset: ds.id },
        ],
      },
      [ds],
      [aviso],
    );
  }

  if (/\bbalanco\b|\bultimos?\s+\d{1,2}\s+mes/.test(n)) {
    const qtd = mesesDoPrompt(prompt);
    const ds = await datasetBalanco(ref, qtd, deps);
    const sem = ds.linhas.filter((l) => l.entradas == null).map((l) => mesPt(l.mes));
    return montar(
      {
        titulo: `Balanço dos últimos ${qtd} meses`,
        subtitulo: `${mesPt(ds.linhas[0]?.mes)} a ${mesPt(ds.linhas[ds.linhas.length - 1]?.mes)}`,
        secoes: [
          {
            type: 'kpi_cards',
            titulo: 'Resumo do período',
            itens: [
              { label: 'Entradas', dataset: ds.id, linha: 'total', coluna: 'entradas' },
              { label: 'Saídas', dataset: ds.id, linha: 'total', coluna: 'saidas' },
              { label: 'Saldo', dataset: ds.id, linha: 'total', coluna: 'saldo' },
            ],
          },
          { type: 'bar_chart', titulo: 'Entradas × saídas por mês', dataset: ds.id, x: 'mes', series: ['entradas', 'saidas'] },
          { type: 'line_chart', titulo: 'Evolução do saldo', dataset: ds.id, x: 'mes', series: ['saldo'] },
          { type: 'table', titulo: 'Tabela mês a mês', dataset: ds.id },
        ],
      },
      [ds],
      [sem.length ? `Sem extrato (marcado "sem dados"): ${sem.join(', ')}.` : undefined],
    );
  }
  return null;
}

export type CriacoesServiceDeps = {
  /** Compat/teste: chave Gemini direta. */
  apiKey?: string;
  providers?: LlmProviderConfig[];
  nomesConhecidos?: NomeConhecido[];
  fetchImpl?: typeof fetch;
  toolDeps?: CriacaoToolDeps;
  models?: CriacoesAgentDeps['models'];
};

export async function gerarCriacao(
  input: { prompt: string; monthYear?: string },
  deps: CriacoesServiceDeps = {},
): Promise<CriacaoSpec> {
  const now = new Date();
  const ref = parseYm(input.monthYear) ?? { mes: now.getMonth() + 1, ano: now.getFullYear() };
  const toolDeps = deps.toolDeps ?? realDeps;
  const providers =
    deps.providers ??
    (deps.apiKey !== undefined
      ? deps.apiKey
        ? [{ provider: 'gemini' as const, apiKey: deps.apiKey, models: deps.models ?? GEMINI_MODELS }]
        : []
      : resolveLlmProviders());
  const preset = await specPreset(input.prompt, ref, toolDeps);
  if (preset) return preset;
  if (!providers.length) return specDeterministico(input.prompt, ref, toolDeps, 'IA não configurada: apresentação montada no modo automático.');
  let nomesConhecidos = deps.nomesConhecidos;
  if (!nomesConhecidos) nomesConhecidos = await carregarNomesConhecidos().catch(() => []);
  const r = await runCriacoesAgent(input.prompt, ref, { providers, nomesConhecidos, fetchImpl: deps.fetchImpl, toolDeps, today: todayIsoLocal() });
  if (r.ok) {
    const v = validarEHidratar(r.draft, r.datasets, r.provider);
    if (v.ok) {
      if (!(await toolDeps.resumoMes(ref.mes, ref.ano).catch(() => ({ entradas: 0, saidas: 0 })))) {
        v.spec.avisos.unshift(`${mesPt(ymStr(ref))} ainda não tem extrato: valores "último mês" referem-se ao último mês com dados (indicado em cada cartão).`);
      }
      return v.spec;
    }
  }
  const aviso = !r.ok && r.reason === 'rate_limit' ? 'Limite gratuito da IA atingido' : 'A IA não montou uma apresentação válida';
  return specDeterministico(input.prompt, ref, toolDeps, `${aviso}: apresentação montada no modo automático.`);
}
