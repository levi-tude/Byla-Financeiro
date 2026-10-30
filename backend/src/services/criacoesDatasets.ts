/**
 * Criações da IA — tools só-leitura que devolvem DATASETS estruturados (agregados, sem PII).
 * Reaproveitam as mesmas consultas do Consulta Byla (consultaBylaTools.ts).
 */
import type { Dataset } from '../ai/criacoesSpec.js';
import {
  entradasPorModalidade,
  loadTransacoesRange,
  mesesAte,
  rangeMes,
  resumoMesNumeros,
} from './consultaBylaTools.js';
import { metodoPagamentoFinal, normalizarTipoTransacao } from './transacoesFiltro.js';

export type MesAno = { mes: number; ano: number };
const pad2 = (n: number) => String(n).padStart(2, '0');
const r2 = (n: number) => Math.round(n * 100) / 100;
const FONTE_EXTRATO = 'Extrato bancário oficial (v_resumo_mensal_oficial / transações oficiais)';

export type CriacaoToolId = 'balanco_meses' | 'entradas_modalidade_mes' | 'meio_pagamento_mes' | 'comparar_meses';

export type CriacaoToolDeps = {
  resumoMes: (mes: number, ano: number) => Promise<{ entradas: number; saidas: number }>;
  modalidades: (mes: number, ano: number) => Promise<Map<string, { total: number; qtd: number }>>;
  meios: (mes: number, ano: number) => Promise<Map<string, { entradas: number; saidas: number; qtd: number }>>;
};

async function meiosReal(mes: number, ano: number) {
  const { inicio, fim } = rangeMes(mes, ano);
  const map = new Map<string, { entradas: number; saidas: number; qtd: number }>();
  for (const t of await loadTransacoesRange(inicio, fim)) {
    const tipoN = normalizarTipoTransacao(t.tipo);
    const metodo = metodoPagamentoFinal(`${t.pessoa} ${t.descricao ?? ''}`, tipoN);
    const e = map.get(metodo) ?? { entradas: 0, saidas: 0, qtd: 0 };
    const v = Math.abs(Number(t.valor || 0));
    if (tipoN === 'saida') e.saidas += v;
    else e.entradas += v;
    e.qtd += 1;
    map.set(metodo, e);
  }
  return map;
}

export const realDeps: CriacaoToolDeps = { resumoMes: resumoMesNumeros, modalidades: entradasPorModalidade, meios: meiosReal };

export async function datasetBalanco(ref: MesAno, n: number, deps: CriacaoToolDeps): Promise<Dataset> {
  const meses = mesesAte(ref.mes, ref.ano, Math.min(12, Math.max(1, n)));
  const nums = await Promise.all(meses.map((m) => deps.resumoMes(m.mes, m.ano)));
  return {
    id: `balanco_${meses.length}m`,
    titulo: `Balanço dos últimos ${meses.length} meses`,
    fonte: FONTE_EXTRATO,
    colunas: [
      { key: 'mes', label: 'Mês', formato: 'mes' },
      { key: 'entradas', label: 'Entradas', formato: 'brl' },
      { key: 'saidas', label: 'Saídas', formato: 'brl' },
      { key: 'saldo', label: 'Saldo', formato: 'brl' },
    ],
    linhas: meses.map((m, i) => ({
      mes: `${m.ano}-${pad2(m.mes)}`,
      entradas: r2(nums[i]!.entradas),
      saidas: r2(nums[i]!.saidas),
      saldo: r2(nums[i]!.entradas - nums[i]!.saidas),
    })),
  };
}

export async function datasetModalidades(ref: MesAno, deps: CriacaoToolDeps): Promise<Dataset> {
  const map = await deps.modalidades(ref.mes, ref.ano);
  return {
    id: `modalidades_${ref.ano}_${pad2(ref.mes)}`,
    titulo: `Entradas por modalidade — ${pad2(ref.mes)}/${ref.ano}`,
    fonte: 'Extrato bancário oficial (v_transacoes_export, entradas com modalidade)',
    colunas: [
      { key: 'modalidade', label: 'Modalidade', formato: 'texto' },
      { key: 'total', label: 'Total', formato: 'brl' },
      { key: 'qtd', label: 'Lançamentos', formato: 'numero' },
    ],
    linhas: [...map.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 15)
      .map(([modalidade, v]) => ({ modalidade, total: r2(v.total), qtd: v.qtd })),
  };
}

