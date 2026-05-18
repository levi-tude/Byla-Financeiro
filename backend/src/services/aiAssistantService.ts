import { config } from '../config.js';
import { buildAssistantPlaybookResponse } from '../ai/assistantPlaybook.js';
import { classifyIntent } from '../ai/intentCatalog.js';

type Role = 'secretaria' | 'admin' | null;
type ChatContext = { route?: string; role?: Role; monthYear?: string };

export type AssistantServiceInput = {
  message: string;
  context?: ChatContext;
};

export type AssistantServiceOutput = {
  message: string;
  intent: string;
  confidence: number;
  actions: Array<{ type: 'navigate'; label: string; to: string }>;
  needsConfirmation: boolean;
  quickReplies: string[];
  providerUsed: 'gemini' | 'groq' | 'openai' | 'fallback';
};

const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'] as const;

function providerStatus() {
  const gemini = !!config.geminiApiKey;
  const groq = !!config.groqApiKey;
  const openai = !!config.openaiApiKey;
  return { gemini, groq, openai };
}

function buildPrompt(input: AssistantServiceInput): string {
  const role = input.context?.role ?? 'secretaria';
  const route = input.context?.route ?? '/';
  const monthYear = input.context?.monthYear ?? 'não informado';
  return [
    'Você é o Assistente do Byla, focado em secretaria de escola de dança.',
    'Escopo desta fase: Fluxo de Caixa + Pendências/Cobranças.',
    'Objetivo: resolver a dúvida com orientação prática no sistema para esse escopo.',
    'Se a pergunta sair desse escopo, explique em 1 frase e redirecione para Fluxo/Pendências/Cobranças.',
    'Regra de ouro: entregue a resposta útil primeiro (passos ou checklist). Evite responder só com perguntas.',
    'Só faça UMA pergunta curta se for impossível ajudar sem um dado objetivo (ex.: qual aluno ou qual dia).',
    'Tom: direto, gentil e simples. Sem rodeios.',
    'Formato: sem markdown, sem **, sem bullets com asterisco. No máximo 4 passos numerados quando precisar.',
    'Use o contexto (rota e competência) para ser específico; se já estiver na tela certa, diga onde clicar nela.',
    'Se sugerir abrir tela, diga explicitamente que depende de confirmação da secretária.',
    'Sempre em português do Brasil.',
    `Contexto: role=${role}; rota=${route}; competencia=${monthYear}.`,
    `Pergunta: ${input.message}`,
  ].join('\n');
}

function sanitizeAssistantText(raw: string): string {
  return raw
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeAssistantStyle(raw: string): string {
  const cleaned = sanitizeAssistantText(raw);
  if (!cleaned) return cleaned;
  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) return cleaned;
  return lines.join('\n');
}

async function tryGemini(prompt: string): Promise<string> {
  const key = config.geminiApiKey;
  if (!key) return '';
  for (const model of GEMINI_MODELS) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 350 },
        }),
      }
    );
    if (!response.ok) continue;
    const json = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) return text;
  }
  return '';
}

async function tryGroq(prompt: string): Promise<string> {
  const key = config.groqApiKey;
  if (!key) return '';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      temperature: 0.2,
      max_tokens: 280,
      messages: [
        {
          role: 'system',
          content:
            'Você é o Assistente do Byla. Responda em português do Brasil, sem markdown. Dê passos práticos primeiro; não responda só com perguntas. Linguagem de secretaria, objetiva.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!response.ok) return '';
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

async function tryOpenAI(prompt: string): Promise<string> {
  const key = config.openaiApiKey;
  if (!key) return '';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 280,
      messages: [
        {
          role: 'system',
          content:
            'Você é o Assistente do Byla. Responda em português do Brasil, sem markdown. Dê passos práticos primeiro; não responda só com perguntas. Linguagem de secretaria, objetiva.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!response.ok) return '';
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

function withLlmMessage(
  fallback: ReturnType<typeof buildAssistantPlaybookResponse>,
  message: string,
  intent: string,
  confidence: number,
  providerUsed: 'gemini' | 'groq' | 'openai'
): AssistantServiceOutput {
  const normalized = normalizeAssistantStyle(message);
  const base: AssistantServiceOutput = {
    ...fallback,
    message: normalized,
    intent,
    confidence,
    providerUsed,
    actions: fallback.actions,
    needsConfirmation: false,
  };
  const scopeHints = ['fluxo', 'pendencia', 'pendência', 'cobranca', 'cobrança', 'pagamento', 'saldo', 'lancamento', 'lançamento'];
  const shouldOfferAction =
    confidence >= 0.52 || scopeHints.some((h) => normalized.toLowerCase().includes(h));
  return {
    ...base,
    actions: shouldOfferAction ? fallback.actions : [],
    needsConfirmation: shouldOfferAction && fallback.actions.length > 0 ? true : false,
  };
}

export async function generateAssistantReply(input: AssistantServiceInput): Promise<AssistantServiceOutput> {
  const { intent, confidence } = classifyIntent(input.message);
  const fallback = buildAssistantPlaybookResponse(intent);
  const prompt = buildPrompt(input);

  try {
    const geminiText = await tryGemini(prompt);
    if (geminiText) {
      return withLlmMessage(fallback, geminiText, intent, confidence, 'gemini');
    }
    const groqText = await tryGroq(prompt);
    if (groqText) {
      return withLlmMessage(fallback, groqText, intent, confidence, 'groq');
    }
    const openaiText = await tryOpenAI(prompt);
    if (openaiText) {
      return withLlmMessage(fallback, openaiText, intent, confidence, 'openai');
    }
  } catch {
    // Keep deterministic fallback.
  }

  return {
    ...fallback,
    intent,
    confidence,
    providerUsed: 'fallback',
  };
}

export function getAssistantProviderStatus(): { configured: boolean; provider: 'gemini' | 'groq' | 'openai' | null } {
  const p = providerStatus();
  const provider: 'gemini' | 'groq' | 'openai' | null = p.gemini ? 'gemini' : p.groq ? 'groq' : p.openai ? 'openai' : null;
  return { configured: Boolean(provider), provider };
}
