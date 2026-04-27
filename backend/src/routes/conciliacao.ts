import { Router, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import { listSheetNames } from '../services/sheetsService.js';
import { config } from '../config.js';
import { lerPagamentosPorAbaEAno } from '../services/planilhaPagamentos.js';
import { isEligibleSheet, businessRules } from '../businessRules.js';
import { filtrarTransacoesOficiais } from '../services/transacoesFiltro.js';
import { normalizeText, sameDayISO, shiftISODate } from '../logic/conciliacaoTexto.js';
import {
  matchUmPagamentoPlanilhaBanco,
  matchPagamentosAgrupadosPlanilhaBanco,
  type PlanilhaItem,
  type BancoItem,
  type PilatesNomePagadorRow,
} from '../logic/conciliacaoPagamentoMatch.js';
import { mesAnoQuerySchema, parseQuery, validacaoPagamentosDiariaQuerySchema } from '../validation/apiQuery.js';
import {
  getConciliacaoVencimentosMesData,
  ConciliacaoVencimentosMesError,
} from '../services/conciliacaoVencimentosMes.js';

const router = Router();

router.get('/validacao-pagamentos-diaria', async (req: Request, res: Response) => {
  try {
    const vq = parseQuery(validacaoPagamentosDiariaQuerySchema, req.query as Record<string, unknown>);
    if (!vq.ok) {
      return res.status(400).json({ error: vq.message });
    }
    const dataStr = vq.data.data.trim();
    const abaReq = (vq.data.aba ?? 'TODAS').trim();
    const modalidadeReq = (vq.data.modalidade ?? '').trim();
    const ano = Number(dataStr.slice(0, 4));

    const idPlanilha = config.sheets.spreadsheetId;
    if (!idPlanilha) {
      return res.status(400).json({ error: 'Planilha FLUXO BYLA não configurada.' });
    }

    const { names, error: abasError } = await listSheetNames(idPlanilha);
    if (abasError) {
      return res.json({
        meta: { data: dataStr, ano, aba: abaReq, modalidade: modalidadeReq || null },
        planilha: { total: 0, quantidade: 0, itens: [], erro: abasError },
        banco: { total: 0, quantidade: 0, itens: [] },
        validacao: {
          status_geral: 'atencao',
          qtd_confirmados: 0,
          qtd_nao_confirmados: 0,
          qtd_possivel_match: 0,
          delta_total_planilha_menos_banco: 0,
          itens_confirmados: [],
          itens_nao_confirmados: [],
          itens_possivel_match: [],
          itens_banco_sem_correspondencia: [],
        },
      });
    }

    const abasElegiveis = names.filter((n) => isEligibleSheet(n));
    const abasSelecionadas =
      normalizeText(abaReq) === 'TODAS'
        ? abasElegiveis
        : abasElegiveis.filter((a) => normalizeText(a) === normalizeText(abaReq) || normalizeText(a).includes(normalizeText(abaReq)));

    const planilhaItens: PlanilhaItem[] = [];
    for (const aba of abasSelecionadas) {
      const { alunos, error } = await lerPagamentosPorAbaEAno(aba, ano);
      if (error) continue;
      for (const a of alunos) {
        const mod = a.modalidade ?? aba;
        if (modalidadeReq && normalizeText(mod) !== normalizeText(modalidadeReq)) continue;
        for (const p of a.pagamentos ?? []) {
          if (!sameDayISO(p.data, dataStr)) continue;
          planilhaItens.push({
            id: `${aba}::${a.linha}::${a.aluno}::${p.data}::${p.valor}::${p.forma}`,
            aba,
            modalidade: mod,
            aluno: a.aluno,
            linha: a.linha,
            data: p.data,
            forma: p.forma,
            valor: Number(p.valor || 0),
            mesCompetencia: Number((p as { mesCompetencia?: number; mes?: number }).mesCompetencia ?? p.mes ?? 0),
            anoCompetencia: Number((p as { anoCompetencia?: number; ano?: number }).anoCompetencia ?? p.ano ?? 0),
            responsaveis: Array.isArray((p as { responsaveis?: string[] }).responsaveis) ? ((p as { responsaveis?: string[] }).responsaveis as string[]) : [],
            pagadorPix: (p as { pagadorPix?: string }).pagadorPix ? String((p as { pagadorPix?: string }).pagadorPix) : undefined,
          });
        }
      }
    }

    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

    const flexDays = businessRules.conciliacao.bancoJanelaDias;
    const bancoDataSet = new Set<string>();
    for (let d = -flexDays; d <= flexDays; d++) bancoDataSet.add(shiftISODate(dataStr, d));

    const { data: bancoRows, error: bancoError } = await supabase
      .from('transacoes')
      .select('id, data, pessoa, valor, descricao, tipo')
      .in('data', Array.from(bancoDataSet))
      .order('id', { ascending: false });

    if (bancoError) return res.status(502).json({ error: bancoError.message });

    const todas = (bancoRows ?? []) as { id: string; data: string; pessoa: string; valor: number; descricao: string | null; tipo: string }[];
    const { entradas } = filtrarTransacoesOficiais(todas);
    const bancoItens: BancoItem[] = entradas.map((r) => ({
      id: r.id,
      data: r.data,
      pessoa: r.pessoa ?? '',
      descricao: r.descricao ?? null,
      valor: Number(r.valor || 0),
    }));

    const usadosBanco = new Set<string>();
    const itensConfirmados: Array<{ planilha: PlanilhaItem; banco: BancoItem }> = [];
    const itensNaoConfirmados: PlanilhaItem[] = [];
    const itensPossivelMatch: Array<{ planilha: PlanilhaItem; candidatos: BancoItem[] }> = [];

    const needsPilatesPagador = planilhaItens.some((it) => normalizeText(it.aba).includes('PILATES') || normalizeText(it.modalidade).includes('PILATES'));
    const pilatesNomePagadorRows: PilatesNomePagadorRow[] = [];
    if (needsPilatesPagador) {
      const { data: rows, error } = await supabase
        .from('v_mensalidades_por_atividade')
        .select('aluno_nome, nome_pagador, valor, forma_pagamento, atividade_nome')
        .eq('data_pagamento', dataStr);
      if (!error && Array.isArray(rows)) {
        for (const r of rows as Record<string, unknown>[]) {
          const atividadeNome = normalizeText(String(r.atividade_nome ?? ''));
          if (!atividadeNome.includes('PILATES')) continue;
          pilatesNomePagadorRows.push({
            aluno_nome: (r.aluno_nome as string) ?? null,
            nome_pagador: (r.nome_pagador as string) ?? null,
            valor: r.valor != null ? Number(r.valor) : null,
            forma_pagamento: (r.forma_pagamento as string) ?? null,
            atividade_nome: (r.atividade_nome as string) ?? null,
          });
        }
      }
    }

    for (const p of planilhaItens) {
      const match = matchUmPagamentoPlanilhaBanco(p, bancoItens, usadosBanco, pilatesNomePagadorRows);
      if (match.status === 'confirmado') {
        usadosBanco.add(match.banco.id);
        itensConfirmados.push({ planilha: p, banco: match.banco });
      } else if (match.status === 'possivel') {
        itensPossivelMatch.push({ planilha: p, candidatos: match.candidatos });
      } else {
        itensNaoConfirmados.push(p);
      }
    }

    // Excecoes (varias linhas planilha -> uma entrada no banco): NUNCA misturar com itens ja "possivel" (ambiguidade 1:1).
    // So tentamos agregar entre itens que falharam 1:1 (nao confirmados).
    const possiveisPorPlanilhaId = new Map<string, { planilha: PlanilhaItem; candidatos: BancoItem[] }>();
    for (const x of itensPossivelMatch) {
      possiveisPorPlanilhaId.set(x.planilha.id, { planilha: x.planilha, candidatos: [...x.candidatos] });
    }
    const pendentes = itensNaoConfirmados;
    const gruposPendentes = new Map<string, PlanilhaItem[]>();
    /**
     * Chaves apenas para excecoes acordadas:
     * - Mesmo aluno, mesmo dia, mesma aba (duas+ linhas na mesma folha).
     * - Mesmo aluno, mesmo dia, em qualquer aba (uma atividade em Ballet + outra em Pilates = um PIX so).
     * - Mesmo pagador PIX, mesmo dia, em qualquer aba (pai/avo paga um valor unico para dois ou mais alunos).
     * Nao usar "responsaveis" generico (gera grupos espurios entre familias diferentes).
     */
    const keysDeAgrupamentoExcecoes = (p: PlanilhaItem): string[] => {
      const keys = new Set<string>();
      const baseData = p.data.slice(0, 10);
      const aluno = normalizeText(p.aluno);
      const aba = normalizeText(p.aba);
      keys.add(`aba::${aba}::${baseData}::aluno::${aluno}`);
      keys.add(`global::${baseData}::aluno::${aluno}`);
      const pg = p.pagadorPix ? normalizeText(p.pagadorPix) : '';
      if (pg.length > 0) keys.add(`global::${baseData}::pagador::${pg}`);
      return Array.from(keys);
    };
    for (const p of pendentes) {
      for (const key of keysDeAgrupamentoExcecoes(p)) {
        const arr = gruposPendentes.get(key) ?? [];
        arr.push(p);
        gruposPendentes.set(key, arr);
      }
    }
    const idsConvertidosParaPossivel = new Set<string>();
    const gruposJaProcessados = new Set<string>();
    for (const grupoRaw of gruposPendentes.values()) {
      const byId = new Map<string, PlanilhaItem>();
      for (const p of grupoRaw) byId.set(p.id, p);
      const grupo = Array.from(byId.values());
      if (grupo.length < 2) continue;
      const assinatura = grupo
        .map((p) => p.id)
        .sort((a, b) => a.localeCompare(b))
        .join('||');
      if (gruposJaProcessados.has(assinatura)) continue;
      gruposJaProcessados.add(assinatura);
      const aggMatch = matchPagamentosAgrupadosPlanilhaBanco(grupo, bancoItens, usadosBanco, pilatesNomePagadorRows);
      if (aggMatch.status !== 'possivel') continue;
      for (const p of grupo) {
        idsConvertidosParaPossivel.add(p.id);
        const existente = possiveisPorPlanilhaId.get(p.id);
        if (!existente) {
          possiveisPorPlanilhaId.set(p.id, { planilha: p, candidatos: [...aggMatch.candidatos] });
          continue;
        }
        const byId = new Map<string, BancoItem>();
        for (const c of existente.candidatos) byId.set(c.id, c);
        for (const c of aggMatch.candidatos) byId.set(c.id, c);
        existente.candidatos = Array.from(byId.values());
      }
    }
    const itensPossivelMatchFinais = Array.from(possiveisPorPlanilhaId.values());
    const itensNaoConfirmadosFinais = itensNaoConfirmados.filter((p) => !idsConvertidosParaPossivel.has(p.id) && !possiveisPorPlanilhaId.has(p.id));

    const itensBancoSemCorrespondencia = bancoItens.filter((b) => !usadosBanco.has(b.id));
    const totalPlanilha = planilhaItens.reduce((s, x) => s + Number(x.valor || 0), 0);
    const bancoMatchIds = new Set<string>();
    for (const c of itensConfirmados) bancoMatchIds.add(c.banco.id);
    for (const x of itensPossivelMatchFinais) for (const cand of x.candidatos) bancoMatchIds.add(cand.id);
    const bancoItensMatch = bancoItens.filter((b) => bancoMatchIds.has(b.id));
    const totalBancoMatch = bancoItensMatch.reduce((s, x) => s + Number(x.valor || 0), 0);
    const bancoItensDiaExibicao = bancoItens.filter((b) => b.data === dataStr);
    const delta = totalPlanilha - totalBancoMatch;
    const statusGeral = itensNaoConfirmadosFinais.length > 0 ? 'divergente' : itensPossivelMatchFinais.length > 0 ? 'atencao' : 'ok';

    const payload = {
      meta: { data: dataStr, ano, aba: normalizeText(abaReq) === 'TODAS' ? 'TODAS' : abaReq, abas_consideradas: abasSelecionadas, modalidade: modalidadeReq || null },
      planilha: { total: totalPlanilha, quantidade: planilhaItens.length, itens: planilhaItens },
      banco: { total: totalBancoMatch, quantidade: bancoItensMatch.length, itens: bancoItensDiaExibicao },
      validacao: {
        status_geral: statusGeral,
        qtd_confirmados: itensConfirmados.length,
        qtd_nao_confirmados: itensNaoConfirmadosFinais.length,
        qtd_possivel_match: itensPossivelMatchFinais.length,
        delta_total_planilha_menos_banco: delta,
        itens_confirmados: itensConfirmados,
        itens_nao_confirmados: itensNaoConfirmadosFinais,
        itens_possivel_match: itensPossivelMatchFinais,
        itens_banco_sem_correspondencia: itensBancoSemCorrespondencia,
      },
    };

    if (req.authUser?.role === 'secretaria') {
      return res.json({
        ...payload,
        banco: { total: 0, quantidade: 0, itens: [] },
        validacao: {
          ...payload.validacao,
          itens_confirmados: payload.validacao.itens_confirmados.map((item) => ({ planilha: item.planilha })),
          itens_possivel_match: payload.validacao.itens_possivel_match.map((item) => ({ planilha: item.planilha })),
          itens_banco_sem_correspondencia: [],
        },
      });
    }

    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/conciliacao-vencimentos', async (req: Request, res: Response) => {
  try {
    const mq = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
    if (!mq.ok) {
      return res.status(400).json({ error: mq.message });
    }
    const { mes, ano } = mq.data;
    try {
      const result = await getConciliacaoVencimentosMesData(mes, ano);
      return res.json(result);
    } catch (err) {
      if (err instanceof ConciliacaoVencimentosMesError) {
        return res.status(err.statusCode).json({ error: err.message, ...(err.body ?? {}) });
      }
      throw err;
    }
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;

