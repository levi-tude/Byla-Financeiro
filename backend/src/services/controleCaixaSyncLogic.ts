import {
  calcularRepasse,
  ENTRADA_PARA_SAIDA_REPASSE,
} from '../domain/entradas/repasseParceiros.js';
import { stableEntradaTemplateKeyForLabel } from '../domain/entradas/categoriasEntrada.js';
import { stableSaidaTemplateKeyForLabel } from '../domain/despesas/categoriasSaida.js';
import type { ControleCaixaReadDto } from './controleCaixaRead.js';

const TEATRO_INFANTIL_ENTRADA = 'ent_parc_teatro_infantil';
const TEATRO_INFANTIL_SAIDA = 'sai_parc_teatro_infantil';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumBloco(bloco: { linhas: { valor: number | null }[] }): number {
  return round2(bloco.linhas.reduce((s, l) => s + (l.valor ?? 0), 0));
}

function isBloco(dataBloco: ControleCaixaReadDto['blocos'][number], kind: string): boolean {
  const tk = (dataBloco.templateKey ?? '').trim();
  const titulo = dataBloco.titulo.toLowerCase();
  if (kind === 'entrada_parceiros') {
    return tk === 'entrada_parceiros' || (dataBloco.tipo === 'entrada' && titulo.includes('parceir'));
  }
  if (kind === 'entrada_aluguel') {
    return (
      tk === 'entrada_aluguel_coworking' ||
      (dataBloco.tipo === 'entrada' && (titulo.includes('aluguel') || titulo.includes('coworking')))
    );
  }
  if (kind === 'saida_parceiros') {
    return tk === 'saida_parceiros' || (dataBloco.tipo === 'saida' && titulo.includes('parceir'));
  }
  if (kind === 'saida_fixas') {
    return (
      tk === 'saida_gastos_fixos' ||
      (dataBloco.tipo === 'saida' && (titulo.includes('fixa') || titulo.includes('gastos fixos')))
    );
  }
  return false;
}

function lookupValor(
  valores: Map<string, number>,
  linha: { id: string; label: string; templateKey: string | null },
  stableFromLabel: (label: string) => string | null,
): number | undefined {
  const candidates = [
    (linha.templateKey ?? '').trim(),
    `linha:${linha.id}`,
    stableFromLabel(linha.label) ?? '',
  ].filter(Boolean);
  for (const k of candidates) {
    if (valores.has(k)) return valores.get(k);
  }
  return undefined;
}

function saidaKeyParaEntrada(entKey: string): string | null {
  return ENTRADA_PARA_SAIDA_REPASSE[entKey] ?? null;
}

function entradaKeyParaSaida(saiKey: string): string | null {
  return Object.entries(ENTRADA_PARA_SAIDA_REPASSE).find(([, sai]) => sai === saiKey)?.[0] ?? null;
}

/**
 * Sync completo do Controle modo Sistema (lógica pura, testável):
 * - Entradas Parceiros + Aluguel ← soma classificados (sobrescreve; sem classificado → 0)
 * - Saídas Parceiros ← só fórmulas a partir das entradas; Teatro Infantil só se houver entrada
 * - Saídas Fixas ← soma classificados Despesas (nunca Saídas Parceiros)
 * - Totais recalculados
 */
