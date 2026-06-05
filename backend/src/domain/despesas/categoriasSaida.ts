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

/** Catálogo do mês: blocos/linhas de saída salvos no Controle de Caixa (inclui custom). */
export async function loadCatalogoSaidasControleMes(
  mes: number,
  ano: number,
): Promise<CategoriaSaidaLinha[]> {
  const result = await readControleCaixa(mes, ano);
  if ('error' in result) throw new Error(result.error);
  return catalogoSaidasFromControleData(result.data);
}

/** Fallback estático (só se leitura do mês falhar em testes). */
export function catalogoSaidasTemplatePadrao(): CategoriaSaidaLinha[] {
  const template = buildControleCaixaTemplate();
  const fake: ControleCaixaReadDto = {
    mes: 0,
    ano: 0,
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

export function findCategoriaInCatalogByLabel(
  catalog: CategoriaSaidaLinha[],
  label: string,
): CategoriaSaidaLinha | null {
  const norm = label.trim().toLowerCase();
  return catalog.find((c) => c.label.trim().toLowerCase() === norm) ?? null;
}
