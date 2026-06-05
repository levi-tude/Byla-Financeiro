import { normalizePessoa } from './normalizePessoa.js';
import type { CategoriaSaidaLinha } from '../domain/despesas/categoriasSaida.js';
import type { MapeamentoRow } from './despesasMapeamento.js';
import { pickMapeamentoForPessoa } from './despesasMapeamento.js';

export type { CategoriaSaidaLinha };

export type SaidaTransacaoRow = {
  id: string;
  data: string;
  pessoa: string;
  valor: number;
  descricao: string | null;
  categoria_sugerida: string | null;
  origem_categoria: string | null;
};

export type GrupoEstado = 'pendente' | 'classificado';

export type GrupoDestinatario = {
  pessoa_normalizada: string;
  pessoa_exibida: string;
  qtd_mes: number;
  total_mes: number;
  datas: string[];
  score_repeticao: number;
  estado: GrupoEstado;
  categoria_label: string | null;
  template_key: string | null;
  bloco_template_key: string | null;
  bloco_titulo: string | null;
  origem_categoria: string;
  mapeamento_id: string | null;
  regra_desativada: boolean;
};

export type TransacaoClassificada = SaidaTransacaoRow & {
  pessoa_normalizada: string;
  categoria_efetiva: string | null;
  template_key_efetivo: string | null;
  origem_efetiva: string;
  mes_competencia?: number;
  ano_competencia?: number;
  competencia_confirmada?: boolean;
  competencia_origem?: string;
  competencia_sugerida_mes?: number;
  competencia_sugerida_ano?: number;
  competencia_alinha_data?: boolean;
  alerta_duplicata_competencia?: boolean;
};

function mesAnoFromIso(data: string): { mes: number; ano: number } | null {
  const m = String(data).match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return { ano: Number(m[1]), mes: Number(m[2]) };
}

function addMonths(mes: number, ano: number, delta: number): { mes: number; ano: number } {
  let m = mes + delta;
  let y = ano;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { mes: m, ano: y };
}

export function rangeMes(mes: number, ano: number): { inicio: string; fim: string } {
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  return { inicio, fim };
}

export function historicoRange6Meses(mes: number, ano: number): { inicio: string; fim: string } {
  const start = addMonths(mes, ano, -6);
  const { inicio } = rangeMes(start.mes, start.ano);
  const { fim } = rangeMes(mes, ano);
  return { inicio, fim: fim };
}

function pickPessoaExibida(nomes: string[]): string {
  const freq = new Map<string, number>();
  for (const n of nomes) {
    const t = (n ?? '').trim();
    if (!t) continue;
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  let best = nomes[0]?.trim() ?? '';
  let max = 0;
  for (const [nome, c] of freq) {
    if (c > max) {
      max = c;
      best = nome;
    }
  }
  return best || pessoaNormFallback(nomes[0]);
}

function pessoaNormFallback(s: string | undefined): string {
  return (s ?? '').trim() || '—';
}

export function classificarTransacao(
  t: SaidaTransacaoRow,
  mapeamentos: MapeamentoRow[],
  mes: number,
  ano: number,
  catalog: CategoriaSaidaLinha[],
): TransacaoClassificada {
  const pessoa_normalizada = normalizePessoa(t.pessoa);
  const map = pickMapeamentoForPessoa(mapeamentos, pessoa_normalizada, mes, ano, catalog);
  if (map) {
    return {
      ...t,
      pessoa_normalizada,
      categoria_efetiva: map.categoria.label,
      template_key_efetivo: map.categoria.templateKey,
      origem_efetiva: 'mapeamento_manual',
    };
  }
  const origem = (t.origem_categoria ?? '').trim() || 'pendente';
  const cat =
    origem === 'mapeamento_manual'
      ? (t.categoria_sugerida ?? '').trim() || null
      : origem !== 'fallback' && origem !== 'pendente'
        ? (t.categoria_sugerida ?? '').trim() || null
        : null;
  const isHeuristica = cat && cat !== 'A classificar';
  return {
    ...t,
    pessoa_normalizada,
    categoria_efetiva: isHeuristica ? cat : null,
    template_key_efetivo: null,
    origem_efetiva: isHeuristica ? origem : 'pendente',
  };
}

export function buildGrupos(
  transacoes: TransacaoClassificada[],
  mapeamentos: MapeamentoRow[],
  mes: number,
  ano: number,
  historicoNorms: Set<string>,
  catalog: CategoriaSaidaLinha[],
): GrupoDestinatario[] {
  const byNorm = new Map<string, TransacaoClassificada[]>();
  for (const t of transacoes) {
    const list = byNorm.get(t.pessoa_normalizada) ?? [];
    list.push(t);
    byNorm.set(t.pessoa_normalizada, list);
  }

  const grupos: GrupoDestinatario[] = [];
  for (const [pessoa_normalizada, itens] of byNorm) {
    const total_mes = itens.reduce((s, x) => s + Math.abs(Number(x.valor || 0)), 0);
    const datas = [...new Set(itens.map((x) => x.data))].sort();
    const map = pickMapeamentoForPessoa(mapeamentos, pessoa_normalizada, mes, ano, catalog);
    const classificado = map != null;
    const qtd_mes = itens.length;
    let score = 0;
    if (qtd_mes >= 2) score += 2;
    if (historicoNorms.has(pessoa_normalizada)) score += 1;

    grupos.push({
      pessoa_normalizada,
      pessoa_exibida: pickPessoaExibida(itens.map((x) => x.pessoa)),
      qtd_mes,
      total_mes,
      datas,
      score_repeticao: score,
      estado: classificado ? 'classificado' : 'pendente',
      categoria_label: map?.categoria.label ?? null,
      template_key: map?.categoria.templateKey ?? null,
      bloco_template_key: map?.categoria.blocoTemplateKey ?? null,
      bloco_titulo: map?.categoria.blocoTitulo ?? null,
      origem_categoria: classificado ? 'mapeamento_manual' : 'pendente',
      mapeamento_id: map?.row.id ?? null,
      regra_desativada: map?.regraDesativada ?? false,
    });
  }

  grupos.sort((a, b) => {
    if (b.score_repeticao !== a.score_repeticao) return b.score_repeticao - a.score_repeticao;
    if (b.total_mes !== a.total_mes) return b.total_mes - a.total_mes;
    return a.pessoa_exibida.localeCompare(b.pessoa_exibida, 'pt-BR');
  });
  return grupos;
}

export function buildHistoricoNormSet(
  rows: { pessoa: string; data: string }[],
  mes: number,
  ano: number,
): Set<string> {
  const { inicio, fim } = historicoRange6Meses(mes, ano);
  const { inicio: mesInicio, fim: mesFim } = rangeMes(mes, ano);
  const out = new Set<string>();
  for (const r of rows) {
    const d = r.data;
    if (d < inicio || d > fim) continue;
    if (d >= mesInicio && d <= mesFim) continue;
    out.add(normalizePessoa(r.pessoa));
  }
  return out;
}

export function isClassificadoOrigem(origem: string): boolean {
  return origem === 'mapeamento_manual';
}