export async function datasetMeios(ref: MesAno, deps: CriacaoToolDeps): Promise<Dataset> {
  const map = await deps.meios(ref.mes, ref.ano);
  return {
    id: `meios_${ref.ano}_${pad2(ref.mes)}`,
    titulo: `Meios de pagamento — ${pad2(ref.mes)}/${ref.ano}`,
    fonte: 'Extrato bancário oficial (transações do mês)',
    colunas: [
      { key: 'meio', label: 'Meio', formato: 'texto' },
      { key: 'entradas', label: 'Entradas', formato: 'brl' },
      { key: 'saidas', label: 'Saídas', formato: 'brl' },
      { key: 'qtd', label: 'Lançamentos', formato: 'numero' },
    ],
    linhas: [...map.entries()]
      .sort((a, b) => b[1].entradas - a[1].entradas)
      .map(([meio, v]) => ({ meio, entradas: r2(v.entradas), saidas: r2(v.saidas), qtd: v.qtd })),
  };
}

export async function datasetComparar(a: MesAno, b: MesAno, deps: CriacaoToolDeps): Promise<Dataset> {
  const [ra, rb] = await Promise.all([deps.resumoMes(a.mes, a.ano), deps.resumoMes(b.mes, b.ano)]);
  const row = (m: MesAno, r: { entradas: number; saidas: number }) => ({
    mes: `${m.ano}-${pad2(m.mes)}`,
    entradas: r2(r.entradas),
    saidas: r2(r.saidas),
    saldo: r2(r.entradas - r.saidas),
  });
  return {
    id: `comparar_${a.ano}${pad2(a.mes)}_${b.ano}${pad2(b.mes)}`,
    titulo: `${pad2(a.mes)}/${a.ano} × ${pad2(b.mes)}/${b.ano}`,
    fonte: FONTE_EXTRATO,
    colunas: [
      { key: 'mes', label: 'Mês', formato: 'mes' },
      { key: 'entradas', label: 'Entradas', formato: 'brl' },
      { key: 'saidas', label: 'Saídas', formato: 'brl' },
      { key: 'saldo', label: 'Saldo', formato: 'brl' },
    ],
    linhas: [row(a, ra), row(b, rb)],
  };
}

export function parseYm(raw: unknown): MesAno | null {
  const m = String(raw ?? '').match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100 ? { mes, ano } : null;
}

/** Executa uma tool de criação com args do modelo (validados aqui; nada vira SQL). */
export async function executarCriacaoTool(
  name: string,
  args: Record<string, unknown> | undefined,
  ref: MesAno,
  deps: CriacaoToolDeps,
): Promise<Dataset | { erro: string }> {
  const a = args ?? {};
  const mesRef = parseYm(a.mes_ref) ?? ref;
  switch (name) {
    case 'balanco_meses': {
      const n = Math.trunc(Number(a.meses ?? 4));
      return datasetBalanco(mesRef, Number.isFinite(n) ? n : 4, deps);
    }
    case 'entradas_modalidade_mes':
      return datasetModalidades(mesRef, deps);
    case 'meio_pagamento_mes':
      return datasetMeios(mesRef, deps);
    case 'comparar_meses': {
      const x = parseYm(a.mes_a);
      const y = parseYm(a.mes_b);
      if (!x || !y) return { erro: 'Use mes_a e mes_b no formato YYYY-MM.' };
      return datasetComparar(x, y, deps);
    }
    default:
      return { erro: 'Função desconhecida.' };
  }
}

export const CRIACAO_TOOL_DECLS = [
  {
    name: 'balanco_meses',
    description: 'Dataset mês a mês (entradas, saídas, saldo) dos últimos N meses até mes_ref.',
    parameters: {
      type: 'object',
      properties: {
        meses: { type: 'number', description: 'Quantidade de meses (1-12).' },
        mes_ref: { type: 'string', description: 'Mês final YYYY-MM (opcional; padrão = mês da tela).' },
      },
      required: ['meses'],
    },
  },
  {
    name: 'entradas_modalidade_mes',
    description: 'Dataset de entradas por modalidade em um mês.',
    parameters: { type: 'object', properties: { mes_ref: { type: 'string', description: 'YYYY-MM (opcional).' } } },
  },
  {
    name: 'meio_pagamento_mes',
    description: 'Dataset de entradas/saídas por meio de pagamento (PIX, cartão…) em um mês.',
    parameters: { type: 'object', properties: { mes_ref: { type: 'string', description: 'YYYY-MM (opcional).' } } },
  },
  {
    name: 'comparar_meses',
    description: 'Dataset com 2 linhas (mes_a, mes_b): entradas, saídas e saldo.',
    parameters: {
      type: 'object',
      properties: { mes_a: { type: 'string', description: 'YYYY-MM' }, mes_b: { type: 'string', description: 'YYYY-MM' } },
      required: ['mes_a', 'mes_b'],
    },
  },
] as const;
