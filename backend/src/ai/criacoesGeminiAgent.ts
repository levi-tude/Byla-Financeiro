/**
 * Criações da IA — agente Gemini (function calling só-leitura) que devolve um RASCUNHO JSON de apresentação.
 * O modelo vê datasets agregados (sem PII) e só pode referenciá-los por id/coluna; o servidor valida e preenche.
 */
import { CONSULTA_GEMINI_MODELS, GeminiHttpError, stripPii } from './consultaGeminiAgent.js';
import type { Dataset } from './criacoesSpec.js';
import { CRIACAO_TOOL_DECLS, executarCriacaoTool, type CriacaoToolDeps, type MesAno } from '../services/criacoesDatasets.js';

const MAX_ITER = 5;

export function buildCriacoesPrompt(ref: MesAno, today: string): string {
  return [
    'Você monta APRESENTAÇÕES de dados financeiros do Espaço Byla (somente leitura).',
    `Hoje é ${today}. Mês de referência da tela: ${ref.ano}-${String(ref.mes).padStart(2, '0')}.`,
    'Passo 1: chame as funções para obter datasets. Passo 2: responda SOMENTE com um objeto JSON (sem markdown, sem código, sem HTML):',
    '{"titulo": str, "subtitulo": str?, "secoes": [ ... até 8 ... ]}',
    'Tipos de seção permitidos (nenhum outro campo):',
    '- {"type":"kpi_cards","titulo","itens":[{"label","dataset","linha": índice|"ultima"|"total","coluna"}]}',
    '- {"type":"line_chart"|"bar_chart"|"area_chart","titulo","descricao"?,"dataset","x","series":[colunas],"empilhado"?}',
    '- {"type":"donut","titulo","dataset","label","valor"}  - {"type":"ranking","titulo","dataset","label","valor","top"?}',
    '- {"type":"comparison","titulo","dataset","x","a": índice,"b": índice,"colunas":[...]}  - {"type":"table","titulo","dataset","colunas"?}',
    '- {"type":"narrative","titulo"?,"texto"}  (texto curto em pt-BR, SEM números/valores: os números aparecem nos gráficos).',
    '"dataset" é o dataset_id devolvido pelas funções; colunas devem existir nele. Nunca invente números nem datasets.',
    'Comece com kpi_cards, depois gráficos, e termine com uma narrative de leitura/insight.',
  ].join('\n');
}

type Part = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  thoughtSignature?: string;
};
type Content = { role: 'user' | 'model'; parts: Part[] };

export type CriacoesAgentDeps = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  toolDeps: CriacaoToolDeps;
  models?: readonly string[];
  today: string;
};

export type CriacoesAgentResult =
  | { ok: true; draft: unknown; datasets: Dataset[]; model: string }
  | { ok: false; reason: 'rate_limit' | 'error' | 'empty' | 'json'; detail: string };

/** Extrai o primeiro objeto JSON do texto (tolera cercas ```json). */
export function extrairJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const i = t.indexOf('{');
  const j = t.lastIndexOf('}');
  if (i < 0 || j <= i) throw new Error('sem JSON');
  return JSON.parse(t.slice(i, j + 1));
}

export async function runCriacoesAgent(prompt: string, ref: MesAno, deps: CriacoesAgentDeps): Promise<CriacoesAgentResult> {
  const f = deps.fetchImpl ?? fetch;
  const system = buildCriacoesPrompt(ref, deps.today);
  let lastErr = 'Falha Gemini';
  for (const model of deps.models ?? CONSULTA_GEMINI_MODELS) {
    const convo: Content[] = [{ role: 'user', parts: [{ text: stripPii(prompt) }] }];
    const datasets = new Map<string, Dataset>();
    try {
      for (let i = 0; i < MAX_ITER; i++) {
        const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': deps.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: convo,
            tools: [{ functionDeclarations: CRIACAO_TOOL_DECLS }],
            generationConfig: { maxOutputTokens: 2500, temperature: 0.4 },
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new GeminiHttpError(res.status, `Gemini HTTP ${res.status}`);
        const json = (await res.json()) as { candidates?: { content?: Content }[] };
        const parts = json.candidates?.[0]?.content?.parts;
        if (!parts?.length) throw new GeminiHttpError(200, 'Gemini sem conteúdo');
        convo.push({ role: 'model', parts });
        const calls = parts.filter((p) => p.functionCall);
        if (calls.length === 0) {
          const text = parts.map((p) => p.text ?? '').join('');
          if (!text.trim()) return { ok: false, reason: 'empty', detail: 'Resposta vazia' };
          try {
            return { ok: true, draft: extrairJson(text), datasets: [...datasets.values()], model };
          } catch {
            return { ok: false, reason: 'json', detail: 'Resposta não é JSON' };
          }
        }
        const responses: Part[] = [];
        for (const p of calls.slice(0, 6)) {
          const out = await executarCriacaoTool(p.functionCall!.name, p.functionCall!.args, ref, deps.toolDeps);
          if ('erro' in out) {
            responses.push({ functionResponse: { name: p.functionCall!.name, response: { erro: out.erro } } });
          } else {
            datasets.set(out.id, out);
            responses.push({
              functionResponse: {
                name: p.functionCall!.name,
                response: { dataset_id: out.id, titulo: out.titulo, colunas: out.colunas, linhas: out.linhas },
              },
            });
          }
        }
        convo.push({ role: 'user', parts: responses });
      }
      return { ok: false, reason: 'error', detail: 'Limite de iterações' };
    } catch (e) {
      lastErr = (e as Error).message;
      if (e instanceof GeminiHttpError && e.status === 429) return { ok: false, reason: 'rate_limit', detail: lastErr };
    }
  }
  return { ok: false, reason: 'error', detail: lastErr };
}
