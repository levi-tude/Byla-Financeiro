import {
  aplicarRepassesEmLinhasSaida,
  calcularRepasse,
  ENTRADA_PARA_SAIDA_REPASSE,
} from '../domain/entradas/repasseParceiros.js';
import { stableEntradaTemplateKeyForLabel } from '../domain/entradas/categoriasEntrada.js';
import {
  mesPermiteSincronizarEntradasRepasses,
  SYNC_ENTRADAS_REPASSE_BLOQUEADO_MSG,
} from '../domain/entradas/syncEntradasRepassesEligible.js';
import { estruturaControleCompleta } from '../domain/controleCaixa/mesAnterior.js';
import { buildControleCaixaTemplate } from '../domain/controleCaixa/template.js';
import {
  loadControleCaixaExisting,
  readControleCaixa,
  type ControleCaixaReadDto,
} from './controleCaixaRead.js';
import { persistControleCaixaModo } from './controleCaixaPersist.js';
import { buildEntradasContext } from './entradasClassificacaoService.js';
import { getSupabase } from './supabaseClient.js';
import { transacaoContaNaCompetencia } from './transacaoCompetenciaService.js';

function linhaMatchKey(label: string, templateKey: string | null | undefined): string {
  const tk = (templateKey ?? '').trim().toLowerCase();
  if (tk) return `k:${tk}`;
  return `l:${label.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()}`;
}

/**
 * Se o modo sistema está incompleto (ex.: só Entradas Parceiros após sync antigo),
 * reconstitui a estrutura a partir do Oficial (planilha) ou do template, preservando
 * valores já preenchidos no sistema quando o rótulo/chave coincidem.
 */
export function mergeEstruturaPreservandoValores(
  estrutura: ControleCaixaReadDto,
  valores: ControleCaixaReadDto,
): ControleCaixaReadDto {
  const valorByKey = new Map<string, { valor: number | null; valorTexto: string | null }>();
  for (const b of valores.blocos) {
    for (const l of b.linhas) {
      valorByKey.set(linhaMatchKey(l.label, l.templateKey), {
        valor: l.valor,
        valorTexto: l.valorTexto,
      });
    }
  }

  return {
    ...estrutura,
    modo: 'sistema',
    somenteLeitura: false,
    origem: valores.origem || estrutura.origem,
    updatedAt: valores.updatedAt ?? estrutura.updatedAt,
    totais: { ...valores.totais },
    blocos: estrutura.blocos.map((b) => ({
      ...b,
      id: b.id,
      linhas: b.linhas.map((l) => {
        const hit = valorByKey.get(linhaMatchKey(l.label, l.templateKey));
        if (!hit) return { ...l };
        return {
          ...l,
          valor: hit.valor,
          valorTexto: hit.valorTexto,
        };
      }),
    })),
  };
}

async function ensureSistemaEstruturaCompleta(
  mes: number,
  ano: number,
  data: ControleCaixaReadDto,
): Promise<ControleCaixaReadDto> {
  if (estruturaControleCompleta(data)) return data;

  const oficial = await loadControleCaixaExisting(mes, ano, 'oficial');
  if ('data' in oficial && estruturaControleCompleta(oficial.data)) {
    return mergeEstruturaPreservandoValores(oficial.data, data);
  }

  const template = buildControleCaixaTemplate();
  const asDto: ControleCaixaReadDto = {
    mes,
    ano,
    modo: 'sistema',
    modosDisponiveis: data.modosDisponiveis,
    somenteLeitura: false,
    existe: true,
    abaRef: data.abaRef ?? template.abaRef,
    origem: data.origem,
    updatedAt: data.updatedAt,
    totais: { ...data.totais },
    blocos: template.blocos.map((b, bi) => ({
      id: `tpl-b-${bi}`,
      tipo: b.tipo,
      titulo: b.titulo,
      ordem: b.ordem,
      templateKey: b.templateKey,
      isDefault: b.isDefault,
      isCustom: b.isCustom,
      lockedLevel: b.lockedLevel,
      linhas: b.linhas.map((l, li) => ({
        id: `tpl-l-${bi}-${li}`,
        label: l.label,
        valor: l.valor,
        valorTexto: l.valorTexto,
        ordem: l.ordem,
        templateKey: l.templateKey,
        isDefault: l.isDefault,
        isCustom: l.isCustom,
        lockedLevel: l.lockedLevel,
      })),
    })),
  };
  return mergeEstruturaPreservandoValores(asDto, data);
}

/** Evita recriar Controle com template_key null (quebra mapeamentos sticky). */
function ensureParceirosTemplateKeys(data: ControleCaixaReadDto): void {
  for (const bloco of data.blocos) {
    if (bloco.tipo !== 'entrada') continue;
    const isParceiros =
      bloco.templateKey === 'entrada_parceiros' || bloco.titulo.toLowerCase().includes('parceir');
    if (!isParceiros) continue;
    if (!bloco.templateKey) bloco.templateKey = 'entrada_parceiros';
    for (const linha of bloco.linhas) {
      if ((linha.templateKey ?? '').trim()) continue;
      const stable = stableEntradaTemplateKeyForLabel(linha.label);
      if (stable) linha.templateKey = stable;
    }
  }
}

function dataNoMes(dataIso: string, mes: number, ano: number): boolean {
  const m = String(dataIso).match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  return Number(m[1]) === ano && Number(m[2]) === mes;
}

