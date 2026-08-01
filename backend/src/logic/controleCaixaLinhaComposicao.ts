import {
  preferStableEntradaTemplateKey,
  resolveCategoriaEntradaInCatalog,
  resolveHintNoCatalogo,
  stableEntradaTemplateKeyForLabel,
  type CategoriaEntradaLinha,
} from '../domain/entradas/categoriasEntrada.js';
import {
  preferStableSaidaTemplateKey,
  resolveCategoriaInCatalog,
  stableSaidaTemplateKeyForLabel,
  type CategoriaSaidaLinha,
} from '../domain/despesas/categoriasSaida.js';
import {
  descricaoFormulaRepasse,
  ENTRADA_PARA_SAIDA_REPASSE,
} from '../domain/entradas/repasseParceiros.js';
import { hintAbaFluxoParaControle } from '../domain/entradas/abaControleMap.js';
import {
  filtrarPagamentosDinheiroParaSyncVisao,
  type PagamentoFluxoDinheiroRow,
  type VisaoDinheiroControle,
} from './dinheiroFluxoParaControle.js';
import { isFormaPagamentoDinheiro } from './pagamentoDinheiroFluxo.js';
import {
  inferirMeioPagamentoFluxo,
  inferirMeioPagamentoVinculo,
  type MeioPagamentoAluno,
} from './meioPagamentoVinculo.js';

export type VisaoComposicao = VisaoDinheiroControle;

export type ComposicaoOrigem = 'extrato' | 'dinheiro_fluxo' | 'formula';

export type ComposicaoItem = {
  id: string;
  data: string | null;
  pessoa: string | null;
  valor: number;
  meio: MeioPagamentoAluno;
  meioLabel: string;
  origem: ComposicaoOrigem;
  descricao: string | null;
};

export type FormulaRepasseDetalhe = {
  templateKeyEntrada: string;
  labelEntrada: string;
  baseEntrada: number;
  descricao: string;
  aviso: string;
};

export type TipoComposicao =
  | 'extrato_e_dinheiro'
  | 'formula_repasse'
  | 'vazio'
  | 'modo_oficial';

export type TxClassificadaComposicao = {
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
};

export type LinhaAlvoComposicao = {
  id: string;
  label: string;
  valor: number | null;
  valorTexto: string | null;
  templateKey: string | null;
};

export type BlocoAlvoComposicao = {
  tipo: 'entrada' | 'saida';
  titulo: string;
  templateKey: string | null;
  linhas: LinhaAlvoComposicao[];
};

