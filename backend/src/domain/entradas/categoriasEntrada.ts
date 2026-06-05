import { buildControleCaixaTemplate } from '../controleCaixa/template.js';
import { readControleCaixa, type ControleCaixaReadDto } from '../../services/controleCaixaRead.js';
import {
  blocoTemplateKeyFrom,
  linhaTemplateKey,
} from '../despesas/categoriasSaida.js';

export type CategoriaEntradaLinha = {
  templateKey: string;
  label: string;
  blocoTemplateKey: string;
  blocoTitulo: string;
  ordem: number;
  blocoOrdem: number;
  linhaId: string;
  blocoId: string;
  isCustom: boolean;
};

/** Todas as linhas de blocos de entrada do Controle do mês (Parceiros + Aluguel/Coworking + custom). */
export function catalogoEntradasFromControleData(data: ControleCaixaReadDto): CategoriaEntradaLinha[] {
  const out: CategoriaEntradaLinha[] = [];
  for (const bloco of data.blocos) {
    if (bloco.tipo !== 'entrada') continue;
    const bKey = blocoTemplateKeyFrom(bloco.templateKey, bloco.id);
    for (const linha of bloco.linhas) {
      out.push({
        templateKey: linhaTemplateKey(linha.templateKey, linha.id),
        label: linha.label.trim(),
        blocoTemplateKey: bKey,
        blocoTitulo: bloco.titulo,
        ordem: linha.ordem,
        blocoOrdem: bloco.ordem,
        linhaId: linha.id,
        blocoId: bloco.id,
        isCustom: linha.isCustom,
      });
    }
  }
  out.sort((a, b) => a.blocoOrdem - b.blocoOrdem || a.ordem - b.ordem);
  return out;
}

/** Só Entradas Parceiros (mensalidades) — usado na sincronização de repasses. */
export function catalogoEntradasParceirosFromControleData(data: ControleCaixaReadDto): CategoriaEntradaLinha[] {
  return catalogoEntradasFromControleData(data).filter(
    (c) => c.blocoTemplateKey === 'entrada_parceiros' || c.blocoTitulo.toLowerCase().includes('parceir'),
  );
}

export function isCategoriaEntradaParceiros(cat: CategoriaEntradaLinha): boolean {
  return cat.blocoTemplateKey === 'entrada_parceiros' || cat.blocoTitulo.toLowerCase().includes('parceir');
}

export function isCategoriaEntradaAluguelCoworking(cat: CategoriaEntradaLinha): boolean {
  return (
    cat.blocoTemplateKey === 'entrada_aluguel_coworking' ||
    cat.blocoTitulo.toLowerCase().includes('aluguel') ||
    cat.blocoTitulo.toLowerCase().includes('coworking')
  );
}

export async function loadCatalogoEntradasControleMes(
  mes: number,
  ano: number,
): Promise<CategoriaEntradaLinha[]> {
  const result = await readControleCaixa(mes, ano);
  if ('error' in result) throw new Error(result.error);
  return catalogoEntradasFromControleData(result.data);
}

/** @deprecated Prefer loadCatalogoEntradasControleMes — mantido como alias do catálogo completo. */
export async function loadCatalogoEntradasParceirosMes(
  mes: number,
  ano: number,
): Promise<CategoriaEntradaLinha[]> {
  return loadCatalogoEntradasControleMes(mes, ano);
}

export function findCategoriaEntradaInCatalog(
  catalog: CategoriaEntradaLinha[],
  templateKey: string,
): CategoriaEntradaLinha | null {
  return catalog.find((c) => c.templateKey === templateKey) ?? null;
}

export function findCategoriaEntradaByLabel(
  catalog: CategoriaEntradaLinha[],
  label: string,
): CategoriaEntradaLinha | null {
  const norm = label.trim().toLowerCase();
  return catalog.find((c) => c.label.trim().toLowerCase() === norm) ?? null;
}

export function resolveHintNoCatalogo(
  catalog: CategoriaEntradaLinha[],
  hint: { templateKeyPreferido: string; labelEsperado: string },
): CategoriaEntradaLinha | null {
  const byKey = findCategoriaEntradaInCatalog(catalog, hint.templateKeyPreferido);
  if (byKey) return byKey;
  return findCategoriaEntradaByLabel(catalog, hint.labelEsperado);
}
