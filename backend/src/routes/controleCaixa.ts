import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getSupabase } from '../services/supabaseClient.js';
import { mesAnoQuerySchema, parseBody, parseQuery } from '../validation/apiQuery.js';
import { buildControleCaixaTemplate, type ControleLockedLevel } from '../domain/controleCaixa/template.js';

type PeriodoRow = {
  id: string;
  mes: number;
  ano: number;
  aba_ref: string | null;
  entrada_total: number | null;
  saida_total: number | null;
  lucro_total: number | null;
  saida_parceiros_total: number | null;
  saida_fixas_total: number | null;
  saida_soma_secoes_principais: number | null;
  updated_at: string | null;
};

type BlocoRow = {
  id: string;
  periodo_id: string;
  tipo: 'entrada' | 'saida';
  titulo: string;
  ordem: number;
  template_key: string | null;
  is_default: boolean | null;
  is_custom: boolean | null;
  locked_level: ControleLockedLevel | null;
};

type LinhaRow = {
  id: string;
  bloco_id: string;
  label: string;
  valor: number | null;
  valor_texto: string | null;
  ordem: number;
  template_key: string | null;
  is_default: boolean | null;
  is_custom: boolean | null;
  locked_level: ControleLockedLevel | null;
};

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

async function ensureControleCaixaTemplate(mes: number, ano: number): Promise<{ ok: true } | { error: string }> {
  const template = buildControleCaixaTemplate();
  return persistControleCaixa(mes, ano, template, 'template_auto');
}

async function readControleCaixa(mes: number, ano: number) {
  const supabase = getSupabase();
  if (!supabase) {
    return { error: 'Supabase não configurado no backend.' };
  }

  const { data: periodo, error: periodoErr } = await supabase
    .from('controle_caixa_periodos')
    .select(
      'id, mes, ano, aba_ref, entrada_total, saida_total, lucro_total, saida_parceiros_total, saida_fixas_total, saida_soma_secoes_principais, updated_at'
    )
    .eq('mes', mes)
    .eq('ano', ano)
    .maybeSingle<PeriodoRow>();
  if (periodoErr) return { error: periodoErr.message };
  if (!periodo) {
    const ensured = await ensureControleCaixaTemplate(mes, ano);
    if ('error' in ensured) return { error: ensured.error };
    return readControleCaixa(mes, ano);
  }

  const { data: blocos, error: blocosErr } = await supabase
    .from('controle_caixa_blocos')
    .select('id, periodo_id, tipo, titulo, ordem, template_key, is_default, is_custom, locked_level')
    .eq('periodo_id', periodo.id)
    .order('ordem', { ascending: true });
  if (blocosErr) return { error: blocosErr.message };

  const blocoRows = (blocos ?? []) as unknown as BlocoRow[];
  const blocoIds = blocoRows.map((b) => b.id);
  const { data: linhas, error: linhasErr } = blocoIds.length
    ? await supabase
        .from('controle_caixa_linhas')
        .select('id, bloco_id, label, valor, valor_texto, ordem, template_key, is_default, is_custom, locked_level')
        .in('bloco_id', blocoIds)
        .order('ordem', { ascending: true })
    : { data: [], error: null };
  if (linhasErr) return { error: linhasErr.message };
  const linhaRows = (linhas ?? []) as unknown as LinhaRow[];

  const linhasByBloco = new Map<string, LinhaRow[]>();
  for (const l of linhaRows) {
    const arr = linhasByBloco.get(l.bloco_id) ?? [];
    arr.push(l);
    linhasByBloco.set(l.bloco_id, arr);
  }

  return {
    data: {
      mes: periodo.mes,
      ano: periodo.ano,
      abaRef: periodo.aba_ref,
      origem: 'supabase',
      updatedAt: periodo.updated_at,
      totais: {
        entradaTotal: periodo.entrada_total,
        saidaTotal: periodo.saida_total,
        lucroTotal: periodo.lucro_total,
        saidaParceirosTotal: periodo.saida_parceiros_total,
        saidaFixasTotal: periodo.saida_fixas_total,
        saidaSomaSecoesPrincipais: periodo.saida_soma_secoes_principais,
      },
      blocos: blocoRows.map((b) => ({
        id: b.id,
        tipo: b.tipo,
        titulo: b.titulo,
        ordem: b.ordem,
        templateKey: b.template_key,
        isDefault: Boolean(b.is_default),
        isCustom: b.is_custom == null ? !Boolean(b.is_default) : Boolean(b.is_custom),
        lockedLevel: b.locked_level ?? 'none',
        linhas: (linhasByBloco.get(b.id) ?? [])
          .sort((a, c) => a.ordem - c.ordem)
          .map((l) => ({
            id: l.id,
            label: l.label,
            valor: l.valor,
            valorTexto: l.valor_texto,
            ordem: l.ordem,
            templateKey: l.template_key,
            isDefault: Boolean(l.is_default),
            isCustom: l.is_custom == null ? !Boolean(l.is_default) : Boolean(l.is_custom),
            lockedLevel: l.locked_level ?? 'none',
          })),
      })),
    },
  };
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
