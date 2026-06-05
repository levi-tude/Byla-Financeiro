import {
  aplicarRepassesEmLinhasSaida,
  calcularRepasse,
  ENTRADA_PARA_SAIDA_REPASSE,
} from '../domain/entradas/repasseParceiros.js';
import {
  mesPermiteSincronizarEntradasRepasses,
  SYNC_ENTRADAS_REPASSE_BLOQUEADO_MSG,
} from '../domain/entradas/syncEntradasRepassesEligible.js';
import { readControleCaixa, type ControleCaixaReadDto } from './controleCaixaRead.js';
import { buildEntradasContext } from './entradasClassificacaoService.js';
import { getSupabase } from './supabaseClient.js';
import { transacaoContaNaCompetencia } from './transacaoCompetenciaService.js';

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

async function persistControleFromPayload(
  mes: number,
  ano: number,
  payload: ReturnType<typeof dtoToSavePayload>,
): Promise<{ ok: true } | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase não configurado no backend.' };

  const { data: periodo, error: periodoErr } = await supabase
    .from('controle_caixa_periodos')
    .upsert(
      {
        mes,
        ano,
        aba_ref: payload.abaRef ?? null,
        entrada_total: payload.totais.entradaTotal ?? null,
        saida_total: payload.totais.saidaTotal ?? null,
        lucro_total: payload.totais.lucroTotal ?? null,
        saida_parceiros_total: payload.totais.saidaParceirosTotal ?? null,
        saida_fixas_total: payload.totais.saidaFixasTotal ?? null,
        saida_soma_secoes_principais: payload.totais.saidaSomaSecoesPrincipais ?? null,
        origem: 'sincronizar_entradas',
      },
      { onConflict: 'mes,ano' },
    )
    .select('id')
    .single<{ id: string }>();
  if (periodoErr || !periodo) return { error: periodoErr?.message ?? 'Falha ao salvar período.' };

  const periodoId = periodo.id;
  const delBlocos = await supabase.from('controle_caixa_blocos').delete().eq('periodo_id', periodoId);
  if (delBlocos.error) return { error: delBlocos.error.message };

  for (const bloco of payload.blocos) {
    const { data: blocoRow, error: blocoErr } = await supabase
      .from('controle_caixa_blocos')
      .insert({
        periodo_id: periodoId,
        tipo: bloco.tipo,
        titulo: bloco.titulo,
        ordem: bloco.ordem,
        template_key: bloco.templateKey ?? null,
        is_default: bloco.isDefault ?? false,
        is_custom: bloco.isCustom ?? true,
        locked_level: bloco.lockedLevel ?? 'none',
      })
      .select('id')
      .single<{ id: string }>();
    if (blocoErr || !blocoRow) return { error: blocoErr?.message ?? 'Falha ao salvar bloco.' };
    if (bloco.linhas.length === 0) continue;
    const insLinhas = await supabase.from('controle_caixa_linhas').insert(
      bloco.linhas.map((linha) => ({
        bloco_id: blocoRow.id,
        label: linha.label,
        valor: linha.valor ?? null,
        valor_texto: linha.valorTexto ?? null,
        ordem: linha.ordem,
        template_key: linha.templateKey ?? null,
        is_default: linha.isDefault ?? false,
        is_custom: linha.isCustom ?? true,
        locked_level: linha.lockedLevel ?? 'none',
      })),
    );
    if (insLinhas.error) return { error: insLinhas.error.message };
  }
  return { ok: true };
}

/**
 * Agrega extrato classificado → Entradas Parceiros; calcula Saídas Parceiros (repasse).
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

  const readResult = await readControleCaixa(mes, ano);
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

  const data = readResult.data;
  for (const bloco of data.blocos) {
    if (bloco.templateKey !== 'entrada_parceiros' && !bloco.titulo.toLowerCase().includes('parceir')) continue;
    if (bloco.tipo !== 'entrada') continue;
    for (const linha of bloco.linhas) {
      const tKey = (linha.templateKey ?? '').trim();
      if (!tKey) continue;
      const soma = valoresPorTemplate.get(tKey);
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
  const persisted = await persistControleFromPayload(mes, ano, payload);
  if ('error' in persisted) return { error: persisted.error };

  const again = await readControleCaixa(mes, ano);
  if ('error' in again) return { error: again.error };
  return { ok: true, data: again.data };
}
