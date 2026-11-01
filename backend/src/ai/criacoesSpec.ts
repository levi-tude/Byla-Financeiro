/**
 * Criações da IA — contrato do "visualization spec".
 *
 * A IA NUNCA escreve código/HTML. Ela devolve um rascunho JSON (CriacaoDraft) que só pode
 * REFERENCIAR datasets produzidos pelas tools só-leitura (por id + nomes de coluna).
 * O servidor valida o rascunho com zod (objetos estritos: chave desconhecida = seção descartada),
 * confere cada referência contra os datasets reais e preenche os números (KPIs) a partir deles.
 */
import { z } from 'zod';

export const FORMATOS = ['brl', 'numero', 'texto', 'mes'] as const;
export type Formato = (typeof FORMATOS)[number];

export type DatasetColuna = { key: string; label: string; formato: Formato };
export type Dataset = {
  id: string;
  titulo: string;
  fonte: string;
  colunas: DatasetColuna[];
  linhas: Array<Record<string, string | number>>;
};

const id = z.string().min(1).max(40).regex(/^[a-z0-9_]+$/);
const col = z.string().min(1).max(40).regex(/^[a-z0-9_]+$/);
const titulo = z.string().min(1).max(90);
const linhaRef = z.union([z.number().int().min(0).max(50), z.literal('ultima'), z.literal('total')]);

const kpiItem = z.strictObject({ label: z.string().min(1).max(40), dataset: id, linha: linhaRef, coluna: col });

const serieChart = (type: 'line_chart' | 'bar_chart' | 'area_chart') =>
  z.strictObject({
    type: z.literal(type),
    titulo,
    descricao: z.string().max(200).optional(),
    dataset: id,
    x: col,
    series: z.array(col).min(1).max(4),
    empilhado: z.boolean().optional(),
  });

export const secaoDraftSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('kpi_cards'), titulo, itens: z.array(kpiItem).min(1).max(6) }),
  serieChart('line_chart'),
  serieChart('bar_chart'),
  serieChart('area_chart'),
  z.strictObject({ type: z.literal('donut'), titulo, descricao: z.string().max(200).optional(), dataset: id, label: col, valor: col }),
  z.strictObject({
    type: z.literal('comparison'),
    titulo,
    dataset: id,
    x: col,
    a: z.number().int().min(0).max(50),
    b: z.number().int().min(0).max(50),
    colunas: z.array(col).min(1).max(4),
  }),
  z.strictObject({ type: z.literal('ranking'), titulo, dataset: id, label: col, valor: col, top: z.number().int().min(1).max(15).optional() }),
  z.strictObject({ type: z.literal('table'), titulo, dataset: id, colunas: z.array(col).max(8).optional() }),
  z.strictObject({ type: z.literal('narrative'), titulo: titulo.optional(), texto: z.string().min(1).max(600) }),
]);
export type SecaoDraft = z.infer<typeof secaoDraftSchema>;

export const criacaoDraftSchema = z.strictObject({
  titulo,
  subtitulo: z.string().max(160).optional(),
  secoes: z.array(z.unknown()).min(1).max(10),
});

export type KpiHidratado = { label: string; dataset: string; coluna: string; valor: number; formato: Formato };
export type Secao =
  | (Exclude<SecaoDraft, { type: 'kpi_cards' }>)
  | { type: 'kpi_cards'; titulo: string; itens: KpiHidratado[] };

export type CriacaoSpec = {
  versao: 1;
  titulo: string;
  subtitulo?: string;
  origem: 'groq' | 'gemini' | 'deterministico' | 'demo';
  geradoEm: string;
  datasets: Dataset[];
  secoes: Secao[];
  avisos: string[];
};

function valorLinha(ds: Dataset, linha: z.infer<typeof linhaRef>, coluna: string): number | null {
  const c = ds.colunas.find((k) => k.key === coluna);
  if (!c || (c.formato !== 'brl' && c.formato !== 'numero')) return null;
  const nums = ds.linhas.map((l) => l[coluna]);
  if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null;
  if (linha === 'total') return Math.round((nums as number[]).reduce((a, b) => a + b, 0) * 100) / 100;
  const idx = linha === 'ultima' ? ds.linhas.length - 1 : linha;
  const v = ds.linhas[idx]?.[coluna];
  return typeof v === 'number' ? v : null;
}

