import { alunoNormKey } from '../logic/alunoPagadorMatch.js';
import {
  cadastroAlunoEstaCompleto,
  camposCadastroFaltantes,
  type CadastroAlunoPendenciasInput,
  type PendenciaCampoIgnoravel,
} from '../logic/cadastroAlunoPendencias.js';
import { inferirMeioPagamentoFluxo, type MeioPagamentoAluno } from '../logic/meioPagamentoVinculo.js';
import { normalizeText } from '../logic/conciliacaoTexto.js';
import { getSupabase } from './supabaseClient.js';
import { listMapeamentoAlunoPagadorAtivos } from './mapeamentoAlunoPagador.js';
import { listGruposFamiliaPagamentoAtivos } from './gruposFamiliaPagamento.js';

export type CadastroAlunoVinculoStatus = 'cadastro' | 'aprendido' | 'nenhum';

export type CadastroAlunoVinculoFiltro = 'todos' | 'com_vinculo' | 'sem_vinculo';

export type CadastroAlunoCadastroFiltro = 'todos' | 'completo' | 'incompleto';

export type CadastroAlunoItem = {
  id: string;
  aluno_nome: string;
  aba: string;
  modalidade: string;
  plano: string | null;
  venc: string | null;
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
  cadastro_completo: number;
  cadastro_incompleto: number;
  por_forma: CadastroAlunoFormaContagem[];
  alunos_com_vinculo: CadastroAlunoItem[];
  alunos_sem_vinculo: CadastroAlunoItem[];
};

