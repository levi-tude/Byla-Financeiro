/**
 * Read-model Finanças → Alunos: pagamentos do Fluxo na competência (vinculados, match automático ou pendentes).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { competenciaAlinhaData, labelCompetencia } from '../domain/competencia/competenciaTransacao.js';
import { fluxoUuidFromAnyPlanilhaId, planilhaIdFromFluxoUuid } from '../logic/fluxoPagamentoFingerprint.js';
import {
  matchUmPagamentoPlanilhaBanco,
  type BancoItem,
  type PlanilhaItem,
} from '../logic/conciliacaoPagamentoMatch.js';
import {
  classificarStatusConciliacao,
  isPlanoBolsaConciliacao,
  parseDiaVencimentoCadastro,
  type ConciliacaoPagamentoStatus,
} from '../logic/conciliacaoStatusExtrato.js';
import {
  inferirMeioPagamentoFluxo,
  inferirMeioPagamentoVinculo,
  type MeioPagamentoAluno,
} from '../logic/meioPagamentoVinculo.js';
import { isFormaPagamentoDinheiro } from '../logic/pagamentoDinheiroFluxo.js';
import { normalizeText } from '../logic/conciliacaoTexto.js';
import { filtrarTransacoesOficiais, type TransacaoBase } from './transacoesFiltro.js';
import { getSupabase } from './supabaseClient.js';
import { listVinculosPorPlanilhaIds } from './validacaoVinculos.js';

export type FinancasAlunoBancoStatus = 'vinculo' | 'match' | 'dinheiro' | 'nenhum';
/** Filtro de reconhecimento bancário: vínculo manual ou match automático. */
export type FinancasAlunoVinculoFiltro = 'todos' | 'vinculado' | 'sem_vinculo';

export type FinancasAlunoPagamento = {
  data_pagamento: string | null;
  data_banco: string | null;
  aba: string;
  modalidade: string;
  valor: number;
  meio: MeioPagamentoAluno;
  banco_status: FinancasAlunoBancoStatus;
  status_conciliacao: ConciliacaoPagamentoStatus;
  aviso_competencia?: string | null;
};

export type FinancasAlunoGrupo = {
  aluno_exibicao: string;
  aba: string;
  modalidade: string;
  pagamentos: FinancasAlunoPagamento[];
};

export type FinancasAlunoVinculoFixture = {
  planilha_id: string;
  banco_id: string;
};

export type FinancasAlunoAlunoFixture = {
  aba: string;
  aluno_nome: string;
  venc: string | null;
  plano: string | null;
};

export type FinancasAlunoFluxoFixture = {
  id: string;
  aluno_nome: string;
  aba: string;
  modalidade: string;
  data_pagamento: string | null;
  forma: string | null;
  valor: number;
  mes_competencia: number;
  ano_competencia: number;
  responsaveis: string | null;
  pagador_pix: string | null;
  linha_planilha?: number;
};

