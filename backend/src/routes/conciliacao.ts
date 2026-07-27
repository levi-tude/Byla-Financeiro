import { Router, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import { businessRules } from '../businessRules.js';
import { carregarItensPlanilhaParaValidacao } from '../services/fluxoValidacaoPlanilhaItens.js';
import { filtrarTransacoesOficiais } from '../services/transacoesFiltro.js';
import { normalizeText } from '../logic/conciliacaoTexto.js';
import {
  matchUmPagamentoPlanilhaBanco,
  matchPagamentosAgrupadosPlanilhaBanco,
  reconciliarAmbiguidadeValorValidacao,
  resolverColisoesPossivelMatch,
  candidatosVendasCreditoRecorrente,
  datasCarregamentoBancoValidacaoDiaria,
  aplicarVinculosEExclusividadeBanco,
  type PlanilhaItem,
  type BancoItem,
  type MatchValidacaoPreliminar,
  type PilatesNomePagadorRow,
} from '../logic/conciliacaoPagamentoMatch.js';
import { enriquecerPlanilhaComPagadoresAprendidos, alunoNormKey } from '../logic/alunoPagadorMatch.js';
import { familiaPagamentoChave } from '../logic/gruposFamiliaPagamento.js';
import { listMapeamentoAlunoPagadorAtivos } from '../services/mapeamentoAlunoPagador.js';
import { carregarGruposFamiliaNoMatch } from '../services/gruposFamiliaPagamento.js';
import { listVinculosDia } from '../services/validacaoVinculos.js';
import {
  mesclarVinculosComAutoGravados,
  persistirConfirmadosAutomaticosValidacao,
} from '../services/autoPersistirVinculosValidacao.js';
import { mesAnoQuerySchema, parseQuery, validacaoPagamentosDiariaQuerySchema } from '../validation/apiQuery.js';
import {
  getConciliacaoVencimentosMesData,
  ConciliacaoVencimentosMesError,
} from '../services/conciliacaoVencimentosMes.js';
import {
  getConciliacaoPagamentosMes,
  stripCamposBancariosConciliacao,
} from '../services/conciliacaoPagamentosMes.js';

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

    const carregado = await carregarItensPlanilhaParaValidacao({
      dataStr,
      abaReq,
      modalidadeReq,
    });
    const planilhaItens: PlanilhaItem[] = carregado.itens;
    if (carregado.erro && planilhaItens.length === 0) {
      return res.json({
        meta: {
          data: dataStr,
          ano,
          aba: abaReq,
          modalidade: modalidadeReq || null,
          fonte_pagamentos: carregado.fonte,
        },
        planilha: { total: 0, quantidade: 0, itens: [], erro: carregado.erro },
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

    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

    const flexDays = businessRules.conciliacao.bancoJanelaDias;
    const bancoDataSet = datasCarregamentoBancoValidacaoDiaria(dataStr, flexDays);

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
    const preliminares: MatchValidacaoPreliminar[] = [];

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

    await carregarGruposFamiliaNoMatch(supabase);
    const regrasAlunoPagador = await listMapeamentoAlunoPagadorAtivos(supabase).catch(() => []);
    const planilhaParaMatch = planilhaItens.map((p) =>
      enriquecerPlanilhaComPagadoresAprendidos(p, regrasAlunoPagador),
    );

    for (const p of planilhaParaMatch) {
      const match = matchUmPagamentoPlanilhaBanco(p, bancoItens, new Set<string>(), pilatesNomePagadorRows);
      if (match.status === 'confirmado') {
        preliminares.push({ status: 'confirmado', planilha: p, banco: match.banco });
      } else if (match.status === 'possivel') {
        preliminares.push({ status: 'possivel', planilha: p, candidatos: match.candidatos });
      } else {
        preliminares.push({ status: 'nao', planilha: p });
      }
    }

    const reconciliado = reconciliarAmbiguidadeValorValidacao(
      preliminares,
      businessRules.conciliacao.valorTolerancia,
    );
    const itensConfirmados = reconciliado.confirmados;
    for (const c of itensConfirmados) usadosBanco.add(c.banco.id);
    const itensPossivelMatch = reconciliado.possiveis;
    const itensNaoConfirmados = reconciliado.nao;

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
     * - Mesmo pagador PIX ou responsável (≥5 chars), mesmo dia (pai/mãe/cônjuge paga um valor unico).
     * - Grupo familiar sticky (catálogo no Supabase: família/casal).
     */
    const keysDeAgrupamentoExcecoes = (p: PlanilhaItem): string[] => {
      const keys = new Set<string>();
      const baseData = p.data.slice(0, 10);
      const aluno = normalizeText(p.aluno);
      const aba = normalizeText(p.aba);
      keys.add(`aba::${aba}::${baseData}::aluno::${aluno}`);
      keys.add(`global::${baseData}::aluno::${aluno}`);
      const fam = familiaPagamentoChave(p.aluno);
      if (fam) keys.add(`global::${baseData}::familia::${fam}`);
      const pg = p.pagadorPix ? normalizeText(p.pagadorPix) : '';
      if (pg.length >= 5) keys.add(`global::${baseData}::pagador::${pg}`);
      for (const r of p.responsaveis ?? []) {
        const rn = normalizeText(r);
        if (rn.length >= 5) keys.add(`global::${baseData}::pagador::${rn}`);
      }
      for (const r of regrasAlunoPagador) {
        if (r.aluno_normalizado !== alunoNormKey(p.aluno)) continue;
        if (r.pessoa_banco_normalizada) {
          keys.add(`global::${baseData}::sticky::${r.pessoa_banco_normalizada}`);
        }
      }
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
    const itensPossivelMatchFinaisRaw = Array.from(possiveisPorPlanilhaId.values());
    const colisoes = resolverColisoesPossivelMatch(
      itensPossivelMatchFinaisRaw,
      businessRules.conciliacao.valorTolerancia,
    );
    const itensPossivelMatchFinais = colisoes.rows;
    const itensNaoConfirmadosFinaisRaw = [
      ...itensNaoConfirmados.filter(
        (p) => !idsConvertidosParaPossivel.has(p.id) && !possiveisPorPlanilhaId.has(p.id),
      ),
      ...colisoes.demovidos,
    ];
    const itensNaoConfirmadosFinais: PlanilhaItem[] = [];
    const possivelVendasPosColisao: Array<{ planilha: PlanilhaItem; candidatos: BancoItem[] }> = [];
    for (const p of itensNaoConfirmadosFinaisRaw) {
      const vendas = candidatosVendasCreditoRecorrente(p, bancoItens, usadosBanco);
      if (vendas.length > 0) {
        possivelVendasPosColisao.push({ planilha: p, candidatos: vendas });
      } else {
        itensNaoConfirmadosFinais.push(p);
      }
    }
    const itensPossivelMatchComVendas = [...itensPossivelMatchFinais, ...possivelVendasPosColisao];

    const mesRef = Number(dataStr.slice(5, 7));
    const vinculosDia = await listVinculosDia(dataStr, mesRef, ano).catch(() => []);
    // Match inequívoco (1 candidato) → grava vínculo para o Fluxo/sticky alinharem com a Validação.
    const autoPersist = await persistirConfirmadosAutomaticosValidacao({
      dataRef: dataStr,
      mes: mesRef,
      ano,
      confirmados: itensConfirmados.map((c) => ({
        planilhaId: c.planilha.id,
        bancoId: c.banco.id,
      })),
      vinculosExistentes: vinculosDia.map((v) => ({
        planilha_id: v.planilha_id,
        banco_id: v.banco_id,
      })),
      supabase,
    }).catch(() => ({ gravados: [], erros: [] as string[] }));
    const vinculosParaMatch = mesclarVinculosComAutoGravados(vinculosDia, autoPersist.gravados);
    const posVinculos = aplicarVinculosEExclusividadeBanco({
      vinculos: vinculosParaMatch,
      planilhas: planilhaItens,
      bancoItens,
      confirmados: itensConfirmados,
      possiveis: itensPossivelMatchComVendas,
      nao: itensNaoConfirmadosFinais,
      tol: businessRules.conciliacao.valorTolerancia,
    });
    const itensConfirmadosFinais = posVinculos.confirmados;
    const itensPossivelMatchPosVinculos = posVinculos.possiveis;
    const itensNaoConfirmadosPosVinculos = posVinculos.nao;

    const usadosBancoPosVinculos = new Set<string>();
    for (const c of itensConfirmadosFinais) usadosBancoPosVinculos.add(c.banco.id);

    const itensBancoSemCorrespondencia = bancoItens.filter((b) => !usadosBancoPosVinculos.has(b.id));
    const totalPlanilha = planilhaItens.reduce((s, x) => s + Number(x.valor || 0), 0);
    const bancoMatchIds = new Set<string>();
    for (const c of itensConfirmadosFinais) bancoMatchIds.add(c.banco.id);
    for (const x of itensPossivelMatchPosVinculos) for (const cand of x.candidatos) bancoMatchIds.add(cand.id);
    const bancoItensMatch = bancoItens.filter((b) => bancoMatchIds.has(b.id));
    const totalBancoMatch = bancoItensMatch.reduce((s, x) => s + Number(x.valor || 0), 0);
    const bancoItensDiaExibicao = bancoItens.filter((b) => b.data === dataStr);
    const delta = totalPlanilha - totalBancoMatch;
    const statusGeral =
      itensNaoConfirmadosPosVinculos.length > 0
        ? 'divergente'
        : itensPossivelMatchPosVinculos.length > 0
          ? 'atencao'
          : 'ok';

    const payload = {
      meta: {
        data: dataStr,
        ano,
        aba: normalizeText(abaReq) === 'TODAS' ? 'TODAS' : abaReq,
        modalidade: modalidadeReq || null,
        fonte_pagamentos: carregado.fonte,
      },
      planilha: { total: totalPlanilha, quantidade: planilhaItens.length, itens: planilhaItens },
      banco: { total: totalBancoMatch, quantidade: bancoItensMatch.length, itens: bancoItensDiaExibicao },
      validacao: {
        status_geral: statusGeral,
        qtd_confirmados: itensConfirmadosFinais.length,
        qtd_nao_confirmados: itensNaoConfirmadosPosVinculos.length,
        qtd_possivel_match: itensPossivelMatchPosVinculos.length,
        delta_total_planilha_menos_banco: delta,
        itens_confirmados: itensConfirmadosFinais,
        itens_nao_confirmados: itensNaoConfirmadosPosVinculos,
        itens_possivel_match: itensPossivelMatchPosVinculos,
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

router.get('/conciliacao-pagamentos', async (req: Request, res: Response) => {
  try {
    const mq = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
    if (!mq.ok) return res.status(400).json({ error: mq.message });
    const { mes, ano } = mq.data;
    const role = req.authUser?.role;
    if (role !== 'admin' && role !== 'secretaria') {
      return res.status(401).json({ error: 'Autenticação obrigatória.' });
    }
    const raw = await getConciliacaoPagamentosMes(mes, ano);
    const payload = stripCamposBancariosConciliacao(raw, role);
    return res.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Supabase')) return res.status(503).json({ error: msg });
    return res.status(500).json({ error: msg });
  }
});

export default router;

