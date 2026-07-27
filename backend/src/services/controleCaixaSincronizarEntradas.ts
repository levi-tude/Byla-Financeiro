import {
  catalogoEntradasFromControleData,
  preferStableEntradaBlocoKey,
  preferStableEntradaTemplateKey,
  resolveCategoriaEntradaInCatalog,
  type CategoriaEntradaLinha,
} from '../domain/entradas/categoriasEntrada.js';
import {
  catalogoSaidasFromControleData,
  isCategoriaSaidaParceiros,
  preferStableSaidaBlocoKey,
  preferStableSaidaTemplateKey,
  resolveCategoriaInCatalog,
  type CategoriaSaidaLinha,
} from '../domain/despesas/categoriasSaida.js';
import {
  mesPermiteSincronizarEntradasRepasses,
  SYNC_ENTRADAS_REPASSE_BLOQUEADO_MSG,
} from '../domain/entradas/syncEntradasRepassesEligible.js';
import { precisaRepararEstruturaSistema } from '../domain/controleCaixa/mesAnterior.js';
import {
  dtoToControlePersistPayload,
  ensureParceirosTemplateKeys,
  ensureSistemaEstruturaCompleta,
  ensureStableTemplateKeys,
  mergeEstruturaPreservandoValores,
} from './controleCaixaEstrutura.js';
import {
  loadControleCaixaExisting,
  readControleCaixa,
  type ControleCaixaReadDto,
} from './controleCaixaRead.js';
import { persistControleCaixaModo } from './controleCaixaPersist.js';
import { buildEntradasContext } from './entradasClassificacaoService.js';
import { buildDespesasContext } from './despesasClassificacaoService.js';
import { getSupabase } from './supabaseClient.js';
import { transacaoContaNaCompetencia } from './transacaoCompetenciaService.js';
import {
  agregarValorEmChaves,
  aplicarSyncCompletoSistema,
} from './controleCaixaSyncLogic.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export { mergeEstruturaPreservandoValores, precisaRepararEstruturaSistema, aplicarSyncCompletoSistema };

export type VisaoControleSync = 'caixa' | 'competencia';

