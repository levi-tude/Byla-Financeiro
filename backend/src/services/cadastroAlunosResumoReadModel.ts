import { alunoNormKey } from '../logic/alunoPagadorMatch.js';
import {
  cadastroAlunoEstaCompleto,
  camposCadastroFaltantes,
  type CadastroAlunoPendenciasInput,
  type PendenciaCampoIgnoravel,
} from '../logic/cadastroAlunoPendencias.js';
import { parseDiaVencimentoCadastro } from '../logic/conciliacaoStatusExtrato.js';
import {
  fluxoUuidFromAnyPlanilhaId,
  planilhaIdFromFluxoUuid,
} from '../logic/fluxoPagamentoFingerprint.js';
import { inferirMeioPagamentoFluxo, type MeioPagamentoAluno } from '../logic/meioPagamentoVinculo.js';
import { normalizeText } from '../logic/conciliacaoTexto.js';
import {
  isRegimeSemCobranca,
  resolverRegimeCobranca,
  type RegimeCobrancaAluno,
} from '../logic/regimeCobrancaAluno.js';
import { casarVinculosOrfaosPorDataValor } from '../logic/vinculosOrfaosHeuristica.js';
import { getSupabase } from './supabaseClient.js';
import { listMapeamentoAlunoPagadorAtivos } from './mapeamentoAlunoPagador.js';
import { listGruposFamiliaPagamentoAtivos } from './gruposFamiliaPagamento.js';
import {
  listVinculosOrfaosFluxo,
  listVinculosPorPlanilhaIds,
  type VinculoPagamento,
} from './validacaoVinculos.js';

/** validacao = confirmado na Validação (sticky ou vínculo extrato); cadastro = só pagador no Fluxo. */
export type CadastroAlunoVinculoStatus = 'validacao' | 'cadastro' | 'nenhum';

export type CadastroAlunoVinculoFiltro = 'todos' | 'com_vinculo' | 'sem_vinculo';

export type CadastroAlunoCadastroFiltro = 'todos' | 'completo' | 'incompleto';

export type CadastroAlunoRegimeFiltro = 'todos' | 'normal' | 'bolsa' | 'excecao' | 'bolsa_excecao';

export type CadastroAlunoDiaVencimentoFiltro = number | 'sem';

export type CadastroAlunoItem = {
  id: string;
  aluno_nome: string;
  aba: string;
  modalidade: string;
  plano: string | null;
  regime_cobranca: RegimeCobrancaAluno;
  venc: string | null;
  dia_vencimento: number | null;
  ativo: boolean;
  cadastro_status: 'completo' | 'incompleto';
  cadastro_pendencias: string[];
  pagador_cadastro: string | null;
  pagador_vinculo: string | null;
  vinculo_status: CadastroAlunoVinculoStatus;
  forma_habitual: string | null;
  meio: MeioPagamentoAluno;
  grupo_familia: string | null;
};

export type CadastroAlunoFormaContagem = {
  forma: string;
  meio: MeioPagamentoAluno;
  count: number;
};

export type CadastroAlunoSecao = {
  aba: string;
  modalidade: string;
  total: number;
  com_vinculo: number;
  sem_vinculo: number;
  bolsa_excecao: number;
  cadastro_completo: number;
  cadastro_incompleto: number;
  por_forma: CadastroAlunoFormaContagem[];
  alunos_com_vinculo: CadastroAlunoItem[];
  alunos_sem_vinculo: CadastroAlunoItem[];
  alunos_bolsa_excecao: CadastroAlunoItem[];
};

export type CadastroAlunoDiaVencimentoContagem = {
  dia: number;
  count: number;
};

export type CadastroAlunosResumoResponse = {
  totais: {
    alunos: number;
    ativos: number;
    com_vinculo: number;
    sem_vinculo: number;
    bolsa_excecao: number;
    cadastro_completo: number;
    cadastro_incompleto: number;
    sem_vencimento_cadastrado: number;
    por_meio: Array<{ meio: MeioPagamentoAluno; count: number }>;
    por_aba: Array<{ aba: string; count: number }>;
    por_dia_vencimento: CadastroAlunoDiaVencimentoContagem[];
  };
  secoes: CadastroAlunoSecao[];
};