export type FinancasAlunoBancoFixture = {
  id: string;
  data: string;
  pessoa: string;
  descricao: string | null;
  valor: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ultimoDiaMes(mes: number, ano: number): number {
  return new Date(ano, mes, 0).getDate();
}

function chaveGrupo(aluno: string, aba: string, modalidade: string): string {
  return `${normalizeText(aluno)}|${normalizeText(aba)}|${normalizeText(modalidade)}`;
}

function chaveAlunoAba(aba: string, alunoNome: string): string {
  return `${normalizeText(aba)}|${normalizeText(alunoNome)}`;
}

function avisoCompetencia(dataBanco: string | null, mes: number, ano: number): string | null {
  if (!dataBanco) return null;
  if (competenciaAlinhaData(dataBanco, mes, ano)) return null;
  return (
    `Este pagamento pertence à competência de ${labelCompetencia(mes, ano)}; ` +
    'a data no banco é de outro mês.'
  );
}

function toBancoItem(t: FinancasAlunoBancoFixture | TransacaoBase | BancoItem): BancoItem {
  return {
    id: t.id,
    data: String(t.data).slice(0, 10),
    pessoa: t.pessoa ?? '',
    descricao: 'descricao' in t ? (t.descricao ?? null) : null,
    valor: Number(t.valor || 0),
  };
}

function pagamentoToPlanilhaItem(
  pag: FinancasAlunoFluxoFixture,
  mes: number,
  ano: number,
): PlanilhaItem {
  const dataPg = (pag.data_pagamento ?? '').slice(0, 10);
  const fallbackData = `${ano}-${pad2(mes)}-01`;
  return {
    id: planilhaIdFromFluxoUuid(String(pag.id)),
    aba: String(pag.aba ?? ''),
    modalidade: String(pag.modalidade ?? pag.aba ?? ''),
    aluno: String(pag.aluno_nome ?? ''),
    linha: Number(pag.linha_planilha ?? 0),
    data: dataPg || fallbackData,
    forma: pag.forma != null ? String(pag.forma) : '',
    valor: Number(pag.valor || 0),
    mesCompetencia: Number(pag.mes_competencia || mes),
    anoCompetencia: Number(pag.ano_competencia || ano),
    responsaveis: pag.responsaveis ? [String(pag.responsaveis)] : [],
    pagadorPix: pag.pagador_pix ? String(pag.pagador_pix) : undefined,
  };
}

type CreditoResolvido = {
  banco: BancoItem;
  banco_status: 'vinculo' | 'match' | 'dinheiro';
};

function resolverCreditoPagamento(params: {
  pag: FinancasAlunoFluxoFixture;
  mes: number;
  ano: number;
  vinculoByFluxoId: Map<string, FinancasAlunoVinculoFixture>;
  bancosById: Map<string, BancoItem>;
  entradasLista: BancoItem[];
  usadosBanco: Set<string>;
}): CreditoResolvido | null {
  const { pag, mes, ano, vinculoByFluxoId, bancosById, entradasLista, usadosBanco } = params;

  if (isFormaPagamentoDinheiro(pag.forma)) {
    const dataPg = (pag.data_pagamento ?? '').slice(0, 10);
    if (!dataPg) return null;
    return {
      banco: {
        id: `dinheiro::${pag.id}`,
        data: dataPg,
        pessoa: 'Pagamento em dinheiro',
        descricao: null,
        valor: Number(pag.valor || 0),
      },
      banco_status: 'dinheiro',
    };
  }

  const vinculo = vinculoByFluxoId.get(pag.id);
  if (vinculo) {
    const banco = bancosById.get(vinculo.banco_id);
    if (banco) {
      usadosBanco.add(banco.id);
      return { banco, banco_status: 'vinculo' };
    }
  }

  const planilha = pagamentoToPlanilhaItem(pag, mes, ano);
  const match = matchUmPagamentoPlanilhaBanco(planilha, entradasLista, usadosBanco, []);
  if (match.status !== 'confirmado') return null;
  usadosBanco.add(match.banco.id);
  return { banco: match.banco, banco_status: 'match' };
}

function temReconhecimentoBanco(status: FinancasAlunoBancoStatus): boolean {
  return status === 'vinculo' || status === 'match' || status === 'dinheiro';
}

/**
 * Agrupamento puro (fixtures) — usado pelos testes e por montarFinancasAlunos.
 */
export function agruparFinancasAlunos(input: {
  mes: number;
  ano: number;
  alunos?: FinancasAlunoAlunoFixture[];
  vinculos: FinancasAlunoVinculoFixture[];
  fluxo: FinancasAlunoFluxoFixture[];
  bancos: FinancasAlunoBancoFixture[];
  entradas?: Array<FinancasAlunoBancoFixture | TransacaoBase | BancoItem>;
  filtroMeio?: MeioPagamentoAluno;
  filtroVinculo?: FinancasAlunoVinculoFiltro;
}): FinancasAlunoGrupo[] {
  const { mes, ano, vinculos, fluxo, bancos, filtroMeio, filtroVinculo = 'todos' } = input;

  const bancosById = new Map<string, BancoItem>();
  for (const b of bancos) bancosById.set(b.id, toBancoItem(b));
  const entradasExtra = (input.entradas ?? bancos).map(toBancoItem);
  for (const e of entradasExtra) {
    if (!bancosById.has(e.id)) bancosById.set(e.id, e);
  }
  const entradasLista = [...bancosById.values()];

  const alunosByKey = new Map<string, FinancasAlunoAlunoFixture>();
  for (const a of input.alunos ?? []) {
    alunosByKey.set(chaveAlunoAba(a.aba, a.aluno_nome), a);
  }

  const vinculoByFluxoId = new Map<string, FinancasAlunoVinculoFixture>();
  for (const v of vinculos) {
    const fluxoUuid = fluxoUuidFromAnyPlanilhaId(v.planilha_id);
    if (fluxoUuid) vinculoByFluxoId.set(fluxoUuid, v);
  }

  const fluxoMes = fluxo.filter(
    (p) => Number(p.mes_competencia) === mes && Number(p.ano_competencia) === ano,
  );
  fluxoMes.sort((a, b) => {
    const da = (a.data_pagamento ?? '').localeCompare(b.data_pagamento ?? '');
    if (da !== 0) return da;
    return String(a.aluno_nome ?? '').localeCompare(String(b.aluno_nome ?? ''), 'pt-BR');
  });

  const usadosBanco = new Set<string>();
  const gruposMap = new Map<string, FinancasAlunoGrupo>();

  for (const pag of fluxoMes) {
    const credito = resolverCreditoPagamento({
      pag,
      mes,
      ano,
      vinculoByFluxoId,
      bancosById,
      entradasLista,
      usadosBanco,
    });

    const bancoStatus: FinancasAlunoBancoStatus = credito?.banco_status ?? 'nenhum';
    const reconhecido = temReconhecimentoBanco(bancoStatus);

    if (filtroVinculo === 'vinculado' && !reconhecido) continue;
    if (filtroVinculo === 'sem_vinculo' && reconhecido) continue;

    const banco = credito?.banco;
    const dataBanco = banco ? banco.data.slice(0, 10) : null;

    const meio =
      bancoStatus === 'dinheiro'
        ? inferirMeioPagamentoFluxo(pag.forma)
        : inferirMeioPagamentoVinculo({
            pessoa: banco?.pessoa ?? '',
            descricao: banco?.descricao ?? null,
            forma: pag.forma,
          });

    if (filtroMeio && meio !== filtroMeio) continue;

    const alunoCadastro = alunosByKey.get(chaveAlunoAba(pag.aba, pag.aluno_nome));
    const statusConciliacao = classificarStatusConciliacao({
      diaVencimento: parseDiaVencimentoCadastro(alunoCadastro?.venc),
      dataCreditoIso: dataBanco,
      mes,
      ano,
      planoBolsa: isPlanoBolsaConciliacao(alunoCadastro?.plano),
    });

    const aluno = String(pag.aluno_nome ?? '');
    const aba = String(pag.aba ?? '');
    const modalidade = String(pag.modalidade ?? pag.aba ?? '');
    const key = chaveGrupo(aluno, aba, modalidade);

    let grupo = gruposMap.get(key);
    if (!grupo) {
      grupo = { aluno_exibicao: aluno, aba, modalidade, pagamentos: [] };
      gruposMap.set(key, grupo);
    }

    grupo.pagamentos.push({
      data_pagamento: pag.data_pagamento ? String(pag.data_pagamento).slice(0, 10) : null,
      data_banco: dataBanco,
      aba,
      modalidade,
      valor: Number(pag.valor || 0),
      meio,
      banco_status: bancoStatus,
      status_conciliacao: statusConciliacao,
      aviso_competencia: avisoCompetencia(dataBanco, mes, ano),
    });
  }

  const grupos = Array.from(gruposMap.values());
  for (const g of grupos) {
    g.pagamentos.sort((a, b) => (a.data_pagamento ?? '').localeCompare(b.data_pagamento ?? ''));
  }
  grupos.sort(
    (a, b) =>
      a.aba.localeCompare(b.aba, 'pt-BR') ||
      a.modalidade.localeCompare(b.modalidade, 'pt-BR') ||
      a.aluno_exibicao.localeCompare(b.aluno_exibicao, 'pt-BR'),
  );
  return grupos;
}

export async function montarFinancasAlunos(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
  filtroMeio?: MeioPagamentoAluno,
  filtroVinculo: FinancasAlunoVinculoFiltro = 'todos',
): Promise<{ mes: number; ano: number; grupos: FinancasAlunoGrupo[] }> {
  const { data: fluxoRows, error: fErr } = await supabase
    .from('fluxo_pagamentos_operacionais')
    .select(
      'id, aluno_nome, aba, modalidade, data_pagamento, forma, valor, mes_competencia, ano_competencia, responsaveis, pagador_pix, linha_planilha',
    )
    .eq('mes_competencia', mes)
    .eq('ano_competencia', ano);
  if (fErr) throw new Error(fErr.message);

  const fluxo: FinancasAlunoFluxoFixture[] = ((fluxoRows ?? []) as Record<string, unknown>[]).map(
    (r) => ({
      id: String(r.id),
      aluno_nome: String(r.aluno_nome ?? ''),
      aba: String(r.aba ?? ''),
      modalidade: String(r.modalidade ?? r.aba ?? ''),
      data_pagamento: r.data_pagamento != null ? String(r.data_pagamento).slice(0, 10) : null,
      forma: r.forma != null ? String(r.forma) : null,
      valor: Number(r.valor || 0),
      mes_competencia: Number(r.mes_competencia || 0),
      ano_competencia: Number(r.ano_competencia || 0),
      responsaveis: r.responsaveis != null ? String(r.responsaveis) : null,
      pagador_pix: r.pagador_pix != null ? String(r.pagador_pix) : null,
      linha_planilha: r.linha_planilha != null ? Number(r.linha_planilha) : undefined,
    }),
  );

  const { data: alunosRows, error: alunosErr } = await supabase
    .from('fluxo_alunos_operacionais')
    .select('aba, aluno_nome, venc, plano')
    .eq('ativo', true)
    .limit(10000);
  if (alunosErr) throw new Error(alunosErr.message);

  const alunos: FinancasAlunoAlunoFixture[] = ((alunosRows ?? []) as Record<string, unknown>[]).map(
    (r) => ({
      aba: String(r.aba ?? ''),
      aluno_nome: String(r.aluno_nome ?? ''),
      venc: r.venc != null ? String(r.venc) : null,
      plano: r.plano != null ? String(r.plano) : null,
    }),
  );

  const planilhaIds = fluxo.map((p) => planilhaIdFromFluxoUuid(String(p.id)));
  const vinculosRaw = await listVinculosPorPlanilhaIds(planilhaIds);
  const vinculos: FinancasAlunoVinculoFixture[] = vinculosRaw.map((v) => ({
    planilha_id: v.planilha_id,
    banco_id: v.banco_id,
  }));

  const inicio = `${ano}-${pad2(mes)}-01`;
  const fim = `${ano}-${pad2(mes)}-${pad2(ultimoDiaMes(mes, ano))}`;
  const { data: txRows, error: txErr } = await supabase
    .from('transacoes')
    .select('id, data, pessoa, descricao, valor, tipo')
    .gte('data', inicio)
    .lte('data', fim)
    .order('id', { ascending: false })
    .limit(20000);
  if (txErr) throw new Error(txErr.message);

  const { entradas } = filtrarTransacoesOficiais((txRows ?? []) as TransacaoBase[]);

  const bancoIds = [...new Set(vinculos.map((v) => v.banco_id).filter(Boolean))];
  let bancos: FinancasAlunoBancoFixture[] = [];
  if (bancoIds.length > 0) {
    const { data, error } = await supabase
      .from('transacoes')
      .select('id, data, pessoa, descricao, valor')
      .in('id', bancoIds);
    if (error) throw new Error(error.message);
    bancos = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      data: String(r.data ?? '').slice(0, 10),
      pessoa: String(r.pessoa ?? ''),
      descricao: r.descricao != null ? String(r.descricao) : null,
      valor: Number(r.valor || 0),
    }));
  }

  const grupos = agruparFinancasAlunos({
    mes,
    ano,
    alunos,
    vinculos,
    fluxo,
    bancos,
    entradas,
    filtroMeio,
    filtroVinculo,
  });
  return { mes, ano, grupos };
}

/** Conveniência para a rota HTTP (usa cliente global). */
export async function getFinancasAlunos(
  mes: number,
  ano: number,
  filtroMeio?: MeioPagamentoAluno,
  filtroVinculo: FinancasAlunoVinculoFiltro = 'todos',
): Promise<{ mes: number; ano: number; grupos: FinancasAlunoGrupo[] }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado.');
  return montarFinancasAlunos(supabase, mes, ano, filtroMeio, filtroVinculo);
}
