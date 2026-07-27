import { hintAbaFluxoParaControle } from '../domain/entradas/abaControleMap.js';
import {
  preferStableEntradaTemplateKey,
  resolveCategoriaEntradaInCatalog,
  resolveHintNoCatalogo,
  type CategoriaEntradaLinha,
} from '../domain/entradas/categoriasEntrada.js';
import { isFormaPagamentoDinheiro } from './pagamentoDinheiroFluxo.js';

export type PagamentoFluxoDinheiroRow = {
  aba: string;
  modalidade: string | null;
  forma: string | null;
  valor: number;
  mes_competencia: number;
  ano_competencia: number;
  data_pagamento: string | null;
};

export type VisaoDinheiroControle = 'caixa' | 'competencia';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dataNoMes(dataIso: string, mes: number, ano: number): boolean {
  const m = String(dataIso).match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  return Number(m[1]) === ano && Number(m[2]) === mes;
}

/**
 * Agrega valor em chaves equivalentes sem duplicar o mesmo slot.
 * Espelha `agregarValorEmChaves` do sync (logic não importa services).
 */
function agregarValorEmChaves(map: Map<string, number>, keys: string[], valor: number): void {
  const v = round2(Math.abs(valor));
  const seen = new Set<string>();
  for (const k of keys) {
    const key = k.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    map.set(key, round2((map.get(key) ?? 0) + v));
  }
}

/** Filtra pagamentos Dinheiro/espécie do Fluxo pela visão do sync. */
export function filtrarPagamentosDinheiroParaSyncVisao(
  pagamentos: PagamentoFluxoDinheiroRow[],
  mes: number,
  ano: number,
  visao: VisaoDinheiroControle,
): PagamentoFluxoDinheiroRow[] {
  return pagamentos.filter((p) => {
    if (!isFormaPagamentoDinheiro(p.forma)) return false;
    if (visao === 'caixa') {
      return p.data_pagamento != null && dataNoMes(p.data_pagamento, mes, ano);
    }
    return Number(p.mes_competencia) === mes && Number(p.ano_competencia) === ano;
  });
}

/**
 * Soma pagamentos Dinheiro do Fluxo nas chaves `ent_parc_*` pela aba/modalidade.
 * Abas sem hint conhecido são ignoradas (não inventa linha).
 */
export function agregarDinheiroFluxoParceiros(
  pagamentos: PagamentoFluxoDinheiroRow[],
  catalog: CategoriaEntradaLinha[],
  mes: number,
  ano: number,
  visao: VisaoDinheiroControle,
): Map<string, number> {
  const map = new Map<string, number>();
  const filtrados = filtrarPagamentosDinheiroParaSyncVisao(pagamentos, mes, ano, visao);

  for (const p of filtrados) {
    const hint = hintAbaFluxoParaControle(p.aba ?? '', p.modalidade);
    if (!hint) continue;

    const cat =
      resolveHintNoCatalogo(catalog, hint) ??
      resolveCategoriaEntradaInCatalog(catalog, hint.templateKeyPreferido, hint.labelEsperado);

    const stableKey = cat ? preferStableEntradaTemplateKey(cat) : hint.templateKeyPreferido;
    const keys = [stableKey, hint.templateKeyPreferido];
    if (cat) keys.push(`linha:${cat.linhaId}`);
    agregarValorEmChaves(map, keys, Number(p.valor || 0));
  }

  return map;
}

/** Soma dois mapas de valores (extrato classificado + dinheiro Fluxo). */
export function mesclarValoresEntrada(
  base: Map<string, number>,
  extra: Map<string, number>,
): Map<string, number> {
  const out = new Map(base);
  for (const [k, v] of extra) {
    out.set(k, round2((out.get(k) ?? 0) + v));
  }
  return out;
}
