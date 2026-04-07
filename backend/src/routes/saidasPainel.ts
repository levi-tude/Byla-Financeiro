import { Router, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import { filtrarTransacoesOficiais, type TransacaoBase } from '../services/transacoesFiltro.js';
import { parseQuery, mesAnoQuerySchema } from '../validation/apiQuery.js';
import { GetFluxoCompletoUseCase } from '../useCases/GetFluxoCompletoUseCase.js';
import { achatarBlocosParaMatch, parseValor } from '../logic/planilhaControleSaidas.js';
import { classificarSaidaCompleta } from '../logic/classificacaoSaidaBanco.js';
import { carregarIndicePagadoresControle } from '../logic/pagadorControleIndice.js';
import { getEntidadesByla } from '../domain/funcionariosByla.js';

type ExportRow = TransacaoBase & {
  categoria_sugerida?: string | null;
  subcategoria_sugerida?: string | null;
  modalidade?: string | null;
  origem_categoria?: string | null;
};

export function createSaidasPainelRouter(fluxoUseCase: GetFluxoCompletoUseCase): Router {
  const router = Router();

  /** GET /api/saidas/painel?mes=&ano= — Saídas oficiais do mês com categoria (banco) + sugestão por planilha CONTROLE DE CAIXA. */
  router.get('/saidas/painel', async (req: Request, res: Response) => {
    try {
      const parsed = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
      if (!parsed.ok) return res.status(400).json({ error: parsed.message });

      const { mes, ano } = parsed.data;
      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

      const fluxo = await fluxoUseCase.execute(mes, ano);
      const blocos = fluxo.combinado.saidasBlocos ?? [];
      const planilhaFlat = achatarBlocosParaMatch(blocos);
      const entidades = getEntidadesByla();
      const { blocos: indicePagadorControle, errors: pagadorPlanilhaErrors } = await carregarIndicePagadoresControle(ano);

      const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('v_transacoes_export')
        .select(
          'id, data, pessoa, valor, descricao, tipo, categoria_sugerida, subcategoria_sugerida, modalidade, origem_categoria',
        )
        .gte('data', inicio)
        .lte('data', fim)
        .limit(3000);

      if (error) return res.status(502).json({ error: error.message });

      const rows = (data ?? []) as ExportRow[];
      const bases: TransacaoBase[] = rows.map((r) => ({
        id: r.id,
        data: r.data,
        pessoa: r.pessoa,
        valor: Number(r.valor),
        descricao: r.descricao,
        tipo: r.tipo,
      }));
      const oficiais = filtrarTransacoesOficiais(bases);
      const rowsById = new Map(rows.map((r) => [r.id, r]));

      const itens = oficiais.saidas.map((t) => {
        const full = rowsById.get(t.id);
        const sug = classificarSaidaCompleta(
          t.pessoa,
          t.descricao,
          Number(t.valor),
          planilhaFlat,
          entidades,
          { indicePagadorControle },
        );
        return {
          id: t.id,
          data: t.data,
          pessoa: t.pessoa,
          valor: Number(t.valor),
          descricao: t.descricao,
          tipo: t.tipo,
          categoria_sugerida_banco: (full?.categoria_sugerida ?? '').trim() || null,
          subcategoria_sugerida_banco: (full?.subcategoria_sugerida ?? '').trim() || null,
          modalidade_banco: (full?.modalidade ?? '').trim() || null,
          origem_categoria_banco: (full?.origem_categoria ?? '').trim() || null,
          grupo_planilha: sug.grupo_planilha,
          linha_planilha_ref: sug.linha_planilha_ref,
          match_confianca: sug.confianca,
          secao_planilha: sug.secao_planilha,
          detalhe: sug.detalhe,
          classificacao_regra: sug.regra,
        };
      });

      const resumoPorCategoriaBanco: { nome: string; total: number; qtd: number }[] = [];
      const mapCat = new Map<string, { total: number; qtd: number }>();
      for (const it of itens) {
        const nome = it.categoria_sugerida_banco || 'A classificar';
        const e = mapCat.get(nome) ?? { total: 0, qtd: 0 };
        e.total += Math.abs(Number(it.valor || 0));
        e.qtd += 1;
        mapCat.set(nome, e);
      }
      for (const [nome, v] of mapCat) resumoPorCategoriaBanco.push({ nome, total: v.total, qtd: v.qtd });
      resumoPorCategoriaBanco.sort((a, b) => b.total - a.total);

      const resumoPorGrupoPlanilha: { nome: string; total: number; qtd: number }[] = [];
      const mapG = new Map<string, { total: number; qtd: number }>();
      for (const it of itens) {
        const nome = it.grupo_planilha || 'Sem match na planilha';
        const e = mapG.get(nome) ?? { total: 0, qtd: 0 };
        e.total += Math.abs(Number(it.valor || 0));
        e.qtd += 1;
        mapG.set(nome, e);
      }
      for (const [nome, v] of mapG) resumoPorGrupoPlanilha.push({ nome, total: v.total, qtd: v.qtd });
      resumoPorGrupoPlanilha.sort((a, b) => b.total - a.total);

      const resumoPorLinhaPlanilha: { nome: string; total: number; qtd: number }[] = [];
      const mapLinha = new Map<string, { total: number; qtd: number }>();
      for (const it of itens) {
        const nome = it.linha_planilha_ref?.trim() || 'Não classificado';
        const e = mapLinha.get(nome) ?? { total: 0, qtd: 0 };
        e.total += Math.abs(Number(it.valor || 0));
        e.qtd += 1;
        mapLinha.set(nome, e);
      }
      for (const [nome, v] of mapLinha) resumoPorLinhaPlanilha.push({ nome, total: v.total, qtd: v.qtd });
      resumoPorLinhaPlanilha.sort((a, b) => b.total - a.total);

      const totaisExtratoFiltrado = {
        total_saidas: itens.reduce((s, it) => s + Math.abs(Number(it.valor || 0)), 0),
        qtd: itens.length,
      };

      res.json({
        mes,
        ano,
        itens,
        /** Mesmo critério do extrato oficial no backend (EA/Blead + Samuel pareados + faixa repasse ~5k). */
        totais_extrato_filtrado: totaisExtratoFiltrado,
        resumo_por_categoria_banco: resumoPorCategoriaBanco,
        resumo_por_grupo_planilha: resumoPorGrupoPlanilha,
        resumo_por_linha_planilha: resumoPorLinhaPlanilha,
        planilha_blocos: blocos,
        totais_planilha_por_bloco: blocos.map((b) => ({
          titulo: b.titulo,
          total: b.linhas.reduce((s, l) => s + Math.abs(l.valorNum ?? parseValor(l.valor) ?? 0), 0),
          qtd: b.linhas.length,
        })),
        fluxo_sheet_error: fluxo.sheet_error ?? null,
        fluxo_fallback_message: fluxo.fallback_message ?? null,
        pagador_planilha_errors: pagadorPlanilhaErrors.length ? pagadorPlanilhaErrors : null,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  return router;
}