type AlunoRow = {
  id: string;
  aba: string;
  modalidade: string;
  linha_planilha: number;
  aluno_nome: string;
  wpp: string | null;
  responsaveis: string | null;
  plano: string | null;
  regime_cobranca?: string | null;
  venc: string | null;
  valor_referencia: number | null;
  pagador_pix: string | null;
  ativo: boolean;
  raw_row?: unknown;
  pendencia_campos_ignorados?: unknown;
  venc_exibicao?: string | null;
  responsaveis_exibicao?: string | null;
  pagador_pix_exibicao?: string | null;
  valor_mensal_exibicao?: number | null;
  valor_mensal_origem?: 'cadastro' | 'planilha_bruta' | 'ultimo_pagamento' | null;
};

type PagamentoRow = {
  id: string;
  aba: string;
  linha_planilha: number;
  aluno_nome: string;
  forma: string | null;
  data_pagamento: string | null;
  valor?: number | null;
};

function alunoMatchKey(aba: string, linha: number, alunoNome: string): string {
  return `${String(aba).trim().toLowerCase()}|${Number(linha)}|${String(alunoNome).trim().toLowerCase()}`;
}

function temVinculoPagador(status: CadastroAlunoVinculoStatus): boolean {
  return status === 'validacao';
}

function montarAlunosComVinculoValidacao(
  pagamentos: PagamentoRow[],
  vinculos: VinculoPagamento[],
): Set<string> {
  const pagamentoIdParaAluno = new Map<string, string>();
  for (const p of pagamentos) {
    const alunoKey = alunoMatchKey(String(p.aba), Number(p.linha_planilha), String(p.aluno_nome));
    pagamentoIdParaAluno.set(String(p.id), alunoKey);
    pagamentoIdParaAluno.set(planilhaIdFromFluxoUuid(String(p.id)), alunoKey);
  }

  const out = new Set<string>();
  for (const v of vinculos) {
    const uuid = fluxoUuidFromAnyPlanilhaId(v.planilha_id);
    const alunoKey =
      (uuid ? pagamentoIdParaAluno.get(uuid) : undefined) ??
      pagamentoIdParaAluno.get(v.planilha_id);
    if (alunoKey) out.add(alunoKey);
  }
  return out;
}

/** Atribui órfãos 1:1 (data±1 + valor) aos alunoKeys do Cadastro — só leitura. */
export function atribuirOrfaosAoCadastro(args: {
  pagamentos: PagamentoRow[];
  orfaos: Array<{ planilha_id: string; data_ref: string; valor: number; pessoa_banco?: string | null }>;
}): { alunoKeys: Set<string>; pagadorPorAlunoNorm: Map<string, string> } {
  const pagamentos = args.pagamentos.map((p) => ({
    id: String(p.id),
    alunoKey: alunoMatchKey(String(p.aba), Number(p.linha_planilha), String(p.aluno_nome)),
    alunoNorm: alunoNormKey(String(p.aluno_nome)),
    data_pagamento: p.data_pagamento,
    valor: Number(p.valor ?? 0),
  }));
  const matches = casarVinculosOrfaosPorDataValor({
    orfaos: args.orfaos,
    pagamentos,
  });
  const alunoKeys = new Set<string>();
  const pagadorPorAlunoNorm = new Map<string, string>();
  for (const m of matches) {
    alunoKeys.add(m.alunoKey);
    if (!m.pessoa_banco) continue;
    const pag = args.pagamentos.find((p) => String(p.id) === m.newPagamentoId);
    if (!pag) continue;
    const k = alunoNormKey(pag.aluno_nome);
    if (k && !pagadorPorAlunoNorm.has(k)) pagadorPorAlunoNorm.set(k, m.pessoa_banco);
  }
  return { alunoKeys, pagadorPorAlunoNorm };
}

