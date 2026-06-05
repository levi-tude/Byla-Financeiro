import type { CategoriaEntradaLinha } from '../domain/entradas/categoriasEntrada.js';
import { normalizePessoa } from './normalizePessoa.js';
import type { MapeamentoRow } from './despesasMapeamento.js';
import { pickMapeamentoEntradaForPessoa, pickSugestaoFluxoEntradaForPessoa } from './entradasMapeamento.js';

export {
  rangeMes,
  historicoRange6Meses,
  buildHistoricoNormSet,
} from './despesasAgrupamento.js';

export type EntradaTransacaoRow = {
  id: string;
  data: string;
  pessoa: string;
  valor: number;
  descricao: string | null;
  categoria_sugerida: string | null;
  origem_categoria: string | null;
  modalidade: string | null;
  nome_aluno: string | null;
};

export type GrupoEstado = 'pendente' | 'classificado';

export type GrupoEntrada = {
  grupo_key: string;
  pessoa_normalizada: string;
  pessoa_exibida: string;
  titulo_card: string;
  aluno_nome: string | null;
  modalidade: string | null;
  aba_fluxo: string | null;
  qtd_mes: number;
  total_mes: number;
  datas: string[];
  score_repeticao: number;
  estado: GrupoEstado;
  categoria_label: string | null;
  template_key: string | null;
  bloco_template_key: string | null;
  bloco_titulo: string | null;
  origem_categoria: string;
  mapeamento_id: string | null;
  regra_desativada: boolean;
  sugestao_fluxo: {
    mapeamento_id: string;
    template_key: string;
    label: string;
    detalhe: string | null;
  } | null;
  regra_pendente_confirmacao: boolean;
  segmento: 'mensalidades' | 'aluguel_coworking';
  match_aluguel: {
    template_key: string;
    label: string;
    confianca: 'alta' | 'media' | 'baixa';
    motivo: string;
  } | null;
  origem_grupo?: 'pix' | 'pix_vinculo' | 'cartao_vinculo' | 'cartao_match' | 'cartao_avulso';
  banco_transacao_id?: string | null;
  metodo_pagamento?: string | null;
  fluxo_planilha_id?: string | null;
  cartao_detalhe?: string | null;
};

export type TransacaoEntradaClassificada = EntradaTransacaoRow & {
  pessoa_normalizada: string;
  categoria_efetiva: string | null;
  template_key_efetivo: string | null;
  origem_efetiva: string;
  mes_competencia?: number;
  ano_competencia?: number;
  competencia_confirmada?: boolean;
  competencia_origem?: string;
  competencia_sugerida_mes?: number;
  competencia_sugerida_ano?: number;
  competencia_alinha_data?: boolean;
  alerta_duplicata_competencia?: boolean;
};

