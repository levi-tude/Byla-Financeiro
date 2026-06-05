export function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

export function agruparPorBlocoTitulo<T extends { blocoTitulo: string }>(
  categorias: T[],
): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const c of categorias) {
    const list = map.get(c.blocoTitulo) ?? [];
    list.push(c);
    map.set(c.blocoTitulo, list);
  }
  return [...map.entries()];
}

export type CategoriaOpcao = {
  templateKey: string;
  label: string;
  blocoTitulo: string;
  blocoTemplateKey: string;
};

export function agruparPorBlocoChave(
  categorias: CategoriaOpcao[],
): Array<{ blocoTemplateKey: string; blocoTitulo: string; linhas: CategoriaOpcao[] }> {
  const map = new Map<string, { blocoTitulo: string; linhas: CategoriaOpcao[] }>();
  for (const c of categorias) {
    const cur = map.get(c.blocoTemplateKey) ?? { blocoTitulo: c.blocoTitulo, linhas: [] };
    cur.linhas.push(c);
    map.set(c.blocoTemplateKey, cur);
  }
  return [...map.entries()].map(([blocoTemplateKey, v]) => ({
    blocoTemplateKey,
    blocoTitulo: v.blocoTitulo,
    linhas: v.linhas,
  }));
}

export function filtrarCategoriasPorBusca(categorias: CategoriaOpcao[], busca: string): CategoriaOpcao[] {
  const q = busca.trim().toLowerCase();
  if (!q) return categorias;
  return categorias.filter(
    (c) => c.label.toLowerCase().includes(q) || c.blocoTitulo.toLowerCase().includes(q),
  );
}

/** Valor do select quando nenhum filtro de tipo está ativo. */
export const FILTRO_TIPO_TODAS = '';

/** Valor do select para mostrar só lançamentos/grupos sem categoria. */
export const FILTRO_TIPO_PENDENTE = '_pendente';

/** Valor do select para filtrar um bloco inteiro do Controle (`bloco:<blocoTemplateKey>`). */
export const FILTRO_BLOCO_PREFIX = 'bloco:';

export function encodeFiltroBloco(blocoTemplateKey: string): string {
  return `${FILTRO_BLOCO_PREFIX}${blocoTemplateKey}`;
}

export function parseFiltroBlocoKey(filtro: string): string | null {
  if (!filtro.startsWith(FILTRO_BLOCO_PREFIX)) return null;
  const key = filtro.slice(FILTRO_BLOCO_PREFIX.length);
  return key || null;
}

export type GrupoComTemplateKey = {
  template_key: string | null;
  bloco_template_key?: string | null;
  sugestao_fluxo?: { template_key: string } | null;
  match_aluguel?: { template_key: string } | null;
  sugestao?: { template_key: string | null } | null;
  sugestao_heuristica?: { label: string } | null;
};

export function resolveGrupoTemplateKey(
  grupo: GrupoComTemplateKey,
  categorias?: CategoriaOpcao[],
): string | null {
  if (grupo.template_key) return grupo.template_key;
  if (grupo.sugestao_fluxo?.template_key) return grupo.sugestao_fluxo.template_key;
  if (grupo.match_aluguel?.template_key) return grupo.match_aluguel.template_key;
  if (grupo.sugestao?.template_key) return grupo.sugestao.template_key;
  const sugLabel = grupo.sugestao_heuristica?.label?.trim();
  if (sugLabel && categorias?.length) {
    const hit = categorias.find((c) => c.label.trim().toLowerCase() === sugLabel.toLowerCase());
    if (hit) return hit.templateKey;
  }
  return null;
}

export function resolveGrupoBlocoTemplateKey(
  grupo: GrupoComTemplateKey,
  templateKeyEfetivo: string | null,
  categorias: CategoriaOpcao[],
): string | null {
  if (grupo.bloco_template_key) return grupo.bloco_template_key;
  if (templateKeyEfetivo) {
    const hit = categorias.find((c) => c.templateKey === templateKeyEfetivo);
    if (hit) return hit.blocoTemplateKey;
  }
  return null;
}

export function grupoPassaFiltroTipo(
  templateKeyEfetivo: string | null,
  filtro: string,
  blocoTemplateKeyEfetivo?: string | null,
): boolean {
  if (!filtro || filtro === FILTRO_TIPO_TODAS) return true;
  if (filtro === FILTRO_TIPO_PENDENTE) return !templateKeyEfetivo;
  const blocoKey = parseFiltroBlocoKey(filtro);
  if (blocoKey) return blocoTemplateKeyEfetivo === blocoKey;
  return templateKeyEfetivo === filtro;
}

export type PorCategoriaBlocoFiltravel = {
  bloco_titulo: string;
  bloco_template_key?: string;
  linhas: { template_key: string }[];
};

export function filtrarPorCategoriaBlocos<T extends PorCategoriaBlocoFiltravel>(
  blocos: T[],
  filtro: string,
): T[] {
  if (!filtro || filtro === FILTRO_TIPO_TODAS) return blocos;
  if (filtro === FILTRO_TIPO_PENDENTE) return [];
  const blocoKey = parseFiltroBlocoKey(filtro);
  if (blocoKey) {
    return blocos.filter((b) => b.bloco_template_key === blocoKey);
  }
  return blocos
    .map((bloco) => ({
      ...bloco,
      linhas: bloco.linhas.filter((l) => l.template_key === filtro),
    }))
    .filter((bloco) => bloco.linhas.length > 0);
}
