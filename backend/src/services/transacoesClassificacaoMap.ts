import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDespesasContext } from './despesasClassificacaoService.js';
import { getEntradasContextCached } from './entradasClassificacaoService.js';

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
