import { stableEntradaTemplateKeyForLabel } from '../domain/entradas/categoriasEntrada.js';
import { stableSaidaTemplateKeyForLabel } from '../domain/despesas/categoriasSaida.js';
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

function isBlocoEntradaParceiros(bloco: ControleCaixaReadDto['blocos'][number]): boolean {
  return (
    bloco.templateKey === 'entrada_parceiros' ||
    (bloco.tipo === 'entrada' && bloco.titulo.toLowerCase().includes('parceir'))
  );
}

function isBlocoEntradaAluguel(bloco: ControleCaixaReadDto['blocos'][number]): boolean {
  const t = bloco.titulo.toLowerCase();
  return (
    bloco.templateKey === 'entrada_aluguel_coworking' ||
    (bloco.tipo === 'entrada' && (t.includes('aluguel') || t.includes('coworking')))
  );
}

function isBlocoSaidaParceiros(bloco: ControleCaixaReadDto['blocos'][number]): boolean {
  return (
    bloco.templateKey === 'saida_parceiros' ||
    (bloco.tipo === 'saida' && bloco.titulo.toLowerCase().includes('parceir'))
  );
}

function isBlocoSaidaFixas(bloco: ControleCaixaReadDto['blocos'][number]): boolean {
  const t = bloco.titulo.toLowerCase();
  return (
    bloco.templateKey === 'saida_gastos_fixos' ||
    (bloco.tipo === 'saida' && (t.includes('fixa') || t.includes('gastos fixos')))
  );
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
        // Estrutura (oficial/template) só empresta rótulos/chaves — valores vêm
        // só do Sistema já preenchido. Sem match → linha vazia (não copia planilha).
        if (!hit) return { ...l, valor: null, valorTexto: null };
        return {
          ...l,
          valor: hit.valor,
          valorTexto: hit.valorTexto,
        };
      }),
    })),
  };
}

/**
 * Garante chaves estáveis em Parceiros, Aluguel e Saídas Fixas (não só parceiros).
 * Remapeia `templateKey` null/`linha:uuid` → chave estável pelo rótulo quando possível.
 */
export function ensureStableTemplateKeys(data: ControleCaixaReadDto): void {
  hydrateBlocoTemplateKeys(data);
  for (const bloco of data.blocos) {
    if (isBlocoEntradaParceiros(bloco) && !bloco.templateKey) bloco.templateKey = 'entrada_parceiros';
    if (isBlocoEntradaAluguel(bloco) && !bloco.templateKey) bloco.templateKey = 'entrada_aluguel_coworking';
    if (isBlocoSaidaParceiros(bloco) && !bloco.templateKey) bloco.templateKey = 'saida_parceiros';
    if (isBlocoSaidaFixas(bloco) && !bloco.templateKey) bloco.templateKey = 'saida_gastos_fixos';

    const wantsStable =
      isBlocoEntradaParceiros(bloco) ||
      isBlocoEntradaAluguel(bloco) ||
      isBlocoSaidaParceiros(bloco) ||
      isBlocoSaidaFixas(bloco);
    if (!wantsStable) continue;

    for (const linha of bloco.linhas) {
      const raw = (linha.templateKey ?? '').trim();
      if (raw && !raw.startsWith('linha:') && !raw.startsWith('legado:')) continue;
      if (bloco.tipo === 'entrada') {
        const stable = stableEntradaTemplateKeyForLabel(linha.label);
        if (stable) linha.templateKey = stable;
      } else {
        const stable = stableSaidaTemplateKeyForLabel(linha.label);
        if (stable) linha.templateKey = stable;
      }
    }
  }
}

/** @deprecated Use ensureStableTemplateKeys — mantido como alias. */
export function ensureParceirosTemplateKeys(data: ControleCaixaReadDto): void {
  ensureStableTemplateKeys(data);
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
    ensureStableTemplateKeys(data);
    return { data, repaired: false, fonte: 'ok' };
  }

  const oficial = await loadExisting(mes, ano, 'oficial');
  if ('data' in oficial && estruturaControleCompleta(oficial.data)) {
    const merged = mergeEstruturaPreservandoValores(oficial.data, data);
    ensureStableTemplateKeys(merged);
    return { data: merged, repaired: true, fonte: 'oficial' };
  }

  const merged = mergeEstruturaPreservandoValores(templateAsDto(mes, ano, data), data);
  ensureStableTemplateKeys(merged);
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
