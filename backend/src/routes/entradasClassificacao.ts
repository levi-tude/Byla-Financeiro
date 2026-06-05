import { Router, Request, Response } from 'express';
import {
  findCategoriaEntradaInCatalog,
  loadCatalogoEntradasParceirosMes,
} from '../domain/entradas/categoriasEntrada.js';
import {
  buildResumoEntradasFromContext,
  decodeGrupoKeyParam,
  ENTRADAS_CATEGORIA_PENDENTE_KEY,
  getEntradasContextCached,
  invalidateEntradasContextCache,
  sugestaoEntradaParaGrupo,
  transacoesDoGrupoEntrada,
  transacoesEntradaPorTemplateKey,
} from '../services/entradasClassificacaoService.js';
import { upsertCompetenciaTransacao } from '../services/transacaoCompetenciaService.js';
import { resolveTransacoesGrupoPorKey } from '../logic/entradasVinculosGrupo.js';
import { mesPermiteSincronizarEntradasRepasses } from '../domain/entradas/syncEntradasRepassesEligible.js';
import { sincronizarEntradasParceirosControle } from '../services/controleCaixaSincronizarEntradas.js';
import {
  loadMapeamentosEntradaRows,
  mapeamentoManualExtraFields,
  mapeamentoSelectForResponse,
  deleteMapeamentoById,
} from '../services/mapeamentoPessoaCategoriaQuery.js';
import { getSupabase } from '../services/supabaseClient.js';
import { normalizePessoa } from '../logic/normalizePessoa.js';
import {
  despesasGruposQuerySchema,
  entradasMapeamentoPatchBodySchema,
  entradasMapeamentoPutBodySchema,
  competenciaPatchBodySchema,
  mesAnoQuerySchema,
  mesAnoVisaoQuerySchema,
  parseBody,
  parseQuery,
} from '../validation/apiQuery.js';