export type CadastroAlunosResumoResponse = {
  totais: {
    alunos: number;
    ativos: number;
    com_vinculo: number;
    sem_vinculo: number;
    cadastro_completo: number;
    cadastro_incompleto: number;
    por_meio: Array<{ meio: MeioPagamentoAluno; count: number }>;
    por_aba: Array<{ aba: string; count: number }>;
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
  aba: string;
  linha_planilha: number;
  aluno_nome: string;
  forma: string | null;
  data_pagamento: string | null;
};

function alunoMatchKey(aba: string, linha: number, alunoNome: string): string {
  return `${String(aba).trim().toLowerCase()}|${Number(linha)}|${String(alunoNome).trim().toLowerCase()}`;
}

function temVinculoPagador(status: CadastroAlunoVinculoStatus): boolean {
  return status === 'cadastro' || status === 'aprendido';
}

function resolverVinculoPagador(
  alunoNome: string,
  pagadorCadastro: string | null,
  stickyByAluno: Map<string, string>,
): { status: CadastroAlunoVinculoStatus; pagador_vinculo: string | null } {
  if (pagadorCadastro) {
    return { status: 'cadastro', pagador_vinculo: pagadorCadastro };
  }
  const aprendido = stickyByAluno.get(alunoNormKey(alunoNome)) ?? null;
  if (aprendido) {
    return { status: 'aprendido', pagador_vinculo: aprendido };
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

export function montarCadastroAlunosResumo(input: {
  alunos: AlunoRow[];
  formaPorAluno: Map<string, string | null>;
  stickyByAluno: Map<string, string>;
  gruposFamilia: Array<{ rotulo: string; membros: string[][] }>;
  filtroVinculo?: CadastroAlunoVinculoFiltro;
  filtroCadastro?: CadastroAlunoCadastroFiltro;
  filtroMeio?: MeioPagamentoAluno;
  filtroAba?: string;
  filtroModalidade?: string;
  somenteAtivos?: boolean;
}): CadastroAlunosResumoResponse {
  const {
    alunos,
    formaPorAluno,
    stickyByAluno,
    gruposFamilia,
    filtroVinculo = 'todos',
    filtroCadastro = 'todos',
    filtroMeio,
    filtroAba,
    filtroModalidade,
    somenteAtivos = true,
  } = input;

  const itens: CadastroAlunoItem[] = [];

  for (const row of alunos) {
    if (somenteAtivos && !row.ativo) continue;
    if (filtroAba && row.aba !== filtroAba) continue;
    if (filtroModalidade && row.modalidade !== filtroModalidade) continue;

    const pendenciasInput: CadastroAlunoPendenciasInput = {
      wpp: row.wpp,
      responsaveis: row.responsaveis,
      responsaveis_exibicao: row.responsaveis_exibicao,
      venc: row.venc,
      venc_exibicao: row.venc_exibicao,
      plano: row.plano,
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
    const { status: vinculoStatus, pagador_vinculo } = resolverVinculoPagador(
      row.aluno_nome,
      pagadorCadastro,
      stickyByAluno,
    );

    if (filtroVinculo === 'com_vinculo' && !temVinculoPagador(vinculoStatus)) continue;
    if (filtroVinculo === 'sem_vinculo' && temVinculoPagador(vinculoStatus)) continue;

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
      venc: vencExibe,
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
    return a.aluno_nome.localeCompare(b.aluno_nome, 'pt-BR');
  });

  const secoesMap = new Map<string, CadastroAlunoSecao>();
  for (const item of itens) {
    const key = `${item.aba}::${item.modalidade}`;
    let secao = secoesMap.get(key);
    if (!secao) {
      secao = {
        aba: item.aba,
        modalidade: item.modalidade,
        total: 0,
        com_vinculo: 0,
        sem_vinculo: 0,
        cadastro_completo: 0,
        cadastro_incompleto: 0,
        por_forma: [],
        alunos_com_vinculo: [],
        alunos_sem_vinculo: [],
      };
      secoesMap.set(key, secao);
    }
    secao.total += 1;
    if (temVinculoPagador(item.vinculo_status)) {
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
    .map((s) => ({ ...s, por_forma: contarPorForma([...s.alunos_com_vinculo, ...s.alunos_sem_vinculo]) }))
    .sort((a, b) => {
      const ab = a.aba.localeCompare(b.aba, 'pt-BR');
      if (ab !== 0) return ab;
      return a.modalidade.localeCompare(b.modalidade, 'pt-BR');
    });

  const porAba = new Map<string, number>();
  for (const item of itens) {
    porAba.set(item.aba, (porAba.get(item.aba) ?? 0) + 1);
  }

  return {
    totais: {
      alunos: itens.length,
      ativos: itens.filter((i) => i.ativo).length,
      com_vinculo: itens.filter((i) => temVinculoPagador(i.vinculo_status)).length,
      sem_vinculo: itens.filter((i) => !temVinculoPagador(i.vinculo_status)).length,
      cadastro_completo: itens.filter((i) => i.cadastro_status === 'completo').length,
      cadastro_incompleto: itens.filter((i) => i.cadastro_status === 'incompleto').length,
      por_meio: contarPorMeio(itens),
      por_aba: Array.from(porAba.entries())
        .map(([aba, count]) => ({ aba, count }))
        .sort((a, b) => a.aba.localeCompare(b.aba, 'pt-BR')),
    },
    secoes,
  };
}

export async function getCadastroAlunosResumo(params: {
  filtroVinculo?: CadastroAlunoVinculoFiltro;
  filtroCadastro?: CadastroAlunoCadastroFiltro;
  filtroMeio?: MeioPagamentoAluno;
  filtroAba?: string;
  filtroModalidade?: string;
  somenteAtivos?: boolean;
}): Promise<CadastroAlunosResumoResponse> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado no backend.');

  const [alunosRes, pagRes, sticky, grupos] = await Promise.all([
    supabase
      .from('fluxo_alunos_operacionais')
      .select(
        'id, aba, modalidade, linha_planilha, aluno_nome, wpp, responsaveis, plano, venc, valor_referencia, pagador_pix, ativo, raw_row, pendencia_campos_ignorados',
      )
      .order('aba', { ascending: true })
      .order('linha_planilha', { ascending: true })
      .limit(8000),
    supabase
      .from('fluxo_pagamentos_operacionais')
      .select('aba, linha_planilha, aluno_nome, forma, data_pagamento')
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

  const formaPorAluno = montarFormaHabitualPorAluno((pagRes.data ?? []) as PagamentoRow[]);

  return montarCadastroAlunosResumo({
    alunos,
    formaPorAluno,
    stickyByAluno,
    gruposFamilia: grupos,
    ...params,
  });
}