export type VisaoControleSync = 'caixa' | 'competencia';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumBloco(bloco: { linhas: { valor: number | null }[] }): number {
  return round2(bloco.linhas.reduce((s, l) => s + (l.valor ?? 0), 0));
}

function dtoToSavePayload(data: ControleCaixaReadDto) {
  return {
    abaRef: data.abaRef,
    totais: { ...data.totais },
    blocos: data.blocos.map((b) => ({
      tipo: b.tipo,
      titulo: b.titulo,
      ordem: b.ordem,
      templateKey: b.templateKey,
      isDefault: b.isDefault,
      isCustom: b.isCustom,
      lockedLevel: b.lockedLevel,
      linhas: b.linhas.map((l) => ({
        label: l.label,
        valor: l.valor,
        valorTexto: l.valorTexto,
        ordem: l.ordem,
        templateKey: l.templateKey,
        isDefault: l.isDefault,
        isCustom: l.isCustom,
        lockedLevel: l.lockedLevel,
      })),
    })),
  };
}

/**
 * Agrega extrato classificado → Entradas Parceiros; calcula Saídas Parceiros (repasse).
 * Sempre grava no modo sistema — nunca altera o Oficial (planilha).
 */
export async function sincronizarEntradasParceirosControle(
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

  const ctx = await buildEntradasContext(supabase, mes, ano);
  const transacoesSync =
    visao === 'caixa'
      ? ctx.transacoes.filter((t) => dataNoMes(t.data, mes, ano))
      : ctx.transacoes.filter((t) => transacaoContaNaCompetencia(t, mes, ano, true));
  const valoresPorTemplate = new Map<string, number>();

  for (const t of transacoesSync) {
    if (t.origem_efetiva !== 'mapeamento_manual' || !t.template_key_efetivo) continue;
    const key = t.template_key_efetivo;
    const v = Math.abs(Number(t.valor || 0));
    valoresPorTemplate.set(key, round2((valoresPorTemplate.get(key) ?? 0) + v));
  }

  const data = await ensureSistemaEstruturaCompleta(mes, ano, readResult.data);
  ensureParceirosTemplateKeys(data);
  for (const bloco of data.blocos) {
    if (bloco.templateKey !== 'entrada_parceiros' && !bloco.titulo.toLowerCase().includes('parceir')) continue;
    if (bloco.tipo !== 'entrada') continue;
    for (const linha of bloco.linhas) {
      const tKey = (linha.templateKey ?? '').trim();
      if (!tKey) continue;
      const soma =
        valoresPorTemplate.get(tKey) ??
        valoresPorTemplate.get(`linha:${linha.id}`);
      if (soma !== undefined) {
        linha.valor = soma;
        linha.valorTexto = 'extrato_classificado';
      }
    }
  }

  const valoresEntrada = new Map<string, number>();
  for (const bloco of data.blocos) {
    if (bloco.templateKey !== 'entrada_parceiros') continue;
    for (const linha of bloco.linhas) {
      const tKey = (linha.templateKey ?? '').trim();
      if (!tKey || !Object.keys(ENTRADA_PARA_SAIDA_REPASSE).includes(tKey)) continue;
      valoresEntrada.set(tKey, linha.valor ?? 0);
    }
  }

  for (const bloco of data.blocos) {
    if (bloco.templateKey !== 'saida_parceiros') continue;
    aplicarRepassesEmLinhasSaida(bloco.linhas, valoresEntrada);
    for (const linha of bloco.linhas) {
      const entKey = Object.entries(ENTRADA_PARA_SAIDA_REPASSE).find(([, sai]) => sai === (linha.templateKey ?? ''))?.[0];
      if (entKey && linha.valor != null) {
        const entrada = valoresEntrada.get(entKey) ?? 0;
        const repasse = calcularRepasse(entKey, entrada);
        if (repasse != null) linha.valorTexto = 'calculado_repasse';
      }
    }
  }

  let entradaTotal = 0;
  let saidaTotal = 0;
  let saidaParceirosTotal = 0;
  let saidaFixasTotal = 0;
  for (const bloco of data.blocos) {
    const t = sumBloco(bloco);
    if (bloco.tipo === 'entrada') entradaTotal += t;
    else {
      saidaTotal += t;
      const titulo = bloco.titulo.toUpperCase();
      if (titulo.includes('PARCEIR')) saidaParceirosTotal += t;
      if (titulo.includes('FIXA') || titulo.includes('GASTOS FIXOS')) saidaFixasTotal += t;
    }
  }

  data.totais = {
    entradaTotal: entradaTotal || null,
    saidaTotal: saidaTotal || null,
    lucroTotal: round2(entradaTotal - saidaTotal),
    saidaParceirosTotal: saidaParceirosTotal || null,
    saidaFixasTotal: saidaFixasTotal || null,
    saidaSomaSecoesPrincipais: round2(saidaParceirosTotal + saidaFixasTotal) || null,
  };

  const payload = dtoToSavePayload(data);
  const persisted = await persistControleCaixaModo(mes, ano, payload, 'sincronizar_entradas', 'sistema');
  if ('error' in persisted) return { error: persisted.error };

  const again = await readControleCaixa(mes, ano, 'sistema');
  if ('error' in again) return { error: again.error };
  return { ok: true, data: again.data };
}
