import { hintAbaFluxoParaControle } from '../domain/entradas/abaControleMap.js';
import { resolveHintNoCatalogo, type CategoriaEntradaLinha } from '../domain/entradas/categoriasEntrada.js';
import type { PlanilhaItem } from './conciliacaoPagamentoMatch.js';
import type { GrupoEntrada, TransacaoEntradaClassificada } from './entradasAgrupamento.js';
import { isNomeGenericoMaquininha } from './entradasPagadorUtil.js';
import type { MapeamentoRow } from './despesasMapeamento.js';
import { normalizePessoa } from './normalizePessoa.js';
import {
  pickMapeamentoEntradaForPessoa,
  pickSugestaoFluxoEntradaForPessoa,
} from './entradasMapeamento.js';
import type { VinculoPagamento } from '../services/validacaoVinculos.js';
import type { MetodoPagamento } from '../services/transacoesFiltro.js';

export function indexVinculosPorBanco(vinculos: VinculoPagamento[]): Map<string, VinculoPagamento[]> {
  const map = new Map<string, VinculoPagamento[]>();
  for (const v of vinculos) {
    const list = map.get(v.banco_id) ?? [];
    list.push(v);
    map.set(v.banco_id, list);
  }
  return map;
}

/** Pagador da regra em Entradas = quem aparece no extrato (ex.: Vicente), não só o aluno. */
export function pagadorNormParaMapeamento(
  txn: TransacaoEntradaClassificada,
  fluxo: PlanilhaItem,
): string {
  const fromBanco = normalizePessoa(txn.pessoa);
  if (fromBanco && !isNomeGenericoMaquininha(txn.pessoa)) return fromBanco;
  const candidatos = [fluxo.pagadorPix, ...(fluxo.responsaveis ?? []), fluxo.aluno].filter(Boolean) as string[];
  for (const c of candidatos) {
    const n = normalizePessoa(c);
    if (n && !isNomeGenericoMaquininha(c)) return n;
  }
  return fromBanco || normalizePessoa(fluxo.aluno || fluxo.id);
}

function sugestaoInlineFromFluxo(
  fluxo: PlanilhaItem,
  catalog: CategoriaEntradaLinha[],
  dataRef: string,
): GrupoEntrada['sugestao_fluxo'] {
  const hint = hintAbaFluxoParaControle(fluxo.aba, fluxo.modalidade);
  if (!hint) return null;
  const cat = resolveHintNoCatalogo(catalog, hint);
  if (!cat) return null;
  const aluno = fluxo.aluno?.trim() || '—';
  const mod = fluxo.modalidade?.trim() || '—';
  const [y, m, d] = dataRef.slice(0, 10).split('-');
  const dataBr = d && m && y ? `${d}/${m}/${y}` : dataRef;
  return {
    mapeamento_id: '',
    template_key: cat.templateKey,
    label: cat.label,
    detalhe: `Validação ${dataBr} · ${aluno} · ${mod}`,
  };
}

function emptyVinculoBase(): Pick<
  GrupoEntrada,
  'score_repeticao' | 'regra_desativada' | 'segmento' | 'match_aluguel'
> {
  return {
    score_repeticao: 0,
    regra_desativada: false,
    segmento: 'mensalidades',
    match_aluguel: null,
  };
}

export type OrigemGrupoVinculo = 'pix_vinculo' | 'cartao_vinculo' | 'cartao_match';

