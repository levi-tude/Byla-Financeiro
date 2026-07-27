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
  categorias?: CategoriaOpcao[],
): boolean {
  if (!filtro || filtro === FILTRO_TIPO_TODAS) return true;
  if (filtro === FILTRO_TIPO_PENDENTE) return !templateKeyEfetivo;
  const blocoKey = parseFiltroBlocoKey(filtro);
  if (blocoKey) {
    if (blocoTemplateKeyEfetivo === blocoKey) return true;
    if (!categorias?.length || !blocoTemplateKeyEfetivo) return false;
    // bloco:uuid legado vs chave estável (entrada_parceiros / saida_gastos_fixos)
    const blocoA = categorias.find((c) => c.blocoTemplateKey === blocoTemplateKeyEfetivo);
    const blocoB = categorias.find((c) => c.blocoTemplateKey === blocoKey);
    if (blocoA && blocoB && blocoA.blocoTitulo === blocoB.blocoTitulo) return true;
    return false;
  }
  if (templateKeyEfetivo === filtro) return true;
  if (!categorias?.length || !templateKeyEfetivo) return false;
  const canonEfetivo = resolveTemplateKeyInCategorias(templateKeyEfetivo, categorias);
  const canonFiltro = resolveTemplateKeyInCategorias(filtro, categorias);
  return Boolean(canonEfetivo && canonFiltro && canonEfetivo === canonFiltro);
}

/** Chaves legadas (sugestão/repasse/sticky) → rótulo no Controle de Caixa. */
const LEGACY_TEMPLATE_LABELS: Record<string, string> = {
  ent_parc_danca: 'Dança',
  ent_parc_yoga: 'Yoga',
  ent_parc_pilates_mari: 'Pilates Mari',
  ent_parc_pilates: 'Pilates Mari',
  ent_parc_teatro: 'Teatro',
  ent_parc_teatro_infantil: 'Teatro Infantil',
  ent_parc_bruna_gr: 'Bruna GR',
  ent_alug_neto_sba: 'Neto (SBA)',
  ent_alug_pholha: 'Pholha (Funcional)',
  ent_alug_forro_alma: 'Forró e Alma',
  ent_alug_pilates_fabi: 'Pilates Fabi',
  ent_alug_loja_everaldo: 'Loja (Everaldo)',
  sai_parc_danca: 'Dança',
  sai_parc_yoga: 'Yoga',
  sai_parc_pilates_mari: 'Pilates Mari',
  sai_parc_teatro: 'Teatro',
  sai_parc_teatro_infantil: 'Teatro Infantil',
  sai_parc_bruna_gr: 'Bruna GR',
  sai_fix_energia: 'Energia',
  sai_fix_agua: 'Água',
  sai_fix_net: 'Net',
  sai_fix_materiais: 'Materiais',
  sai_fix_energia_solar: 'Energia Solar',
  sai_fix_contadora: 'Contadora',
  sai_fix_eli_ar: 'Eli Ar Condicionado',
  sai_fix_impostos: 'Impostos',
  sai_fix_iptu: 'IPTU',
  sai_fix_samuel: 'Samuel',
  sai_fix_luciana: 'Luciana',
  sai_fix_funcionarios: 'Funcionários',
  sai_fix_transporte: 'Transporte',
  sai_fix_parcela_pilates: 'Parcela Pilates',
};

/** Alinha chave da sugestão/regra antiga com o catálogo real do mês (ex.: ent_parc_danca ou linha:uuid órfão → linha atual). */
export function resolveTemplateKeyInCategorias(
  rawKey: string | null | undefined,
  categorias: CategoriaOpcao[],
  labelHint?: string | null,
): string {
  const key = (rawKey ?? '').trim();
  if (key && categorias.some((c) => c.templateKey === key)) return key;

  const legacyLabel = key ? LEGACY_TEMPLATE_LABELS[key] : undefined;
  const label = (legacyLabel ?? labelHint ?? '').trim();
  if (label) {
    const hit = categorias.find((c) => c.label.trim().toLowerCase() === label.toLowerCase());
    if (hit) return hit.templateKey;
  }

  // Chave `linha:uuid` de um Controle já recriado: sem label, não dá para salvar.
  if (key.startsWith('linha:')) return '';

  return key;
}

export type PorCategoriaBlocoFiltravel = {
  bloco_titulo: string;
  bloco_template_key?: string;
  linhas: { template_key: string }[];
};

export function filtrarPorCategoriaBlocos<T extends PorCategoriaBlocoFiltravel>(
  blocos: T[],
  filtro: string,
  categorias?: CategoriaOpcao[],
): T[] {
  if (!filtro || filtro === FILTRO_TIPO_TODAS) return blocos;
  if (filtro === FILTRO_TIPO_PENDENTE) return [];
  const blocoKey = parseFiltroBlocoKey(filtro);
  if (blocoKey) {
    return blocos.filter((b) => {
      if (b.bloco_template_key === blocoKey) return true;
      if (!categorias?.length || !b.bloco_template_key) return false;
      const a = categorias.find((c) => c.blocoTemplateKey === b.bloco_template_key);
      const bb = categorias.find((c) => c.blocoTemplateKey === blocoKey);
      return Boolean(a && bb && a.blocoTitulo === bb.blocoTitulo);
    });
  }
  const canonFiltro = categorias?.length ? resolveTemplateKeyInCategorias(filtro, categorias) : filtro;
  return blocos
    .map((bloco) => ({
      ...bloco,
      linhas: bloco.linhas.filter((l) => {
        if (l.template_key === filtro || l.template_key === canonFiltro) return true;
        if (!categorias?.length) return false;
        return resolveTemplateKeyInCategorias(l.template_key, categorias) === canonFiltro;
      }),
    }))
    .filter((bloco) => bloco.linhas.length > 0);
}
