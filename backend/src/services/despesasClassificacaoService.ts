import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadCatalogoSaidasControleMes,
  type CategoriaSaidaLinha,
} from '../domain/despesas/categoriasSaida.js';
import { getEntidadesByla } from '../domain/funcionariosByla.js';
import { classificarSaidaCompleta } from '../logic/classificacaoSaidaBanco.js';
import {
  buildGrupos,
  buildHistoricoNormSet,
  classificarTransacao,
  rangeMes,
  historicoRange6Meses,
  type GrupoDestinatario,
  type SaidaTransacaoRow,
  type TransacaoClassificada,
} from '../logic/despesasAgrupamento.js';
import { normalizePessoa } from '../logic/normalizePessoa.js';
import type { MapeamentoRow } from '../logic/despesasMapeamento.js';
import { filtrarTransacoesOficiais, type TransacaoBase } from './transacoesFiltro.js';
import {
  applyDuplicataAlertas,
  enrichTransacaoCompetenciaDespesa,
  loadCompetenciasMap,
  transacaoContaNaCompetencia,
} from './transacaoCompetenciaService.js';

type ExportRow = SaidaTransacaoRow;

async function loadMapeamentos(supabase: SupabaseClient): Promise<MapeamentoRow[]> {
  const { data, error } = await supabase
    .from('mapeamento_pessoa_categoria')
    .select(
      'id, pessoa_normalizada, categoria, subcategoria, template_key, bloco_template_key, aplica_tipo, ativo, updated_at',
    )
    .in('aplica_tipo', ['saida', 'todos']);
  if (error) throw new Error(error.message);
  return (data ?? []) as MapeamentoRow[];
}

function shiftMes(mes: number, ano: number, delta: number): { mes: number; ano: number } {
  let m = mes + delta;
  let y = ano;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { mes: m, ano: y };
}

function dataNoMes(dataIso: string, mes: number, ano: number): boolean {
  const m = String(dataIso).match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  return Number(m[1]) === ano && Number(m[2]) === mes;
}

async function loadSaidasJanelaCompetencia(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
): Promise<ExportRow[]> {
  const prev = shiftMes(mes, ano, -1);
  const next = shiftMes(mes, ano, 1);
  const [cur, p, n] = await Promise.all([
    loadSaidasMes(supabase, mes, ano),
    loadSaidasMes(supabase, prev.mes, prev.ano),
    loadSaidasMes(supabase, next.mes, next.ano),
  ]);
  const map = new Map<string, ExportRow>();
  for (const row of [...p, ...cur, ...n]) map.set(row.id, row);
  return [...map.values()];
}

function blocoMetaForTemplate(
  catalog: CategoriaSaidaLinha[],
  templateKey: string | null | undefined,
): { blocoTemplateKey: string | null; blocoTitulo: string | null } {
  if (!templateKey) return { blocoTemplateKey: null, blocoTitulo: null };
  const c = catalog.find((x) => x.templateKey === templateKey);
  return { blocoTemplateKey: c?.blocoTemplateKey ?? null, blocoTitulo: c?.blocoTitulo ?? null };
}

