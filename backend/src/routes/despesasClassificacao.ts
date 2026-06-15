import { Router, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import {
  resolveCategoriaInCatalog,
  loadCatalogoSaidasControleMes,
} from '../domain/despesas/categoriasSaida.js';
import {
  buildDespesasContext,
  buildResumoFromContext,
  decodePessoaNormParam,
  DESPESAS_CATEGORIA_PENDENTE_KEY,
  sugestaoHeuristicaParaGrupo,
  transacoesDespesaPorTemplateKey,
} from '../services/despesasClassificacaoService.js';
import { deleteMapeamentoById } from '../services/mapeamentoPessoaCategoriaQuery.js';
import { upsertCompetenciaTransacao } from '../services/transacaoCompetenciaService.js';
import { normalizePessoa } from '../logic/normalizePessoa.js';
import {
  competenciaPatchBodySchema,
  despesasGruposQuerySchema,
  despesasMapeamentoPatchBodySchema,
  despesasMapeamentoPutBodySchema,
  mesAnoQuerySchema,
  mesAnoVisaoQuerySchema,
  parseBody,
  parseQuery,
} from '../validation/apiQuery.js';

export function createDespesasClassificacaoRouter(): Router {
  const router = Router();

  /** GET /api/despesas/categorias?mes=&ano= — linhas de saída do Controle de Caixa do mês (inclui custom). */
  router.get('/despesas/categorias', async (req: Request, res: Response) => {
    try {
      const parsed = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });
      const categorias = await loadCatalogoSaidasControleMes(parsed.data.mes, parsed.data.ano);
      res.json({ mes: parsed.data.mes, ano: parsed.data.ano, categorias });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET /api/despesas/categorias/:templateKey/transacoes?mes=&ano= */
  router.get('/despesas/categorias/:templateKey/transacoes', async (req: Request, res: Response) => {
    try {
      const parsed = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const templateKeyRaw = String(req.params.templateKey ?? '').trim();
      if (!templateKeyRaw) return res.status(400).json({ error: 'templateKey inválido.' });
      const templateKey = decodeURIComponent(templateKeyRaw);

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const ctx = await buildDespesasContext(supabase, parsed.data.mes, parsed.data.ano);
      const transacoes = transacoesDespesaPorTemplateKey(ctx, templateKey);
      const catRow = ctx.catalog.find((c) => c.templateKey === templateKey);

      res.json({
        mes: parsed.data.mes,
        ano: parsed.data.ano,
        template_key: templateKey,
        label:
          templateKey === DESPESAS_CATEGORIA_PENDENTE_KEY
            ? 'Sem categoria (pendente)'
            : catRow?.label ?? transacoes[0]?.categoria_efetiva ?? templateKey,
        transacoes,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET /api/despesas/resumo?mes=&ano= */
  router.get('/despesas/resumo', async (req: Request, res: Response) => {
    try {
      const parsed = parseQuery(mesAnoVisaoQuerySchema, req.query as Record<string, unknown>);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const ctx = await buildDespesasContext(supabase, parsed.data.mes, parsed.data.ano);
      const resumo = buildResumoFromContext(ctx, parsed.data.visao);
      res.json({ mes: parsed.data.mes, ano: parsed.data.ano, ...resumo });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.patch('/despesas/transacoes/:id/competencia', async (req: Request, res: Response) => {
    try {
      const qMesAno = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!qMesAno.ok) return res.status(400).json({ error: qMesAno.message });

      const parsed = parseBody(competenciaPatchBodySchema, req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const transacaoId = String(req.params.id ?? '').trim();
      if (!transacaoId) return res.status(400).json({ error: 'id obrigatório.' });

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const ctx = await buildDespesasContext(supabase, qMesAno.data.mes, qMesAno.data.ano);
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

  /** GET /api/despesas/grupos?mes=&ano=&filtro=pendente|classificado */
  router.get('/despesas/grupos', async (req: Request, res: Response) => {
    try {
      const parsed = parseQuery(despesasGruposQuerySchema, req.query as Record<string, unknown>);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const ctx = await buildDespesasContext(supabase, parsed.data.mes, parsed.data.ano);
      const filtered = ctx.grupos.filter((g) => g.estado === parsed.data.filtro);
      const slice = filtered.slice(parsed.data.offset, parsed.data.offset + parsed.data.limit);

      const byNorm = new Map<string, typeof ctx.transacoes>();
      for (const t of ctx.transacoes) {
        const list = byNorm.get(t.pessoa_normalizada) ?? [];
        list.push(t);
        byNorm.set(t.pessoa_normalizada, list);
      }

      const grupos = slice.map((g) => {
        const itens = byNorm.get(g.pessoa_normalizada) ?? [];
        const base = { ...g };
        if (parsed.data.filtro === 'pendente') {
          return { ...base, sugestao_heuristica: sugestaoHeuristicaParaGrupo(itens, ctx.catalog) };
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

  /** GET /api/despesas/grupos/:pessoaNorm/transacoes?mes=&ano= */
  router.get('/despesas/grupos/:pessoaNorm/transacoes', async (req: Request, res: Response) => {
    try {
      const parsed = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const pessoaNorm = decodePessoaNormParam(req.params.pessoaNorm ?? '');
      if (!pessoaNorm) return res.status(400).json({ error: 'pessoaNorm inválido.' });

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const ctx = await buildDespesasContext(supabase, parsed.data.mes, parsed.data.ano);
      const transacoes = ctx.transacoes.filter((t) => t.pessoa_normalizada === pessoaNorm);
      const grupo = ctx.grupos.find((g) => g.pessoa_normalizada === pessoaNorm) ?? null;

      res.json({
        mes: parsed.data.mes,
        ano: parsed.data.ano,
        pessoa_normalizada: pessoaNorm,
        grupo,
        transacoes,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** PUT /api/despesas/mapeamento?mes=&ano= — regra validada contra o Controle do mês */
  router.put('/despesas/mapeamento', async (req: Request, res: Response) => {
    try {
      const qMesAno = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!qMesAno.ok) return res.status(400).json({ error: qMesAno.message });

      const parsed = parseBody(despesasMapeamentoPutBodySchema, req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const catalog = await loadCatalogoSaidasControleMes(qMesAno.data.mes, qMesAno.data.ano);
      const cat = resolveCategoriaInCatalog(catalog, parsed.data.template_key);
      if (!cat) {
        return res.status(400).json({
          error: 'template_key inválido: a linha deve existir no Controle de Caixa deste mês.',
        });
      }

      const pessoa_normalizada = normalizePessoa(parsed.data.pessoa_normalizada);
      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const row = {
        pessoa_normalizada,
        categoria: cat.label,
        template_key: cat.templateKey,
        bloco_template_key: cat.blocoTemplateKey,
        aplica_tipo: 'saida' as const,
        ativo: true,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('mapeamento_pessoa_categoria')
        .upsert(row, { onConflict: 'pessoa_normalizada,aplica_tipo' })
        .select(
          'id, pessoa_normalizada, categoria, template_key, bloco_template_key, aplica_tipo, ativo, updated_at',
        )
        .single();

      if (error) {
        const status = error.code === '23505' ? 409 : 502;
        return res.status(status).json({ error: error.message });
      }

      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** PATCH /api/despesas/mapeamento/:id?mes=&ano= */
  router.patch('/despesas/mapeamento/:id', async (req: Request, res: Response) => {
    try {
      const qMesAno = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!qMesAno.ok) return res.status(400).json({ error: qMesAno.message });

      const parsed = parseBody(despesasMapeamentoPatchBodySchema, req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const id = String(req.params.id ?? '').trim();
      if (!id) return res.status(400).json({ error: 'id obrigatório.' });

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (parsed.data.ativo !== undefined) patch.ativo = parsed.data.ativo;
      if (parsed.data.template_key) {
        const catalog = await loadCatalogoSaidasControleMes(qMesAno.data.mes, qMesAno.data.ano);
        const cat = resolveCategoriaInCatalog(catalog, parsed.data.template_key);
        if (!cat) {
          return res.status(400).json({ error: 'template_key inválido para o Controle de Caixa deste mês.' });
        }
        patch.template_key = cat.templateKey;
        patch.bloco_template_key = cat.blocoTemplateKey;
        patch.categoria = cat.label;
      }

      const { data, error } = await supabase
        .from('mapeamento_pessoa_categoria')
        .update(patch)
        .eq('id', id)
        .select(
          'id, pessoa_normalizada, categoria, template_key, bloco_template_key, aplica_tipo, ativo, updated_at',
        )
        .single();

      if (error) return res.status(502).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'Mapeamento não encontrado.' });

      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** DELETE /api/despesas/mapeamento/:id?mes=&ano= — remove vínculo e regra (lançamentos voltam a pendente). */
  router.delete('/despesas/mapeamento/:id', async (req: Request, res: Response) => {
    try {
      const qMesAno = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!qMesAno.ok) return res.status(400).json({ error: qMesAno.message });

      const id = String(req.params.id ?? '').trim();
      if (!id) return res.status(400).json({ error: 'id obrigatório.' });

      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const removed = await deleteMapeamentoById(supabase, id, ['saida', 'todos']);
      if (!removed) return res.status(404).json({ error: 'Mapeamento não encontrado.' });

      res.json({ ok: true, id, pessoa_normalizada: removed.pessoa_normalizada });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  return router;
}
