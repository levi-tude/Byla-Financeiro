import { getSupabase } from './supabaseClient.js';
import { buildControleCaixaTemplate } from '../domain/controleCaixa/template.js';
import type { ControleLockedLevel, ControleTemplatePayload } from '../domain/controleCaixa/template.js';
import {
  buildPayloadFromMesAnterior,
  periodoUsavelParaHerdar,
  stripBlocoSaidasAluguel,
} from '../domain/controleCaixa/mesAnterior.js';
import {
  CONTROLE_MODOS,
  type ControleModo,
} from '../domain/controleCaixa/modo.js';
import { persistControleCaixaModo } from './controleCaixaPersist.js';
import {
  dtoToControlePersistPayload,
  ensureSistemaEstruturaCompleta,
} from './controleCaixaEstrutura.js';

type PeriodoRow = {
  id: string;
  mes: number;
  ano: number;
  modo: ControleModo;
  aba_ref: string | null;
  entrada_total: number | null;
  saida_total: number | null;
  lucro_total: number | null;
  saida_parceiros_total: number | null;
  saida_fixas_total: number | null;
  saida_soma_secoes_principais: number | null;
  origem: string | null;
  updated_at: string | null;
};

type BlocoRow = {
  id: string;
  periodo_id: string;
  tipo: 'entrada' | 'saida';
  titulo: string;
  ordem: number;
  template_key: string | null;
  is_default: boolean | null;
  is_custom: boolean | null;
  locked_level: ControleLockedLevel | null;
};

type LinhaRow = {
  id: string;
  bloco_id: string;
  label: string;
  valor: number | null;
  valor_texto: string | null;
  ordem: number;
  template_key: string | null;
  is_default: boolean | null;
  is_custom: boolean | null;
  locked_level: ControleLockedLevel | null;
};

export type ControleCaixaLinhaDto = {
  id: string;
  label: string;
  valor: number | null;
  valorTexto: string | null;
  ordem: number;
  templateKey: string | null;
  isDefault: boolean;
  isCustom: boolean;
  lockedLevel: ControleLockedLevel;
};

export type ControleCaixaBlocoDto = {
  id: string;
  tipo: 'entrada' | 'saida';
  titulo: string;
  ordem: number;
  templateKey: string | null;
  isDefault: boolean;
  isCustom: boolean;
  lockedLevel: ControleLockedLevel;
  linhas: ControleCaixaLinhaDto[];
};

export type ControleCaixaReadDto = {
  mes: number;
  ano: number;
  modo: ControleModo;
  modosDisponiveis: ControleModo[];
  somenteLeitura: boolean;
  existe: boolean;
  abaRef: string | null;
  origem: string;
  updatedAt: string | null;
  totais: {
    entradaTotal: number | null;
    saidaTotal: number | null;
    lucroTotal: number | null;
    saidaParceirosTotal: number | null;
    saidaFixasTotal: number | null;
    saidaSomaSecoesPrincipais: number | null;
  };
  blocos: ControleCaixaBlocoDto[];
};

function emptyControleDto(mes: number, ano: number, modo: ControleModo, modosDisponiveis: ControleModo[]): ControleCaixaReadDto {
  return {
    mes,
    ano,
    modo,
    modosDisponiveis,
    somenteLeitura: modo === 'oficial',
    existe: false,
    abaRef: null,
    origem: 'ausente',
    updatedAt: null,
    totais: {
      entradaTotal: null,
      saidaTotal: null,
      lucroTotal: null,
      saidaParceirosTotal: null,
      saidaFixasTotal: null,
      saidaSomaSecoesPrincipais: null,
    },
    blocos: [],
  };
}

