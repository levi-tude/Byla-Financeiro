import {
  LEGACY_ENTRADA_ALUGUEL_TEMPLATE_KEY_LABELS,
  stableEntradaAluguelTemplateKeyForLabel,
} from '../controleCaixa/chavesEstaveis.js';
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
      const raw: CategoriaEntradaLinha = {
        templateKey: linhaTemplateKey(linha.templateKey, linha.id),
        label: linha.label.trim(),
        blocoTemplateKey: bKey,
        blocoTitulo: bloco.titulo,
        ordem: linha.ordem,
        blocoOrdem: bloco.ordem,
        linhaId: linha.id,
        blocoId: bloco.id,
        isCustom: linha.isCustom,
      };
      // Filtro Transações / sticky: sempre expor chave estável quando o rótulo for conhecido
      // (evita `entrada::linha:uuid` ≠ `ent_parc_*` gravado no mapeamento).
      out.push({
        ...raw,
        templateKey: preferStableEntradaTemplateKey(raw),
        blocoTemplateKey: preferStableEntradaBlocoKey(raw),
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
  // Catálogo de classificação usa o modo sistema (template keys estáveis).
  const result = await readControleCaixa(mes, ano, 'sistema');
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

/** Chaves estáveis usadas em sugestões, repasse e migrações antigas. */
export const LEGACY_ENTRADA_TEMPLATE_KEY_LABELS: Record<string, string> = {
  ent_parc_danca: 'Dança',
  ent_parc_yoga: 'Yoga',
  ent_parc_pilates_mari: 'Pilates Mari',
  ent_parc_pilates: 'Pilates Mari',
  ent_parc_teatro: 'Teatro',
  ent_parc_teatro_infantil: 'Teatro Infantil',
  ent_parc_bruna_gr: 'Bruna GR',
  ...LEGACY_ENTRADA_ALUGUEL_TEMPLATE_KEY_LABELS,
};

/** Preferência ao gravar regra: chave estável (não `linha:uuid` que morre no próximo sync). */
const STABLE_ENTRADA_KEY_BY_LABEL: Record<string, string> = {
  dança: 'ent_parc_danca',
  danca: 'ent_parc_danca',
  yoga: 'ent_parc_yoga',
  'pilates mari': 'ent_parc_pilates_mari',
  pilates: 'ent_parc_pilates_mari',
  teatro: 'ent_parc_teatro',
  'teatro infantil': 'ent_parc_teatro_infantil',
  'bruna gr': 'ent_parc_bruna_gr',
};

export function stableEntradaTemplateKeyForLabel(label: string): string | null {
  const norm = label.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const withCedilla = label.trim().toLowerCase();
  return (
    STABLE_ENTRADA_KEY_BY_LABEL[withCedilla] ??
    STABLE_ENTRADA_KEY_BY_LABEL[norm] ??
    stableEntradaAluguelTemplateKeyForLabel(label) ??
    null
  );
}

/**
 * Se a linha do catálogo só tem `linha:uuid`, devolve a chave estável do parceiro/aluguel quando o rótulo for conhecido.
 * Assim o mapeamento sobrevive a recriação do Controle.
 */
export function preferStableEntradaTemplateKey(cat: CategoriaEntradaLinha): string {
  const raw = (cat.templateKey ?? '').trim();
  if (raw && !raw.startsWith('linha:') && !raw.startsWith('legado:')) return raw;
  return stableEntradaTemplateKeyForLabel(cat.label) ?? raw;
}

export function preferStableEntradaBlocoKey(cat: CategoriaEntradaLinha): string {
  const raw = (cat.blocoTemplateKey ?? '').trim();
  if (raw && !raw.startsWith('bloco:')) return raw;
  if (isCategoriaEntradaParceiros(cat)) return 'entrada_parceiros';
  if (isCategoriaEntradaAluguelCoworking(cat)) return 'entrada_aluguel_coworking';
  return raw;
}

/**
 * Aceita chave do Controle (`linha:uuid`), chave estável (`ent_parc_danca`) ou rótulo legado.
 * `labelHint` recupera chaves órfãs após o Controle ser recriado (UUIDs antigos).
 */
export function resolveCategoriaEntradaInCatalog(
  catalog: CategoriaEntradaLinha[],
  templateKey: string,
  labelHint?: string | null,
): CategoriaEntradaLinha | null {
  const key = templateKey.trim();
  if (!key) {
    return labelHint ? findCategoriaEntradaByLabel(catalog, labelHint) : null;
  }

  const direct = findCategoriaEntradaInCatalog(catalog, key);
  if (direct) return direct;

  const legacyLabel = LEGACY_ENTRADA_TEMPLATE_KEY_LABELS[key];
  if (legacyLabel) {
    const byLabel = findCategoriaEntradaByLabel(catalog, legacyLabel);
    if (byLabel) return byLabel;
  }

  if (key.startsWith('legado:')) {
    const labelGuess = key.slice('legado:'.length).replace(/_/g, ' ');
    const byLegado = findCategoriaEntradaByLabel(catalog, labelGuess);
    if (byLegado) return byLegado;
  }

  if (labelHint) {
    const byHint = findCategoriaEntradaByLabel(catalog, labelHint);
    if (byHint) return byHint;
  }

  return null;
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