export function createEntradasClassificacaoRouter(): Router {
  const router = Router();

  router.get('/entradas/categorias', async (req: Request, res: Response) => {
    try {
      const parsed = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });
      const categorias = await loadCatalogoEntradasParceirosMes(parsed.data.mes, parsed.data.ano);
      res.json({ mes: parsed.data.mes, ano: parsed.data.ano, categorias });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.get('/entradas/categorias/:templateKey/transacoes', async (req: Request, res: Response) => {
    try {
      const parsed = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const templateKeyRaw = String(req.params.templateKey ?? '').trim();
      if (!templateKeyRaw) return res.status(400).json({ error: 'templateKey inválido.' });
      const templateKey = decodeURIComponent(templateKeyRaw);

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const ctx = await getEntradasContextCached(supabase, parsed.data.mes, parsed.data.ano);
      const transacoes = transacoesEntradaPorTemplateKey(ctx, templateKey);
      const catRow = ctx.catalog.find((c) => c.templateKey === templateKey);

      res.json({
        mes: parsed.data.mes,
        ano: parsed.data.ano,
        template_key: templateKey,
        label:
          templateKey === ENTRADAS_CATEGORIA_PENDENTE_KEY
            ? 'Sem categoria (pendente)'
            : catRow?.label ?? transacoes[0]?.categoria_efetiva ?? templateKey,
        transacoes,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.get('/entradas/resumo', async (req: Request, res: Response) => {
    try {
      const parsed = parseQuery(mesAnoVisaoQuerySchema, req.query as Record<string, unknown>);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const ctx = await getEntradasContextCached(supabase, parsed.data.mes, parsed.data.ano);
      res.json({
        mes: parsed.data.mes,
        ano: parsed.data.ano,
        ...buildResumoEntradasFromContext(ctx, parsed.data.visao),
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.patch('/entradas/transacoes/:id/competencia', async (req: Request, res: Response) => {
    try {
      const qMesAno = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!qMesAno.ok) return res.status(400).json({ error: qMesAno.message });

      const parsed = parseBody(competenciaPatchBodySchema, req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const transacaoId = String(req.params.id ?? '').trim();
      if (!transacaoId) return res.status(400).json({ error: 'id obrigatório.' });

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const ctx = await getEntradasContextCached(supabase, qMesAno.data.mes, qMesAno.data.ano);
      if (!ctx.transacoes.some((t) => t.id === transacaoId)) {
        return res.status(404).json({ error: 'Transação não encontrada neste período.' });
      }

      const row = await upsertCompetenciaTransacao(
        supabase,
        transacaoId,
        parsed.data.mes_competencia,
        parsed.data.ano_competencia,
        parsed.data.confirmada,
        'manual',
      );
      invalidateEntradasContextCache(qMesAno.data.mes, qMesAno.data.ano);

      res.json({
        ok: true,
        transacao_id: transacaoId,
        mes_competencia: row.mes_competencia,
        ano_competencia: row.ano_competencia,
        competencia_confirmada: row.confirmada,
        competencia_origem: row.origem_sugestao,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.get('/entradas/grupos', async (req: Request, res: Response) => {
    try {
      const parsed = parseQuery(despesasGruposQuerySchema, req.query as Record<string, unknown>);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const ctx = await getEntradasContextCached(supabase, parsed.data.mes, parsed.data.ano);
      const filtered = ctx.grupos.filter((g) => g.estado === parsed.data.filtro);
      const slice = filtered.slice(parsed.data.offset, parsed.data.offset + parsed.data.limit);

      const byKey = new Map<string, typeof ctx.transacoes>();
      for (const g of ctx.grupos) {
        byKey.set(g.grupo_key, transacoesDoGrupoEntrada(g, ctx.transacoes));
      }

      const grupos = slice.map((g) => {
        const itens = byKey.get(g.grupo_key) ?? [];
        const base = { ...g };
        if (parsed.data.filtro === 'pendente') {
          return { ...base, sugestao: sugestaoEntradaParaGrupo(g, itens, ctx.catalog) };
        }
        return base;
      });

      res.json({
        mes: parsed.data.mes,
        ano: parsed.data.ano,
        filtro: parsed.data.filtro,
        total: filtered.length,
        offset: parsed.data.offset,
        limit: parsed.data.limit,
        grupos,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.get('/entradas/grupos/:grupoKey/transacoes', async (req: Request, res: Response) => {
    try {
      const parsed = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const grupoKeyRaw = String(req.params.grupoKey ?? '').trim();
      if (!grupoKeyRaw) return res.status(400).json({ error: 'grupoKey inválido.' });

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const ctx = await getEntradasContextCached(supabase, parsed.data.mes, parsed.data.ano);
      const grupoKeyDecoded = decodeURIComponent(grupoKeyRaw);
      const cartaoTxns = resolveTransacoesGrupoPorKey(grupoKeyDecoded, ctx.transacoes);
      const grupoNorm = decodeGrupoKeyParam(grupoKeyRaw);
      const transacoes =
        cartaoTxns ??
        ctx.transacoes.filter((t) => t.pessoa_normalizada === grupoNorm);
      const grupo =
        ctx.grupos.find((g) => g.grupo_key === grupoKeyDecoded) ??
        ctx.grupos.find((g) => g.pessoa_normalizada === grupoNorm) ??
        null;

      res.json({
        mes: parsed.data.mes,
        ano: parsed.data.ano,
        grupo_key: grupoKeyDecoded,
        grupo,
        transacoes,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.put('/entradas/mapeamento', async (req: Request, res: Response) => {
    try {
      const qMesAno = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!qMesAno.ok) return res.status(400).json({ error: qMesAno.message });

      const parsed = parseBody(entradasMapeamentoPutBodySchema, req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const catalog = await loadCatalogoEntradasParceirosMes(qMesAno.data.mes, qMesAno.data.ano);
      const cat = findCategoriaEntradaInCatalog(catalog, parsed.data.template_key);
      if (!cat) {
        return res.status(400).json({
          error: 'template_key inválido: a linha deve existir em um bloco de entrada do Controle deste mês.',
        });
      }

      const pessoa_normalizada = normalizePessoa(parsed.data.pessoa_normalizada);
      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      await loadMapeamentosEntradaRows(supabase);

      const row = {
        pessoa_normalizada,
        categoria: cat.label,
        subcategoria: parsed.data.subcategoria ?? null,
        template_key: cat.templateKey,
        bloco_template_key: cat.blocoTemplateKey,
        aplica_tipo: 'entrada' as const,
        ativo: true,
        ...mapeamentoManualExtraFields(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('mapeamento_pessoa_categoria')
        .upsert(row, { onConflict: 'pessoa_normalizada,aplica_tipo' })
        .select(mapeamentoSelectForResponse())
        .single();

      if (error) {
        const status = error.code === '23505' ? 409 : 502;
        return res.status(status).json({ error: error.message });
      }

      invalidateEntradasContextCache(qMesAno.data.mes, qMesAno.data.ano);

      if (mesPermiteSincronizarEntradasRepasses(qMesAno.data.mes, qMesAno.data.ano)) {
        void sincronizarEntradasParceirosControle(qMesAno.data.mes, qMesAno.data.ano).catch(() => {});
      }

      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.patch('/entradas/mapeamento/:id', async (req: Request, res: Response) => {
    try {
      const qMesAno = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!qMesAno.ok) return res.status(400).json({ error: qMesAno.message });

      const parsed = parseBody(entradasMapeamentoPatchBodySchema, req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const id = String(req.params.id ?? '').trim();
      if (!id) return res.status(400).json({ error: 'id obrigatório.' });

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      await loadMapeamentosEntradaRows(supabase);

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (parsed.data.ativo !== undefined) patch.ativo = parsed.data.ativo;
      if (parsed.data.confirmado !== undefined) patch.confirmado = parsed.data.confirmado;
      if (parsed.data.template_key) {
        const catalog = await loadCatalogoEntradasParceirosMes(qMesAno.data.mes, qMesAno.data.ano);
        const cat = findCategoriaEntradaInCatalog(catalog, parsed.data.template_key);
        if (!cat) {
          return res.status(400).json({ error: 'template_key inválido para o Controle deste mês.' });
        }
        patch.template_key = cat.templateKey;
        patch.bloco_template_key = cat.blocoTemplateKey;
        patch.categoria = cat.label;
      }
      if (parsed.data.confirmado === true && !parsed.data.template_key) {
        patch.ativo = true;
      }

      const { data, error } = await supabase
        .from('mapeamento_pessoa_categoria')
        .update(patch)
        .eq('id', id)
        .select(mapeamentoSelectForResponse())
        .single();

      if (error) return res.status(502).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'Mapeamento não encontrado.' });

      invalidateEntradasContextCache(qMesAno.data.mes, qMesAno.data.ano);

      if (
        mesPermiteSincronizarEntradasRepasses(qMesAno.data.mes, qMesAno.data.ano) &&
        (parsed.data.confirmado === true || parsed.data.template_key != null)
      ) {
        void sincronizarEntradasParceirosControle(qMesAno.data.mes, qMesAno.data.ano).catch(() => {});
      }

      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** DELETE /api/entradas/mapeamento/:id?mes=&ano= — remove vínculo e regra (lançamentos voltam a pendente). */
  router.delete('/entradas/mapeamento/:id', async (req: Request, res: Response) => {
    try {
      const qMesAno = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!qMesAno.ok) return res.status(400).json({ error: qMesAno.message });

      const id = String(req.params.id ?? '').trim();
      if (!id) return res.status(400).json({ error: 'id obrigatório.' });

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const removed = await deleteMapeamentoById(supabase, id, ['entrada', 'todos']);
      if (!removed) return res.status(404).json({ error: 'Mapeamento não encontrado.' });

      invalidateEntradasContextCache(qMesAno.data.mes, qMesAno.data.ano);

      if (mesPermiteSincronizarEntradasRepasses(qMesAno.data.mes, qMesAno.data.ano)) {
        void sincronizarEntradasParceirosControle(qMesAno.data.mes, qMesAno.data.ano).catch(() => {});
      }

      res.json({ ok: true, id, pessoa_normalizada: removed.pessoa_normalizada });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** POST /api/controle-caixa/sincronizar-entradas?mes=&ano= */
  router.post('/controle-caixa/sincronizar-entradas', async (req: Request, res: Response) => {
    try {
      const parsed = parseQuery(mesAnoVisaoQuerySchema, req.query as Record<string, unknown>);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const result = await sincronizarEntradasParceirosControle(
        parsed.data.mes,
        parsed.data.ano,
        parsed.data.visao,
      );
      if ('error' in result) {
        const status = result.blocked ? 422 : 500;
        return res.status(status).json({ error: result.error });
      }
      res.json({
        ok: true,
        mes: parsed.data.mes,
        ano: parsed.data.ano,
        visao: parsed.data.visao,
        controle: result.data,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  return router;
}
