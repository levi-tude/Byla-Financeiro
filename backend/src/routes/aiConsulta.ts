import { Router, type Request, type Response } from 'express';
import { consultaChatBodySchema, parseBody } from '../validation/apiQuery.js';
import { gerarConsultaReply, getConsultaProviderStatus } from '../services/consultaBylaService.js';
import { CONSULTA_MENU_LABELS } from '../ai/consultaCatalog.js';
import { log } from '../services/logger.js';
import { clientKey, criarCota, rateLimit } from '../middleware/rateLimit.js';
import { config } from '../config.js';

export function createAiConsultaRouter(): Router {
  const router = Router();
  // Teto anti-abuso (qualquer pergunta): acima dele, 429.
  const consultaLimiter = rateLimit({
    name: 'consulta-hard',
    max: config.rateLimitConsultaHardMax,
    windowMs: 5 * 60 * 1000,
  });
  // Cota de IA por usuário: só conta quando a pergunta vai para a IA. Acabou → modo simples (roteador/menu).
  const cotaIa = criarCota({
    name: 'consulta-ia',
    max: config.rateLimitConsultaIaMax,
    windowMs: config.rateLimitConsultaIaWindowMs,
  });

  router.get('/ai/consulta/status', (_req: Request, res: Response) => {
    res.json({ ...getConsultaProviderStatus(), menu: CONSULTA_MENU_LABELS });
  });

  router.post('/ai/consulta/chat', consultaLimiter, async (req: Request, res: Response) => {
    const parsed = parseBody(consultaChatBodySchema, req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.message });
      return;
    }

    const key = clientKey(req);
    let response: Awaited<ReturnType<typeof gerarConsultaReply>>;
    try {
      response = await gerarConsultaReply(parsed.data, { consumirCotaIa: () => cotaIa.consumir(key) });
    } catch (e) {
      log('warn', { msg: 'ai_consulta_chat_erro', requestId: req.requestId, detail: e instanceof Error ? e.message : String(e) });
      response = await gerarConsultaReply(parsed.data, {
        providers: [],
        avisoInicial: 'A IA não respondeu agora; respondi no modo simples (menu).',
      }).catch(() => ({
        message: 'A IA não respondeu agora; respondi no modo simples (menu). Use um dos atalhos abaixo.',
        tool: null,
        confidence: 0,
        quickReplies: CONSULTA_MENU_LABELS,
        providerUsed: 'fallback' as const,
      }));
    }

    log('info', {
      msg: 'ai_consulta_chat',
      requestId: req.requestId,
      userId: req.authUser?.userId ?? null,
      role: req.authUser?.role ?? parsed.data.context?.role ?? null,
      tool: response.tool,
      confidence: response.confidence,
      provider: response.providerUsed,
      monthYear: parsed.data.context?.monthYear ?? null,
      route: parsed.data.context?.route ?? null,
      historyLen: parsed.data.history?.length ?? 0,
    });

    res.json({
      message: response.message,
      tool: response.tool,
      confidence: response.confidence,
      quickReplies: response.quickReplies,
      providerUsed: response.providerUsed,
    });
  });

  return router;
}
