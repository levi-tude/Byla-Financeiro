import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDespesasContext } from './despesasClassificacaoService.js';
import { getEntradasContextCached } from './entradasClassificacaoService.js';
import { transacaoContaNaCompetencia } from './transacaoCompetenciaService.js';
import { competenciaFromDataIso } from '../domain/competencia/competenciaTransacao.js';

export const TRANSACOES_CATEGORIA_PENDENTE = '_pendente';
export const TRANSACOES_BLOCO_PREFIX = 'bloco:';

export type ClassificacaoTransacao = {
  template_key: string | null;
  categoria_label: string | null;
  bloco_template_key: string | null;
  classificado: boolean;
};

function dataNoMes(dataIso: string, mes: number, ano: number): boolean {
  const m = String(dataIso).match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  return Number(m[1]) === ano && Number(m[2]) === mes;
}

function blocoFromCatalog(
  catalog: Array<{ templateKey: string; blocoTemplateKey: string }>,
  templateKey: string | null | undefined,
): string | null {
  if (!templateKey) return null;
  return catalog.find((c) => c.templateKey === templateKey)?.blocoTemplateKey ?? null;
}

/** Mapa transacao_id → classificação efetiva (caixa no mês). */
export async function mapClassificacaoPorId(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
): Promise<Map<string, ClassificacaoTransacao>> {
  const map = new Map<string, ClassificacaoTransacao>();
  const [entCtx, despCtx] = await Promise.all([
    getEntradasContextCached(supabase, mes, ano),
    buildDespesasContext(supabase, mes, ano),
  ]);

  for (const t of entCtx.transacoes) {
    if (!dataNoMes(t.data, mes, ano)) continue;
    const classificado = t.origem_efetiva === 'mapeamento_manual' && Boolean(t.template_key_efetivo);
    map.set(t.id, {
      template_key: classificado ? t.template_key_efetivo : null,
      categoria_label: classificado ? t.categoria_efetiva : null,
      bloco_template_key: classificado
        ? blocoFromCatalog(entCtx.catalog, t.template_key_efetivo)
        : null,
      classificado,
    });
  }

  for (const t of despCtx.transacoes) {
    if (!dataNoMes(t.data, mes, ano)) continue;
    const classificado = t.origem_efetiva === 'mapeamento_manual' && Boolean(t.template_key_efetivo);
    map.set(t.id, {
      template_key: classificado ? t.template_key_efetivo : null,
      categoria_label: classificado ? t.categoria_efetiva : null,
      bloco_template_key: classificado
        ? blocoFromCatalog(despCtx.catalog, t.template_key_efetivo)
        : null,
      classificado,
    });
  }

  return map;
}

export function parseCategoriaControleFiltro(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (v === TRANSACOES_CATEGORIA_PENDENTE) return v;
  const m = v.match(/^(entrada|saida)::(.+)$/);
  if (!m || !m[2]) return null;
  return v;
}

export type CategoriasControleFiltro = {
  modo: 'incluir' | 'excluir';
  itens: string[];
};

/**
 * Combina o param novo `categorias` (lista) com o legado `categoria` (único).
 * Retorna `{ ok: false }` se algum item for inválido; filtro null = sem filtro.
 */
export function parseCategoriasControleFiltro(
  rawLista: string | undefined,
  rawLegado: string | undefined,
  modo: 'incluir' | 'excluir',
): { ok: true; filtro: CategoriasControleFiltro | null } | { ok: false } {
  const fonte = (rawLista ?? '').trim() || (rawLegado ?? '').trim();
  if (!fonte) return { ok: true, filtro: null };
  const itens: string[] = [];
  for (const part of fonte.split(',')) {
    if (!part.trim()) continue;
    const p = parseCategoriaControleFiltro(part);
    if (!p) return { ok: false };
    if (!itens.includes(p)) itens.push(p);
  }
  if (itens.length === 0) return { ok: true, filtro: null };
  return { ok: true, filtro: { modo, itens } };
}

/**
 * Modo incluir: passa se casar com QUALQUER item. Modo excluir: passa se NÃO casar com nenhum.
 * Transações pendentes (sem categoria) não casam com itens `entrada::`/`saida::`, então no modo
 * excluir elas continuam visíveis — a menos que `_pendente` esteja na lista.
 */
export function transacaoPassaFiltroCategorias(
  txn: { id: string; tipo: 'entrada' | 'saida' },
  filtro: CategoriasControleFiltro | null,
  map: Map<string, ClassificacaoTransacao>,
): boolean {
  if (!filtro || filtro.itens.length === 0) return true;
  const matchAlgum = filtro.itens.some((item) => transacaoPassaFiltroCategoriaControle(txn, item, map));
  return filtro.modo === 'incluir' ? matchAlgum : !matchAlgum;
}

export type TransacaoCompetenciaListada = {
  id: string;
  data: string;
  pessoa: string;
  valor: number;
  descricao: string | null;
  tipo: 'entrada' | 'saida';
  mes_competencia: number;
  ano_competencia: number;
  competencia_confirmada: boolean;
  competencia_origem: string;
  competencia_sugerida_mes: number;
  competencia_sugerida_ano: number;
  competencia_alinha_data: boolean;
  alerta_duplicata_competencia: boolean;
};

