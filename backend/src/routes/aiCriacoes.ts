import { Router, type Request, type Response } from 'express';
import { criacaoRequestSchema } from '../ai/criacoesSpec.js';
import { gerarCriacao } from '../services/criacoesService.js';
import { log } from '../services/logger.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { config } from '../config.js';

/** Criações da IA — só leitura; gating admin+gestor aplicado em routes/api.ts (igual ao Consulta Byla). */
export function createAiCriacoesRouter(): Router {
  const router = Router();
  const limiter = rateLimit({ name: 'criacoes-ia', max: config.rateLimitIaMax, windowMs: config.rateLimitIaWindowMs });

  router.post('/ai/criacoes/gerar', limiter, async (req: Request, res: Response) => {
    const parsed = criacaoRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Pedido inválido: envie "prompt" (3–500 caracteres) e opcional "monthYear" (YYYY-MM).' });
      return;
    }
    try {
      const spec = await gerarCriacao(parsed.data);
      log('info', {
        msg: 'ai_criacoes_gerar',
        requestId: req.requestId,
        userId: req.authUser?.userId ?? null,
        role: req.authUser?.role ?? null,
        origem: spec.origem,
        secoes: spec.secoes.length,
      });
      res.json({ spec });
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : 'Falha ao montar a criação.' });
    }
  });
  return router;
}
