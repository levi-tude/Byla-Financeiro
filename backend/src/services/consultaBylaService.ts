/**
 * Orquestrador Consulta Byla: menu/keywords → tools; fatos só das tools.
 */

import {
  CONSULTA_MENU_LABELS,
  mensagemRecusaForaDoCatalogo,
  parseMonthYearContext,
  resolveConsultaIntent,
  type ConsultaToolId,
} from '../ai/consultaCatalog.js';
import { config } from '../config.js';
import { executeConsultaTool } from './consultaBylaTools.js';

export type ConsultaServiceInput = {
  message: string;
  context?: {
    route?: string;
    role?: 'secretaria' | 'admin' | null;
    monthYear?: string;
  };
};

export type ConsultaServiceOutput = {
  message: string;
  tool: ConsultaToolId | null;
  confidence: number;
  quickReplies: string[];
  providerUsed: 'deterministic' | 'gemini' | 'groq' | 'openai' | 'fallback';
};

function defaultMesAno(monthYear?: string): { mes: number; ano: number } {
  const parsed = parseMonthYearContext(monthYear);
  if (parsed) return parsed;
  const d = new Date();
  return { mes: d.getMonth() + 1, ano: d.getFullYear() };
}

function sanitize(raw: string): string {
  return raw
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function tryPolishWithLlm(factsText: string): Promise<{ text: string; provider: 'gemini' | 'groq' | 'openai' } | null> {
  const prompt = [
    'Você é o Consulta Byla. Reescreva os FATOS abaixo em português claro para gestão de escola de dança.',
    'NÃO invente, NÃO altere números, NÃO acrescente valores que não estejam nos fatos.',
    'Sem markdown. Pode só reorganizar frases se ajudar a leitura.',
    'Se os fatos já estiverem claros, devolva-os quase iguais.',
    '',
    'FATOS:',
    factsText,
  ].join('\n');

  if (config.geminiApiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
          }),
        },
      );
      if (response.ok) {
        const json = (await response.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return { text: sanitize(text), provider: 'gemini' };
      }
    } catch {
      /* fallback facts */
    }
  }
  return null;
}

export async function gerarConsultaReply(input: ConsultaServiceInput): Promise<ConsultaServiceOutput> {
  const quickReplies = CONSULTA_MENU_LABELS.slice(0, 8);
  const intent = resolveConsultaIntent(input.message);

  if (!intent) {
    return {
      message: mensagemRecusaForaDoCatalogo(),
      tool: null,
      confidence: 0,
      quickReplies: CONSULTA_MENU_LABELS,
      providerUsed: 'deterministic',
    };
  }

  const ctx = defaultMesAno(input.context?.monthYear);
  const result = await executeConsultaTool(intent.tool, intent.params, ctx);

  if (!result.ok) {
    return {
      message: result.error,
      tool: result.tool,
      confidence: intent.confidence,
      quickReplies: result.needsClarification ? quickReplies : CONSULTA_MENU_LABELS,
      providerUsed: 'deterministic',
    };
  }

  const polished = await tryPolishWithLlm(result.factsText);
  if (polished) {
    return {
      message: polished.text,
      tool: result.tool,
      confidence: intent.confidence,
      quickReplies,
      providerUsed: polished.provider,
    };
  }

  return {
    message: result.factsText,
    tool: result.tool,
    confidence: intent.confidence,
    quickReplies,
    providerUsed: 'deterministic',
  };
}

export function getConsultaProviderStatus(): {
  configured: boolean;
  provider: 'gemini' | 'groq' | 'openai' | null;
} {
  if (config.geminiApiKey) return { configured: true, provider: 'gemini' };
  if (config.groqApiKey) return { configured: true, provider: 'groq' };
  if (config.openaiApiKey) return { configured: true, provider: 'openai' };
  return { configured: false, provider: null };
}