export type PagamentoDinheiroComposicao = PagamentoFluxoDinheiroRow & {
  id?: string;
  aluno_nome?: string | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function labelMeioCurto(meio: MeioPagamentoAluno): string {
  switch (meio) {
    case 'pix':
      return 'PIX';
    case 'debito':
      return 'Débito';
    case 'credito_a_vista':
      return 'Crédito';
    case 'credito_recorrente':
      return 'Crédito recorrente';
    case 'dinheiro':
      return 'Dinheiro';
    default:
      return '—';
  }
}

function isBloco(bloco: BlocoAlvoComposicao, kind: string): boolean {
  const tk = (bloco.templateKey ?? '').trim();
  const titulo = bloco.titulo.toLowerCase();
  if (kind === 'entrada_parceiros') {
    return tk === 'entrada_parceiros' || (bloco.tipo === 'entrada' && titulo.includes('parceir'));
  }
  if (kind === 'entrada_aluguel') {
    return (
      tk === 'entrada_aluguel_coworking' ||
      (bloco.tipo === 'entrada' && (titulo.includes('aluguel') || titulo.includes('coworking')))
    );
  }
  if (kind === 'saida_parceiros') {
    return tk === 'saida_parceiros' || (bloco.tipo === 'saida' && titulo.includes('parceir'));
  }
  if (kind === 'saida_fixas') {
    return (
      tk === 'saida_gastos_fixos' ||
      (bloco.tipo === 'saida' && (titulo.includes('fixa') || titulo.includes('gastos fixos')))
    );
  }
  return false;
}

function entradaKeyParaSaida(saiKey: string): string | null {
  return Object.entries(ENTRADA_PARA_SAIDA_REPASSE).find(([, sai]) => sai === saiKey)?.[0] ?? null;
}

/** Chaves equivalentes usadas no sync para achar a linha. */
export function chavesEquivalentesLinha(
  linha: LinhaAlvoComposicao,
  tipo: 'entrada' | 'saida',
): Set<string> {
  const keys = new Set<string>();
  const raw = (linha.templateKey ?? '').trim();
  if (raw) keys.add(raw);
  if (linha.id) keys.add(`linha:${linha.id}`);
  const stable =
    tipo === 'entrada'
      ? stableEntradaTemplateKeyForLabel(linha.label)
      : stableSaidaTemplateKeyForLabel(linha.label);
  if (stable) keys.add(stable);
  return keys;
}

function txCasaComChaves(
  tx: TxClassificadaComposicao,
  chaves: Set<string>,
  catalogEntrada: CategoriaEntradaLinha[] | null,
  catalogSaida: CategoriaSaidaLinha[] | null,
): boolean {
  if (tx.origem_efetiva !== 'mapeamento_manual' || !tx.template_key_efetivo) return false;
  const raw = tx.template_key_efetivo.trim();
  if (chaves.has(raw)) return true;

  if (catalogEntrada) {
    const cat = resolveCategoriaEntradaInCatalog(catalogEntrada, raw, tx.categoria_efetiva);
    if (cat) {
      const stable = preferStableEntradaTemplateKey(cat);
      if (chaves.has(stable) || chaves.has(`linha:${cat.linhaId}`)) return true;
    }
  }
  if (catalogSaida) {
    const cat = resolveCategoriaInCatalog(catalogSaida, raw, tx.categoria_efetiva);
    if (cat) {
      const stable = preferStableSaidaTemplateKey(cat);
      if (chaves.has(stable) || chaves.has(`linha:${cat.linhaId}`)) return true;
    }
  }
  return false;
}

function filtrarTxVisao(
  transacoes: TxClassificadaComposicao[],
  mes: number,
  ano: number,
  visao: VisaoComposicao,
): TxClassificadaComposicao[] {
  if (visao === 'caixa') {
    return transacoes.filter((t) => {
      const m = String(t.data).match(/^(\d{4})-(\d{2})/);
      return m != null && Number(m[1]) === ano && Number(m[2]) === mes;
    });
  }
  return transacoes.filter((t) => {
    if (t.mes_competencia != null && t.ano_competencia != null) {
      return Number(t.mes_competencia) === mes && Number(t.ano_competencia) === ano;
    }
    const m = String(t.data).match(/^(\d{4})-(\d{2})/);
    return m != null && Number(m[1]) === ano && Number(m[2]) === mes;
  });
}

function itemFromExtrato(tx: TxClassificadaComposicao): ComposicaoItem {
  const meio = inferirMeioPagamentoVinculo({
    pessoa: tx.pessoa,
    descricao: tx.descricao,
  });
  return {
    id: `extrato::${tx.id}`,
    data: tx.data.slice(0, 10),
    pessoa: tx.pessoa || null,
    valor: round2(Math.abs(Number(tx.valor) || 0)),
    meio,
    meioLabel: labelMeioCurto(meio),
    origem: 'extrato',
    descricao: tx.descricao,
  };
}

function itemFromDinheiro(p: PagamentoDinheiroComposicao, idx: number): ComposicaoItem {
  const meio: MeioPagamentoAluno = 'dinheiro';
  const pessoa =
    (p.aluno_nome ?? '').trim() ||
    (isFormaPagamentoDinheiro(p.forma) ? 'Pagamento em dinheiro' : null);
  return {
    id: p.id ? `dinheiro::${p.id}` : `dinheiro::${idx}-${p.data_pagamento ?? 'x'}-${p.valor}`,
    data: p.data_pagamento ? p.data_pagamento.slice(0, 10) : null,
    pessoa,
    valor: round2(Math.abs(Number(p.valor) || 0)),
    meio,
    meioLabel: labelMeioCurto(meio),
    origem: 'dinheiro_fluxo',
    descricao: p.aba ? `Fluxo · ${p.aba}` : 'Fluxo (dinheiro)',
  };
}

function dinheiroCasaComLinha(
  p: PagamentoDinheiroComposicao,
  chaves: Set<string>,
  catalog: CategoriaEntradaLinha[],
): boolean {
  const hint = hintAbaFluxoParaControle(p.aba ?? '', p.modalidade);
  if (!hint) return false;
  if (chaves.has(hint.templateKeyPreferido)) return true;
  const cat =
    resolveHintNoCatalogo(catalog, hint) ??
    resolveCategoriaEntradaInCatalog(catalog, hint.templateKeyPreferido, hint.labelEsperado);
  if (!cat) return false;
  const stable = preferStableEntradaTemplateKey(cat);
  return chaves.has(stable) || chaves.has(`linha:${cat.linhaId}`);
}

export type MontarComposicaoInput = {
  modo: 'oficial' | 'sistema';
  mes: number;
  ano: number;
  visao: VisaoComposicao;
  bloco: BlocoAlvoComposicao;
  linha: LinhaAlvoComposicao;
  /** Todas as linhas de entrada (para achar base do repasse). */
  entradasParceiros: LinhaAlvoComposicao[];
  catalogEntrada: CategoriaEntradaLinha[];
  catalogSaida: CategoriaSaidaLinha[];
  transacoesEntrada: TxClassificadaComposicao[];
  transacoesDespesa: TxClassificadaComposicao[];
  pagamentosDinheiro: PagamentoDinheiroComposicao[];
};

export type MontarComposicaoResult = {
  tipoComposicao: TipoComposicao;
  itens: ComposicaoItem[];
  totalItens: number;
  totalLinha: number | null;
  formula: FormulaRepasseDetalhe | null;
  mensagem: string | null;
};

/**
 * Monta a composição da linha (lógica pura, testável, sem PII).
 * Saídas Parceiros → só fórmula (base + descrição), nunca lista de PIX de repasse.
 */
export function montarComposicaoLinha(input: MontarComposicaoInput): MontarComposicaoResult {
  const totalLinha = input.linha.valor != null ? round2(input.linha.valor) : null;

  if (input.modo === 'oficial') {
    return {
      tipoComposicao: 'modo_oficial',
      itens: [],
      totalItens: 0,
      totalLinha,
      formula: null,
      mensagem:
        'Este valor veio da planilha (modo Oficial). Para ver a composição do extrato classificado e do dinheiro do Fluxo, abra o modo Sistema.',
    };
  }

  if (isBloco(input.bloco, 'saida_parceiros')) {
    const saiKey =
      (input.linha.templateKey ?? '').trim() ||
      stableSaidaTemplateKeyForLabel(input.linha.label) ||
      '';
    const entKey = entradaKeyParaSaida(saiKey);
    if (!entKey) {
      return {
        tipoComposicao: 'vazio',
        itens: [],
        totalItens: 0,
        totalLinha,
        formula: null,
        mensagem:
          'Esta saída de parceiro não tem fórmula de repasse cadastrada. O sync não lista PIX de repasse aqui.',
      };
    }

    const entradaLinha =
      input.entradasParceiros.find((l) => {
        const k =
          (l.templateKey ?? '').trim() || stableEntradaTemplateKeyForLabel(l.label) || '';
        return k === entKey || (l.templateKey ?? '') === entKey;
      }) ?? null;
    const baseEntrada = round2(entradaLinha?.valor ?? 0);
    const desc = descricaoFormulaRepasse(entKey, baseEntrada);
    const labelEntrada = entradaLinha?.label ?? entKey;

    return {
      tipoComposicao: 'formula_repasse',
      itens: [],
      totalItens: 0,
      totalLinha,
      formula: {
        templateKeyEntrada: entKey,
        labelEntrada,
        baseEntrada,
        descricao: desc ?? `Repasse a partir da entrada ${labelEntrada}`,
        aviso:
          'Saídas Parceiros = fórmula sobre a entrada do mês (não é a lista de PIX de repasse no extrato).',
      },
      mensagem: null,
    };
  }

  const chaves = chavesEquivalentesLinha(input.linha, input.bloco.tipo);
  const itens: ComposicaoItem[] = [];

  if (isBloco(input.bloco, 'entrada_parceiros') || isBloco(input.bloco, 'entrada_aluguel')) {
    const txs = filtrarTxVisao(input.transacoesEntrada, input.mes, input.ano, input.visao);
    for (const tx of txs) {
      if (txCasaComChaves(tx, chaves, input.catalogEntrada, null)) {
        itens.push(itemFromExtrato(tx));
      }
    }

    if (isBloco(input.bloco, 'entrada_parceiros')) {
      const dins = filtrarPagamentosDinheiroParaSyncVisao(
        input.pagamentosDinheiro,
        input.mes,
        input.ano,
        input.visao,
      );
      dins.forEach((p, idx) => {
        if (dinheiroCasaComLinha(p, chaves, input.catalogEntrada)) {
          itens.push(itemFromDinheiro(p, idx));
        }
      });
    }
  } else if (isBloco(input.bloco, 'saida_fixas')) {
    const txs = filtrarTxVisao(input.transacoesDespesa, input.mes, input.ano, input.visao);
    for (const tx of txs) {
      if (txCasaComChaves(tx, chaves, null, input.catalogSaida)) {
        itens.push(itemFromExtrato(tx));
      }
    }
  } else {
    return {
      tipoComposicao: 'vazio',
      itens: [],
      totalItens: 0,
      totalLinha,
      formula: null,
      mensagem: 'Este bloco não tem composição automática no sync Sistema.',
    };
  }

  itens.sort((a, b) => {
    const da = a.data ?? '';
    const db = b.data ?? '';
    if (da !== db) return da.localeCompare(db);
    return (a.pessoa ?? '').localeCompare(b.pessoa ?? '', 'pt-BR');
  });

  const totalItens = round2(itens.reduce((s, i) => s + i.valor, 0));
  return {
    tipoComposicao: itens.length ? 'extrato_e_dinheiro' : 'vazio',
    itens,
    totalItens,
    totalLinha,
    formula: null,
    mensagem: itens.length
      ? null
      : 'Nenhuma transação classificada (nem dinheiro do Fluxo) encontrada para esta linha na visão atual.',
  };
}

/** Resolve bloco+linha no DTO pelos template keys (ou rótulo). */
export function findBlocoLinha(
  blocos: BlocoAlvoComposicao[],
  blocoTemplateKey: string,
  linhaTemplateKey: string,
  linhaLabel?: string | null,
): { bloco: BlocoAlvoComposicao; linha: LinhaAlvoComposicao } | null {
  const bWant = blocoTemplateKey.trim();
  const lWant = linhaTemplateKey.trim();
  const labelWant = (linhaLabel ?? '').trim().toLowerCase();

  const bloco =
    blocos.find((b) => (b.templateKey ?? '').trim() === bWant) ??
    blocos.find((b) => b.titulo.toLowerCase().includes(bWant.toLowerCase()));
  if (!bloco) return null;

  const linha =
    bloco.linhas.find((l) => (l.templateKey ?? '').trim() === lWant) ??
    (labelWant
      ? bloco.linhas.find((l) => l.label.trim().toLowerCase() === labelWant)
      : undefined) ??
    bloco.linhas.find((l) => {
      const stable =
        bloco.tipo === 'entrada'
          ? stableEntradaTemplateKeyForLabel(l.label)
          : stableSaidaTemplateKeyForLabel(l.label);
      return stable === lWant;
    });
  if (!linha) return null;
  return { bloco, linha };
}

export { inferirMeioPagamentoFluxo };