export function aplicarSyncCompletoSistema(
  data: ControleCaixaReadDto,
  valoresEntradaClassificados: Map<string, number>,
  valoresDespesaClassificados: Map<string, number>,
): void {
  const valoresEntradaComClassificacao = new Map<string, number>();

  for (const bloco of data.blocos) {
    if (!isBloco(bloco, 'entrada_parceiros') && !isBloco(bloco, 'entrada_aluguel')) continue;
    for (const linha of bloco.linhas) {
      const soma = lookupValor(valoresEntradaClassificados, linha, stableEntradaTemplateKeyForLabel);
      const tKey =
        (linha.templateKey ?? '').trim() ||
        stableEntradaTemplateKeyForLabel(linha.label) ||
        `linha:${linha.id}`;
      if (soma !== undefined) {
        linha.valor = soma;
        linha.valorTexto = 'extrato_classificado';
        if (Object.keys(ENTRADA_PARA_SAIDA_REPASSE).includes(tKey) || tKey.startsWith('ent_parc_')) {
          valoresEntradaComClassificacao.set(tKey, soma);
        }
      } else {
        linha.valor = 0;
        linha.valorTexto = 'sync_zerado';
      }
    }
  }

  // Entradas classificadas sem linha no template (ex.: Teatro Infantil) ainda alimentam repasse.
  for (const [key, val] of valoresEntradaClassificados) {
    if (!ENTRADA_PARA_SAIDA_REPASSE[key]) continue;
    if (!valoresEntradaComClassificacao.has(key)) {
      valoresEntradaComClassificacao.set(key, val);
    }
  }

  for (const bloco of data.blocos) {
    if (!isBloco(bloco, 'saida_parceiros')) continue;
    for (const linha of bloco.linhas) {
      const saiKey =
        (linha.templateKey ?? '').trim() ||
        stableSaidaTemplateKeyForLabel(linha.label) ||
        '';
      const entKey = entradaKeyParaSaida(saiKey);

      if (saiKey === TEATRO_INFANTIL_SAIDA || entKey === TEATRO_INFANTIL_ENTRADA) {
        if (!valoresEntradaComClassificacao.has(TEATRO_INFANTIL_ENTRADA)) {
          linha.valor = 0;
          linha.valorTexto = 'sync_zerado';
          continue;
        }
        const entrada = valoresEntradaComClassificacao.get(TEATRO_INFANTIL_ENTRADA) ?? 0;
        const repasse = calcularRepasse(TEATRO_INFANTIL_ENTRADA, entrada);
        linha.valor = repasse ?? 0;
        linha.valorTexto = 'calculado_repasse';
        continue;
      }

      if (!entKey) {
        // Linha de parceiro sem fórmula conhecida: zera (sync não copia Despesas).
        linha.valor = 0;
        linha.valorTexto = 'sync_zerado';
        continue;
      }

      if (!valoresEntradaComClassificacao.has(entKey)) {
        linha.valor = 0;
        linha.valorTexto = 'sync_zerado';
        continue;
      }

      const entrada = valoresEntradaComClassificacao.get(entKey) ?? 0;
      const repasse = calcularRepasse(entKey, entrada);
      linha.valor = repasse ?? 0;
      linha.valorTexto = 'calculado_repasse';
    }
  }

  for (const bloco of data.blocos) {
    if (!isBloco(bloco, 'saida_fixas')) continue;
    for (const linha of bloco.linhas) {
      const soma = lookupValor(valoresDespesaClassificados, linha, stableSaidaTemplateKeyForLabel);
      if (soma !== undefined) {
        linha.valor = soma;
        linha.valorTexto = 'extrato_classificado';
      } else {
        linha.valor = 0;
        linha.valorTexto = 'sync_zerado';
      }
    }
  }

  let entradaTotal = 0;
  let saidaTotal = 0;
  let saidaParceirosTotal = 0;
  let saidaFixasTotal = 0;
  for (const bloco of data.blocos) {
    const t = sumBloco(bloco);
    if (bloco.tipo === 'entrada') entradaTotal += t;
    else {
      saidaTotal += t;
      if (isBloco(bloco, 'saida_parceiros')) saidaParceirosTotal += t;
      if (isBloco(bloco, 'saida_fixas')) saidaFixasTotal += t;
    }
  }

  data.totais = {
    entradaTotal: entradaTotal || null,
    saidaTotal: saidaTotal || null,
    lucroTotal: round2(entradaTotal - saidaTotal),
    saidaParceirosTotal: saidaParceirosTotal || null,
    saidaFixasTotal: saidaFixasTotal || null,
    saidaSomaSecoesPrincipais: round2(saidaParceirosTotal + saidaFixasTotal) || null,
  };
}

/**
 * Agrega valor em todas as chaves equivalentes (estável + linha:uuid + raw).
 * Deduplica chaves: se a efetiva já é a estável, NÃO somar duas vezes no mesmo slot
 * (isso inflava o Controle Sistema ~2× após remap sticky → ent_parc_*).
 */
export function agregarValorEmChaves(
  map: Map<string, number>,
  keys: string[],
  valor: number,
): void {
  const v = round2(Math.abs(valor));
  const seen = new Set<string>();
  for (const k of keys) {
    const key = k.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    map.set(key, round2((map.get(key) ?? 0) + v));
  }
}

export { saidaKeyParaEntrada, TEATRO_INFANTIL_ENTRADA, TEATRO_INFANTIL_SAIDA };
