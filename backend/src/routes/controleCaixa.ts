import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { mesAnoQuerySchema, parseBody, parseQuery } from '../validation/apiQuery.js';
import { isControleModo, type ControleModo } from '../domain/controleCaixa/modo.js';
import { readControleCaixa } from '../services/controleCaixaRead.js';
import { persistControleCaixaModo } from '../services/controleCaixaPersist.js';

const controleCaixaSaveBodySchema = z.object({
  abaRef: z.string().trim().min(1).max(120).nullable().optional(),
  totais: z.object({
    entradaTotal: z.number().finite().nullable().optional(),
    saidaTotal: z.number().finite().nullable().optional(),
    lucroTotal: z.number().finite().nullable().optional(),
    saidaParceirosTotal: z.number().finite().nullable().optional(),
    saidaFixasTotal: z.number().finite().nullable().optional(),
    saidaSomaSecoesPrincipais: z.number().finite().nullable().optional(),
  }),
  blocos: z.array(
    z.object({
      tipo: z.enum(['entrada', 'saida']),
      titulo: z.string().trim().min(1).max(180),
      ordem: z.number().int().min(0),
      templateKey: z.string().trim().min(1).max(120).nullable().optional(),
      isDefault: z.boolean().optional(),
      isCustom: z.boolean().optional(),
      lockedLevel: z.enum(['none', 'warn', 'strong']).optional(),
      linhas: z.array(
        z.object({
          label: z.string().trim().min(1).max(220),
          valor: z.number().finite().nullable().optional(),
          valorTexto: z.string().trim().max(220).nullable().optional(),
          ordem: z.number().int().min(0),
          templateKey: z.string().trim().min(1).max(120).nullable().optional(),
          isDefault: z.boolean().optional(),
          isCustom: z.boolean().optional(),
          lockedLevel: z.enum(['none', 'warn', 'strong']).optional(),
        })
      ),
    })
  ),
});

const controleModoQuerySchema = mesAnoQuerySchema.extend({
  modo: z.preprocess(
    (v) => (v === '' || v == null ? 'oficial' : v),
    z.enum(['oficial', 'sistema']).default('oficial'),
  ),
});

function parseModo(raw: unknown, fallback: ControleModo = 'oficial'): ControleModo {
  return isControleModo(raw) ? raw : fallback;
}

export default function createControleCaixaRouter(): Router {
  const router = Router();

  router.get('/controle-caixa', async (req: Request, res: Response) => {
    const q = parseQuery(controleModoQuerySchema, req.query as Record<string, unknown>);
    if (!q.ok) return res.status(400).json({ error: q.message });

    const modo = parseModo(q.data.modo, 'sistema');
    const result = await readControleCaixa(q.data.mes, q.data.ano, modo);
    if ('error' in result) return res.status(500).json({ error: result.error });
    return res.json(result.data);
  });

  router.put('/controle-caixa', async (req: Request, res: Response) => {
    const q = parseQuery(controleModoQuerySchema, req.query as Record<string, unknown>);
    if (!q.ok) return res.status(400).json({ error: q.message });
    const b = parseBody(controleCaixaSaveBodySchema, req.body);
    if (!b.ok) return res.status(400).json({ error: b.message });

    const modo = parseModo(q.data.modo, 'sistema');
    if (modo === 'oficial') {
      return res.status(403).json({
        error:
          'O modo Oficial (planilha) é somente leitura. Edite no modo Sistema ou rode novamente a migração da planilha.',
      });
    }

    const persisted = await persistControleCaixaModo(
      q.data.mes,
      q.data.ano,
      {
        abaRef: b.data.abaRef ?? null,
        totais: {
          entradaTotal: b.data.totais.entradaTotal ?? null,
          saidaTotal: b.data.totais.saidaTotal ?? null,
          lucroTotal: b.data.totais.lucroTotal ?? null,
          saidaParceirosTotal: b.data.totais.saidaParceirosTotal ?? null,
          saidaFixasTotal: b.data.totais.saidaFixasTotal ?? null,
          saidaSomaSecoesPrincipais: b.data.totais.saidaSomaSecoesPrincipais ?? null,
        },
        blocos: b.data.blocos.map((bloco) => ({
          tipo: bloco.tipo,
          titulo: bloco.titulo,
          ordem: bloco.ordem,
          templateKey: bloco.templateKey ?? null,
          isDefault: bloco.isDefault ?? false,
          isCustom: bloco.isCustom ?? true,
          lockedLevel: bloco.lockedLevel ?? 'none',
          linhas: bloco.linhas.map((linha) => ({
            label: linha.label,
            valor: linha.valor ?? null,
            valorTexto: linha.valorTexto ?? null,
            ordem: linha.ordem,
            templateKey: linha.templateKey ?? null,
            isDefault: linha.isDefault ?? false,
            isCustom: linha.isCustom ?? true,
            lockedLevel: linha.lockedLevel ?? 'none',
          })),
        })),
      },
      'sistema_editor',
      'sistema',
    );
    if ('error' in persisted) return res.status(500).json({ error: persisted.error });

    const result = await readControleCaixa(q.data.mes, q.data.ano, 'sistema');
    if ('error' in result) return res.status(500).json({ error: result.error });
    return res.json(result.data);
  });

  return router;
}
