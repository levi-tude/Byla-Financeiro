import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getSupabase } from '../services/supabaseClient.js';
import { mesAnoQuerySchema, parseBody, parseQuery } from '../validation/apiQuery.js';
import { buildControleCaixaTemplate } from '../domain/controleCaixa/template.js';
import { readControleCaixa } from '../services/controleCaixaRead.js';

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

type ControlePersistPayload = z.infer<typeof controleCaixaSaveBodySchema>;

async function persistControleCaixa(
  mes: number,
  ano: number,
  payload: ControlePersistPayload,
  origem: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { error: 'Supabase não configurado no backend.' };
  }
  const { data: periodo, error: periodoErr } = await supabase
    .from('controle_caixa_periodos')
    .upsert(
      {
        mes,
        ano,
        aba_ref: payload.abaRef ?? null,
        entrada_total: payload.totais.entradaTotal ?? null,
        saida_total: payload.totais.saidaTotal ?? null,
        lucro_total: payload.totais.lucroTotal ?? null,
        saida_parceiros_total: payload.totais.saidaParceirosTotal ?? null,
        saida_fixas_total: payload.totais.saidaFixasTotal ?? null,
        saida_soma_secoes_principais: payload.totais.saidaSomaSecoesPrincipais ?? null,
        origem,
      },
      { onConflict: 'mes,ano' }
    )
    .select('id')
    .single<{ id: string }>();
  if (periodoErr || !periodo) {
    return { error: periodoErr?.message ?? 'Falha ao salvar período.' };
  }

  const periodoId = periodo.id;
  const delBlocos = await supabase.from('controle_caixa_blocos').delete().eq('periodo_id', periodoId);
  if (delBlocos.error) return { error: delBlocos.error.message };

  for (const bloco of payload.blocos) {
    const { data: blocoRow, error: blocoErr } = await supabase
      .from('controle_caixa_blocos')
      .insert({
        periodo_id: periodoId,
        tipo: bloco.tipo,
        titulo: bloco.titulo,
        ordem: bloco.ordem,
        template_key: bloco.templateKey ?? null,
        is_default: bloco.isDefault ?? false,
        is_custom: bloco.isCustom ?? true,
        locked_level: bloco.lockedLevel ?? 'none',
      })
      .select('id')
      .single<{ id: string }>();
    if (blocoErr || !blocoRow) {
      return { error: blocoErr?.message ?? 'Falha ao salvar bloco.' };
    }
    if (bloco.linhas.length === 0) continue;
    const insLinhas = await supabase.from('controle_caixa_linhas').insert(
      bloco.linhas.map((linha) => ({
        bloco_id: blocoRow.id,
        label: linha.label,
        valor: linha.valor ?? null,
        valor_texto: linha.valorTexto ?? null,
        ordem: linha.ordem,
        template_key: linha.templateKey ?? null,
        is_default: linha.isDefault ?? false,
        is_custom: linha.isCustom ?? true,
        locked_level: linha.lockedLevel ?? 'none',
      }))
    );
    if (insLinhas.error) return { error: insLinhas.error.message };
  }
  return { ok: true };
}

export default function createControleCaixaRouter(): Router {
  const router = Router();

  router.get('/controle-caixa', async (req: Request, res: Response) => {
    const q = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
    if (!q.ok) return res.status(400).json({ error: q.message });

    const result = await readControleCaixa(q.data.mes, q.data.ano);
    if ('error' in result) return res.status(500).json({ error: result.error });
    return res.json(result.data);
  });

  router.put('/controle-caixa', async (req: Request, res: Response) => {
    const q = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
    if (!q.ok) return res.status(400).json({ error: q.message });
    const b = parseBody(controleCaixaSaveBodySchema, req.body);
    if (!b.ok) return res.status(400).json({ error: b.message });

    const persisted = await persistControleCaixa(q.data.mes, q.data.ano, b.data, 'sistema_editor');
    if ('error' in persisted) return res.status(500).json({ error: persisted.error });

    const result = await readControleCaixa(q.data.mes, q.data.ano);
    if ('error' in result) return res.status(500).json({ error: result.error });
    return res.json(result.data);
  });

  return router;
}