async function loadSaidasMes(supabase: SupabaseClient, mes: number, ano: number): Promise<ExportRow[]> {
  const { inicio, fim } = rangeMes(mes, ano);
  const { data, error } = await supabase
    .from('v_transacoes_export')
    .select('id, data, pessoa, valor, descricao, tipo, categoria_sugerida, origem_categoria')
    .gte('data', inicio)
    .lte('data', fim)
    .limit(5000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (ExportRow & { tipo: string })[];
  const bases: TransacaoBase[] = rows.map((r) => ({
    id: r.id,
    data: r.data,
    pessoa: r.pessoa,
    valor: Number(r.valor),
    descricao: r.descricao,
    tipo: r.tipo,
  }));
  const oficiais = filtrarTransacoesOficiais(bases);
  const ids = new Set(oficiais.saidas.map((x) => x.id));
  return rows.filter((r) => ids.has(r.id));
}

async function loadHistoricoPessoas(supabase: SupabaseClient, mes: number, ano: number) {
  const { inicio, fim } = historicoRange6Meses(mes, ano);
  const { data, error } = await supabase
    .from('v_transacoes_export')
    .select('pessoa, data, tipo')
    .gte('data', inicio)
    .lte('data', fim)
    .eq('tipo', 'saida')
    .limit(8000);
  if (error) throw new Error(error.message);
  return (data ?? []) as { pessoa: string; data: string }[];
}

function planilhaLinhasFromCatalog(catalog: CategoriaSaidaLinha[]) {
  return catalog.map((c) => ({
    titulo: c.blocoTitulo,
    label: c.label,
    valor: 0,
  }));
}

export type DespesasClassificacaoContext = {
  mes: number;
  ano: number;
  catalog: CategoriaSaidaLinha[];
  transacoes: TransacaoClassificada[];
  grupos: GrupoDestinatario[];
  mapeamentos: MapeamentoRow[];
};

export type VisaoControle = 'caixa' | 'competencia';

export async function buildDespesasContext(
  supabase: SupabaseClient,
  mes: number,
  ano: number,
): Promise<DespesasClassificacaoContext> {
  const [saidas, mapeamentos, histRows, catalog] = await Promise.all([
    loadSaidasJanelaCompetencia(supabase, mes, ano),
    loadMapeamentos(supabase),
    loadHistoricoPessoas(supabase, mes, ano),
    loadCatalogoSaidasControleMes(mes, ano),
  ]);
  const historicoNorms = buildHistoricoNormSet(histRows, mes, ano);
  const transacoesClassificadas = saidas.map((t) => classificarTransacao(t, mapeamentos, mes, ano, catalog));
  const competenciaMap = await loadCompetenciasMap(
    supabase,
    transacoesClassificadas.map((t) => t.id),
  );
  const transacoesEnriquecidas = applyDuplicataAlertas(
    transacoesClassificadas.map((t) => {
      const meta = blocoMetaForTemplate(catalog, t.template_key_efetivo);
      return enrichTransacaoCompetenciaDespesa(t, competenciaMap, meta.blocoTemplateKey, meta.blocoTitulo);
    }),
  );
  const transacoesCaixa = transacoesEnriquecidas.filter((t) => dataNoMes(t.data, mes, ano));
  const grupos = buildGrupos(transacoesCaixa, mapeamentos, mes, ano, historicoNorms, catalog);
  return { mes, ano, catalog, transacoes: transacoesEnriquecidas, grupos, mapeamentos };
}

export function sugestaoHeuristicaParaGrupo(
  itens: TransacaoClassificada[],
  catalog: CategoriaSaidaLinha[],
): {
  label: string;
  confianca: string;
  regra: string;
} | null {
  if (itens.length === 0) return null;
  const t = itens[0];
  const sug = classificarSaidaCompleta(
    t.pessoa,
    t.descricao,
    Math.abs(Number(t.valor)),
    planilhaLinhasFromCatalog(catalog),
    getEntidadesByla(),
  );
  const label = (sug.linha_planilha_ref ?? '').trim();
  if (!label || sug.regra === 'nenhuma') return null;
  const noCatalogo = catalog.some((c) => c.label.trim().toLowerCase() === label.toLowerCase());
  if (!noCatalogo) return null;
  return { label, confianca: sug.confianca, regra: sug.regra };
}

export function buildResumoFromContext(ctx: DespesasClassificacaoContext, visao: VisaoControle = 'caixa') {
  const transacoes =
    visao === 'caixa'
      ? ctx.transacoes.filter((t) => dataNoMes(t.data, ctx.mes, ctx.ano))
      : ctx.transacoes.filter((t) => transacaoContaNaCompetencia(t, ctx.mes, ctx.ano));

  const total_saidas = transacoes.reduce((s, t) => s + Math.abs(Number(t.valor || 0)), 0);
  let total_classificado = 0;
  let valor_pendente = 0;
  const catMap = new Map<
    string,
    {
      template_key: string;
      label: string;
      bloco_template_key: string;
      bloco_titulo: string;
      bloco_ordem: number;
      ordem: number;
      total: number;
      qtd_transacoes: number;
      destinatarios: Set<string>;
    }
  >();

  for (const c of ctx.catalog) {
    catMap.set(c.templateKey, {
      template_key: c.templateKey,
      label: c.label,
      bloco_template_key: c.blocoTemplateKey,
      bloco_titulo: c.blocoTitulo,
      bloco_ordem: c.blocoOrdem,
      ordem: c.ordem,
      total: 0,
      qtd_transacoes: 0,
      destinatarios: new Set(),
    });
  }

  for (const t of transacoes) {
    const v = Math.abs(Number(t.valor || 0));
    if (t.origem_efetiva === 'mapeamento_manual' && t.template_key_efetivo) {
      total_classificado += v;
      let bucket = catMap.get(t.template_key_efetivo);
      if (!bucket) {
        bucket = {
          template_key: t.template_key_efetivo,
          label: t.categoria_efetiva ?? t.template_key_efetivo,
          bloco_template_key: 'legado',
          bloco_titulo: 'Fora do Controle atual',
          bloco_ordem: 999,
          ordem: 0,
          total: 0,
          qtd_transacoes: 0,
          destinatarios: new Set(),
        };
        catMap.set(t.template_key_efetivo, bucket);
      }
      bucket.total += v;
      bucket.qtd_transacoes += 1;
      bucket.destinatarios.add(t.pessoa_normalizada);
    } else {
      valor_pendente += v;
    }
  }

  const qtd_destinatarios_pendentes = ctx.grupos.filter((g) => g.estado === 'pendente').length;
  const pct_classificado = total_saidas > 0 ? (total_classificado / total_saidas) * 100 : 0;

  const por_categoria = [...catMap.values()]
    .map((b) => ({
      template_key: b.template_key,
      label: b.label,
      bloco_template_key: b.bloco_template_key,
      bloco_titulo: b.bloco_titulo,
      total: b.total,
      qtd_transacoes: b.qtd_transacoes,
      qtd_destinatarios: b.destinatarios.size,
      bloco_ordem: b.bloco_ordem,
      ordem: b.ordem,
    }))
    .sort((a, b) => a.bloco_ordem - b.bloco_ordem || a.ordem - b.ordem);

  const por_bloco = new Map<string, { bloco_titulo: string; bloco_ordem: number; linhas: typeof por_categoria }>();
  for (const row of por_categoria) {
    const key = row.bloco_template_key;
    const bloco = por_bloco.get(key) ?? {
      bloco_titulo: row.bloco_titulo,
      bloco_ordem: row.bloco_ordem,
      linhas: [],
    };
    bloco.linhas.push(row);
    por_bloco.set(key, bloco);
  }

  return {
    kpis: {
      total_saidas,
      total_classificado,
      pct_classificado: Math.round(pct_classificado * 10) / 10,
      valor_pendente,
      qtd_destinatarios_pendentes,
      qtd_transacoes: transacoes.length,
    },
    por_categoria,
    por_bloco: [...por_bloco.values()].sort((a, b) => a.bloco_ordem - b.bloco_ordem),
    pendente: {
      total: valor_pendente,
      qtd_transacoes: transacoes.filter((t) => t.origem_efetiva !== 'mapeamento_manual').length,
    },
    visao,
  };
}

export function decodePessoaNormParam(raw: string): string {
  return normalizePessoa(decodeURIComponent(raw));
}

export const DESPESAS_CATEGORIA_PENDENTE_KEY = '_pendente';

export function transacoesDespesaPorTemplateKey(
  ctx: DespesasClassificacaoContext,
  templateKey: string,
): TransacaoClassificada[] {
  if (templateKey === DESPESAS_CATEGORIA_PENDENTE_KEY) {
    return ctx.transacoes.filter((t) => t.origem_efetiva !== 'mapeamento_manual');
  }
  return ctx.transacoes.filter(
    (t) => t.origem_efetiva === 'mapeamento_manual' && t.template_key_efetivo === templateKey,
  );
}
