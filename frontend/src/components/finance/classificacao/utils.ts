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
};

export function filtrarCategoriasPorBusca(categorias: CategoriaOpcao[], busca: string): CategoriaOpcao[] {
  const q = busca.trim().toLowerCase();
  if (!q) return categorias;
  return categorias.filter(
    (c) => c.label.toLowerCase().includes(q) || c.blocoTitulo.toLowerCase().includes(q),
  );
}
