/**
 * Chat único — cartão visual da Consulta Byla.
 *
 * Cada resposta pode trazer um spec JSON (o MESMO formato das Criações da IA, ver criacoesSpec.ts).
 * - Roteador determinístico / modo simples: o spec é montado aqui SEM IA, a partir da tool e dos params.
 * - IA: pode propor um rascunho em <visual>{json}</visual>; o servidor valida com zod (validarEHidratar)
 *   contra os datasets reais das tools usadas. Inválido → usa o spec determinístico.
 * Nunca há código: só JSON declarativo. Datasets são agregados; textos passam por stripPii.
 */
import type { ConsultaToolId } from './consultaCatalog.js';
import { validarEHidratar, type CriacaoSpec, type Dataset } from './criacoesSpec.js';
import { stripPii } from './consultaGeminiAgent.js';
import { limparDocumentoPessoa } from './pseudonimizacao.js';
import { instrucaoIa } from './instrucaoIa.js';
import { normalizeText } from '../logic/conciliacaoTexto.js';
import { professorDaSaida } from '../services/consultaRepasses.js';
import type { SaidaExtrato } from '../services/consultaSaidas.js';
import {
  datasetBalanco,
  datasetComparar,
  datasetModalidades,
  parseYm,
  type CriacaoToolDeps,
  type MesAno,
} from '../services/criacoesDatasets.js';