export async function listControleModosDisponiveis(
  mes: number,
  ano: number,
): Promise<{ modos: ControleModo[] } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase não configurado no backend.' };
  const { data, error } = await supabase
    .from('controle_caixa_periodos')
    .select('modo')
    .eq('mes', mes)
    .eq('ano', ano);
  if (error) return { error: error.message };
  const set = new Set<ControleModo>();
  for (const row of data ?? []) {
    const m = (row as { modo?: string }).modo;
    if (m === 'oficial' || m === 'sistema') set.add(m);
  }
  return { modos: CONTROLE_MODOS.filter((m) => set.has(m)) };
}

/** Lê período existente no modo indicado — não cria template automático. */
export async function loadControleCaixaExisting(
  mes: number,
  ano: number,
  modo: ControleModo = 'sistema',
): Promise<{ data: ControleCaixaReadDto } | { error: string; notFound?: true }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase não configurado no backend.' };

  const modosRes = await listControleModosDisponiveis(mes, ano);
  if ('error' in modosRes) return { error: modosRes.error };
  const modosDisponiveis = modosRes.modos;

  const { data: periodo, error: periodoErr } = await supabase
    .from('controle_caixa_periodos')
    .select(
      'id, mes, ano, modo, aba_ref, entrada_total, saida_total, lucro_total, saida_parceiros_total, saida_fixas_total, saida_soma_secoes_principais, origem, updated_at',
    )
    .eq('mes', mes)
    .eq('ano', ano)
    .eq('modo', modo)
    .maybeSingle<PeriodoRow>();
  if (periodoErr) return { error: periodoErr.message };
  if (!periodo) return { error: 'Período não encontrado.', notFound: true };

  const { data: blocos, error: blocosErr } = await supabase
    .from('controle_caixa_blocos')
    .select('id, periodo_id, tipo, titulo, ordem, template_key, is_default, is_custom, locked_level')
    .eq('periodo_id', periodo.id)
    .order('ordem', { ascending: true });
  if (blocosErr) return { error: blocosErr.message };

  const blocoRows = (blocos ?? []) as BlocoRow[];
  const blocoIds = blocoRows.map((b) => b.id);
  const { data: linhas, error: linhasErr } = blocoIds.length
    ? await supabase
        .from('controle_caixa_linhas')
        .select('id, bloco_id, label, valor, valor_texto, ordem, template_key, is_default, is_custom, locked_level')
        .in('bloco_id', blocoIds)
        .order('ordem', { ascending: true })
    : { data: [], error: null };
  if (linhasErr) return { error: linhasErr.message };
  const linhaRows = (linhas ?? []) as LinhaRow[];

  const linhasByBloco = new Map<string, LinhaRow[]>();
  for (const l of linhaRows) {
    const arr = linhasByBloco.get(l.bloco_id) ?? [];
    arr.push(l);
    linhasByBloco.set(l.bloco_id, arr);
  }

  return {
    data: {
      mes: periodo.mes,
      ano: periodo.ano,
      modo: (periodo.modo === 'oficial' ? 'oficial' : 'sistema') as ControleModo,
      modosDisponiveis,
      somenteLeitura: periodo.modo === 'oficial',
      existe: true,
      abaRef: periodo.aba_ref,
      origem: periodo.origem ?? 'supabase',
      updatedAt: periodo.updated_at,
      totais: {
        entradaTotal: periodo.entrada_total,
        saidaTotal: periodo.saida_total,
        lucroTotal: periodo.lucro_total,
        saidaParceirosTotal: periodo.saida_parceiros_total,
        saidaFixasTotal: periodo.saida_fixas_total,
        saidaSomaSecoesPrincipais: periodo.saida_soma_secoes_principais,
      },
      blocos: blocoRows.map((b) => ({
        id: b.id,
        tipo: b.tipo,
        titulo: b.titulo,
        ordem: b.ordem,
        templateKey: b.template_key,
        isDefault: Boolean(b.is_default),
        isCustom: b.is_custom == null ? !Boolean(b.is_default) : Boolean(b.is_custom),
        lockedLevel: b.locked_level ?? 'none',
        linhas: (linhasByBloco.get(b.id) ?? [])
          .sort((a, c) => a.ordem - c.ordem)
          .map((l) => ({
            id: l.id,
            label: l.label,
            valor: l.valor,
            valorTexto: l.valor_texto,
            ordem: l.ordem,
            templateKey: l.template_key,
            isDefault: Boolean(l.is_default),
            isCustom: l.is_custom == null ? !Boolean(l.is_default) : Boolean(l.is_custom),
            lockedLevel: l.locked_level ?? 'none',
          })),
      })),
    },
  };
}

