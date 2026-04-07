import { Router, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import { listSheetNames } from '../services/sheetsService.js';
import { config } from '../config.js';
import { lerPagamentosPorAbaEAno } from '../services/planilhaPagamentos.js';
import { isEligibleSheet } from '../businessRules.js';
import { filtrarTransacoesOficiais } from '../services/transacoesFiltro.js';
import {
  dataIsoQuerySchema,
  mesAnoQuerySchema,
  parseBody,
  parseQuery,
  validacaoVinculoDeleteBodySchema,
  validacaoVinculoUpsertBodySchema,
} from '../validation/apiQuery.js';
import { listVinculosDia, listVinculosMes, removeVinculo, upsertVinculosDia } from '../services/validacaoVinculos.js';

type PlanilhaItem = {
  id: string;
  aba: string;
  modalidade: string;
  aluno: string;
  linha: number;
  data: string;
  forma: string;
  valor: number;
  mesCompetencia: number;
  anoCompetencia: number;
  responsaveis: string[];
  pagadorPix?: string;
};

type BancoItem = {
  id: string;
  data: string;
  pessoa: string;
  descricao: string | null;
  valor: number;
};

const router = Router();
type StatusValidacao = 'pendente' | 'ok' | 'atencao' | 'divergente';
function calcularStatusDerivado(totalBanco: number, qtdBanco: number, totalPlanilha: number, qtdPlanilha: number, qtdPlanilhaVinculada: number): StatusValidacao {
  if (qtdBanco === 0 && qtdPlanilha === 0) return 'pendente';
  if (qtdPlanilha > 0 && qtdPlanilhaVinculada >= qtdPlanilha) return 'ok';
  const delta = Math.abs(totalPlanilha - totalBanco);
  const toleranciaOk = Math.max(1, Math.round(totalPlanilha * 0.01)); // 1%
  const toleranciaAtencao = Math.max(5, Math.round(totalPlanilha * 0.05)); // 5%
  // Se os totais do dia batem (ou quase batem na tolerância), o dia deve ficar OK
  // mesmo sem vínculo manual já gravado, para alinhar com a leitura da validação diária.
  if (qtdPlanilha > 0 && qtdBanco > 0 && delta <= toleranciaOk) return 'ok';
  if (delta <= toleranciaAtencao) return 'atencao';
  return 'divergente';
}

/**
 * GET /api/calendario-financeiro?mes=3&ano=2026
 * Por dia do mês: entradas oficiais no banco vs pagamentos na planilha FLUXO BYLA pela data de pagamento.
 */
router.get('/calendario-financeiro', async (req: Request, res: Response) => {
  try {
    const parsed = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.message });
    }
    const { mes, ano } = parsed.data;

    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado.' });

    const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

    const { data: bancoRows, error: bancoError } = await supabase
      .from('transacoes')
      .select('id, data, pessoa, valor, descricao, tipo')
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: true })
      .order('id', { ascending: false })
      .limit(8000);

    if (bancoError) return res.status(502).json({ error: bancoError.message });

    const todas = (bancoRows ?? []) as {
      id: string;
      data: string;
      pessoa: string;
      valor: number;
      descricao: string | null;
      tipo: string;
    }[];
    const { entradas } = filtrarTransacoesOficiais(todas);
    const porDiaBanco = new Map<string, BancoItem[]>();
    for (const r of entradas) {
      const d = (r.data ?? '').slice(0, 10);
      const arr = porDiaBanco.get(d) ?? [];
      arr.push({
        id: r.id,
        data: r.data,
        pessoa: r.pessoa ?? '',
        descricao: r.descricao ?? null,
        valor: Number(r.valor || 0),
      });
      porDiaBanco.set(d, arr);
    }

    const idPlanilha = config.sheets.spreadsheetId;
    let planilha_aviso: string | undefined;
    const porDiaPlanilha = new Map<string, PlanilhaItem[]>();

    if (!idPlanilha) {
      planilha_aviso = 'Planilha FLUXO BYLA não configurada.';
    } else {
      const { names, error: abasError } = await listSheetNames(idPlanilha);
      if (abasError) {
        planilha_aviso = abasError;
      } else {
        const abasElegiveis = names.filter((n) => isEligibleSheet(n));
        const prefixMes = `${ano}-${String(mes).padStart(2, '0')}`;
        for (const aba of abasElegiveis) {
          const { alunos, error: errAba } = await lerPagamentosPorAbaEAno(aba, ano);
          if (errAba) continue;
          for (const a of alunos) {
            const mod = a.modalidade ?? aba;
            for (const p of a.pagamentos ?? []) {
              const pd = (p.data ?? '').slice(0, 10);
              if (!pd.startsWith(prefixMes)) continue;
              const item: PlanilhaItem = {
                id: `${aba}::${a.linha}::${a.aluno}::${p.data}::${p.valor}::${p.forma}`,
                aba,
                modalidade: mod,
                aluno: a.aluno,
                linha: a.linha,
                data: p.data,
                forma: p.forma,
                valor: Number(p.valor || 0),
                mesCompetencia: Number((p as { mesCompetencia?: number }).mesCompetencia ?? p.mes ?? 0),
                anoCompetencia: Number((p as { anoCompetencia?: number }).anoCompetencia ?? p.ano ?? 0),
                responsaveis: Array.isArray((p as { responsaveis?: string[] }).responsaveis)
                  ? (p as { responsaveis: string[] }).responsaveis
                  : [],
                pagadorPix: (p as { pagadorPix?: string }).pagadorPix
                  ? String((p as { pagadorPix?: string }).pagadorPix)
                  : undefined,
              };
              const arr = porDiaPlanilha.get(pd) ?? [];
              arr.push(item);
              porDiaPlanilha.set(pd, arr);
            }
          }
        }
      }
    }

    const vinculosMes = await listVinculosMes(mes, ano);
    const vinculosPorData = new Map<string, Set<string>>();
    for (const v of vinculosMes) {
      const k = v.data_ref.slice(0, 10);
      const set = vinculosPorData.get(k) ?? new Set<string>();
      set.add(v.planilha_id);
      vinculosPorData.set(k, set);
    }

    const dias: Array<{
      data: string;
      banco: { total: number; quantidade: number; itens: BancoItem[] };
      planilha: { total: number; quantidade: number; itens: PlanilhaItem[] };
      validacao: {
        status_final: StatusValidacao;
        qtd_planilha_vinculada: number;
      };
    }> = [];

    for (let day = 1; day <= ultimoDia; day++) {
      const data = `${ano}-${String(mes).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const bi = porDiaBanco.get(data) ?? [];
      const pi = porDiaPlanilha.get(data) ?? [];
      const totalB = bi.reduce((s, x) => s + x.valor, 0);
      const totalP = pi.reduce((s, x) => s + x.valor, 0);
      const planilhaIdsVinculadas = vinculosPorData.get(data) ?? new Set<string>();
      const qtdPlanilhaVinculada = pi.filter((p) => planilhaIdsVinculadas.has(p.id)).length;
      const statusFinal = calcularStatusDerivado(totalB, bi.length, totalP, pi.length, qtdPlanilhaVinculada);
      dias.push({
        data,
        banco: { total: totalB, quantidade: bi.length, itens: bi },
        planilha: { total: totalP, quantidade: pi.length, itens: pi },
        validacao: {
          status_final: statusFinal,
          qtd_planilha_vinculada: qtdPlanilhaVinculada,
        },
      });
    }

    const totais_mes = {
      banco: dias.reduce((s, d) => s + d.banco.total, 0),
      planilha: dias.reduce((s, d) => s + d.planilha.total, 0),
    };
    const status_contagem = dias.reduce(
      (acc, d) => {
        acc[d.validacao.status_final] += 1;
        return acc;
      },
      { pendente: 0, ok: 0, atencao: 0, divergente: 0 } as Record<StatusValidacao, number>,
    );

    res.json({
      mes,
      ano,
      dias,
      totais_mes,
      status_contagem,
      ...(planilha_aviso ? { planilha_aviso } : {}),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/validacao-vinculos', async (req: Request, res: Response) => {
  try {
    const qData = parseQuery(dataIsoQuerySchema, req.query as Record<string, unknown>);
    const qMesAno = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
    if (!qData.ok) return res.status(400).json({ error: qData.message });
    if (!qMesAno.ok) return res.status(400).json({ error: qMesAno.message });
    const { data } = qData.data;
    const { mes, ano } = qMesAno.data;
    const itens = await listVinculosDia(data, mes, ano);
    return res.json({ data, mes, ano, itens });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/validacao-vinculos', async (req: Request, res: Response) => {
  try {
    const parsed = parseBody(validacaoVinculoUpsertBodySchema, req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message });
    const { data, mes, ano, banco_id, planilha_ids, observacao } = parsed.data;
    const result = await upsertVinculosDia(data, mes, ano, banco_id, planilha_ids, observacao);
    return res.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('já vinculada')) return res.status(409).json({ error: msg });
    return res.status(500).json({ error: msg });
  }
});

router.delete('/validacao-vinculos', async (req: Request, res: Response) => {
  try {
    const parsed = parseBody(validacaoVinculoDeleteBodySchema, req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.message });
    const { planilha_id } = parsed.data;
    const result = await removeVinculo(planilha_id);
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;

