import { businessRules } from '../businessRules.js';
import { normalizeText, sameDayISO } from './conciliacaoTexto.js';
import type { PlanilhaItem } from './conciliacaoPagamentoMatch.js';
import { metodoPagamentoFinal, type MetodoPagamento } from '../services/transacoesFiltro.js';
import type { CategoriaEntradaLinha } from '../domain/entradas/categoriasEntrada.js';
import type { MapeamentoRow } from './despesasMapeamento.js';
import { isNomeGenericoMaquininha } from './entradasPagadorUtil.js';
import { buildGrupoFromFluxoVinculo, indexVinculosPorBanco, resolveTransacoesGrupoPorKey } from './entradasVinculosGrupo.js';
import type { GrupoEntrada, TransacaoEntradaClassificada } from './entradasAgrupamento.js';
import type { VinculoPagamento } from '../services/validacaoVinculos.js';

function textoMetodo(pessoa: string, descricao: string | null): string {
  return `${pessoa ?? ''} ${descricao ?? ''}`.trim();
}

/** Entrada da maquininha sem pagador identificável (vários alunos no mesmo rótulo). */
export function isEntradaCartaoAgregada(pessoa: string, descricao: string | null): boolean {
  const metodo = metodoPagamentoFinal(textoMetodo(pessoa, descricao), 'entrada');
  if (metodo !== 'Crédito' && metodo !== 'Débito') return false;
  return isNomeGenericoMaquininha(pessoa);
}

export function metodoEntradaCartao(pessoa: string, descricao: string | null): MetodoPagamento {
  const m = metodoPagamentoFinal(textoMetodo(pessoa, descricao), 'entrada');
  return m === 'Crédito' || m === 'Débito' ? m : 'Crédito';
}

export function formaFluxoCompativelCartao(formaFluxo: string, metodo: MetodoPagamento): boolean {
  const f = normalizeText(formaFluxo);
  if (!f) return false;
  if (metodo === 'Crédito') {
    return f.includes('CREDIT') || f.includes('CREDITO') || f.includes('CRÉDITO');
  }
  if (metodo === 'Débito') {
    return f.includes('DEBIT') || f.includes('DEBITO') || f.includes('DÉBITO');
  }
  return false;
}

export function matchFluxoCartaoParaTransacao(
  txn: TransacaoEntradaClassificada,
  metodo: MetodoPagamento,
  fluxoItens: PlanilhaItem[],
  usadosFluxo: Set<string>,
): PlanilhaItem | null {
  if (metodo !== 'Crédito' && metodo !== 'Débito') return null;
  const tol = businessRules.conciliacao.valorTolerancia;
  const valorTxn = Math.abs(Number(txn.valor || 0));

  const candidatos = fluxoItens.filter((f) => {
    if (usadosFluxo.has(f.id)) return false;
    if (!sameDayISO(f.data, txn.data)) return false;
    if (Math.abs(Number(f.valor || 0) - valorTxn) > tol) return false;
    return formaFluxoCompativelCartao(f.forma, metodo);
  });

  if (candidatos.length === 1) return candidatos[0];
  return null;
}

export type FluxoPagamentoMin = {
  id: string;
  aba: string;
  modalidade: string;
  aluno_nome: string;
  pagador_pix: string | null;
  responsaveis: string | null;
  data_pagamento: string;
  forma: string;
  valor: number;
};

export function fluxoItemFromRow(row: FluxoPagamentoMin): PlanilhaItem {
  return {
    id: `fluxo::${row.id}`,
    aba: row.aba,
    modalidade: row.modalidade,
    aluno: row.aluno_nome,
    linha: 0,
    data: row.data_pagamento.slice(0, 10),
    forma: row.forma,
    valor: Number(row.valor || 0),
    mesCompetencia: 0,
    anoCompetencia: 0,
    responsaveis: row.responsaveis ? [String(row.responsaveis)] : [],
    pagadorPix: row.pagador_pix ?? undefined,
  };
}

function buildGrupoCartaoAvulso(txn: TransacaoEntradaClassificada, metodo: MetodoPagamento): GrupoEntrada {
  const valor = Math.abs(Number(txn.valor || 0));
  const titulo = `${metodo} · R$ ${valor.toFixed(2).replace('.', ',')} · ${txn.data.slice(0, 10)}`;
  return {
    grupo_key: `cartao-txn::${txn.id}`,
    pessoa_normalizada: `cartao-txn::${txn.id}`,
    pessoa_exibida: txn.pessoa.trim() || metodo,
    titulo_card: titulo,
    aluno_nome: null,
    modalidade: null,
    aba_fluxo: null,
    qtd_mes: 1,
    total_mes: valor,
    datas: [txn.data],
    score_repeticao: 0,
    estado: 'pendente',
    categoria_label: null,
    template_key: null,
    bloco_template_key: null,
    bloco_titulo: null,
    origem_categoria: 'pendente',
    mapeamento_id: null,
    regra_desativada: false,
    sugestao_fluxo: null,
    regra_pendente_confirmacao: false,
    segmento: 'mensalidades',
    match_aluguel: null,
    origem_grupo: 'cartao_avulso',
    banco_transacao_id: txn.id,
    metodo_pagamento: metodo,
    fluxo_planilha_id: null,
    cartao_detalhe: 'Identifique na Validação de pagamentos (valor + data + crédito/débito)',
  };
}

export function buildGruposCartaoEntrada(
  transacoesCartao: TransacaoEntradaClassificada[],
  vinculos: VinculoPagamento[],
  fluxoById: Map<string, PlanilhaItem>,
  mapeamentos: MapeamentoRow[],
  mes: number,
  ano: number,
  catalog: CategoriaEntradaLinha[],
): GrupoEntrada[] {
  const vinculosByBanco = indexVinculosPorBanco(vinculos);
  const fluxoItens = [...fluxoById.values()];
  const usadosFluxo = new Set<string>();
  const grupos: GrupoEntrada[] = [];

  for (const txn of transacoesCartao) {
    const metodo = metodoEntradaCartao(txn.pessoa, txn.descricao);
    const vinculosTxn = vinculosByBanco.get(txn.id) ?? [];

    if (vinculosTxn.length > 0) {
      for (const v of vinculosTxn) {
        const fluxo = fluxoById.get(v.planilha_id);
        if (!fluxo) continue;
        usadosFluxo.add(fluxo.id);
        grupos.push(
          buildGrupoFromFluxoVinculo(fluxo, txn, 'cartao_vinculo', mapeamentos, mes, ano, catalog, metodo),
        );
      }
      continue;
    }

    const match = matchFluxoCartaoParaTransacao(txn, metodo, fluxoItens, usadosFluxo);
    if (match) {
      usadosFluxo.add(match.id);
      grupos.push(
        buildGrupoFromFluxoVinculo(match, txn, 'cartao_match', mapeamentos, mes, ano, catalog, metodo),
      );
      continue;
    }

    grupos.push(buildGrupoCartaoAvulso(txn, metodo));
  }

  return grupos;
}

/** @deprecated Use resolveTransacoesGrupoPorKey */
export function resolveTransacoesGrupoCartao(
  grupoKey: string,
  transacoes: TransacaoEntradaClassificada[],
): TransacaoEntradaClassificada[] | null {
  return resolveTransacoesGrupoPorKey(grupoKey, transacoes);
}

export { isNomeGenericoMaquininha };
