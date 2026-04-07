/**
 * Montagem de payloads de relatórios além do mensal básico (R2, R4).
 */

import { getSupabase } from './supabaseClient.js';
import { listSheetNames } from './sheetsService.js';
import { config } from '../config.js';
import { lerPagamentosPorAbaEAno, type PagamentoPlanilha, type PagamentosAluno } from './planilhaPagamentos.js';
import { isEligibleSheet } from '../businessRules.js';
import { filtrarTransacoesOficiais } from './transacoesFiltro.js';
import type { GetFluxoCompletoResult } from '../useCases/GetFluxoCompletoUseCase.js';
import { PROMPT_VERSION_RELATORIOS } from '../relatorios/relatoriosPrompts.js';
import {
  flattenEntradasPorFontePlanilha,
  montarControleCaixaLeituraGestao,
  totaisAgregadosPorBlocoSaida,
} from '../relatorios/controleCaixaGestao.js';

function mesRange(mes: number, ano: number): { inicio: string; fim: string } {
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  return { inicio, fim };
}

const MESES_NOMES: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Soma valores cujo mês de competência (calendário da planilha) = mês/ano escolhidos no relatório.
 * Inclui retrocompat: triplet antigo sem ano na linha de meses gerava anoCompetencia = ano−1; se a data do pagamento é do ano consultado, conta.
 */
function somaMensalidadeCompetencia(pagamentos: PagamentoPlanilha[], mesRef: number, ano: number): number {
  let s = 0;
  for (const p of pagamentos) {
    if (p.mesCompetencia !== mesRef) continue;
    const yComp = typeof p.anoCompetencia === 'number' ? p.anoCompetencia : p.ano;
    if (yComp === ano) {
      s += p.valor;
      continue;
    }
    if (yComp === ano - 1 && p.ano === ano) {
      s += p.valor;
    }
  }
  return round2(s);
}