/**
 * Lista transações cuja competência efetiva cai em mes/ano, varrendo os contextos de
 * entradas e despesas do mês e dos meses vizinhos (pagamentos podem ocorrer fora do mês
 * de competência). Também retorna o mapa de classificação correspondente.
 */
export async function listarTransacoesPorCompetencia(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
): Promise<{ itens: TransacaoCompetenciaListada[]; classificacao: Map<string, ClassificacaoTransacao> }> {
  const janelas = [shiftMesAno(mes, ano, -1), { mes, ano }, shiftMesAno(mes, ano, 1)];
  const porId = new Map<string, TransacaoCompetenciaListada>();
  const classificacao = new Map<string, ClassificacaoTransacao>();

  for (const j of janelas) {
    const [entCtx, despCtx] = await Promise.all([
      getEntradasContextCached(supabase, j.mes, j.ano),
      buildDespesasContext(supabase, j.mes, j.ano),
    ]);

    for (const t of entCtx.transacoes) {
      if (!dataNoMes(t.data, j.mes, j.ano)) continue;
      if (porId.has(t.id)) continue;
      if (!transacaoContaNaCompetencia(t, mes, ano)) continue;
      porId.set(t.id, montarListada(t, 'entrada'));
      classificacao.set(t.id, classificacaoDe(t, entCtx.catalog));
    }

    for (const t of despCtx.transacoes) {
      if (!dataNoMes(t.data, j.mes, j.ano)) continue;
      if (porId.has(t.id)) continue;
      if (!transacaoContaNaCompetencia(t, mes, ano)) continue;
      porId.set(t.id, montarListada(t, 'saida'));
      classificacao.set(t.id, classificacaoDe(t, despCtx.catalog));
    }
  }

  return { itens: [...porId.values()], classificacao };
}

function shiftMesAno(mes: number, ano: number, delta: number): { mes: number; ano: number } {
  const d = new Date(ano, mes - 1 + delta, 1);
  return { mes: d.getMonth() + 1, ano: d.getFullYear() };
}

type CtxTransacao = {
  id: string;
  data: string;
  pessoa: string;
  valor: number;
  descricao: string | null;
  origem_efetiva: string;
  template_key_efetivo: string | null;
  categoria_efetiva: string | null;
  mes_competencia?: number;
  ano_competencia?: number;
  competencia_confirmada?: boolean;
  competencia_origem?: string;
  competencia_sugerida_mes?: number;
  competencia_sugerida_ano?: number;
  competencia_alinha_data?: boolean;
  alerta_duplicata_competencia?: boolean;
};

function montarListada(t: CtxTransacao, tipo: 'entrada' | 'saida'): TransacaoCompetenciaListada {
  // Só chega aqui após passar em transacaoContaNaCompetencia, então mes/ano existem.
  const fallback = competenciaFromDataIso(t.data);
  return {
    id: t.id,
    data: t.data,
    pessoa: t.pessoa,
    valor: Number(t.valor || 0),
    descricao: t.descricao,
    tipo,
    mes_competencia: t.mes_competencia ?? fallback.mes,
    ano_competencia: t.ano_competencia ?? fallback.ano,
    competencia_confirmada: t.competencia_confirmada ?? false,
    competencia_origem: t.competencia_origem ?? 'data_extrato',
    competencia_sugerida_mes: t.competencia_sugerida_mes ?? fallback.mes,
    competencia_sugerida_ano: t.competencia_sugerida_ano ?? fallback.ano,
    competencia_alinha_data: t.competencia_alinha_data ?? true,
    alerta_duplicata_competencia: t.alerta_duplicata_competencia ?? false,
  };
}

function classificacaoDe(
  t: Pick<CtxTransacao, 'origem_efetiva' | 'template_key_efetivo' | 'categoria_efetiva'>,
  catalog: Array<{ templateKey: string; blocoTemplateKey: string }>,
): ClassificacaoTransacao {
  const classificado = t.origem_efetiva === 'mapeamento_manual' && Boolean(t.template_key_efetivo);
  return {
    template_key: classificado ? t.template_key_efetivo : null,
    categoria_label: classificado ? t.categoria_efetiva : null,
    bloco_template_key: classificado ? blocoFromCatalog(catalog, t.template_key_efetivo) : null,
    classificado,
  };
}

export function transacaoPassaFiltroCategoriaControle(
  txn: { id: string; tipo: 'entrada' | 'saida' },
  categoriaFiltro: string | null,
  map: Map<string, ClassificacaoTransacao>,
): boolean {
  if (!categoriaFiltro) return true;
  const info = map.get(txn.id) ?? {
    template_key: null,
    categoria_label: null,
    bloco_template_key: null,
    classificado: false,
  };

  if (categoriaFiltro === TRANSACOES_CATEGORIA_PENDENTE) {
    return !info.classificado;
  }

  const match = categoriaFiltro.match(/^(entrada|saida)::(.+)$/);
  if (!match) return true;
  const familia = match[1] as 'entrada' | 'saida';
  const keyPart = match[2];
  if (txn.tipo !== familia) return false;
  if (!info.classificado) return false;

  if (keyPart.startsWith(TRANSACOES_BLOCO_PREFIX)) {
    const blocoKey = keyPart.slice(TRANSACOES_BLOCO_PREFIX.length);
    return Boolean(blocoKey) && info.bloco_template_key === blocoKey;
  }

  return info.template_key === keyPart;
}
