import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRoles } from '../middleware/auth.js';
import { requireSyncSecret } from '../middleware/syncSecret.js';
import { mesAnoQuerySchema, parseBody, parseQuery } from '../validation/apiQuery.js';
import {
  createClassificacao,
  createReserva,
  createSala,
  classificacaoCreateSchema,
  deleteReserva,
  listClassificacoes,
  listReservas,
  listSalas,
  mesAnteriorReferenciaSaoPaulo,
  montarResumoWhatsApp,
  patchReserva,
  patchSala,
  reservaCreateSchema,
  reservaPatchSchema,
  salaCreateSchema,
  salaPatchSchema,
} from '../services/aluguelSalasService.js';

const reservasListQuerySchema = mesAnoQuerySchema.extend({
  sala_id: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().uuid().optional(),
  ),
});

const resumoQuerySchema = mesAnoQuerySchema.extend({
  sala_id: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().uuid().optional(),
  ),
});

const resumoAutoQuerySchema = z.object({
  mes: z.coerce.number().int().min(1).max(12).optional(),
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
});

function httpError(res: Response, e: unknown, fallback = 500): void {
  const msg = e instanceof Error ? e.message : String(e);
  const status =
    /não encontrad/i.test(msg) ? 404
    : /conflito|deve ser depois|Nada para atualizar|Slug/i.test(msg) ? 400
    : /não configurado/i.test(msg) ? 503
    : fallback;
  res.status(status).json({ error: msg });
}

/** Rotas JWT: secretaria + admin (CRUD reservas; salas leitura). Admin cria/edita salas. */
export function createAluguelSalasRouter(): Router {
  const router = Router();

  router.get('/aluguel/salas', requireRoles(['secretaria', 'admin']), async (req, res) => {
    try {
      const incluirInativas = req.authUser?.role === 'admin' && String(req.query.todas ?? '') === '1';
      const salas = await listSalas({ incluirInativas });
      res.json({ salas });
    } catch (e) {
      httpError(res, e);
    }
  });

  router.get('/aluguel/classificacoes', requireRoles(['secretaria', 'admin']), async (_req, res) => {
    try {
      const classificacoes = await listClassificacoes();
      res.json({ classificacoes });
    } catch (e) {
      httpError(res, e);
    }
  });

  router.post('/aluguel/classificacoes', requireRoles(['admin']), async (req, res) => {
    try {
      const body = parseBody(classificacaoCreateSchema, req.body);
      if (!body.ok) return void res.status(400).json({ error: body.message });
      const classificacao = await createClassificacao(body.data);
      res.status(201).json({ classificacao });
    } catch (e) {
      httpError(res, e);
    }
  });

  router.post('/aluguel/salas', requireRoles(['admin']), async (req, res) => {
    try {
      const body = parseBody(salaCreateSchema, req.body);
      if (!body.ok) return void res.status(400).json({ error: body.message });
      const sala = await createSala(body.data);
      res.status(201).json({ sala });
    } catch (e) {
      httpError(res, e);
    }
  });

  router.patch('/aluguel/salas/:id', requireRoles(['admin']), async (req, res) => {
    try {
      const body = parseBody(salaPatchSchema, req.body);
      if (!body.ok) return void res.status(400).json({ error: body.message });
      const sala = await patchSala(req.params.id, body.data);
      res.json({ sala });
    } catch (e) {
      httpError(res, e);
    }
  });

  router.get('/aluguel/reservas', requireRoles(['secretaria', 'admin']), async (req, res) => {
    try {
      const q = parseQuery(reservasListQuerySchema, req.query as Record<string, unknown>);
      if (!q.ok) return void res.status(400).json({ error: q.message });
      const reservas = await listReservas({
        mes: q.data.mes,
        ano: q.data.ano,
        salaId: q.data.sala_id,
      });
      res.json({ mes: q.data.mes, ano: q.data.ano, reservas });
    } catch (e) {
      httpError(res, e);
    }
  });

  router.post('/aluguel/reservas', requireRoles(['secretaria', 'admin']), async (req, res) => {
    try {
      const body = parseBody(reservaCreateSchema, req.body);
      if (!body.ok) return void res.status(400).json({ error: body.message });
      const reserva = await createReserva(body.data, req.authUser?.userId ?? null);
      res.status(201).json({ reserva });
    } catch (e) {
      httpError(res, e);
    }
  });

  router.patch('/aluguel/reservas/:id', requireRoles(['secretaria', 'admin']), async (req, res) => {
    try {
      const body = parseBody(reservaPatchSchema, req.body);
      if (!body.ok) return void res.status(400).json({ error: body.message });
      const reserva = await patchReserva(req.params.id, body.data);
      res.json({ reserva });
    } catch (e) {
      httpError(res, e);
    }
  });

  router.delete('/aluguel/reservas/:id', requireRoles(['secretaria', 'admin']), async (req, res) => {
    try {
      await deleteReserva(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      httpError(res, e);
    }
  });

  router.get(
    '/aluguel/resumo-whatsapp',
    requireRoles(['secretaria', 'admin']),
    async (req, res) => {
      try {
        const q = parseQuery(resumoQuerySchema, req.query as Record<string, unknown>);
        if (!q.ok) return void res.status(400).json({ error: q.message });
        const resumo = await montarResumoWhatsApp({
          mes: q.data.mes,
          ano: q.data.ano,
          salaId: q.data.sala_id,
        });
        res.json(resumo);
      } catch (e) {
        httpError(res, e);
      }
    },
  );

  return router;
}

/** Rota n8n (sync secret) — montar ANTES de qualquer guard JWT em /aluguel se necessário.
 *  Aqui fica sob attachAuthUser mas sem requireRoles; exige X-Byla-Sync-Secret. */
export function createAluguelSalasAutomaticoRouter(): Router {
  const router = Router();

  router.get('/aluguel/resumo-whatsapp-auto', async (req: Request, res: Response) => {
    if (!requireSyncSecret(req, res)) return;
    try {
      const q = parseQuery(resumoAutoQuerySchema, req.query as Record<string, unknown>);
      if (!q.ok) return void res.status(400).json({ error: q.message });

      let mes = q.data.mes;
      let ano = q.data.ano;
      if (mes == null || ano == null) {
        const prev = mesAnteriorReferenciaSaoPaulo();
        mes = prev.mes;
        ano = prev.ano;
      }

      const resumo = await montarResumoWhatsApp({ mes, ano });
      res.json(resumo);
    } catch (e) {
      httpError(res, e);
    }
  });

  return router;
}

export default createAluguelSalasRouter;