/** R2: mensal operacional — agregações planilha + banco no mês (usa um único `fluxoResult` já carregado). */
export async function montarMensalOperacional(
  mes: number,
  ano: number,
  fluxoResult: GetFluxoCompletoResult,
  opts: {
    totalOficialEntradas: number;
    totalOficialSaidas: number;
    totalOficialSaldo: number;
  },
): Promise<Record<string, unknown>> {
  const { inicio, fim } = mesRange(mes, ano);

  const supabase = getSupabase();
  let porDiaEntrada: { data: string; total: number }[] = [];
  let topPessoasEntrada: { pessoa: string; total: number }[] = [];
  let topPessoasSaida: { pessoa: string; total: number }[] = [];

  if (supabase) {
    const { data: rows, error } = await supabase
      .from('transacoes')
      .select('id, data, pessoa, valor, descricao, tipo')
      .gte('data', inicio)
      .lte('data', fim)
      .order('id', { ascending: false })
      .limit(2000);
    if (!error && rows) {
      const todas = rows as {
        id: string;
        data: string;
        pessoa: string;
        valor: number;
        descricao: string | null;
        tipo: string;
      }[];
      const { entradas, saidas } = filtrarTransacoesOficiais(todas);
      const mapaDia = new Map<string, number>();
      for (const r of entradas) {
        const d = (r.data ?? '').slice(0, 10);
        mapaDia.set(d, (mapaDia.get(d) ?? 0) + Number(r.valor || 0));
      }
      porDiaEntrada = [...mapaDia.entries()]
        .map(([data, total]) => ({ data, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      const mapaPessoaE = new Map<string, number>();
      for (const r of entradas) {
        const p = (r.pessoa ?? '').trim() || '(sem nome)';
        mapaPessoaE.set(p, (mapaPessoaE.get(p) ?? 0) + Number(r.valor || 0));
      }
      topPessoasEntrada = [...mapaPessoaE.entries()]
        .map(([pessoa, total]) => ({ pessoa, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 12);

      const mapaPessoaS = new Map<string, number>();
      for (const r of saidas) {
        const p = (r.pessoa ?? '').trim() || '(sem nome)';
        mapaPessoaS.set(p, (mapaPessoaS.get(p) ?? 0) + Number(r.valor || 0));
      }
      topPessoasSaida = [...mapaPessoaS.entries()]
        .map(([pessoa, total]) => ({ pessoa, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 12);
    }
  }

  const idPlanilha = config.sheets.spreadsheetId;
  const receitaPorModalidade: { modalidade: string; total: number; fonte: 'planilha' }[] = [];
  if (idPlanilha) {
    const { names, error: abasError } = await listSheetNames(idPlanilha);
    if (!abasError) {
      const abas = names.filter((n) => isEligibleSheet(n));
      const modalMap = new Map<string, number>();
      for (const aba of abas) {
        const { alunos, error } = await lerPagamentosPorAbaEAno(aba, ano);
        if (error) continue;
        for (const aluno of alunos) {
          const comps = (aluno.pagamentos ?? []).filter((p) => p.mesCompetencia === mes && p.anoCompetencia === ano);
          const mod = (aluno.modalidade ?? aba).trim() || aba;
          const soma = comps.reduce((s, p) => s + Number(p.valor || 0), 0);
          if (soma > 0) modalMap.set(mod, (modalMap.get(mod) ?? 0) + soma);
        }
      }
      for (const [modalidade, total] of modalMap.entries()) {
        receitaPorModalidade.push({ modalidade, total, fonte: 'planilha' });
      }
      receitaPorModalidade.sort((a, b) => b.total - a.total);
    }
  }

  const porFonteEntradasFluxo = flattenEntradasPorFontePlanilha(fluxoResult.combinado.entradasBlocos);
  const porBlocoSaidasFluxo = totaisAgregadosPorBlocoSaida(fluxoResult.combinado.saidasBlocos);
  const totalEntradaPlanilha =
    fluxoResult.combinado.entradaTotal ?? porFonteEntradasFluxo.reduce((s, x) => s + x.valor, 0);
  const totalSaidaPlanilha =
    fluxoResult.combinado.saidaTotal ?? porBlocoSaidasFluxo.reduce((s, x) => s + x.total, 0);
  const lucroPlanilha =
    fluxoResult.combinado.lucroTotal ?? totalEntradaPlanilha - totalSaidaPlanilha;

  const totalEntradaModal = receitaPorModalidade.reduce((s, x) => s + x.total, 0);
  const concentracaoTop1 =
    totalEntradaModal > 0 && receitaPorModalidade[0]
      ? Math.round((receitaPorModalidade[0].total / totalEntradaModal) * 10000) / 100
      : null;

  return {
    tipo: 'mensal_operacional',
    mes,
    ano,
    periodo_label: `${MESES_NOMES[mes] ?? ''} de ${ano}`,
    prompt_version: PROMPT_VERSION_RELATORIOS,
    resumo_financeiro_oficial: {
      entradas: opts.totalOficialEntradas,
      saidas: opts.totalOficialSaidas,
      saldo: opts.totalOficialSaldo,
      fonte: 'banco',
    },
    planilha_controle_caixa: {
      entrada_total: fluxoResult.combinado.entradaTotal,
      saida_total: fluxoResult.combinado.saidaTotal,
      lucro_total: fluxoResult.combinado.lucroTotal,
      aba: fluxoResult.combinado.aba,
      fonte: 'planilha',
    },
    receita_por_modalidade_competencia: receitaPorModalidade.slice(0, 40),
    indicadores: {
      concentracao_receita_modalidade_top1_pct: concentracaoTop1,
      total_receita_modalidades_soma: totalEntradaModal || null,
    },
    banco_entradas: {
      dias_maior_entrada: porDiaEntrada,
      top_pessoas_entradas: topPessoasEntrada,
      top_pessoas_saidas: topPessoasSaida,
      fonte: 'banco',
    },
    planilha_entradas_detalhe: {
      por_fonte: porFonteEntradasFluxo.slice(0, 30),
      fonte: 'planilha',
    },
    saidas_por_bloco_planilha: {
      por_bloco: porBlocoSaidasFluxo.slice(0, 20),
      fonte: 'planilha',
    },
    controle_caixa_leitura_gestao: montarControleCaixaLeituraGestao(
      fluxoResult.combinado.entradasBlocos,
      fluxoResult.combinado.saidasBlocos,
      fluxoResult.combinado.aba ?? null,
      {
        entrada: totalEntradaPlanilha || null,
        saida: totalSaidaPlanilha || null,
        lucro: lucroPlanilha ?? null,
      },
    ),
    fontes: {
      legenda: { banco: 'transações oficiais Supabase', planilha: 'FLUXO / CONTROLE DE CAIXA', sistema: 'regras + indicadores derivados' },
      regra_usada: 'Agregações por modalidade a partir de pagamentos na planilha por competência; entradas por pessoa/dia a partir do extrato filtrado.',
    },
  };
}

/** R4: panorama de alunos por aba e modalidade (planilha). */
export async function montarAlunosPanorama(ano: number, mesRef: number): Promise<Record<string, unknown>> {
  const idPlanilha = config.sheets.spreadsheetId;
  if (!idPlanilha) {
    return {
      tipo: 'alunos_panorama',
      prompt_version_relatorios: PROMPT_VERSION_RELATORIOS,
      ano,
      mes_ref: mesRef,
      periodo_label: `Alunos ativos – ${MESES_NOMES[mesRef] ?? mesRef} de ${ano}`,
      competencia: { mes: mesRef, ano, label: `${MESES_NOMES[mesRef] ?? mesRef} de ${ano}` },
      fonte_dados: {
        planilha: 'FLUXO DE CAIXA BYLA',
        descricao: 'Configure GOOGLE_SHEETS_SPREADSHEET_ID no backend para ler a planilha.',
      },
      aviso: 'Planilha FLUXO BYLA não configurada.',
      totais: { total_alunos_ativos: 0, total_mensalidade_competencia: 0, total_abas: 0, total_alunos_cadastrados_abas: 0 },
      por_aba: [],
      fontes: { principal: 'planilha' },
    };
  }

  const { names, error: abasError } = await listSheetNames(idPlanilha);
  if (abasError) {
    return {
      tipo: 'alunos_panorama',
      prompt_version_relatorios: PROMPT_VERSION_RELATORIOS,
      ano,
      mes_ref: mesRef,
      periodo_label: `Alunos ativos – ${MESES_NOMES[mesRef] ?? mesRef} de ${ano}`,
      competencia: { mes: mesRef, ano, label: `${MESES_NOMES[mesRef] ?? mesRef} de ${ano}` },
      fonte_dados: {
        planilha: 'FLUXO DE CAIXA BYLA',
        descricao: 'Leitura da planilha Google Sheets (abas elegíveis).',
      },
      aviso: abasError,
      totais: { total_alunos_ativos: 0, total_mensalidade_competencia: 0, total_abas: 0, total_alunos_cadastrados_abas: 0 },
      por_aba: [],
      fontes: { principal: 'planilha' },
    };
  }

  const abas = names.filter((n) => isEligibleSheet(n)).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const porAba: {
    aba: string;
    total_alunos_ativos: number;
    total_mensalidade_competencia: number;
    por_modalidade: {
      modalidade: string;
      alunos_ativos: number;
      total_mensalidade_competencia: number;
    }[];
  }[] = [];

  for (const aba of abas) {
    const { alunos, error } = await lerPagamentosPorAbaEAno(aba, ano);
    if (error) continue;

    const modMap = new Map<string, PagamentosAluno[]>();
    for (const a of alunos) {
      const m = (a.modalidade ?? aba).trim() || aba;
      if (!modMap.has(m)) modMap.set(m, []);
      modMap.get(m)!.push(a);
    }

    const por_modalidade = [...modMap.entries()]
      .map(([modalidade, lista]) => {
        const total_mensalidade_competencia = round2(
          lista.reduce((sum, st) => sum + somaMensalidadeCompetencia(st.pagamentos, mesRef, ano), 0),
        );
        return {
          modalidade,
          alunos_ativos: lista.length,
          total_mensalidade_competencia,
        };
      })
      .sort(
        (a, b) =>
          b.total_mensalidade_competencia - a.total_mensalidade_competencia ||
          a.modalidade.localeCompare(b.modalidade, 'pt-BR'),
      );

    const total_mensalidade_competencia = round2(
      alunos.reduce((sum, st) => sum + somaMensalidadeCompetencia(st.pagamentos, mesRef, ano), 0),
    );

    porAba.push({
      aba,
      total_alunos_ativos: alunos.length,
      total_mensalidade_competencia,
      por_modalidade,
    });
  }

  const totalAlunos = porAba.reduce((s, x) => s + x.total_alunos_ativos, 0);
  const totalMensalidadeGeral = round2(porAba.reduce((s, x) => s + x.total_mensalidade_competencia, 0));

  const avisoAbas =
    abas.length === 0 && names.length > 0
      ? `Nenhuma aba corresponde à lista elegível (BYLA_ELIGIBLE_SHEETS). Abas na planilha: ${names.slice(0, 30).join(', ')}${names.length > 30 ? '…' : ''}.`
      : undefined;

  return {
    tipo: 'alunos_panorama',
    prompt_version_relatorios: PROMPT_VERSION_RELATORIOS,
    ano,
    mes_ref: mesRef,
    periodo_label: `Alunos ativos – ${MESES_NOMES[mesRef] ?? mesRef} de ${ano}`,
    competencia: {
      mes: mesRef,
      ano,
      label: `${MESES_NOMES[mesRef] ?? mesRef} de ${ano}`,
    },
    fonte_dados: {
      planilha: 'FLUXO DE CAIXA BYLA',
      descricao:
        'Dados lidos da planilha Google Sheets configurada em GOOGLE_SHEETS_SPREADSHEET_ID (abas elegíveis). Alunos ativos seguem o limite de linha por aba; mensalidade = soma dos valores na competência do mês (colunas do calendário DATA/FORMA/VALOR).',
    },
    totais: {
      total_alunos_ativos: totalAlunos,
      total_mensalidade_competencia: totalMensalidadeGeral,
      total_abas: porAba.length,
      total_alunos_cadastrados_abas: totalAlunos,
    },
    por_aba: porAba,
    regra_ativos:
      'Somente linhas de aluno marcadas como ativas na planilha FLUXO (limite por aba em parsePlanilhaPorBlocos). A mensalidade do período é a soma dos pagamentos cuja competência (mês da coluna do calendário) coincide com o mês/ano escolhidos no relatório.',
    fontes: {
      principal: 'planilha',
      planilha: 'FLUXO DE CAIXA BYLA (Google Sheets)',
      abas_elegiveis: 'mesmas regras de negócio (BYLA DANÇA, PILATES, TEATRO, YOGA, etc.)',
    },
    ...(avisoAbas ? { aviso: avisoAbas } : {}),
  };
}
