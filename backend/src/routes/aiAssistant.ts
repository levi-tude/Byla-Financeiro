import { Router, type Request, type Response } from 'express';
import { assistantChatBodySchema, parseBody } from '../validation/apiQuery.js';
import { generateAssistantReply, getAssistantProviderStatus } from '../services/aiAssistantService.js';
import { log } from '../services/logger.js';

export function createAiAssistantRouter(): Router {
  const router = Router();

  router.get('/ai/assistant/status', (_req: Request, res: Response) => {
    res.json(getAssistantProviderStatus());
  });

  router.post('/ai/assistant/chat', async (req: Request, res: Response) => {
    const parsed = parseBody(assistantChatBodySchema, req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.message });
      return;
    }

    const response = await generateAssistantReply(parsed.data);

    log('info', {
      msg: 'ai_assistant_chat',
      requestId: req.requestId,
      userId: req.authUser?.userId ?? null,
      role: req.authUser?.role ?? parsed.data.context?.role ?? null,
      intent: response.intent,
      confidence: response.confidence,
      provider: response.providerUsed,
      route: parsed.data.context?.route ?? null,
      hasAction: response.actions.length > 0,
    });

    res.json({
      message: response.message,
      intent: response.intent,
      confidence: response.confidence,
      actions: response.actions,
      needsConfirmation: response.needsConfirmation,
      quickReplies: response.quickReplies,
    });
  });

  return router;
}