export function buildGrupoFromFluxoVinculo(
  fluxo: PlanilhaItem,
  txn: TransacaoEntradaClassificada,
  origem: OrigemGrupoVinculo,
  mapeamentos: MapeamentoRow[],
  mes: number,
  ano: number,
  catalog: CategoriaEntradaLinha[],
  metodo?: MetodoPagamento | null,
): GrupoEntrada {
  const pessoaNorm = pagadorNormParaMapeamento(txn, fluxo);
  const map = pickMapeamentoEntradaForPessoa(mapeamentos, pessoaNorm, mes, ano, catalog);
  const sugestaoDb = pickSugestaoFluxoEntradaForPessoa(mapeamentos, pessoaNorm, mes, ano, catalog);
  const sugestaoInline = sugestaoInlineFromFluxo(fluxo, catalog, txn.data);
  const classificado = map != null;

  const pagadorExibido = txn.pessoa.trim() || fluxo.pagadorPix?.trim() || fluxo.aluno?.trim() || '—';
  const titulo =
    fluxo.aluno && fluxo.modalidade
      ? `${fluxo.aluno} · ${fluxo.modalidade}`
      : fluxo.aluno || pagadorExibido;

  const prefix =
    origem === 'pix_vinculo' ? 'pix-vinculo' : origem === 'cartao_vinculo' ? 'cartao-vinculo' : 'cartao-match';

  const sugestaoFluxo = sugestaoDb
    ? {
        mapeamento_id: sugestaoDb.row.id,
        template_key: sugestaoDb.categoria.templateKey,
        label: sugestaoDb.categoria.label,
        detalhe: sugestaoDb.row.observacao ?? sugestaoInline?.detalhe ?? null,
      }
    : sugestaoInline;

  const detalheValidacao =
    origem === 'pix_vinculo'
      ? `Vinculado na validação · PIX · ${pagadorExibido}`
      : metodo
        ? origem === 'cartao_vinculo'
          ? `Vinculado na validação · ${metodo} · ${txn.data.slice(0, 10)}`
          : `Sugerido por valor/data/forma · ${metodo}`
        : null;

  return {
    grupo_key: `${prefix}::${fluxo.id}::${txn.id}`,
    pessoa_normalizada: pessoaNorm,
    pessoa_exibida: pagadorExibido,
    titulo_card: titulo,
    aluno_nome: fluxo.aluno?.trim() || null,
    modalidade: fluxo.modalidade?.trim() || null,
    aba_fluxo: fluxo.aba?.trim() || null,
    qtd_mes: 1,
    total_mes: Math.abs(Number(fluxo.valor || txn.valor || 0)),
    datas: [txn.data],
    estado: classificado ? 'classificado' : 'pendente',
    categoria_label: map?.categoria.label ?? sugestaoFluxo?.label ?? null,
    template_key: map?.categoria.templateKey ?? null,
    bloco_template_key: map?.categoria.blocoTemplateKey ?? null,
    bloco_titulo: map?.categoria.blocoTitulo ?? null,
    origem_categoria: classificado ? 'mapeamento_manual' : sugestaoFluxo ? 'validacao_fluxo' : 'pendente',
    mapeamento_id: map?.row.id ?? sugestaoDb?.row.id ?? null,
    sugestao_fluxo: sugestaoFluxo,
    regra_pendente_confirmacao: !classificado && sugestaoFluxo != null,
    origem_grupo: origem,
    banco_transacao_id: txn.id,
    metodo_pagamento: metodo ?? null,
    fluxo_planilha_id: fluxo.id,
    cartao_detalhe: detalheValidacao,
    ...emptyVinculoBase(),
    regra_desativada: map?.regraDesativada ?? false,
  };
}

/** Transações PIX (ou outras nominadas) com vínculo na validação → um grupo por vínculo (não acumula pagador). */
export function buildGruposPixComVinculos(
  transacoesPix: TransacaoEntradaClassificada[],
  vinculos: VinculoPagamento[],
  fluxoById: Map<string, PlanilhaItem>,
  mapeamentos: MapeamentoRow[],
  mes: number,
  ano: number,
  catalog: CategoriaEntradaLinha[],
): { grupos: GrupoEntrada[]; transacoesRestantes: TransacaoEntradaClassificada[] } {
  const vinculosByBanco = indexVinculosPorBanco(vinculos);
  const txnIdsVinculados = new Set<string>();
  const grupos: GrupoEntrada[] = [];

  for (const txn of transacoesPix) {
    const vinculosTxn = vinculosByBanco.get(txn.id) ?? [];
    if (vinculosTxn.length === 0) continue;

    txnIdsVinculados.add(txn.id);
    for (const v of vinculosTxn) {
      const fluxo = fluxoById.get(v.planilha_id);
      if (!fluxo) continue;
      grupos.push(
        buildGrupoFromFluxoVinculo(fluxo, txn, 'pix_vinculo', mapeamentos, mes, ano, catalog, null),
      );
    }
  }

  return {
    grupos,
    transacoesRestantes: transacoesPix.filter((t) => !txnIdsVinculados.has(t.id)),
  };
}

export function resolveTransacoesGrupoPorKey(
  grupoKey: string,
  transacoes: TransacaoEntradaClassificada[],
): TransacaoEntradaClassificada[] | null {
  if (grupoKey.startsWith('cartao-txn::')) {
    const id = grupoKey.slice('cartao-txn::'.length);
    return transacoes.filter((t) => t.id === id);
  }
  if (
    grupoKey.startsWith('cartao-vinculo::') ||
    grupoKey.startsWith('cartao-match::') ||
    grupoKey.startsWith('pix-vinculo::')
  ) {
    const parts = grupoKey.split('::');
    const bancoId = parts[2];
    if (bancoId) return transacoes.filter((t) => t.id === bancoId);
  }
  return null;
}