export type VisualDeps = CriacaoToolDeps & {
  saidasMes: (mes: number, ano: number) => Promise<SaidaExtrato[]>;
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const r2 = (n: number) => Math.round(n * 100) / 100;
const ref = (m: MesAno) => `${pad2(m.mes)}/${m.ano}`;

function mesesEntre(a: MesAno, b: MesAno, max = 12): MesAno[] {
  const out: MesAno[] = [];
  let i = a.ano * 12 + a.mes - 1;
  const fim = b.ano * 12 + b.mes - 1;
  while (i <= fim && out.length < max) {
    out.push({ ano: Math.floor(i / 12), mes: (i % 12) + 1 });
    i += 1;
  }
  return out;
}

/** Limpa PII de todo texto de dataset (rótulos de pessoas, etc.). */
export function datasetSemPii(d: Dataset): Dataset {
  return {
    ...d,
    linhas: d.linhas.map((l) =>
      Object.fromEntries(Object.entries(l).map(([k, v]) => [k, typeof v === 'string' ? stripPii(limparDocumentoPessoa(v) || v) : v])),
    ),
  };
}

function hidratar(draft: unknown, datasets: Dataset[]): CriacaoSpec | null {
  const r = validarEHidratar(draft, datasets.map(datasetSemPii), 'deterministico');
  return r.ok ? r.spec : null;
}

/** Contagens do texto de quem_nao_pagou ("Pagos: X · Parcial: Y · Pendente: Z · Sem …: W · Previsto: V"). Sem nomes. */
export function contagensQuemNaoPagou(facts: string): Record<'pago' | 'parcial' | 'pendente' | 'sem_dado' | 'previsto', number> | null {
  const m = facts.match(/Pagos:\s*(\d+)\s*·\s*Parcial:\s*(\d+)\s*·\s*Pendente:\s*(\d+)\s*·[^:]*:\s*(\d+)\s*·\s*Previsto:\s*(\d+)/);
  if (!m) return null;
  return { pago: +m[1]!, parcial: +m[2]!, pendente: +m[3]!, sem_dado: +m[4]!, previsto: +m[5]! };
}

/**
 * Spec do cartão para uma tool executada (sem IA). `null` = tool sem visual (resposta só texto).
 * Erros de leitura também viram `null` (o texto continua valendo).
 */
export async function specDaConsulta(
  tool: ConsultaToolId,
  params: Record<string, string>,
  ctx: MesAno,
  facts: string,
  deps: VisualDeps,
): Promise<CriacaoSpec | null> {
  try {
    return await montar(tool, params, ctx, facts, deps);
  } catch {
    return null;
  }
}

async function montar(tool: ConsultaToolId, params: Record<string, string>, ctx: MesAno, facts: string, deps: VisualDeps): Promise<CriacaoSpec | null> {
  switch (tool) {
    case 'resumo_mes': {
      const d = await datasetBalanco(ctx, 1, deps);
      if (!d.linhas.length) return null;
      return hidratar(
        {
          titulo: `Balanço de ${ref(ctx)}`,
          subtitulo: 'Extrato bancário oficial',
          secoes: [
            {
              type: 'kpi_cards',
              titulo: 'Resumo do mês',
              itens: [
                { label: 'Entradas', dataset: d.id, linha: 0, coluna: 'entradas' },
                { label: 'Saídas', dataset: d.id, linha: 0, coluna: 'saidas' },
                { label: 'Saldo', dataset: d.id, linha: 0, coluna: 'saldo' },
              ],
            },
            { type: 'bar_chart', titulo: 'Entradas × saídas', dataset: d.id, x: 'mes', series: ['entradas', 'saidas'] },
          ],
        },
        [d],
      );
    }
    case 'balanco_meses': {
      const n = Math.min(12, Math.max(1, Math.trunc(Number(params.meses ?? 1)) || 1));
      const d = await datasetBalanco(ctx, n, deps);
      if (!d.linhas.length) return null;
      return hidratar(
        {
          titulo: d.titulo,
          subtitulo: 'Extrato bancário oficial',
          secoes: [
            {
              type: 'kpi_cards',
              titulo: 'Total do período',
              itens: [
                { label: 'Entradas', dataset: d.id, linha: 'total', coluna: 'entradas' },
                { label: 'Saídas', dataset: d.id, linha: 'total', coluna: 'saidas' },
                { label: 'Saldo', dataset: d.id, linha: 'total', coluna: 'saldo' },
              ],
            },
            { type: 'bar_chart', titulo: 'Entradas × saídas por mês', dataset: d.id, x: 'mes', series: ['entradas', 'saidas'] },
            { type: 'line_chart', titulo: 'Saldo mês a mês', dataset: d.id, x: 'mes', series: ['saldo'] },
            { type: 'table', titulo: 'Mês a mês', dataset: d.id },
          ],
        },
        [d],
      );
    }
    case 'comparar_meses': {
      const a = parseYm(params.mes_a);
      const b = parseYm(params.mes_b);
      if (!a || !b) return null;
      const d = await datasetComparar(a, b, deps);
      if (d.linhas.length < 2) return null;
      return hidratar(
        {
          titulo: `Comparativo ${ref(a)} × ${ref(b)}`,
          subtitulo: 'Extrato bancário oficial',
          secoes: [
            { type: 'comparison', titulo: 'Diferença entre os meses', dataset: d.id, x: 'mes', a: 0, b: 1, colunas: ['entradas', 'saidas', 'saldo'] },
            { type: 'bar_chart', titulo: 'Entradas × saídas', dataset: d.id, x: 'mes', series: ['entradas', 'saidas'] },
          ],
        },
        [d],
      );
    }
    case 'resumo_modalidades': {
      const d = await datasetModalidades(ctx, deps);
      if (!d.linhas.length) return null;
      return hidratar(
        {
          titulo: `Entradas por modalidade — ${ref(ctx)}`,
          subtitulo: 'Fluxo de caixa (data de pagamento)',
          secoes: [
            { type: 'kpi_cards', titulo: 'Total', itens: [{ label: 'Entradas', dataset: d.id, linha: 'total', coluna: 'total' }] },
            { type: 'donut', titulo: 'Participação por modalidade', dataset: d.id, label: 'modalidade', valor: 'total' },
            { type: 'table', titulo: 'Por modalidade', dataset: d.id },
          ],
        },
        [d],
      );
    }
    case 'entradas_modalidade_periodo': {
      const alvo = normalizeText(params.modalidade ?? '').toLowerCase();
      if (!alvo) return null;
      const ini = parseYm(params.mes_inicio) ?? ctx;
      const fim = parseYm(params.mes_fim) ?? ini;
      const meses = mesesEntre(ini, fim);
      const maps = await Promise.all(meses.map((m) => deps.modalidades(m.mes, m.ano)));
      const linhas = meses.map((m, i) => {
        let total = 0;
        let qtd = 0;
        for (const [k, v] of maps[i]!) {
          if (normalizeText(k).toLowerCase().includes(alvo)) {
            total += v.total;
            qtd += v.qtd;
          }
        }
        return { mes: `${m.ano}-${pad2(m.mes)}`, total: r2(total), qtd };
      });
      if (!linhas.some((l) => l.qtd > 0)) return null; // sem registro ≠ zero: só texto
      const d: Dataset = {
        id: 'modalidade_periodo',
        titulo: `Entradas — ${params.modalidade}`,
        fonte: 'Fluxo de caixa operacional (data de pagamento)',
        colunas: [
          { key: 'mes', label: 'Mês', formato: 'mes' },
          { key: 'total', label: 'Total', formato: 'brl' },
          { key: 'qtd', label: 'Pagamentos', formato: 'numero' },
        ],
        linhas,
      };
      const secoes: unknown[] = [
        {
          type: 'kpi_cards',
          titulo: 'Total do período',
          itens: [
            { label: 'Entradas', dataset: d.id, linha: 'total', coluna: 'total' },
            { label: 'Pagamentos', dataset: d.id, linha: 'total', coluna: 'qtd' },
          ],
        },
      ];
      if (linhas.length > 1) secoes.push({ type: 'bar_chart', titulo: 'Mês a mês', dataset: d.id, x: 'mes', series: ['total'] });
      return hidratar({ titulo: `Entradas de ${params.modalidade}`, subtitulo: 'Fluxo de caixa (data de pagamento)', secoes }, [d]);
    }
    case 'maiores_saidas': {
      const saidas = await deps.saidasMes(ctx.mes, ctx.ano);
      if (!saidas.length) return null;
      const g = new Map<string, { nome: string; total: number; qtd: number }>();
      for (const s of saidas) {
        const nome = limparDocumentoPessoa(s.pessoa) || 'Sem identificação';
        const k = normalizeText(nome);
        const cur = g.get(k) ?? { nome, total: 0, qtd: 0 };
        cur.total += Math.abs(Number(s.valor));
        cur.qtd += 1;
        g.set(k, cur);
      }
      const d: Dataset = {
        id: 'maiores_saidas',
        titulo: `Maiores saídas — ${ref(ctx)}`,
        fonte: 'Extrato bancário oficial (saídas do mês)',
        colunas: [
          { key: 'destino', label: 'Destinatário', formato: 'texto' },
          { key: 'total', label: 'Total', formato: 'brl' },
          { key: 'qtd', label: 'Lançamentos', formato: 'numero' },
        ],
        linhas: [...g.values()].sort((a, b) => b.total - a.total).slice(0, 10).map((x) => ({ destino: x.nome, total: r2(x.total), qtd: x.qtd })),
      };
      const total = r2(saidas.reduce((a, s) => a + Math.abs(Number(s.valor)), 0));
      const tot: Dataset = {
        id: 'saidas_total',
        titulo: 'Total de saídas',
        fonte: d.fonte,
        colunas: [
          { key: 'total', label: 'Total', formato: 'brl' },
          { key: 'qtd', label: 'Lançamentos', formato: 'numero' },
        ],
        linhas: [{ total, qtd: saidas.length }],
      };
      return hidratar(
        {
          titulo: `Maiores saídas — ${ref(ctx)}`,
          subtitulo: 'Extrato bancário oficial',
          secoes: [
            {
              type: 'kpi_cards',
              titulo: 'Saídas do mês',
              itens: [
                { label: 'Total', dataset: tot.id, linha: 0, coluna: 'total' },
                { label: 'Lançamentos', dataset: tot.id, linha: 0, coluna: 'qtd' },
              ],
            },
            { type: 'ranking', titulo: 'Por destinatário (top 10)', dataset: d.id, label: 'destino', valor: 'total', top: 10 },
          ],
        },
        [d, tot],
      );
    }
    case 'repasses_professores': {
      const filtro = normalizeText(params.professor ?? '').toLowerCase();
      if (filtro && /\b(pholha|weider|wendel|coworking)\b/.test(filtro)) return null; // coworking é entrada: só texto
      const saidas = await deps.saidasMes(ctx.mes, ctx.ano);
      const g = new Map<string, { professor: string; atividade: string; total: number; qtd: number }>();
      for (const s of saidas) {
        const p = professorDaSaida(s);
        if (!p) continue;
        if (filtro && normalizeText(p.apelido).toLowerCase() !== filtro && normalizeText(p.atividade).toLowerCase() !== filtro) continue;
        const cur = g.get(p.apelido) ?? { professor: p.apelido, atividade: p.atividade, total: 0, qtd: 0 };
        cur.total += Math.abs(Number(s.valor));
        cur.qtd += 1;
        g.set(p.apelido, cur);
      }
      if (!g.size) return null;
      const d: Dataset = {
        id: 'repasses_professores',
        titulo: `Repasses a professores — ${ref(ctx)}`,
        fonte: 'Extrato bancário oficial (saídas a professores)',
        colunas: [
          { key: 'professor', label: 'Professor', formato: 'texto' },
          { key: 'atividade', label: 'Atividade', formato: 'texto' },
          { key: 'total', label: 'Total', formato: 'brl' },
          { key: 'qtd', label: 'Lançamentos', formato: 'numero' },
        ],
        linhas: [...g.values()].sort((a, b) => b.total - a.total).map((x) => ({ ...x, total: r2(x.total) })),
      };
      return hidratar(
        {
          titulo: `Repasses a professores — ${ref(ctx)}`,
          subtitulo: 'Extrato bancário (o Controle de caixa aparece no texto)',
          secoes: [
            { type: 'kpi_cards', titulo: 'Total pelo extrato', itens: [{ label: 'Repasses', dataset: d.id, linha: 'total', coluna: 'total' }] },
            { type: 'ranking', titulo: 'Por professor', dataset: d.id, label: 'professor', valor: 'total' },
            { type: 'table', titulo: 'Detalhe', dataset: d.id },
          ],
        },
        [d],
      );
    }
    case 'quem_nao_pagou': {
      const c = contagensQuemNaoPagou(facts);
      if (!c) return null;
      const mesRef = parseYm(params.mes) ?? ctx;
      const d: Dataset = {
        id: 'situacao_competencia',
        titulo: `Situação das mensalidades — ${ref(mesRef)}`,
        fonte: 'Fluxo de caixa (competência; mesmo cálculo da tela)',
        colunas: [
          { key: 'status', label: 'Situação', formato: 'texto' },
          { key: 'alunos', label: 'Alunos', formato: 'numero' },
        ],
        linhas: [
          { status: 'Pagos', alunos: c.pago },
          { status: 'Pendentes', alunos: c.pendente },
          { status: 'Parciais', alunos: c.parcial },
          { status: 'Previstos', alunos: c.previsto },
          { status: 'Sem valor no cadastro', alunos: c.sem_dado },
        ],
      };
      return hidratar(
        {
          titulo: `Quem não pagou — ${ref(mesRef)}${params.modalidade ? ` · ${params.modalidade}` : ''}`,
          subtitulo: 'Só contagens (os nomes ficam no texto da resposta)',
          secoes: [
            {
              type: 'kpi_cards',
              titulo: 'Situação',
              itens: [
                { label: 'Pendentes', dataset: d.id, linha: 1, coluna: 'alunos' },
                { label: 'Parciais', dataset: d.id, linha: 2, coluna: 'alunos' },
                { label: 'Pagos', dataset: d.id, linha: 0, coluna: 'alunos' },
              ],
            },
            { type: 'donut', titulo: 'Distribuição', dataset: d.id, label: 'status', valor: 'alunos' },
          ],
        },
        [d],
      );
    }
    default:
      return null;
  }
}

/** Dica (só para a IA) com os datasets do cartão, para ela poder propor um layout. */
export function dicaVisualParaIa(spec: CriacaoSpec): string {
  const ds = spec.datasets.map((d) => `${d.id}(${d.colunas.map((c) => c.key).join(',')}; ${d.linhas.length} linhas)`).join(' ');
  return instrucaoIa(`Visual disponível: datasets ${ds}.`);
}

const RE_VISUAL = /<visual>([\s\S]*?)<\/visual>/i;

/** Separa o bloco <visual>{json}</visual> da resposta da IA. O texto volta sem o bloco. */
export function extrairVisualDaIa(texto: string): { texto: string; draft: unknown | null } {
  const m = texto.match(RE_VISUAL);
  if (!m) return { texto, draft: null };
  const limpo = texto.replace(RE_VISUAL, '').replace(/<\/?visual>/gi, '').trim();
  try {
    return { texto: limpo, draft: JSON.parse(m[1]!.trim()) };
  } catch {
    return { texto: limpo, draft: null };
  }
}

/** Valida o rascunho da IA com zod contra os datasets reais. Inválido → null (usa o determinístico). */
export function specPropostoPelaIa(draft: unknown, datasets: Dataset[], origem: 'groq' | 'gemini'): CriacaoSpec | null {
  if (draft == null || !datasets.length) return null;
  const r = validarEHidratar(draft, datasets.map(datasetSemPii), origem);
  if (!r.ok) return null;
  // Texto livre da IA no cartão poderia trazer nomes já re-identificados: descartado (o texto vai na resposta).
  r.spec.secoes = r.spec.secoes.filter((s) => s.type !== 'narrative');
  return r.spec.secoes.length ? r.spec : null;
}

