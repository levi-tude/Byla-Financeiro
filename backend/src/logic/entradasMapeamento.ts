import {
  findCategoriaEntradaByLabel,
  findCategoriaEntradaInCatalog,
  type CategoriaEntradaLinha,
} from '../domain/entradas/categoriasEntrada.js';
import {
  mapeamentoClassificaMes,
  type MapeamentoRow,
} from './despesasMapeamento.js';

export type { MapeamentoRow };

export function isMapeamentoEntradaConfirmado(row: MapeamentoRow): boolean {
  return row.confirmado !== false;
}

export function isMapeamentoSugestaoFluxo(row: MapeamentoRow): boolean {
  return row.origem_regra === 'validacao_fluxo' && row.confirmado === false;
}

export function resolveCategoriaEntradaFromMapeamento(
  mapeamento: MapeamentoRow,
  catalog: CategoriaEntradaLinha[],
): CategoriaEntradaLinha | null {
  if (mapeamento.template_key) {
    const byKey = findCategoriaEntradaInCatalog(catalog, mapeamento.template_key);
    if (byKey) return byKey;
  }
  return findCategoriaEntradaByLabel(catalog, mapeamento.categoria);
}

function pickMapeamentoEntradaRowForPessoa(
  mapeamentos: MapeamentoRow[],
  pessoaNorm: string,
  mes: number,
  ano: number,
): MapeamentoRow | null {
  const candidates = mapeamentos.filter(
    (m) => m.pessoa_normalizada === pessoaNorm && (m.aplica_tipo === 'entrada' || m.aplica_tipo === 'todos'),
  );
  const active = candidates.find((m) => m.ativo);
  return active ?? candidates.find((m) => mapeamentoClassificaMes(m, mes, ano)) ?? null;
}

function resolveMapeamentoEntradaPick(
  row: MapeamentoRow,
  catalog: CategoriaEntradaLinha[],
): { row: MapeamentoRow; categoria: CategoriaEntradaLinha; regraDesativada: boolean } | null {
  let categoria = resolveCategoriaEntradaFromMapeamento(row, catalog);
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

/** Regra confirmada — usada para classificação efetiva e sync Controle. */
export function pickMapeamentoEntradaForPessoa(
  mapeamentos: MapeamentoRow[],
  pessoaNorm: string,
  mes: number,
  ano: number,
  catalog: CategoriaEntradaLinha[],
): { row: MapeamentoRow; categoria: CategoriaEntradaLinha; regraDesativada: boolean } | null {
  const row = pickMapeamentoEntradaRowForPessoa(mapeamentos, pessoaNorm, mes, ano);
  if (!row || !isMapeamentoEntradaConfirmado(row)) return null;
  return resolveMapeamentoEntradaPick(row, catalog);
}

/** Sugestão pendente de revisão (vínculo Pagamento dia a dia). */
export function pickSugestaoFluxoEntradaForPessoa(
  mapeamentos: MapeamentoRow[],
  pessoaNorm: string,
  mes: number,
  ano: number,
  catalog: CategoriaEntradaLinha[],
): { row: MapeamentoRow; categoria: CategoriaEntradaLinha } | null {
  const row = pickMapeamentoEntradaRowForPessoa(mapeamentos, pessoaNorm, mes, ano);
  if (!row || !isMapeamentoSugestaoFluxo(row)) return null;
  const resolved = resolveMapeamentoEntradaPick(row, catalog);
  if (!resolved) return null;
  return { row: resolved.row, categoria: resolved.categoria };
}
