import { normalizeText } from '../logic/conciliacaoTexto.js';
import { achatarBlocosParaMatch } from '../logic/planilhaControleSaidas.js';
import { loadControleCaixaExisting } from './controleCaixaRead.js';
import { filtrarTransacoesOficiais, type TransacaoBase } from './transacoesFiltro.js';
import { getSupabase } from './supabaseClient.js';
import { PlanilhaFluxoAdapter } from '../adapters/PlanilhaFluxoAdapter.js';
import { CacheFluxoPlanilhaAdapter } from '../adapters/CacheFluxoPlanilhaAdapter.js';
import { SupabaseFluxoAdapter } from '../adapters/SupabaseFluxoAdapter.js';
import { GetFluxoCompletoUseCase } from '../useCases/GetFluxoCompletoUseCase.js';

export type MesRef = { mes: number; ano: number };
export type Direcao = 'entrada' | 'saida';
export type LinhaSaida = { data?: string; descricao: string; valor: number; secao?: string; direcao?: Direcao; pessoaNorm?: string };
export type MapeamentoPessoa = { pessoa_normalizada: string; categoria: string | null; subcategoria: string | null };

/** Fontes consultadas, na ordem em que aparecem na resposta. */
export const FONTES_SAIDAS = {
  banco: 'Extrato bancário (entradas e saídas oficiais, por nome ou pela categoria do mapeamento pessoa→categoria)',
  controle: 'Controle de caixa (modo Planilha, importado no sistema)',
  planilha: 'Planilha FLUXO DE CAIXA (Google Sheets, blocos de saídas e repasses)',
} as const;
type FonteKey = keyof typeof FONTES_SAIDAS;

export type SaidasBeneficiarioDeps = Record<FonteKey, (m: MesRef) => Promise<LinhaSaida[]>> & {
  /** Regras de mapeamento_pessoa_categoria (apelido/categoria → pagador do banco). */
  mapeamento: () => Promise<MapeamentoPessoa[]>;
};

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const p2 = (n: number) => String(n).padStart(2, '0');

function bate(nome: string, texto: string): boolean {
  const tokens = normalizeText(nome).split(/\s+/).filter((t) => t.length >= 3);
  const alvo = normalizeText(texto);
  return tokens.length > 0 && tokens.every((t) => alvo.includes(t));
}

/** Pagadores do banco cuja categoria/subcategoria no mapeamento contém o nome pedido (ex.: 'Pholha (Funcional)'). */
export function resolverPagadoresPorCategoria(nome: string, maps: MapeamentoPessoa[]) {
  return maps.filter((m) => bate(nome, `${m.categoria ?? ''} ${m.subcategoria ?? ''}`));
}

/**
 * Procura movimentos (recebidos e pagos) de uma pessoa em todas as fontes.
 * Quando não acha nada, diz isso explicitamente. Nunca responde "R$ 0".
 */
