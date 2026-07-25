import { Router, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import { upsertVinculosDia } from '../services/validacaoVinculos.js';
import { listAlertasVendasSemVinculo } from '../services/alertasVendasSemVinculo.js';
import {
  atualizarValorBancoUltimo,
  listRegrasCreditoRecorrente,
  montarSugestoesCreditoRecorrenteMes,
  patchRegraCreditoRecorrente,
} from '../services/mapeamentoCreditoRecorrente.js';
import { amarrarRegraStickyAssinatura } from '../services/assinaturaCreditoRecorrente.js';
import {
  creditoRecorrenteConfirmarBodySchema,
  creditoRecorrenteRegraPatchBodySchema,
  mesAnoQuerySchema,
  parseBody,
  parseQuery,
} from '../validation/apiQuery.js';

const router = Router();

/**
 * GET /api/credito-recorrente/sugestoes?mes=&ano=
 * RBAC: admin + secretaria (guard em api.ts)
 */
router.get('/credito-recorrente/sugestoes', async (req: Request, res: Response) => {
  try {
    const parsed = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message });
    const { mes, ano } = parsed.data;

    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

    const sugestoes = await montarSugestoesCreditoRecorrenteMes(supabase, mes, ano);
    return res.json({ mes, ano, sugestoes });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * POST /api/credito-recorrente/confirmar
 * Confirma sugestão: grava vínculos + atualiza valor_banco_ultimo.
 * RBAC: admin + secretaria (guard em api.ts)
 */
router.post('/credito-recorrente/confirmar', async (req: Request, res: Response) => {
  try {
    const parsed = parseBody(creditoRecorrenteConfirmarBodySchema, req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message });
    const { regra_id, banco_id, planilha_ids, data_ref, mes, ano, pagbank_subs_id } = parsed.data;

    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

    const result = await upsertVinculosDia(data_ref, mes, ano, banco_id, planilha_ids);

    const { data: banco, error: bancoErr } = await supabase
      .from('transacoes')
      .select('id, valor, id_unico')
      .eq('id', banco_id)
      .maybeSingle();
    if (!bancoErr && banco) {
      const valorBanco = Number((banco as { valor?: number }).valor || 0);
      const codigoUltimo =
        (banco as { id_unico?: string | null }).id_unico != null
          ? String((banco as { id_unico: string | null }).id_unico)
          : null;
      await atualizarValorBancoUltimo(supabase, {
        regraId: regra_id,
        valorBanco,
        codigoUltimo,
      }).catch(() => undefined);
    }

    const pagbankSubsId = pagbank_subs_id?.trim();
    if (pagbankSubsId) {
      await amarrarRegraStickyAssinatura(supabase, pagbankSubsId, regra_id).catch(() => undefined);
    }

    return res.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('já vinculada')) return res.status(409).json({ error: msg });
    return res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/credito-recorrente/alertas-vendas?mes=&ano=
 * RBAC: admin + secretaria (guard em api.ts)
 */
router.get('/credito-recorrente/alertas-vendas', async (req: Request, res: Response) => {
  try {
    const parsed = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message });
    const { mes, ano } = parsed.data;

    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

    const alertas = await listAlertasVendasSemVinculo(supabase, mes, ano);
    const role = req.authUser?.role;
    const safe =
      role === 'secretaria'
        ? alertas.map(({ data, valor, mensagem, possivel_nova_assinatura }) => ({
            data,
            valor,
            mensagem:
              'Possível nova assinatura. Peça ao admin para vincular na Validação após conferir Assinaturas no PagBank.',
            possivel_nova_assinatura,
          }))
        : alertas;

    return res.json({ mes, ano, alertas: safe });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * GET /api/credito-recorrente/regras
 * RBAC: admin only (guard em api.ts)
 */
router.get('/credito-recorrente/regras', async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

    const regras = await listRegrasCreditoRecorrente(supabase);
    return res.json({ regras });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * PATCH /api/credito-recorrente/regras/:id
 * Body: { ativo?: boolean, rotulo?: string }
 * RBAC: admin only (guard em api.ts)
 */
router.patch('/credito-recorrente/regras/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: 'id inválido.' });
    }
    const parsed = parseBody(creditoRecorrenteRegraPatchBodySchema, req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message });

    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

    const regra = await patchRegraCreditoRecorrente(supabase, id, parsed.data);
    if (!regra) return res.status(404).json({ error: 'Regra não encontrada.' });
    return res.json({ ok: true, regra });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
