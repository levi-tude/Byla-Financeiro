/**
 * Dados da planilha CONTROLE DE CAIXA formatados para relatório (gestão) e para o prompt de IA.
 * Fonte: mesmos blocos que o adapter (entradasBlocos + saidasBlocos) — não reparsear porColuna com heurística paralela.
 */

import type { SaidaBlocoPlanilha } from '../domain/FluxoPlanilhaTotais.js';
import { linhasGastosFixosDeSaidasBlocos } from '../logic/planilhaControleEntradas.js';
import { normalizarTituloBlocoSaida, parseValor } from '../logic/planilhaControleSaidas.js';

/** Totais por bloco normalizado (Parceiros, Fixas, Aluguel) — para cards / destaques. */
export function totaisAgregadosPorBlocoSaida(
  saidasBlocos: SaidaBlocoPlanilha[] | undefined,
): { nome: string; total: number }[] {
  const map = new Map<string, number>();
  for (const b of saidasBlocos ?? []) {
    const nome = normalizarTituloBlocoSaida(b.titulo);
    let t = 0;
    for (const l of b.linhas) {
      t += Math.abs(l.valorNum ?? parseValor(l.valor) ?? 0);
    }
    map.set(nome, (map.get(nome) ?? 0) + t);
  }
  return Array.from(map.entries())
    .map(([nome, total]) => ({ nome, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

/** Lista plana para o campo legado por_fonte_planilha. */
export function flattenEntradasPorFontePlanilha(
  entradasBlocos: SaidaBlocoPlanilha[] | undefined,
): { label: string; valor: number }[] {
  const out: { label: string; valor: number }[] = [];
  for (const b of entradasBlocos ?? []) {
    const prefix = b.titulo.trim();
    for (const l of b.linhas) {
      const v = l.valorNum ?? parseValor(l.valor) ?? 0;
      if (v <= 0) continue;
      const label = prefix && prefix !== 'Entradas' ? `${prefix}: ${l.label}` : l.label;
      out.push({ label, valor: Math.abs(v) });
    }
  }
  return out;
}

export function montarControleCaixaLeituraGestao(
  entradasBlocos: SaidaBlocoPlanilha[] | undefined,
  saidasBlocos: SaidaBlocoPlanilha[] | undefined,
  abaPlanilha: string | null,
  totaisPlanilha?: { entrada: number | null; saida: number | null; lucro: number | null } | null,
  /** Ex.: trimestral/anual — explica que o detalhe linha a linha é de um mês de referência, não a soma do período. */
  notaPreviewPeriodo?: string | null,
): {
  titulo: string;
  publico_alvo: string;
  aba_planilha: string | null;
  /** Esclarece que descrições vêm só de células da planilha — não de cadastro de equipe nem do extrato. */
  origem_detalhe_listas: { entradas_e_saidas: string };
  /** Totais agregados da planilha CONTROLE (mesma base que entradas/saídas oficiais do extrato no JSON). */
  totais_planilha: { entradas_reais: number | null; saidas_reais: number | null; lucro_reais: number | null } | null;
  /** Quando preenchida, os totais em totais_planilha referem-se ao mesmo mês das linhas (pode diferir dos cards agregados do trimestre/ano). */
  nota_preview_periodo?: string | null;
  entradas_linha_a_linha: { secao: string; descricao: string; valor_reais: number }[];
  saidas_por_categoria: { categoria: string; descricao: string; valor_reais: number }[];
  gastos_fixos_linha_a_linha: { descricao: string; valor_reais: number }[];
  instrucao_relatorio: string;
} {
  const entradas_linha_a_linha: { secao: string; descricao: string; valor_reais: number }[] = [];
  for (const b of entradasBlocos ?? []) {
    const secao = b.titulo.trim() || 'Entradas';
    for (const l of b.linhas) {
      const v = l.valorNum ?? parseValor(l.valor) ?? 0;
      if (v <= 0) continue;
      entradas_linha_a_linha.push({ secao, descricao: l.label, valor_reais: Math.abs(v) });
    }
  }

  const saidas_por_categoria: { categoria: string; descricao: string; valor_reais: number }[] = [];
  for (const b of saidasBlocos ?? []) {
    const cat = normalizarTituloBlocoSaida(b.titulo);
    for (const l of b.linhas) {
      const v = l.valorNum ?? parseValor(l.valor) ?? 0;
      if (v <= 0) continue;
      saidas_por_categoria.push({ categoria: cat, descricao: l.label, valor_reais: Math.abs(v) });
    }
  }

  const gastos_fixos_linha_a_linha: { descricao: string; valor_reais: number }[] = [];
  for (const l of linhasGastosFixosDeSaidasBlocos(saidasBlocos)) {
    const v = l.valorNum ?? parseValor(l.valor) ?? 0;
    if (v <= 0) continue;
    gastos_fixos_linha_a_linha.push({ descricao: l.label, valor_reais: Math.abs(v) });
  }

  const totais_planilha =
    totaisPlanilha &&
    (totaisPlanilha.entrada != null || totaisPlanilha.saida != null || totaisPlanilha.lucro != null)
      ? {
          entradas_reais: totaisPlanilha.entrada,
          saidas_reais: totaisPlanilha.saida,
          lucro_reais: totaisPlanilha.lucro,
        }
      : null;

  return {
    titulo: 'Valores extraídos da planilha CONTROLE DE CAIXA',
    publico_alvo: 'gestão e administração do Espaço Byla',
    aba_planilha: abaPlanilha,
    origem_detalhe_listas: {
      entradas_e_saidas:
        'Somente texto e valores lidos de células da aba CONTROLE DE CAIXA (Google Sheets). Não usa cadastro de funcionários (funcionariosByla), nem extrato Supabase (transacoes); essas fontes podem aparecer em outros campos do relatório, mas não alimentam estas listas.',
    },
    totais_planilha,
    nota_preview_periodo: notaPreviewPeriodo ?? null,
    entradas_linha_a_linha,
    saidas_por_categoria,
    gastos_fixos_linha_a_linha,
    instrucao_relatorio:
      'Cada linha vem da planilha: entradas por seção; saídas por bloco (Parceiros, Fixas, Aluguel). O campo totais_planilha resume entrada/saída/lucro do CONTROLE; gastos_fixos_linha_a_linha repete só o bloco de gastos fixos para leitura rápida (as mesmas linhas também aparecem em saidas_por_categoria como categoria Saídas Fixas). Totais de fechamento na aba não são listados como linhas de detalhe.',
  };
}