/** Remove valores escritos pelo modelo no texto livre: números só vêm dos datasets. */
export function sanitizeNarrativa(texto: string): string {
  return texto
    .replace(/<[^>]*>/g, '')
    .replace(/R\$\s*-?[\d.,]+/gi, '(ver gráfico)')
    .replace(/-?\d+(?:[.,]\d+)?\s*%/g, '(ver gráfico)')
    .replace(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b/g, '(ver gráfico)')
    .replace(/\*\*|`|#/g, '')
    .trim();
}

function checkSecao(s: SecaoDraft, byId: Map<string, Dataset>): Secao | string {
  if (s.type === 'narrative') {
    const texto = sanitizeNarrativa(s.texto);
    return texto ? { ...s, texto } : 'narrativa vazia';
  }
  if (s.type === 'kpi_cards') {
    const itens: KpiHidratado[] = [];
    for (const it of s.itens) {
      if (!byId.has(it.dataset)) return `dataset inexistente: ${it.dataset}`;
      const d = byId.get(it.dataset)!;
      const v = valorLinha(d, it.linha, it.coluna);
      if (v == null) return `kpi inválido: ${it.dataset}.${it.coluna}`;
      itens.push({ label: it.label, dataset: it.dataset, coluna: it.coluna, valor: v, formato: d.colunas.find((c) => c.key === it.coluna)!.formato });
  }
    return { type: 'kpi_cards', titulo: s.titulo, itens };
  }
  const ds = byId.get(s.dataset);
  if (!ds) return `dataset inexistente: ${s.dataset}`;
  const has = (k: string) => ds.colunas.some((c) => c.key === k);
  const isNum = (k: string) => ds.colunas.some((c) => c.key === k && (c.formato === 'brl' || c.formato === 'numero'));
  switch (s.type) {
    case 'line_chart':
    case 'bar_chart':
    case 'area_chart':
      if (!has(s.x) || !s.series.every(isNum)) return 'colunas inválidas';
      return s;
    case 'donut':
    case 'ranking':
      if (!has(s.label) || !isNum(s.valor)) return 'colunas inválidas';
      return s;
    case 'comparison':
      if (!has(s.x) || !s.colunas.every(isNum) || !ds.linhas[s.a] || !ds.linhas[s.b]) return 'comparação inválida';
      return s;
    case 'table':
      if (s.colunas && !s.colunas.every(has)) return 'colunas inválidas';
      return s;
  }
}

/**
 * Valida o rascunho da IA contra o schema e os datasets reais.
 * Seções inválidas são descartadas (com aviso); se nada sobrar, retorna ok=false (o chamador usa o fallback).
 */
export function validarEHidratar(
  raw: unknown,
  datasets: Dataset[],
  origem: CriacaoSpec['origem'],
  agora = new Date(),
): { ok: true; spec: CriacaoSpec } | { ok: false; erro: string } {
  const top = criacaoDraftSchema.safeParse(raw);
  if (!top.success) return { ok: false, erro: 'Spec fora do schema.' };
  const byId = new Map(datasets.map((d) => [d.id, d]));
  const secoes: Secao[] = [];
  const avisos: string[] = [];
  top.data.secoes.forEach((s, i) => {
    const p = secaoDraftSchema.safeParse(s);
    if (!p.success) {
      avisos.push(`Seção ${i + 1} descartada (tipo/campos fora do schema).`);
      return;
    }
    const r = checkSecao(p.data, byId);
    if (typeof r === 'string') avisos.push(`Seção ${i + 1} descartada (${r}).`);
    else secoes.push(r);
  });
  if (!secoes.some((s) => s.type !== 'narrative')) return { ok: false, erro: 'Nenhuma seção com dados válidos.' };
  const usados = new Set(secoes.flatMap((s) => (s.type === 'narrative' ? [] : s.type === 'kpi_cards' ? s.itens.map((i) => i.dataset) : [s.dataset])));
  return {
    ok: true,
    spec: {
      versao: 1,
      titulo: top.data.titulo,
      subtitulo: top.data.subtitulo,
      origem,
      geradoEm: agora.toISOString(),
      datasets: datasets.filter((d) => usados.has(d.id)),
      secoes,
      avisos,
    },
  };
}

export const criacaoRequestSchema = z.strictObject({
  prompt: z.string().trim().min(3).max(500),
  monthYear: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});
