import {
  findCategoriaEntradaByLabel,
  resolveCategoriaEntradaInCatalog,
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
    const byKey = resolveCategoriaEntradaInCatalog(
      catalog,
      mapeamento.template_key,
      mapeamento.categoria,
    );
    if (byKey) return byKey;
  }
  if ((mapeamento.categoria ?? '').trim()) {
    return findCategoriaEntradaByLabel(catalog, mapeamento.categoria);
  }
  return null;
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
  // Sem linha no Controle atual (ex.: sticky `linha:uuid` órfão após salvar estrutura),
  // NÃO inventa categoria fantasma — volta a pendente para o usuário reclassificar.
  const categoria = resolveCategoriaEntradaFromMapeamento(row, catalog);
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
