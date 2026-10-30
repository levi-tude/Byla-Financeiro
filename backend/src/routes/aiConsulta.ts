import { Router, type Request, type Response } from 'express';
import { consultaChatBodySchema, parseBody } from '../validation/apiQuery.js';
import { gerarConsultaReply, getConsultaProviderStatus } from '../services/consultaBylaService.js';
import { CONSULTA_MENU_LABELS } from '../ai/consultaCatalog.js';
import { log } from '../services/logger.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { config } from '../config.js';

export function createAiConsultaRouter(): Router {
  const router = Router();
  const consultaLimiter = rateLimit({
    name: 'consulta-ia',
    max: config.rateLimitIaMax,
    windowMs: config.rateLimitIaWindowMs,
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

    const response = await gerarConsultaReply(parsed.data);

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