function resolverVinculoPagador(
  alunoKey: string,
  alunoNome: string,
  pagadorCadastro: string | null,
  stickyByAluno: Map<string, string>,
  alunosComVinculoValidacao: Set<string>,
): { status: CadastroAlunoVinculoStatus; pagador_vinculo: string | null } {
  const pagadorAprendido = stickyByAluno.get(alunoNormKey(alunoNome)) ?? null;
  if (pagadorAprendido || alunosComVinculoValidacao.has(alunoKey)) {
    return { status: 'validacao', pagador_vinculo: pagadorAprendido };
  }
  if (pagadorCadastro) {
    return { status: 'cadastro', pagador_vinculo: null };
  }
  return { status: 'nenhum', pagador_vinculo: null };
}

function grupoFamiliaDoAluno(
  alunoNome: string,
  grupos: Array<{ rotulo: string; membros: string[][] }>,
): string | null {
  const tokensAluno = normalizeText(alunoNome).split(/\s+/).filter(Boolean);
  if (tokensAluno.length === 0) return null;
  for (const g of grupos) {
    for (const membros of g.membros) {
      const hit = membros.some((m) => {
        const mt = normalizeText(m);
        return tokensAluno.some((t) => t.includes(mt) || mt.includes(t));
      });
      if (hit) return g.rotulo;
    }
  }
  return null;
}

function montarFormaHabitualPorAluno(pagamentos: PagamentoRow[]): Map<string, string | null> {
  const sorted = [...pagamentos].sort((a, b) =>
    String(b.data_pagamento ?? '').localeCompare(String(a.data_pagamento ?? '')),
  );
  const out = new Map<string, string | null>();
  for (const p of sorted) {
    const k = alunoMatchKey(String(p.aba), Number(p.linha_planilha), String(p.aluno_nome));
    if (!out.has(k)) {
      const forma = String(p.forma ?? '').trim();
      out.set(k, forma || null);
    }
  }
  return out;
}

function contarPorForma(itens: CadastroAlunoItem[]): CadastroAlunoFormaContagem[] {
  const map = new Map<string, CadastroAlunoFormaContagem>();
  for (const item of itens) {
    const forma = item.forma_habitual?.trim() || 'Sem forma registrada';
    const key = `${forma}::${item.meio}`;
    const prev = map.get(key);
    if (prev) prev.count += 1;
    else map.set(key, { forma, meio: item.meio, count: 1 });
  }
  return Array.from(map.values()).sort((a, b) => {
    const fa = a.forma.localeCompare(b.forma, 'pt-BR');
    if (fa !== 0) return fa;
    return a.meio.localeCompare(b.meio);
  });
}