function pickPessoaExibida(nomes: string[]): string {
  const freq = new Map<string, number>();
  for (const n of nomes) {
    const t = (n ?? '').trim();
    if (!t) continue;
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  let best = nomes[0]?.trim() ?? '';
  let max = 0;
  for (const [nome, c] of freq) {
    if (c > max) {
      max = c;
      best = nome;
    }
  }
  return best || '—';
}

export function classificarTransacaoEntrada(
  t: EntradaTransacaoRow,
  mapeamentos: MapeamentoRow[],
  mes: number,
  ano: number,
  catalog: CategoriaEntradaLinha[],
): TransacaoEntradaClassificada {
  const pessoa_normalizada = normalizePessoa(t.pessoa);
  const map = pickMapeamentoEntradaForPessoa(mapeamentos, pessoa_normalizada, mes, ano, catalog);
  if (map) {
    return {
      ...t,
      pessoa_normalizada,
      categoria_efetiva: map.categoria.label,
      template_key_efetivo: map.categoria.templateKey,
      origem_efetiva: 'mapeamento_manual',
    };
  }
  const origem = (t.origem_categoria ?? '').trim() || 'pendente';
  const cat =
    origem === 'mapeamento_manual'
      ? (t.categoria_sugerida ?? '').trim() || null
      : origem !== 'fallback' && origem !== 'pendente'
        ? (t.categoria_sugerida ?? '').trim() || null
        : null;
  const isHeuristica = cat && cat !== 'A classificar';
  return {
    ...t,
    pessoa_normalizada,
    categoria_efetiva: isHeuristica ? cat : null,
    template_key_efetivo: null,
    origem_efetiva: isHeuristica ? origem : 'pendente',
  };
}

export function buildGruposEntrada(
  transacoes: TransacaoEntradaClassificada[],
  mapeamentos: MapeamentoRow[],
  mes: number,
  ano: number,
  historicoNorms: Set<string>,
  catalog: CategoriaEntradaLinha[],
): GrupoEntrada[] {
  const byNorm = new Map<string, TransacaoEntradaClassificada[]>();
  for (const t of transacoes) {
    const list = byNorm.get(t.pessoa_normalizada) ?? [];
    list.push(t);
    byNorm.set(t.pessoa_normalizada, list);
  }

  const grupos: GrupoEntrada[] = [];
  for (const [pessoa_normalizada, itens] of byNorm) {
    const total_mes = itens.reduce((s, x) => s + Math.abs(Number(x.valor || 0)), 0);
    const datas = [...new Set(itens.map((x) => x.data))].sort();
    const map = pickMapeamentoEntradaForPessoa(mapeamentos, pessoa_normalizada, mes, ano, catalog);
    const sugestaoFluxo = pickSugestaoFluxoEntradaForPessoa(
      mapeamentos,
      pessoa_normalizada,
      mes,
      ano,
      catalog,
    );
    const classificado = map != null;
    const qtd_mes = itens.length;
    let score = 0;
    if (qtd_mes >= 2) score += 2;
    if (historicoNorms.has(pessoa_normalizada)) score += 1;

    const aluno = itens.find((x) => (x.nome_aluno ?? '').trim())?.nome_aluno?.trim() ?? null;
    const modalidade = itens.find((x) => (x.modalidade ?? '').trim())?.modalidade?.trim() ?? null;
    const pessoa_exibida = pickPessoaExibida(itens.map((x) => x.pessoa));
    const titulo_card =
      aluno && modalidade ? `${aluno} · ${modalidade}` : aluno ? aluno : pessoa_exibida;

    grupos.push({
      grupo_key: pessoa_normalizada,
      pessoa_normalizada,
      pessoa_exibida,
      titulo_card,
      aluno_nome: aluno,
      modalidade,
      aba_fluxo: null,
      qtd_mes,
      total_mes,
      datas,
      score_repeticao: score,
      estado: classificado ? 'classificado' : 'pendente',
      categoria_label: map?.categoria.label ?? null,
      template_key: map?.categoria.templateKey ?? null,
      bloco_template_key: map?.categoria.blocoTemplateKey ?? null,
      bloco_titulo: map?.categoria.blocoTitulo ?? null,
      origem_categoria: classificado ? 'mapeamento_manual' : sugestaoFluxo ? 'validacao_fluxo' : 'pendente',
      mapeamento_id: map?.row.id ?? sugestaoFluxo?.row.id ?? null,
      regra_desativada: map?.regraDesativada ?? false,
      sugestao_fluxo: sugestaoFluxo
        ? {
            mapeamento_id: sugestaoFluxo.row.id,
            template_key: sugestaoFluxo.categoria.templateKey,
            label: sugestaoFluxo.categoria.label,
            detalhe: sugestaoFluxo.row.observacao ?? null,
          }
        : null,
      regra_pendente_confirmacao: sugestaoFluxo != null,
      segmento: 'mensalidades',
      match_aluguel: null,
    });
  }

  grupos.sort((a, b) => {
    if (b.score_repeticao !== a.score_repeticao) return b.score_repeticao - a.score_repeticao;
    if (b.total_mes !== a.total_mes) return b.total_mes - a.total_mes;
    return a.titulo_card.localeCompare(b.titulo_card, 'pt-BR');
  });
  return grupos;
}
