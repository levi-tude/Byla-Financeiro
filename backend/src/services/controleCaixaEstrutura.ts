import { stableEntradaTemplateKeyForLabel } from '../domain/entradas/categoriasEntrada.js';
import {
  estruturaControleCompleta,
  precisaRepararEstruturaSistema,
} from '../domain/controleCaixa/mesAnterior.js';
import { buildControleCaixaTemplate } from '../domain/controleCaixa/template.js';
import type { ControleCaixaReadDto } from './controleCaixaRead.js';

type LoadExistingFn = (
  mes: number,
  ano: number,
  modo: 'oficial' | 'sistema',
) => Promise<{ data: ControleCaixaReadDto } | { error: string; notFound?: true }>;

function linhaMatchKey(label: string, templateKey: string | null | undefined): string {
  const tk = (templateKey ?? '').trim().toLowerCase();
  if (tk) return `k:${tk}`;
  return `l:${label.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()}`;
}

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

function stableSaidaParceiroKeyForLabel(label: string): string | null {
  const withCedilla = label.trim().toLowerCase();
  const norm = withCedilla.normalize('NFD').replace(/\p{M}/gu, '');
  return STABLE_SAIDA_PARCEIRO_BY_LABEL[withCedilla] ?? STABLE_SAIDA_PARCEIRO_BY_LABEL[norm] ?? null;
}

function hydrateBlocoTemplateKeys(data: ControleCaixaReadDto): void {
  for (const bloco of data.blocos) {
    const titulo = bloco.titulo.toLowerCase();
    if (!bloco.templateKey) {
      if (bloco.tipo === 'entrada' && titulo.includes('parceir')) bloco.templateKey = 'entrada_parceiros';
      else if (bloco.tipo === 'entrada' && (titulo.includes('aluguel') || titulo.includes('coworking'))) {
        bloco.templateKey = 'entrada_aluguel_coworking';
      } else if (bloco.tipo === 'saida' && titulo.includes('parceir')) {
        bloco.templateKey = 'saida_parceiros';
      } else if (
        bloco.tipo === 'saida' &&
        (titulo.includes('fixa') || titulo.includes('gastos fixos'))
      ) {
        bloco.templateKey = 'saida_gastos_fixos';
      }
    }
  }
}

/**
 * Se o modo sistema está incompleto (ex.: só Entradas Parceiros após sync antigo)
 * ou usa o template genérico legado, reconstitui a partir do Oficial (planilha)
 * ou do template operacional, preservando valores já preenchidos no sistema.
 */
export function mergeEstruturaPreservandoValores(
  estrutura: ControleCaixaReadDto,
  valores: ControleCaixaReadDto,
): ControleCaixaReadDto {
  const valorByKey = new Map<string, { valor: number | null; valorTexto: string | null }>();
  for (const b of valores.blocos) {
    for (const l of b.linhas) {
      valorByKey.set(linhaMatchKey(l.label, l.templateKey), {
        valor: l.valor,
        valorTexto: l.valorTexto,
      });
    }
  }

  return {
    ...estrutura,
    modo: 'sistema',
    somenteLeitura: false,
    origem: valores.origem || estrutura.origem,
    updatedAt: valores.updatedAt ?? estrutura.updatedAt,
    totais: { ...valores.totais },
    blocos: estrutura.blocos.map((b) => ({
      ...b,
      id: b.id,
      linhas: b.linhas.map((l) => {
        const hit = valorByKey.get(linhaMatchKey(l.label, l.templateKey));
        if (!hit) return { ...l };
        return {
          ...l,
          valor: hit.valor,
          valorTexto: hit.valorTexto,
        };
      }),
    })),
  };
}

/** Evita recriar Controle com template_key null (quebra mapeamentos sticky). */
export function ensureParceirosTemplateKeys(data: ControleCaixaReadDto): void {
  hydrateBlocoTemplateKeys(data);
  for (const bloco of data.blocos) {
    const isParceiros =
      bloco.templateKey === 'entrada_parceiros' ||
      (bloco.tipo === 'entrada' && bloco.titulo.toLowerCase().includes('parceir'));
    const isSaidaParceiros =
      bloco.templateKey === 'saida_parceiros' ||
      (bloco.tipo === 'saida' && bloco.titulo.toLowerCase().includes('parceir'));
    if (!isParceiros && !isSaidaParceiros) continue;
    if (isParceiros && !bloco.templateKey) bloco.templateKey = 'entrada_parceiros';
    if (isSaidaParceiros && !bloco.templateKey) bloco.templateKey = 'saida_parceiros';
    for (const linha of bloco.linhas) {
      if ((linha.templateKey ?? '').trim()) continue;
      if (isParceiros) {
        const stable = stableEntradaTemplateKeyForLabel(linha.label);
        if (stable) linha.templateKey = stable;
      } else {
        const stable = stableSaidaParceiroKeyForLabel(linha.label);
        if (stable) linha.templateKey = stable;
      }
    }
  }
}

function templateAsDto(
  mes: number,
  ano: number,
  data: ControleCaixaReadDto,
): ControleCaixaReadDto {
  const template = buildControleCaixaTemplate();
  return {
    mes,
    ano,
    modo: 'sistema',
    modosDisponiveis: data.modosDisponiveis,
    somenteLeitura: false,
    existe: true,
    abaRef: data.abaRef ?? template.abaRef,
    origem: data.origem,
    updatedAt: data.updatedAt,
    totais: { ...data.totais },
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
}

/**
 * Garante estrutura operacional alinhada à planilha (oficial do mês ou template).
 * Não persiste — o caller grava se necessário.
 * `loadExisting` evita ciclo de import com controleCaixaRead.
 */
export async function ensureSistemaEstruturaCompleta(
  mes: number,
  ano: number,
  data: ControleCaixaReadDto,
  loadExisting: LoadExistingFn,
): Promise<{ data: ControleCaixaReadDto; repaired: boolean; fonte: 'ok' | 'oficial' | 'template' }> {
  if (!precisaRepararEstruturaSistema(data)) {
    ensureParceirosTemplateKeys(data);
    return { data, repaired: false, fonte: 'ok' };
  }

  const oficial = await loadExisting(mes, ano, 'oficial');
  if ('data' in oficial && estruturaControleCompleta(oficial.data)) {
    const merged = mergeEstruturaPreservandoValores(oficial.data, data);
    ensureParceirosTemplateKeys(merged);
    return { data: merged, repaired: true, fonte: 'oficial' };
  }

  const merged = mergeEstruturaPreservandoValores(templateAsDto(mes, ano, data), data);
  ensureParceirosTemplateKeys(merged);
  return { data: merged, repaired: true, fonte: 'template' };
}

export function dtoToControlePersistPayload(data: ControleCaixaReadDto) {
  return {
    abaRef: data.abaRef,
    totais: { ...data.totais },
    blocos: data.blocos.map((b) => ({
      tipo: b.tipo,
      titulo: b.titulo,
      ordem: b.ordem,
      templateKey: b.templateKey,
      isDefault: b.isDefault,
      isCustom: b.isCustom,
      lockedLevel: b.lockedLevel,
      linhas: b.linhas.map((l) => ({
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
}
