import { criarFluxoPlanilhaVazio, type FluxoPlanilhaTotais, type LinhaPlanilha, type SaidaBlocoPlanilha } from '../domain/FluxoPlanilhaTotais.js';
import type { MesAno } from '../domain/MesAno.js';
import type { IFluxoPlanilhaRepository } from '../ports/IFluxoPlanilhaRepository.js';
import { getSupabase } from '../services/supabaseClient.js';

type PeriodoRow = {
  id: string;
  mes: number;
  ano: number;
  aba_ref: string | null;
  entrada_total: number | null;
  saida_total: number | null;
  lucro_total: number | null;
  saida_parceiros_total: number | null;
  saida_fixas_total: number | null;
  saida_soma_secoes_principais: number | null;
};

type BlocoRow = {
  id: string;
  periodo_id: string;
  tipo: 'entrada' | 'saida';
  titulo: string;
  ordem: number;
};

type LinhaRow = {
  id: string;
  bloco_id: string;
  label: string;
  valor: number | null;
  valor_texto: string | null;
  ordem: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function lineFromRow(row: LinhaRow): LinhaPlanilha {
  const valorNum = row.valor != null ? Number(row.valor) : null;
  return {
    label: row.label,
    valor: row.valor_texto ?? (valorNum != null ? String(valorNum) : ''),
    valorNum: valorNum != null ? round2(valorNum) : undefined,
  };
}

function toBlocos(blocos: BlocoRow[], linhas: LinhaRow[], tipo: 'entrada' | 'saida'): SaidaBlocoPlanilha[] {
  const linhasByBloco = new Map<string, LinhaRow[]>();
  for (const l of linhas) {
    const arr = linhasByBloco.get(l.bloco_id) ?? [];
    arr.push(l);
    linhasByBloco.set(l.bloco_id, arr);
  }
  return blocos
    .filter((b) => b.tipo === tipo)
    .sort((a, b) => a.ordem - b.ordem)
    .map((b) => ({
      titulo: b.titulo,
      linhas: (linhasByBloco.get(b.id) ?? [])
        .sort((a, c) => a.ordem - c.ordem)
        .map(lineFromRow),
    }));
}

export class SupabaseFluxoAdapter implements IFluxoPlanilhaRepository {
  constructor(private readonly fallbackRepo: IFluxoPlanilhaRepository) {}

  async obterTotais(
    mesAno: MesAno
  ): Promise<{ totais: FluxoPlanilhaTotais; error?: string; fallbackMessage?: string; origem?: 'supabase' | 'planilha' | 'erro' }> {
    const sourcePrimary = (process.env.BYLA_FLUXO_SOURCE_PRIMARY ?? 'supabase').trim().toLowerCase();
    if (sourcePrimary !== 'supabase') {
      return this.fallbackRepo.obterTotais(mesAno);
    }

    const supabase = getSupabase();
    if (!supabase) {
      const fallback = await this.fallbackRepo.obterTotais(mesAno);
      return {
        ...fallback,
        fallbackMessage: 'Supabase indisponível para fluxo; usando fallback planilha.',
        origem: 'planilha',
      };
    }

    const { data: periodo, error: periodoError } = await supabase
      .from('controle_caixa_periodos')
      .select(
        'id, mes, ano, aba_ref, entrada_total, saida_total, lucro_total, saida_parceiros_total, saida_fixas_total, saida_soma_secoes_principais'
      )
      .eq('mes', mesAno.mes)
      .eq('ano', mesAno.ano)
      .maybeSingle<PeriodoRow>();

    if (periodoError) {
      const fallback = await this.fallbackRepo.obterTotais(mesAno);
      return {
        ...fallback,
        fallbackMessage: `Erro ao ler Supabase fluxo (${periodoError.message}); usando planilha.`,
        origem: 'planilha',
      };
    }

    if (!periodo) {
      const fallback = await this.fallbackRepo.obterTotais(mesAno);
      return {
        ...fallback,
        fallbackMessage: 'Sem registro de fluxo no Supabase para o mês; usando planilha.',
        origem: 'planilha',
      };
    }

    const { data: blocos, error: blocosError } = await supabase
      .from('controle_caixa_blocos')
      .select('id, periodo_id, tipo, titulo, ordem')
      .eq('periodo_id', periodo.id)
      .order('ordem', { ascending: true });

    if (blocosError) {
      const fallback = await this.fallbackRepo.obterTotais(mesAno);
      return {
        ...fallback,
        fallbackMessage: `Erro ao ler blocos no Supabase (${blocosError.message}); usando planilha.`,
        origem: 'planilha',
      };
    }

    const blocosRows = (blocos ?? []) as unknown as BlocoRow[];
    const blocoIds = blocosRows.map((b) => b.id);
    const { data: linhas, error: linhasError } = blocoIds.length
      ? await supabase
          .from('controle_caixa_linhas')
          .select('id, bloco_id, label, valor, valor_texto, ordem')
          .in('bloco_id', blocoIds)
          .order('ordem', { ascending: true })
      : { data: [], error: null };

    if (linhasError) {
      const fallback = await this.fallbackRepo.obterTotais(mesAno);
      return {
        ...fallback,
        fallbackMessage: `Erro ao ler linhas no Supabase (${linhasError.message}); usando planilha.`,
        origem: 'planilha',
      };
    }

    const linhasRows = (linhas ?? []) as unknown as LinhaRow[];

    const entradasBlocos = toBlocos(blocosRows, linhasRows, 'entrada');
    const saidasBlocos = toBlocos(blocosRows, linhasRows, 'saida');

    const linhasFlat: LinhaPlanilha[] = [];
    for (const b of entradasBlocos) {
      linhasFlat.push(...b.linhas);
    }
    for (const b of saidasBlocos) {
      linhasFlat.push(...b.linhas);
    }

    const totais: FluxoPlanilhaTotais = criarFluxoPlanilhaVazio();
    totais.mes = periodo.mes;
    totais.ano = periodo.ano;
    totais.aba = periodo.aba_ref;
    totais.entradaTotal = periodo.entrada_total;
    totais.saidaTotal = periodo.saida_total;
    totais.lucroTotal = periodo.lucro_total;
    totais.saidaParceirosTotal = periodo.saida_parceiros_total;
    totais.saidaFixasTotal = periodo.saida_fixas_total;
    totais.saidaSomaSecoesPrincipais = periodo.saida_soma_secoes_principais;
    totais.entradasBlocos = entradasBlocos;
    totais.saidasBlocos = saidasBlocos;
    totais.linhas = linhasFlat;
    totais.porColuna = [];

    return { totais, origem: 'supabase' };
  }
}