function dataNoMes(dataIso: string, mes: number, ano: number): boolean {
  const m = String(dataIso).match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  return Number(m[1]) === ano && Number(m[2]) === mes;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type TxClassificada = {
  data: string;
  valor: number;
  origem_efetiva: string;
  template_key_efetivo: string | null;
  categoria_efetiva?: string | null;
  mes_competencia?: number;
  ano_competencia?: number;
  competencia_confirmada?: boolean;
};

function agregarEntradasClassificadas(
  transacoes: TxClassificada[],
  catalog: CategoriaEntradaLinha[],
  mes: number,
  ano: number,
  visao: VisaoControleSync,
): Map<string, number> {
  const map = new Map<string, number>();
  const filtradas =
    visao === 'caixa'
      ? transacoes.filter((t) => dataNoMes(t.data, mes, ano))
      : transacoes.filter((t) => transacaoContaNaCompetencia(t, mes, ano, true));

  for (const t of filtradas) {
    if (t.origem_efetiva !== 'mapeamento_manual' || !t.template_key_efetivo) continue;
    const cat = resolveCategoriaEntradaInCatalog(
      catalog,
      t.template_key_efetivo,
      t.categoria_efetiva,
    );
    const keys: string[] = [t.template_key_efetivo];
    if (cat) {
      keys.push(preferStableEntradaTemplateKey(cat), `linha:${cat.linhaId}`);
    }
    agregarValorEmChaves(map, keys, Number(t.valor || 0));
  }
  return map;
}

function agregarDespesasFixasClassificadas(
  transacoes: TxClassificada[],
  catalog: CategoriaSaidaLinha[],
  mes: number,
  ano: number,
  visao: VisaoControleSync,
): Map<string, number> {
  const map = new Map<string, number>();
  const filtradas =
    visao === 'caixa'
      ? transacoes.filter((t) => dataNoMes(t.data, mes, ano))
      : transacoes.filter((t) => transacaoContaNaCompetencia(t, mes, ano, true));

  for (const t of filtradas) {
    if (t.origem_efetiva !== 'mapeamento_manual' || !t.template_key_efetivo) continue;
    const cat = resolveCategoriaInCatalog(catalog, t.template_key_efetivo, t.categoria_efetiva);
    if (!cat) continue;
    // Saídas Parceiros nunca entram no sync de fixas (só fórmulas).
    if (isCategoriaSaidaParceiros(cat)) continue;
    const keys = [
      t.template_key_efetivo,
      preferStableSaidaTemplateKey(cat),
      `linha:${cat.linhaId}`,
    ];
    agregarValorEmChaves(map, keys, Number(t.valor || 0));
  }
  return map;
}

type MapeamentoStickyRow = {
  id: string;
  categoria: string | null;
  template_key: string | null;
  bloco_template_key: string | null;
  aplica_tipo: string;
};

/**
 * Remapeia mapeamentos sticky órfãos (`linha:uuid` / legado) para chave estável
 * pelo rótulo da categoria, quando o Controle já tem a chave estável.
 * Preserva classificações existentes sempre que o rótulo casar.
 */
export async function remapearMapeamentosStickyParaChavesEstaveis(
  supabase: SupabaseClient,
  data: ControleCaixaReadDto,
): Promise<{ atualizados: number }> {
  const catalogEntrada = catalogoEntradasFromControleData(data);
  const catalogSaida = catalogoSaidasFromControleData(data);

  const { data: rows, error } = await supabase
    .from('mapeamento_pessoa_categoria')
    .select('id, categoria, template_key, bloco_template_key, aplica_tipo')
    .eq('ativo', true)
    .in('aplica_tipo', ['entrada', 'saida', 'todos']);
  if (error) throw new Error(error.message);

  let atualizados = 0;
  for (const row of (rows ?? []) as MapeamentoStickyRow[]) {
    const raw = (row.template_key ?? '').trim();
    const precisaRemap =
      !raw || raw.startsWith('linha:') || raw.startsWith('legado:');
    if (!precisaRemap) continue;

    const isEntrada = row.aplica_tipo === 'entrada' || row.aplica_tipo === 'todos';
    const isSaida = row.aplica_tipo === 'saida' || row.aplica_tipo === 'todos';

    let nextKey: string | null = null;
    let nextBloco: string | null = null;
    let nextLabel: string | null = null;

    if (isEntrada) {
      const cat = resolveCategoriaEntradaInCatalog(catalogEntrada, raw, row.categoria);
      if (cat) {
        nextKey = preferStableEntradaTemplateKey(cat);
        nextBloco = preferStableEntradaBlocoKey(cat);
        nextLabel = cat.label;
      }
    }
    if (!nextKey && isSaida) {
      const cat = resolveCategoriaInCatalog(catalogSaida, raw, row.categoria);
      if (cat) {
        nextKey = preferStableSaidaTemplateKey(cat);
        nextBloco = preferStableSaidaBlocoKey(cat);
        nextLabel = cat.label;
      }
    }

    if (!nextKey || nextKey === raw || nextKey.startsWith('linha:')) continue;

    const patch: Record<string, unknown> = {
      template_key: nextKey,
      updated_at: new Date().toISOString(),
    };
    if (nextBloco) patch.bloco_template_key = nextBloco;
    if (nextLabel) patch.categoria = nextLabel;

    const { error: updErr } = await supabase
      .from('mapeamento_pessoa_categoria')
      .update(patch)
      .eq('id', row.id);
    if (updErr) throw new Error(updErr.message);
    atualizados += 1;
  }

  return { atualizados };
}

/**
 * Sync completo: Entradas (parceiros + aluguel), Saídas Fixas (despesas) e
 * Saídas Parceiros (só fórmulas). Sempre grava no modo sistema.
 */
export async function sincronizarControleCaixaSistema(
  mes: number,
  ano: number,
  visao: VisaoControleSync = 'competencia',
): Promise<{ ok: true; data: ControleCaixaReadDto } | { error: string; blocked?: true }> {
  if (!mesPermiteSincronizarEntradasRepasses(mes, ano)) {
    return { error: SYNC_ENTRADAS_REPASSE_BLOQUEADO_MSG, blocked: true };
  }

  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase não configurado.' };

  const readResult = await readControleCaixa(mes, ano, 'sistema');
  if ('error' in readResult) return { error: readResult.error };

  const ensured = await ensureSistemaEstruturaCompleta(
    mes,
    ano,
    readResult.data,
    loadControleCaixaExisting,
  );
  const data = ensured.data;
  ensureStableTemplateKeys(data);

  try {
    await remapearMapeamentosStickyParaChavesEstaveis(supabase, data);
  } catch {
    // Remap é best-effort: sync de valores segue mesmo se sticky falhar.
  }

  const [entCtx, despCtx] = await Promise.all([
    buildEntradasContext(supabase, mes, ano),
    buildDespesasContext(supabase, mes, ano),
  ]);

  // Catálogo após ensure (chaves estáveis) — não o do contexto pré-sync.
  const catalogEntrada = catalogoEntradasFromControleData(data);
  const catalogSaida = catalogoSaidasFromControleData(data);

  const valoresEntrada = agregarEntradasClassificadas(
    entCtx.transacoes,
    catalogEntrada,
    mes,
    ano,
    visao,
  );
  const valoresDespesa = agregarDespesasFixasClassificadas(
    despCtx.transacoes,
    catalogSaida,
    mes,
    ano,
    visao,
  );

  aplicarSyncCompletoSistema(data, valoresEntrada, valoresDespesa);

  const payload = dtoToControlePersistPayload(data);
  const persisted = await persistControleCaixaModo(mes, ano, payload, 'sincronizar_sistema', 'sistema');
  if ('error' in persisted) return { error: persisted.error };

  const again = await readControleCaixa(mes, ano, 'sistema');
  if ('error' in again) return { error: again.error };
  return { ok: true, data: again.data };
}

/** @deprecated Alias — use sincronizarControleCaixaSistema. */
export async function sincronizarEntradasParceirosControle(
  mes: number,
  ano: number,
  visao: VisaoControleSync = 'competencia',
): Promise<{ ok: true; data: ControleCaixaReadDto } | { error: string; blocked?: true }> {
  return sincronizarControleCaixaSistema(mes, ano, visao);
}

export { ensureParceirosTemplateKeys, round2 };
