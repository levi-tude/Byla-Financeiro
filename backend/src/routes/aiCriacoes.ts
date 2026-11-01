import { Router, type Request, type Response } from 'express';
import { criacaoRequestSchema } from '../ai/criacoesSpec.js';
import { gerarCriacao } from '../services/criacoesService.js';
import { z } from 'zod';
import { abrirSalva, apagarSalva, listarSalvas, salvarCriacao, salvarCriacaoSchema, specTamanhoOk } from '../services/criacoesSalvasService.js';
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
  // Visões salvas — precisa de usuário logado (owner_id vem do token, nunca do corpo).
  const idSchema = z.string().uuid();
  const userIdOr401 = (req: Request, res: Response): string | null => {
    const id = req.authUser?.userId;
    if (!id) {
      res.status(401).json({ error: 'Entre com sua conta para usar as visões salvas.' });
      return null;
    }
    return id;
  };

  router.get('/ai/criacoes/salvas', async (req: Request, res: Response) => {
    const userId = userIdOr401(req, res);
    if (!userId) return;
    try {
      res.json({ items: await listarSalvas(userId) });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Falha ao listar.' });
    }
  });

  router.get('/ai/criacoes/salvas/:id', async (req: Request, res: Response) => {
    const userId = userIdOr401(req, res);
    if (!userId) return;
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return void res.status(400).json({ error: 'id inválido.' });
    try {
      const item = await abrirSalva(userId, id.data);
      if (!item) return void res.status(404).json({ error: 'Visão não encontrada.' });
      res.json({ item });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Falha ao abrir.' });
    }
  });

  router.post('/ai/criacoes/salvas', async (req: Request, res: Response) => {
    const userId = userIdOr401(req, res);
    if (!userId) return;
    const parsed = salvarCriacaoSchema.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({ error: 'Pedido inválido: envie "titulo" (3–120), "visibilidade" (privada|compartilhada) e o "spec" da criação.' });
    }
    if (!specTamanhoOk(parsed.data.spec)) return void res.status(413).json({ error: 'Visão grande demais (limite 64 KB).' });
    try {
      const item = await salvarCriacao(userId, parsed.data);
      log('info', { msg: 'ai_criacoes_salvar', requestId: req.requestId, userId, visibilidade: item.visibilidade });
      res.status(201).json({ item });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Falha ao salvar.' });
    }
  });

  router.delete('/ai/criacoes/salvas/:id', async (req: Request, res: Response) => {
    const userId = userIdOr401(req, res);
    if (!userId) return;
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return void res.status(400).json({ error: 'id inválido.' });
    try {
      const ok = await apagarSalva(userId, id.data);
      if (!ok) return void res.status(404).json({ error: 'Visão não encontrada ou não é sua.' });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Falha ao apagar.' });
    }
  });
  return router;
}
