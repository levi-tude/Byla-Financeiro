import { catalogoEntradasFromControleData } from '../domain/entradas/categoriasEntrada.js';
import { catalogoSaidasFromControleData } from '../domain/despesas/categoriasSaida.js';
import {
  findBlocoLinha,
  montarComposicaoLinha,
  type BlocoAlvoComposicao,
  type PagamentoDinheiroComposicao,
  type TxClassificadaComposicao,
  type VisaoComposicao,
} from '../logic/controleCaixaLinhaComposicao.js';
import { rangeMes } from '../logic/despesasAgrupamento.js';
import { buildEntradasContext } from './entradasClassificacaoService.js';
import { buildDespesasContext } from './despesasClassificacaoService.js';
import { readControleCaixa, type ControleCaixaReadDto } from './controleCaixaRead.js';
import { getSupabase } from './supabaseClient.js';
import type { ControleModo } from '../domain/controleCaixa/modo.js';
import type { SupabaseClient } from '@supabase/supabase-js';

function blocosFromDto(data: ControleCaixaReadDto): BlocoAlvoComposicao[] {
  return data.blocos.map((b) => ({
    tipo: b.tipo,
    titulo: b.titulo,
    templateKey: b.templateKey,
    linhas: b.linhas.map((l) => ({
      id: l.id,
      label: l.label,
      valor: l.valor,
      valorTexto: l.valorTexto,
      templateKey: l.templateKey,
    })),
  }));
}

async function loadPagamentosDinheiroComposicao(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
  visao: VisaoComposicao,
): Promise<PagamentoDinheiroComposicao[]> {
  let query = supabase
    .from('fluxo_pagamentos_operacionais')
    .select('id, aba, modalidade, forma, valor, mes_competencia, ano_competencia, data_pagamento, aluno_nome')
    .limit(10000);

  if (visao === 'caixa') {
    const { inicio, fim } = rangeMes(mes, ano);
    query = query.gte('data_pagamento', inicio).lte('data_pagamento', fim);
  } else {
    query = query.eq('mes_competencia', mes).eq('ano_competencia', ano);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id != null ? String(r.id) : undefined,
    aba: String(r.aba ?? ''),
    modalidade: r.modalidade != null ? String(r.modalidade) : null,
    forma: r.forma != null ? String(r.forma) : null,
    valor: Number(r.valor || 0),
    mes_competencia: Number(r.mes_competencia || 0),
    ano_competencia: Number(r.ano_competencia || 0),
    data_pagamento: r.data_pagamento != null ? String(r.data_pagamento).slice(0, 10) : null,
    aluno_nome: r.aluno_nome != null ? String(r.aluno_nome) : null,
  }));
}

function toTxComposicao(
  rows: Array<{
    id: string;
    data: string;
    pessoa: string;
    valor: number;
    descricao: string | null;
    origem_efetiva: string;
    template_key_efetivo: string | null;
    categoria_efetiva?: string | null;
    mes_competencia?: number;
    ano_competencia?: number;
    competencia_confirmada?: boolean;
  }>,
): TxClassificadaComposicao[] {
  return rows.map((t) => ({
    id: t.id,
    data: t.data,
    pessoa: t.pessoa,
    valor: Number(t.valor || 0),
    descricao: t.descricao,
    origem_efetiva: t.origem_efetiva,
    template_key_efetivo: t.template_key_efetivo,
    categoria_efetiva: t.categoria_efetiva ?? null,
    mes_competencia: t.mes_competencia,
    ano_competencia: t.ano_competencia,
    competencia_confirmada: t.competencia_confirmada,
  }));
}

export type ControleLinhaComposicaoResponse = {
  mes: number;
  ano: number;
  modo: ControleModo;
  visao: VisaoComposicao;
  bloco: { templateKey: string | null; titulo: string; tipo: 'entrada' | 'saida' };
  linha: {
    templateKey: string | null;
    label: string;
    valor: number | null;
    valorTexto: string | null;
  };
  tipoComposicao: string;
  formula: {
    templateKeyEntrada: string;
    labelEntrada: string;
    baseEntrada: number;
    descricao: string;
    aviso: string;
  } | null;
  itens: Array<{
    id: string;
    data: string | null;
    pessoa: string | null;
    valor: number;
    meio: string;
    meioLabel: string;
    origem: string;
    descricao: string | null;
  }>;
  totalItens: number;
  totalLinha: number | null;
  mensagem: string | null;
};

export async function getControleLinhaComposicao(opts: {
  mes: number;
  ano: number;
  modo: ControleModo;
  visao?: VisaoComposicao;
  blocoTemplateKey: string;
  linhaTemplateKey: string;
  linhaLabel?: string | null;
}): Promise<{ ok: true; data: ControleLinhaComposicaoResponse } | { error: string; status?: number }> {
  const visao: VisaoComposicao = opts.visao ?? 'competencia';
  const modo = opts.modo;

  const read = await readControleCaixa(opts.mes, opts.ano, modo);
  if ('error' in read) return { error: read.error, status: 500 };

  const blocos = blocosFromDto(read.data);
  const found = findBlocoLinha(
    blocos,
    opts.blocoTemplateKey,
    opts.linhaTemplateKey,
    opts.linhaLabel,
  );
  if (!found) {
    return { error: 'Linha não encontrada neste Controle.', status: 404 };
  }

  const catalogEntrada = catalogoEntradasFromControleData(read.data);
  const catalogSaida = catalogoSaidasFromControleData(read.data);
  const entradasParceiros =
    blocos.find(
      (b) =>
        b.templateKey === 'entrada_parceiros' ||
        (b.tipo === 'entrada' && b.titulo.toLowerCase().includes('parceir')),
    )?.linhas ?? [];

  let transacoesEntrada: TxClassificadaComposicao[] = [];
  let transacoesDespesa: TxClassificadaComposicao[] = [];
  let pagamentosDinheiro: PagamentoDinheiroComposicao[] = [];

  if (modo === 'sistema') {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase não configurado.', status: 503 };
    try {
      const [entCtx, despCtx, dinheiro] = await Promise.all([
        buildEntradasContext(supabase, opts.mes, opts.ano),
        buildDespesasContext(supabase, opts.mes, opts.ano),
        loadPagamentosDinheiroComposicao(supabase, opts.mes, opts.ano, visao),
      ]);
      transacoesEntrada = toTxComposicao(entCtx.transacoes);
      transacoesDespesa = toTxComposicao(despCtx.transacoes);
      pagamentosDinheiro = dinheiro;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e), status: 502 };
    }
  }

  const composed = montarComposicaoLinha({
    modo,
    mes: opts.mes,
    ano: opts.ano,
    visao,
    bloco: found.bloco,
    linha: found.linha,
    entradasParceiros,
    catalogEntrada,
    catalogSaida,
    transacoesEntrada,
    transacoesDespesa,
    pagamentosDinheiro,
  });

  return {
    ok: true,
    data: {
      mes: opts.mes,
      ano: opts.ano,
      modo,
      visao,
      bloco: {
        templateKey: found.bloco.templateKey,
        titulo: found.bloco.titulo,
        tipo: found.bloco.tipo,
      },
      linha: {
        templateKey: found.linha.templateKey,
        label: found.linha.label,
        valor: found.linha.valor,
        valorTexto: found.linha.valorTexto,
      },
      tipoComposicao: composed.tipoComposicao,
      formula: composed.formula,
      itens: composed.itens,
      totalItens: composed.totalItens,
      totalLinha: composed.totalLinha,
      mensagem: composed.mensagem,
    },
  };
}
