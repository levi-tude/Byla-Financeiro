import {
  LEGACY_SAIDA_FIXA_TEMPLATE_KEY_LABELS,
  stableCustomSaidaTemplateKey,
  stableSaidaFixaTemplateKeyForLabel,
} from '../controleCaixa/chavesEstaveis.js';
import { buildControleCaixaTemplate } from '../controleCaixa/template.js';
import { readControleCaixa, type ControleCaixaReadDto } from '../../services/controleCaixaRead.js';

export type CategoriaSaidaLinha = {
  /** Chave estável: template_key do Controle ou `linha:{uuid}` para linhas custom sem template. */
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

export function linhaTemplateKey(
  templateKey: string | null | undefined,
  linhaId: string,
): string {
  const t = (templateKey ?? '').trim();
  return t || `linha:${linhaId}`;
}

export function blocoTemplateKeyFrom(
  templateKey: string | null | undefined,
  blocoId: string,
): string {
  const t = (templateKey ?? '').trim();
  return t || `bloco:${blocoId}`;
}

/** Catálogo a partir do payload já lido do Supabase (mesmo formato da API controle-caixa). */
export function catalogoSaidasFromControleData(data: ControleCaixaReadDto): CategoriaSaidaLinha[] {
  const out: CategoriaSaidaLinha[] = [];
  for (const bloco of data.blocos) {
    if (bloco.tipo !== 'saida') continue;
    const bKey = blocoTemplateKeyFrom(bloco.templateKey, bloco.id);
    for (const linha of bloco.linhas) {
      const raw: CategoriaSaidaLinha = {
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
      // Mesma regra das entradas: filtro/sticky usam chave estável (sai_parc_* / sai_fix_*).
      out.push({
        ...raw,
        templateKey: preferStableSaidaTemplateKey(raw),
        blocoTemplateKey: preferStableSaidaBlocoKey(raw),
      });
    }
  }
  out.sort((a, b) => a.blocoOrdem - b.blocoOrdem || a.ordem - b.ordem);
  return out;
}

/** Catálogo do mês: blocos/linhas de saída salvos no Controle de Caixa (inclui custom). */
export async function loadCatalogoSaidasControleMes(
  mes: number,
  ano: number,
): Promise<CategoriaSaidaLinha[]> {
  const result = await readControleCaixa(mes, ano, 'sistema');
  if ('error' in result) throw new Error(result.error);
  return catalogoSaidasFromControleData(result.data);
}

/** Fallback estático (só se leitura do mês falhar em testes). */
export function catalogoSaidasTemplatePadrao(): CategoriaSaidaLinha[] {
  const template = buildControleCaixaTemplate();
  const fake: ControleCaixaReadDto = {
    mes: 0,
    ano: 0,
    modo: 'sistema',
    modosDisponiveis: ['sistema'],
    somenteLeitura: false,
    existe: true,
    abaRef: null,
    origem: 'template',
    updatedAt: null,
    totais: {
      entradaTotal: null,
      saidaTotal: null,
      lucroTotal: null,
      saidaParceirosTotal: null,
      saidaFixasTotal: null,
      saidaSomaSecoesPrincipais: null,
    },
    blocos: template.blocos.map((b, bi) => ({
      id: `tpl-b-${bi}`,
      tipo: b.tipo,
      titulo: b.titulo,
      ordem: b.ordem,
      templateKey: b.templateKey,
      isDefault: b.isDefault,
      isCustom: b.isCustom,
      lockedLevel: b.lockedLevel,
      linhas: b.linhas.map((l, li) => ({
        id: `tpl-l-${bi}-${li}`,
        label: l.label,
        valor: l.valor,
        valorTexto: l.valorTexto,
        ordem: l.ordem,
        templateKey: l.templateKey,
        isDefault: l.isDefault,
        isCustom: l.isCustom,
        lockedLevel: l.lockedLevel,
      })),
    })),
  };
  return catalogoSaidasFromControleData(fake);
}

export function findCategoriaInCatalog(
  catalog: CategoriaSaidaLinha[],
  templateKey: string,
): CategoriaSaidaLinha | null {
  return catalog.find((c) => c.templateKey === templateKey) ?? null;
}

const LEGACY_SAIDA_TEMPLATE_KEY_LABELS: Record<string, string> = {
  sai_parc_danca: 'Dança',
  sai_parc_yoga: 'Yoga',
  sai_parc_pilates_mari: 'Pilates Mari',
  sai_parc_teatro: 'Teatro',
  sai_parc_teatro_infantil: 'Teatro Infantil',
  sai_parc_bruna_gr: 'Bruna GR',
  ...LEGACY_SAIDA_FIXA_TEMPLATE_KEY_LABELS,
};

const STABLE_SAIDA_PARCEIRO_BY_LABEL: Record<string, string> = {
  dança: 'sai_parc_danca',
  danca: 'sai_parc_danca',
  yoga: 'sai_parc_yoga',
  'pilates mari': 'sai_parc_pilates_mari',
  pilates: 'sai_parc_pilates_mari',
  teatro: 'sai_parc_teatro',
  'teatro infantil': 'sai_parc_teatro_infantil',
  'bruna gr': 'sai_parc_bruna_gr',
};

export function stableSaidaTemplateKeyForLabel(label: string): string | null {
  const withCedilla = label.trim().toLowerCase();
  const norm = withCedilla.normalize('NFD').replace(/\p{M}/gu, '');
  return (
    STABLE_SAIDA_PARCEIRO_BY_LABEL[withCedilla] ??
    STABLE_SAIDA_PARCEIRO_BY_LABEL[norm] ??
    stableSaidaFixaTemplateKeyForLabel(label) ??
    null
  );
}

export function isCategoriaSaidaParceiros(cat: Pick<CategoriaSaidaLinha, 'blocoTemplateKey' | 'blocoTitulo'>): boolean {
  return (
    cat.blocoTemplateKey === 'saida_parceiros' ||
    cat.blocoTitulo.toLowerCase().includes('parceir')
  );
}

export function isCategoriaSaidaFixas(cat: Pick<CategoriaSaidaLinha, 'blocoTemplateKey' | 'blocoTitulo'>): boolean {
  const t = cat.blocoTitulo.toLowerCase();
  return (
    cat.blocoTemplateKey === 'saida_gastos_fixos' ||
    t.includes('fixa') ||
    t.includes('gastos fixos')
  );
}

/** Preferência ao gravar regra sticky: chave estável (não `linha:uuid`). */
export function preferStableSaidaTemplateKey(cat: CategoriaSaidaLinha): string {
  const raw = (cat.templateKey ?? '').trim();
  if (raw && !raw.startsWith('linha:') && !raw.startsWith('legado:')) return raw;
  return (
    stableSaidaTemplateKeyForLabel(cat.label) ??
    stableCustomSaidaTemplateKey(cat.label, cat.blocoTemplateKey)
  );
}

export function preferStableSaidaBlocoKey(cat: CategoriaSaidaLinha): string {
  const raw = (cat.blocoTemplateKey ?? '').trim();
  if (raw && !raw.startsWith('bloco:')) return raw;
  if (isCategoriaSaidaParceiros(cat)) return 'saida_parceiros';
  if (isCategoriaSaidaFixas(cat)) return 'saida_gastos_fixos';
  return raw;
}

export function resolveCategoriaInCatalog(
  catalog: CategoriaSaidaLinha[],
  templateKey: string,
  labelHint?: string | null,
): CategoriaSaidaLinha | null {
  const key = templateKey.trim();
  if (!key) {
    return labelHint ? findCategoriaInCatalogByLabel(catalog, labelHint) : null;
  }

  const direct = findCategoriaInCatalog(catalog, key);
  if (direct) return direct;

  const legacyLabel = LEGACY_SAIDA_TEMPLATE_KEY_LABELS[key];
  if (legacyLabel) {
    const byLabel = findCategoriaInCatalogByLabel(catalog, legacyLabel);
    if (byLabel) return byLabel;
  }

  if (key.startsWith('legado:')) {
    const labelGuess = key.slice('legado:'.length).replace(/_/g, ' ');
    const byLegado = findCategoriaInCatalogByLabel(catalog, labelGuess);
    if (byLegado) return byLegado;
  }

  if (labelHint) {
    const byHint = findCategoriaInCatalogByLabel(catalog, labelHint);
    if (byHint) return byHint;
  }

  return null;
}

export function findCategoriaInCatalogByLabel(
  catalog: CategoriaSaidaLinha[],
  label: string,
): CategoriaSaidaLinha | null {
  const norm = label.trim().toLowerCase();
  return catalog.find((c) => c.label.trim().toLowerCase() === norm) ?? null;
}