function contarPorMeio(itens: CadastroAlunoItem[]): Array<{ meio: MeioPagamentoAluno; count: number }> {
  const map = new Map<MeioPagamentoAluno, number>();
  for (const item of itens) {
    map.set(item.meio, (map.get(item.meio) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([meio, count]) => ({ meio, count }))
    .sort((a, b) => b.count - a.count || a.meio.localeCompare(b.meio));
}

function contarPorDiaVencimento(itens: CadastroAlunoItem[]): CadastroAlunoDiaVencimentoContagem[] {
  const map = new Map<number, number>();
  for (const item of itens) {
    if (item.dia_vencimento == null) continue;
    map.set(item.dia_vencimento, (map.get(item.dia_vencimento) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([dia, count]) => ({ dia, count }))
    .sort((a, b) => a.dia - b.dia);
}

function aplicarFiltroDiaVencimento(
  itens: CadastroAlunoItem[],
  filtro?: CadastroAlunoDiaVencimentoFiltro,
): CadastroAlunoItem[] {
  if (filtro == null) return itens;
  if (filtro === 'sem') return itens.filter((i) => i.dia_vencimento == null);
  return itens.filter((i) => i.dia_vencimento === filtro);
}

export function montarCadastroAlunosResumo(input: {
  alunos: AlunoRow[];
  formaPorAluno: Map<string, string | null>;
  stickyByAluno: Map<string, string>;
  alunosComVinculoValidacao: Set<string>;
  gruposFamilia: Array<{ rotulo: string; membros: string[][] }>;
  filtroVinculo?: CadastroAlunoVinculoFiltro;
  filtroCadastro?: CadastroAlunoCadastroFiltro;
  filtroRegime?: CadastroAlunoRegimeFiltro;
  filtroMeio?: MeioPagamentoAluno;
  filtroAba?: string;
  filtroModalidade?: string;
  filtroDiaVencimento?: CadastroAlunoDiaVencimentoFiltro;
  somenteAtivos?: boolean;
}): CadastroAlunosResumoResponse {
  const {
    alunos,
    formaPorAluno,
    stickyByAluno,
    alunosComVinculoValidacao,
    gruposFamilia,
    filtroVinculo = 'todos',
    filtroCadastro = 'todos',
    filtroRegime = 'todos',
    filtroMeio,
    filtroAba,
    filtroModalidade,
    filtroDiaVencimento,
    somenteAtivos = true,
  } = input;

  const itens: CadastroAlunoItem[] = [];

  for (const row of alunos) {
    if (somenteAtivos && !row.ativo) continue;
    if (filtroAba && row.aba !== filtroAba) continue;
    if (filtroModalidade && row.modalidade !== filtroModalidade) continue;

    const regime = resolverRegimeCobranca({
      regime_cobranca: row.regime_cobranca,
      plano: row.plano,
    });
    if (filtroRegime === 'normal' && regime !== 'normal') continue;
    if (filtroRegime === 'bolsa' && regime !== 'bolsa') continue;
    if (filtroRegime === 'excecao' && regime !== 'excecao') continue;
    if (filtroRegime === 'bolsa_excecao' && !isRegimeSemCobranca(regime)) continue;

    const pendenciasInput: CadastroAlunoPendenciasInput = {
      wpp: row.wpp,
      responsaveis: row.responsaveis,
      responsaveis_exibicao: row.responsaveis_exibicao,
      venc: row.venc,
      venc_exibicao: row.venc_exibicao,
      plano: row.plano,
      regime_cobranca: regime,
      valor_referencia: row.valor_referencia,
      valor_mensal_exibicao: row.valor_mensal_exibicao,
      valor_mensal_origem: row.valor_mensal_origem,
      pagador_pix: row.pagador_pix,
      pagador_pix_exibicao: row.pagador_pix_exibicao,
      pendencia_campos_ignorados: row.pendencia_campos_ignorados as PendenciaCampoIgnoravel[] | undefined,
    };

    const cadastroCompleto = cadastroAlunoEstaCompleto(pendenciasInput);
    if (filtroCadastro === 'completo' && !cadastroCompleto) continue;
    if (filtroCadastro === 'incompleto' && cadastroCompleto) continue;

    const pagadorCadastro =
      (row.pagador_pix_exibicao?.trim() || row.pagador_pix?.trim() || null) ?? null;
    const vencExibe = (row.venc_exibicao?.trim() || row.venc?.trim() || null) ?? null;
    const diaVencimento = parseDiaVencimentoCadastro(vencExibe);
    const alunoKey = alunoMatchKey(String(row.aba), Number(row.linha_planilha), String(row.aluno_nome));
    const { status: vinculoStatus, pagador_vinculo } = resolverVinculoPagador(
      alunoKey,
      row.aluno_nome,
      pagadorCadastro,
      stickyByAluno,
      alunosComVinculoValidacao,
    );

    // Bolsa/exceção não entra no filtro "sem vínculo" (não precisa vincular extrato).
    if (filtroVinculo === 'com_vinculo') {
      if (isRegimeSemCobranca(regime) || !temVinculoPagador(vinculoStatus)) continue;
    }
    if (filtroVinculo === 'sem_vinculo') {
      if (isRegimeSemCobranca(regime) || temVinculoPagador(vinculoStatus)) continue;
    }

    const formaHabitual =
      formaPorAluno.get(
        alunoMatchKey(String(row.aba), Number(row.linha_planilha), String(row.aluno_nome)),
      ) ?? null;
    const meio = inferirMeioPagamentoFluxo(formaHabitual);
    if (filtroMeio && meio !== filtroMeio) continue;

    itens.push({
      id: row.id,
      aluno_nome: String(row.aluno_nome ?? ''),
      aba: String(row.aba ?? ''),
      modalidade: String(row.modalidade ?? row.aba ?? ''),
      plano: row.plano ? String(row.plano) : null,
      regime_cobranca: regime,
      venc: vencExibe,
      dia_vencimento: diaVencimento,
      ativo: Boolean(row.ativo),
      cadastro_status: cadastroCompleto ? 'completo' : 'incompleto',
      cadastro_pendencias: camposCadastroFaltantes(pendenciasInput),
      pagador_cadastro: pagadorCadastro,
      pagador_vinculo,
      vinculo_status: vinculoStatus,
      forma_habitual: formaHabitual,
      meio,
      grupo_familia: grupoFamiliaDoAluno(row.aluno_nome, gruposFamilia),
    });
  }

  itens.sort((a, b) => {
    const ab = a.aba.localeCompare(b.aba, 'pt-BR');
    if (ab !== 0) return ab;
    const md = a.modalidade.localeCompare(b.modalidade, 'pt-BR');
    if (md !== 0) return md;
    const dv =
      (a.dia_vencimento ?? 99) - (b.dia_vencimento ?? 99);
    if (dv !== 0) return dv;
    return a.aluno_nome.localeCompare(b.aluno_nome, 'pt-BR');
  });

  const porDiaVencimento = contarPorDiaVencimento(itens);
  const semVencimentoCadastrado = itens.filter((i) => i.dia_vencimento == null).length;
  const itensFiltrados = aplicarFiltroDiaVencimento(itens, filtroDiaVencimento);

  const secoesMap = new Map<string, CadastroAlunoSecao>();
  for (const item of itensFiltrados) {
    const key = `${item.aba}::${item.modalidade}`;
    let secao = secoesMap.get(key);
    if (!secao) {
      secao = {
        aba: item.aba,
        modalidade: item.modalidade,
        total: 0,
        com_vinculo: 0,
        sem_vinculo: 0,
        bolsa_excecao: 0,
        cadastro_completo: 0,
        cadastro_incompleto: 0,
        por_forma: [],
        alunos_com_vinculo: [],
        alunos_sem_vinculo: [],
        alunos_bolsa_excecao: [],
      };
      secoesMap.set(key, secao);
    }
    secao.total += 1;
    if (isRegimeSemCobranca(item.regime_cobranca)) {
      secao.bolsa_excecao += 1;
      secao.alunos_bolsa_excecao.push(item);
    } else if (temVinculoPagador(item.vinculo_status)) {
      secao.com_vinculo += 1;
      secao.alunos_com_vinculo.push(item);
    } else {
      secao.sem_vinculo += 1;
      secao.alunos_sem_vinculo.push(item);
    }
    if (item.cadastro_status === 'completo') secao.cadastro_completo += 1;
    else secao.cadastro_incompleto += 1;
  }

  const secoes = Array.from(secoesMap.values())
    .map((s) => ({
      ...s,
      por_forma: contarPorForma([
        ...s.alunos_com_vinculo,
        ...s.alunos_sem_vinculo,
        ...s.alunos_bolsa_excecao,
      ]),
    }))
    .sort((a, b) => {
      const ab = a.aba.localeCompare(b.aba, 'pt-BR');
      if (ab !== 0) return ab;
      return a.modalidade.localeCompare(b.modalidade, 'pt-BR');
    });

  const porAba = new Map<string, number>();
  for (const item of itensFiltrados) {
    porAba.set(item.aba, (porAba.get(item.aba) ?? 0) + 1);
  }

  const semCobranca = (i: CadastroAlunoItem) => isRegimeSemCobranca(i.regime_cobranca);

  return {
    totais: {
      alunos: itensFiltrados.length,
      ativos: itensFiltrados.filter((i) => i.ativo).length,
      com_vinculo: itensFiltrados.filter(
        (i) => !semCobranca(i) && temVinculoPagador(i.vinculo_status),
      ).length,
      sem_vinculo: itensFiltrados.filter(
        (i) => !semCobranca(i) && !temVinculoPagador(i.vinculo_status),
      ).length,
      bolsa_excecao: itensFiltrados.filter((i) => semCobranca(i)).length,
      cadastro_completo: itensFiltrados.filter((i) => i.cadastro_status === 'completo').length,
      cadastro_incompleto: itensFiltrados.filter((i) => i.cadastro_status === 'incompleto').length,
      sem_vencimento_cadastrado: semVencimentoCadastrado,
      por_meio: contarPorMeio(itensFiltrados),
      por_aba: Array.from(porAba.entries())
        .map(([aba, count]) => ({ aba, count }))
        .sort((a, b) => a.aba.localeCompare(b.aba, 'pt-BR')),
      por_dia_vencimento: porDiaVencimento,
    },
    secoes,
  };
}

export async function getCadastroAlunosResumo(params: {
  filtroVinculo?: CadastroAlunoVinculoFiltro;
  filtroCadastro?: CadastroAlunoCadastroFiltro;
  filtroRegime?: CadastroAlunoRegimeFiltro;
  filtroMeio?: MeioPagamentoAluno;
  filtroAba?: string;
  filtroModalidade?: string;
  filtroDiaVencimento?: CadastroAlunoDiaVencimentoFiltro;
  somenteAtivos?: boolean;
}): Promise<CadastroAlunosResumoResponse> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado no backend.');

  const [alunosRes, pagRes, sticky, grupos] = await Promise.all([
    supabase
      .from('fluxo_alunos_operacionais')
      .select(
        'id, aba, modalidade, linha_planilha, aluno_nome, wpp, responsaveis, plano, regime_cobranca, venc, valor_referencia, pagador_pix, ativo, raw_row, pendencia_campos_ignorados',
      )
      .order('aba', { ascending: true })
      .order('linha_planilha', { ascending: true })
      .limit(8000),
    supabase
      .from('fluxo_pagamentos_operacionais')
      .select('id, aba, linha_planilha, aluno_nome, forma, data_pagamento, valor')
      .order('data_pagamento', { ascending: false })
      .limit(20000),
    listMapeamentoAlunoPagadorAtivos(supabase).catch(() => []),
    listGruposFamiliaPagamentoAtivos(supabase).catch(() => []),
  ]);

  if (alunosRes.error) throw new Error(alunosRes.error.message);
  if (pagRes.error) throw new Error(pagRes.error.message);

  const stickyByAluno = new Map<string, string>();
  for (const r of sticky) {
    if (!stickyByAluno.has(r.aluno_normalizado)) {
      stickyByAluno.set(
        r.aluno_normalizado,
        r.pessoa_banco_exibicao.trim() || r.pessoa_banco_normalizada,
      );
    }
  }

  const alunos: AlunoRow[] = (alunosRes.data ?? []).map((row) => {
    const raw = row.raw_row;
    let venc_exibicao: string | null = null;
    let responsaveis_exibicao: string | null = null;
    let pagador_pix_exibicao: string | null = null;
    let valor_mensal_exibicao: number | null = null;
    let valor_mensal_origem: AlunoRow['valor_mensal_origem'] = null;

    if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      const pick = (keys: string[]) => {
        const wanted = new Set(keys.map((k) => normalizeText(k)));
        for (const [k, v] of Object.entries(r)) {
          if (wanted.has(normalizeText(k))) return String(v ?? '').trim();
        }
        return '';
      };
      venc_exibicao = pick(['VENC', 'VENC.', 'DATA VENC', 'VENCIMENTO', 'DIA VENC']) || null;
      responsaveis_exibicao = pick(['RESPONSÁVEIS', 'RESPONSAVEIS', 'RESPONS.', 'RESP.']) || null;
      pagador_pix_exibicao = pick(['PRÓ', 'PRO', 'PAGADOR', 'PIX', 'PAGADOR PIX']) || null;
    }

    const valorCadastro = row.valor_referencia != null ? Number(row.valor_referencia) : null;
    if (valorCadastro != null) {
      valor_mensal_exibicao = valorCadastro;
      valor_mensal_origem = 'cadastro';
    }

    return {
      id: String(row.id),
      aba: String(row.aba ?? ''),
      modalidade: String(row.modalidade ?? ''),
      linha_planilha: Number(row.linha_planilha ?? 0),
      aluno_nome: String(row.aluno_nome ?? ''),
      wpp: row.wpp != null ? String(row.wpp) : null,
      responsaveis: row.responsaveis != null ? String(row.responsaveis) : null,
      plano: row.plano != null ? String(row.plano) : null,
      regime_cobranca: (row as { regime_cobranca?: unknown }).regime_cobranca != null
        ? String((row as { regime_cobranca?: unknown }).regime_cobranca)
        : null,
      venc: row.venc != null ? String(row.venc) : null,
      valor_referencia: valorCadastro,
      pagador_pix: row.pagador_pix != null ? String(row.pagador_pix) : null,
      ativo: Boolean(row.ativo),
      raw_row: row.raw_row,
      pendencia_campos_ignorados: row.pendencia_campos_ignorados,
      venc_exibicao: (row.venc && String(row.venc).trim()) || venc_exibicao,
      responsaveis_exibicao: (row.responsaveis && String(row.responsaveis).trim()) || responsaveis_exibicao,
      pagador_pix_exibicao: (row.pagador_pix && String(row.pagador_pix).trim()) || pagador_pix_exibicao,
      valor_mensal_exibicao,
      valor_mensal_origem,
    };
  });

  const pagamentos = (pagRes.data ?? []).map((row) => ({
    id: String((row as { id: string }).id),
    aba: String((row as { aba: string }).aba ?? ''),
    linha_planilha: Number((row as { linha_planilha: number }).linha_planilha ?? 0),
    aluno_nome: String((row as { aluno_nome: string }).aluno_nome ?? ''),
    forma: (row as { forma?: string | null }).forma != null ? String((row as { forma: string }).forma) : null,
    data_pagamento:
      (row as { data_pagamento?: string | null }).data_pagamento != null
        ? String((row as { data_pagamento: string }).data_pagamento)
        : null,
    valor:
      (row as { valor?: number | null }).valor != null
        ? Number((row as { valor: number }).valor)
        : null,
  })) as PagamentoRow[];

  const planilhaIds = pagamentos.flatMap((p) => [p.id, planilhaIdFromFluxoUuid(p.id)]);
  const vinculos = await listVinculosPorPlanilhaIds(planilhaIds).catch(() => []);
  const alunosComVinculoValidacao = montarAlunosComVinculoValidacao(pagamentos, vinculos);

  // Órfãos pós-remigração: Cadastro não via o vínculo porque o UUID do pagamento mudou.
  const orfaos = await listVinculosOrfaosFluxo(pagamentos.map((p) => p.id)).catch(() => []);
  if (orfaos.length > 0) {
    const bancoIds = [...new Set(orfaos.map((v) => String(v.banco_id)).filter(Boolean))];
    const pessoaPorBanco = new Map<string, { pessoa: string; valor: number }>();
    const CHUNK = 200;
    for (let i = 0; i < bancoIds.length; i += CHUNK) {
      const slice = bancoIds.slice(i, i + CHUNK);
      const { data: txs, error: txErr } = await supabase
        .from('transacoes')
        .select('id, pessoa, valor')
        .in('id', slice);
      if (txErr) break;
      for (const t of txs ?? []) {
        pessoaPorBanco.set(String((t as { id: string }).id), {
          pessoa: String((t as { pessoa?: string }).pessoa ?? '').trim(),
          valor: Number((t as { valor?: number }).valor ?? 0),
        });
      }
    }
    const { alunoKeys, pagadorPorAlunoNorm } = atribuirOrfaosAoCadastro({
      pagamentos,
      orfaos: orfaos.map((v) => {
        const tx = pessoaPorBanco.get(String(v.banco_id));
        return {
          planilha_id: v.planilha_id,
          data_ref: v.data_ref,
          valor: tx?.valor ?? 0,
          pessoa_banco: tx?.pessoa ?? null,
        };
      }),
    });
    for (const k of alunoKeys) alunosComVinculoValidacao.add(k);
    for (const [alunoNorm, pessoa] of pagadorPorAlunoNorm) {
      if (!stickyByAluno.has(alunoNorm) && pessoa) stickyByAluno.set(alunoNorm, pessoa);
    }
  }

  const formaPorAluno = montarFormaHabitualPorAluno(pagamentos);

  return montarCadastroAlunosResumo({
    alunos,
    formaPorAluno,
    stickyByAluno,
    alunosComVinculoValidacao,
    gruposFamilia: grupos,
    ...params,
  });
}