export async function buscarMovimentosPorPessoa(
  nome: string,
  meses: MesRef[],
  deps: SaidasBeneficiarioDeps = defaultDeps,
): Promise<string> {
  const periodo =
    meses.length === 1
      ? `${p2(meses[0]!.mes)}/${meses[0]!.ano}`
      : `${p2(meses[0]!.mes)}/${meses[0]!.ano} a ${p2(meses.at(-1)!.mes)}/${meses.at(-1)!.ano}`;
  const blocos: string[] = [];
  let maps: MapeamentoPessoa[] = [];
  try {
    maps = await deps.mapeamento();
  } catch {
    /* sem mapeamento: segue só por nome */
  }
  const viaCategoria = resolverPagadoresPorCategoria(nome, maps);
  const pagadores = new Map(viaCategoria.map((m) => [normalizeText(m.pessoa_normalizada), m]));
  if (viaCategoria.length) {
    blocos.push(
      `Mapeamento pessoa→categoria: “${nome}” corresponde a ${viaCategoria
        .map((m) => `${m.pessoa_normalizada} (categoria ${[m.categoria, m.subcategoria].filter(Boolean).join(' / ')})`)
        .join('; ')}.`,
    );
  }
  const indisponiveis: string[] = [];
  const semRegistro: string[] = [];
  for (const k of Object.keys(FONTES_SAIDAS) as FonteKey[]) {
    const achados: Array<LinhaSaida & { ref: string; via?: string }> = [];
    let falhou = false;
    for (const m of meses) {
      try {
        for (const l of await deps[k](m)) {
          if (Math.abs(Number(l.valor)) === 0) continue;
          const porNome = bate(nome, `${l.descricao} ${l.secao ?? ''}`);
          const map = l.pessoaNorm ? pagadores.get(normalizeText(l.pessoaNorm)) : undefined;
          if (porNome || map) {
            achados.push({ ...l, ref: `${p2(m.mes)}/${m.ano}`, via: map && !porNome ? `via categoria ${map.categoria ?? ''}` : undefined });
          }
        }
      } catch {
        falhou = true;
      }
    }
    if (achados.length === 0) {
      (falhou ? indisponiveis : semRegistro).push(FONTES_SAIDAS[k]);
      continue;
    }
    for (const dir of ['entrada', 'saida'] as const) {
      const grupo = achados.filter((a) => (a.direcao ?? 'saida') === dir);
      if (!grupo.length) continue;
      const total = grupo.reduce((s, a) => s + Math.abs(a.valor), 0);
      const rot = dir === 'entrada' ? `RECEBIDO DE “${nome}” (entrada no caixa da Byla)` : `PAGO A “${nome}” (saída do caixa da Byla)`;
      blocos.push(`Fonte: ${FONTES_SAIDAS[k]}. ${rot}: total ${brl(total)} em ${grupo.length} registro(s):`);
      for (const a of grupo.slice(0, 15)) {
        blocos.push(
          `  ${a.data ?? a.ref} · ${a.secao ? `${a.secao} · ` : ''}${a.descricao}${a.via ? ` (${a.via})` : ''}: ${brl(Math.abs(a.valor))}`,
        );
      }
    }
  }
  const out = [`Movimentos de “${nome}” em ${periodo} (recebidos e pagos).`];
  if (!blocos.some((b) => b.startsWith('Fonte:'))) {
    out.push(...blocos);
    out.push(
      `NENHUM REGISTRO ENCONTRADO para “${nome}” nas fontes: ${[...semRegistro, ...indisponiveis].join('; ')}. ` +
        'Não informe valor zero: diga que o dado não foi encontrado.',
    );
  } else {
    out.push(...blocos);
    if (semRegistro.length) out.push(`Sem registro nas fontes: ${semRegistro.join('; ')}.`);
  }
  if (indisponiveis.length) out.push(`Fontes indisponíveis agora: ${indisponiveis.join('; ')}.`);
  out.push('Diga claramente a direção (recebido de / pago a). Totais de fontes diferentes podem ser o mesmo movimento; não os some.');
  return out.join('\n');
}

let fluxoUseCase: GetFluxoCompletoUseCase | null = null;

const defaultDeps: SaidasBeneficiarioDeps = {
  async banco({ mes, ano }) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase não configurado.');
    const inicio = `${ano}-${p2(mes)}-01`;
    const fim = `${ano}-${p2(mes)}-${p2(new Date(ano, mes, 0).getDate())}`;
    const { data, error } = await supabase
      .from('transacoes')
      .select('id, data, pessoa, valor, descricao, tipo')
      .gte('data', inicio)
      .lte('data', fim)
      .limit(8000);
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as TransacaoBase[]).map((r) => ({ ...r, valor: Number(r.valor), data: String(r.data).slice(0, 10) }));
    const of = filtrarTransacoesOficiais(rows);
    const conv = (direcao: Direcao) => (t: TransacaoBase) => ({
      data: t.data,
      descricao: `${t.pessoa ?? ''} ${t.descricao ?? ''}`.trim(),
      valor: Number(t.valor),
      direcao,
      pessoaNorm: t.pessoa ?? '',
    });
    return [...of.entradas.map(conv('entrada')), ...of.saidas.map(conv('saida'))];
  },
  async mapeamento() {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase não configurado.');
    const { data, error } = await supabase
      .from('mapeamento_pessoa_categoria')
      .select('pessoa_normalizada, categoria, subcategoria')
      .eq('ativo', true)
      .limit(5000);
    if (error) throw new Error(error.message);
    return (data ?? []) as MapeamentoPessoa[];
  },
  async controle({ mes, ano }) {
    const r = await loadControleCaixaExisting(mes, ano, 'oficial');
    if (!('data' in r)) {
      if (r.notFound) return [];
      throw new Error(r.error);
    }
    if (!r.data.existe) return [];
    return r.data.blocos
      .filter((b) => b.tipo === 'saida')
      .flatMap((b) => b.linhas.map((l) => ({ descricao: l.label, valor: Number(l.valor ?? 0), secao: b.titulo })));
  },
  async planilha({ mes, ano }) {
    fluxoUseCase ??= new GetFluxoCompletoUseCase(
      new SupabaseFluxoAdapter(new CacheFluxoPlanilhaAdapter(new PlanilhaFluxoAdapter())),
    );
    const f = await fluxoUseCase.execute(mes, ano);
    return achatarBlocosParaMatch(f.combinado.saidasBlocos ?? []).map((l) => ({
      descricao: l.label,
      valor: l.valor,
      secao: l.titulo,
    }));
  },
};