/**
 * Prefere o modo pedido; se ausente, tenta o outro (útil para catálogo / fluxo legado).
 */
export async function loadControleCaixaPreferindo(
  mes: number,
  ano: number,
  prefer: ControleModo,
): Promise<{ data: ControleCaixaReadDto } | { error: string; notFound?: true }> {
  const primary = await loadControleCaixaExisting(mes, ano, prefer);
  if ('data' in primary) return primary;
  if (!primary.notFound) return primary;
  const other: ControleModo = prefer === 'oficial' ? 'sistema' : 'oficial';
  return loadControleCaixaExisting(mes, ano, other);
}

/** Lê o Controle no modo indicado. Só auto-cria / repara estrutura no modo sistema. */
export async function readControleCaixa(
  mes: number,
  ano: number,
  modo: ControleModo = 'sistema',
): Promise<{ data: ControleCaixaReadDto } | { error: string }> {
  const existing = await loadControleCaixaExisting(mes, ano, modo);
  if ('data' in existing) {
    if (modo === 'oficial') return existing;

    // Catálogo de Entradas/Despesas e a UI usam modo sistema — se estiver
    // incompleto (só parceiros após sync) ou com template genérico legado,
    // espelha o Oficial do mês (ou o template operacional) e persiste.
    const repaired = await ensureSistemaEstruturaCompleta(
      mes,
      ano,
      existing.data,
      loadControleCaixaExisting,
    );
    if (!repaired.repaired) return { data: repaired.data };

    const origem =
      repaired.fonte === 'oficial' ? 'reparar_estrutura_oficial' : 'reparar_estrutura_template';
    const persisted = await persistControleCaixaModo(
      mes,
      ano,
      dtoToControlePersistPayload(repaired.data),
      origem,
      'sistema',
    );
    if ('error' in persisted) return { error: persisted.error };
    const again = await loadControleCaixaExisting(mes, ano, 'sistema');
    if ('data' in again) return again;
    return { error: again.error };
  }
  if (!('notFound' in existing) || !existing.notFound) {
    return { error: existing.error };
  }

  const modosRes = await listControleModosDisponiveis(mes, ano);
  if ('error' in modosRes) return { error: modosRes.error };

  if (modo === 'oficial') {
    return { data: emptyControleDto(mes, ano, 'oficial', modosRes.modos) };
  }

  const fromPrev = await buildPayloadFromMesAnterior(mes, ano, async (m, a) => {
    // Prefere oficial da planilha quando existir e for usável; senão sistema usável.
    const of = await loadControleCaixaExisting(m, a, 'oficial');
    if ('data' in of && periodoUsavelParaHerdar(of.data)) return of;
    const r = await loadControleCaixaExisting(m, a, 'sistema');
    if ('data' in r && periodoUsavelParaHerdar(r.data)) return r;
    if ('data' in of && of.data.blocos.length > 0) {
      return { error: 'Período oficial incompleto/legado.', notFound: true };
    }
    if ('data' in r) return { error: 'Período sistema sem estrutura usável.', notFound: true };
    return { error: r.error, notFound: r.notFound };
  });

  const payload = stripBlocoSaidasAluguel(fromPrev ?? buildControleCaixaTemplate());
  const origem = fromPrev ? 'mes_anterior' : 'template_fallback';
  const ensured = await persistControleCaixaModo(mes, ano, payload as ControleTemplatePayload, origem, 'sistema');
  if ('error' in ensured) return { error: ensured.error };
  return readControleCaixa(mes, ano, 'sistema');
}
