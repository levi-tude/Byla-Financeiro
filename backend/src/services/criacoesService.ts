/**
 * Criações da IA — orquestra IA (Groq/Gemini) → validação → fallback determinístico.
 */
import { GEMINI_MODELS, resolveLlmProviders, type LlmProviderConfig } from '../ai/llmProviders.js';
import { carregarNomesConhecidos, type NomeConhecido } from '../ai/pseudonimizacao.js';
import { todayIsoLocal } from '../ai/consultaCatalog.js';
import { runCriacoesAgent, type CriacoesAgentDeps } from '../ai/criacoesGeminiAgent.js';
import { validarEHidratar, type CriacaoSpec } from '../ai/criacoesSpec.js';
import { datasetBalanco, datasetMeios, datasetModalidades, parseYm, realDeps, type CriacaoToolDeps, type MesAno } from './criacoesDatasets.js';

export function mesesDoPrompt(prompt: string): number {
  const m = prompt.match(/(\d{1,2})\s*(?:meses|mês|mes)/i);
  const n = m ? Number(m[1]) : 4;
  return Math.min(12, Math.max(1, n));
}

/** Spec fixo (sem IA) — balanço de N meses + modalidades e meios do mês de referência. */
export async function specDeterministico(prompt: string, ref: MesAno, deps: CriacaoToolDeps, aviso?: string): Promise<CriacaoSpec> {
  const n = mesesDoPrompt(prompt);
  const [bal, mod, meio] = await Promise.all([datasetBalanco(ref, n, deps), datasetModalidades(ref, deps), datasetMeios(ref, deps)]);
  const datasets = [bal, mod, meio].filter((d) => d.linhas.length > 0);
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
      { type: 'donut', titulo: 'Entradas por modalidade (mês da tela)', dataset: mod.id, label: 'modalidade', valor: 'total' },
      { type: 'ranking', titulo: 'Meios de pagamento', dataset: meio.id, label: 'meio', valor: 'entradas', top: 8 },
      { type: 'table', titulo: 'Tabela mês a mês', dataset: bal.id },
    ],
  };
  const r = validarEHidratar(draft, datasets, 'deterministico');
  if (!r.ok) throw new Error('Sem dados para montar a criação.');
  if (aviso) r.spec.avisos.unshift(aviso);
  return r.spec;
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
  if (!providers.length) return specDeterministico(input.prompt, ref, toolDeps, 'IA não configurada: apresentação montada no modo automático.');
  let nomesConhecidos = deps.nomesConhecidos;
  if (!nomesConhecidos) nomesConhecidos = await carregarNomesConhecidos().catch(() => []);
  const r = await runCriacoesAgent(input.prompt, ref, { providers, nomesConhecidos, fetchImpl: deps.fetchImpl, toolDeps, today: todayIsoLocal() });
  if (r.ok) {
    const v = validarEHidratar(r.draft, r.datasets, r.provider);
    if (v.ok) return v.spec;
  }
  const aviso = !r.ok && r.reason === 'rate_limit' ? 'Limite gratuito da IA atingido' : 'A IA não montou uma apresentação válida';
  return specDeterministico(input.prompt, ref, toolDeps, `${aviso}: apresentação montada no modo automático.`);
}
