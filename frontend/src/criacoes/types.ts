/** Espelho do contrato do backend (backend/src/ai/criacoesSpec.ts). A IA nunca envia código: só este JSON. */
export type Formato = 'brl' | 'numero' | 'texto' | 'mes';
export type DatasetColuna = { key: string; label: string; formato: Formato };
export type Dataset = {
  id: string;
  titulo: string;
  fonte: string;
  colunas: DatasetColuna[];
  linhas: Array<Record<string, string | number>>;
};
export type KpiItem = { label: string; dataset: string; coluna: string; valor: number; formato: Formato };
export type Secao =
  | { type: 'kpi_cards'; titulo: string; itens: KpiItem[] }
  | { type: 'line_chart' | 'bar_chart' | 'area_chart'; titulo: string; descricao?: string; dataset: string; x: string; series: string[]; empilhado?: boolean }
  | { type: 'donut'; titulo: string; descricao?: string; dataset: string; label: string; valor: string }
  | { type: 'comparison'; titulo: string; dataset: string; x: string; a: number; b: number; colunas: string[] }
  | { type: 'ranking'; titulo: string; dataset: string; label: string; valor: string; top?: number }
  | { type: 'table'; titulo: string; dataset: string; colunas?: string[] }
  | { type: 'narrative'; titulo?: string; texto: string };
export type CriacaoSpec = {
  versao: 1;
  titulo: string;
  subtitulo?: string;
  origem: 'gemini' | 'deterministico' | 'demo';
  geradoEm: string;
  datasets: Dataset[];
  secoes: Secao[];
  avisos: string[];
};

const TIPOS = new Set(['kpi_cards', 'line_chart', 'bar_chart', 'area_chart', 'donut', 'comparison', 'ranking', 'table', 'narrative']);

/** Defesa extra no cliente: só renderiza tipos conhecidos com dataset existente. */
export function secoesRenderizaveis(spec: CriacaoSpec): Secao[] {
  const ids = new Set(spec.datasets.map((d) => d.id));
  return spec.secoes.filter((s) => {
    if (!TIPOS.has(s.type)) return false;
    if (s.type === 'narrative') return typeof s.texto === 'string';
    if (s.type === 'kpi_cards') return s.itens.every((i) => typeof i.valor === 'number');
    return ids.has(s.dataset);
  });
}
