import {
  resolveCategoriaInCatalog,
  findCategoriaInCatalogByLabel,
  type CategoriaSaidaLinha,
} from '../domain/despesas/categoriasSaida.js';

export type MapeamentoRow = {
  id: string;
  pessoa_normalizada: string;
  categoria: string;
  subcategoria: string | null;
  template_key: string | null;
  bloco_template_key: string | null;
  aplica_tipo: string;
  ativo: boolean;
  updated_at: string;
  origem_regra?: string | null;
  confirmado?: boolean | null;
  observacao?: string | null;
};

/** Opção A: regra inativa ainda classifica até o mês/ano da desativação (inclusive). */
export function mapeamentoClassificaMes(mapeamento: MapeamentoRow, mes: number, ano: number): boolean {
  if (mapeamento.ativo) return true;
  const d = new Date(mapeamento.updated_at);
  if (Number.isNaN(d.getTime())) return false;
  const dy = d.getUTCFullYear();
  const dm = d.getUTCMonth() + 1;
  if (ano < dy) return true;
  if (ano > dy) return false;
  return mes <= dm;
}

export function resolveCategoriaFromMapeamento(
  mapeamento: MapeamentoRow,
  catalog: CategoriaSaidaLinha[],
): CategoriaSaidaLinha | null {
  if (mapeamento.template_key) {
    const byKey = resolveCategoriaInCatalog(catalog, mapeamento.template_key);
    if (byKey) return byKey;
  }
  const byLabel = findCategoriaInCatalogByLabel(catalog, mapeamento.categoria);
  if (byLabel) return byLabel;
  return null;
}

export function pickMapeamentoForPessoa(
  mapeamentos: MapeamentoRow[],
  pessoaNorm: string,
  mes: number,
  ano: number,
  catalog: CategoriaSaidaLinha[],
): { row: MapeamentoRow; categoria: CategoriaSaidaLinha; regraDesativada: boolean } | null {
  const candidates = mapeamentos.filter(
    (m) => m.pessoa_normalizada === pessoaNorm && (m.aplica_tipo === 'saida' || m.aplica_tipo === 'todos'),
  );
  const active = candidates.find((m) => m.ativo);
  const row = active ?? candidates.find((m) => mapeamentoClassificaMes(m, mes, ano));
  if (!row) return null;

  let categoria = resolveCategoriaFromMapeamento(row, catalog);
  if (!categoria && (row.categoria ?? '').trim()) {
    categoria = {
      templateKey: row.template_key ?? `legado:${row.categoria.trim().toLowerCase()}`,
      label: row.categoria.trim(),
      blocoTemplateKey: row.bloco_template_key ?? 'legado',
      blocoTitulo: 'Fora do Controle atual',
      ordem: 0,
      blocoOrdem: 999,
      linhaId: '',
      blocoId: '',
      isCustom: true,
    };
  }
  if (!categoria) return null;
  return { row, categoria, regraDesativada: !row.ativo };
}
