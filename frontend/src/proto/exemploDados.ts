/**
 * PROTÓTIPO "chat único" — DADOS DE EXEMPLO, 100% FICTÍCIOS.
 * Nada aqui vem do banco nem de IA. Respostas do chat são roteadas por palavras-chave (determinístico).
 */
import type { CriacaoSpec, Dataset, Secao } from '../criacoes/types';

export const DADOS_ATE = '29/10';
export const SELO_EXEMPLO = 'EXEMPLO · dados fictícios';

export const MESES_EX = [
  { mes: '2026-04', entradas: 39820.0, saidas: 34110.2 },
  { mes: '2026-05', entradas: 41260.4, saidas: 35740.0 },
  { mes: '2026-06', entradas: 42150.0, saidas: 35820.4 },
  { mes: '2026-07', entradas: 38900.5, saidas: 36410.0 },
  { mes: '2026-08', entradas: 46780.25, saidas: 37990.75 },
  { mes: '2026-09', entradas: 51230.9, saidas: 39105.3 },
].map((m) => ({ ...m, saldo: Math.round((m.entradas - m.saidas) * 100) / 100 }));

export const MODALIDADES_EX = [
  { modalidade: 'Dança', total: 18420.0 },
  { modalidade: 'Pilates', total: 12350.5 },
  { modalidade: 'Yoga', total: 8640.0 },
  { modalidade: 'Teatro', total: 5210.4 },
  { modalidade: 'G.R.', total: 3980.0 },
  { modalidade: 'Aluguel de salas', total: 2630.0 },
];
export const PILATES_MESES = [9820, 10340, 10910, 10120, 11480, 12350.5];

export type Metrica = 'entradas' | 'saidas' | 'saldo';
export const ROTULO: Record<Metrica, string> = { entradas: 'Entradas', saidas: 'Saídas', saldo: 'Saldo' };

export type Visao = {
  id: string;
  titulo: string;
  meses: 3 | 4 | 6;
  metricas: Metrica[];
  comparar: [number, number] | null; // índices em MESES_EX
  foco?: 'pilates';
};

const FONTE = 'EXEMPLO fictício (no real: extrato bancário oficial)';

export function datasetsVisao(v: Visao): Dataset[] {
  const linhas = MESES_EX.slice(-v.meses);
  return [
    {
      id: 'balanco',
      titulo: 'Balanço mensal',
      fonte: FONTE,
      colunas: [
        { key: 'mes', label: 'Mês', formato: 'mes' },
        { key: 'entradas', label: 'Entradas', formato: 'brl' },
        { key: 'saidas', label: 'Saídas', formato: 'brl' },
        { key: 'saldo', label: 'Saldo', formato: 'brl' },
      ],
      linhas,
    },
    {
      id: 'comparar',
      titulo: 'Comparação',
      fonte: FONTE,
      colunas: [
        { key: 'mes', label: 'Mês', formato: 'mes' },
        { key: 'entradas', label: 'Entradas', formato: 'brl' },
        { key: 'saidas', label: 'Saídas', formato: 'brl' },
        { key: 'saldo', label: 'Saldo', formato: 'brl' },
      ],
      linhas: v.comparar ? [MESES_EX[v.comparar[0]]!, MESES_EX[v.comparar[1]]!] : [],
    },
    {
      id: 'modalidades',
      titulo: 'Entradas por modalidade (set)',
      fonte: FONTE,
      colunas: [
        { key: 'modalidade', label: 'Modalidade', formato: 'texto' },
        { key: 'total', label: 'Total', formato: 'brl' },
      ],
      linhas: MODALIDADES_EX,
    },
    {
      id: 'pilates',
      titulo: 'Pilates por mês',
      fonte: FONTE,
      colunas: [
        { key: 'mes', label: 'Mês', formato: 'mes' },
        { key: 'pilates', label: 'Pilates', formato: 'brl' },
      ],
      linhas: MESES_EX.map((m, i) => ({ mes: m.mes, pilates: PILATES_MESES[i]! })).slice(-v.meses),
    },
  ];
}

export function specDaVisao(v: Visao): CriacaoSpec {
  const ds = datasetsVisao(v);
  const linhas = ds[0]!.linhas;
  const soma = (k: Metrica) => Math.round(linhas.reduce((a, l) => a + Number(l[k]), 0) * 100) / 100;
  const secoes: Secao[] = [];
  if (v.foco === 'pilates') {
    const p = ds[3]!.linhas;
    secoes.push({
      type: 'kpi_cards',
      titulo: 'Pilates',
      itens: [
        { label: 'Pilates em set', dataset: 'pilates', coluna: 'pilates', valor: Number(p[p.length - 1]!.pilates), formato: 'brl' },
        { label: `Pilates (${v.meses} meses)`, dataset: 'pilates', coluna: 'pilates', valor: p.reduce((a, l) => a + Number(l.pilates), 0), formato: 'brl' },
      ],
    });
    secoes.push({ type: 'area_chart', titulo: 'Pilates mês a mês', dataset: 'pilates', x: 'mes', series: ['pilates'] });
    secoes.push({ type: 'donut', titulo: 'Participação por modalidade (set)', dataset: 'modalidades', label: 'modalidade', valor: 'total' });
    secoes.push({ type: 'ranking', titulo: 'Ranking de modalidades (set)', dataset: 'modalidades', label: 'modalidade', valor: 'total' });
  } else {
    secoes.push({
      type: 'kpi_cards',
      titulo: 'Resumo do período',
      itens: v.metricas.map((m) => ({ label: ROTULO[m], dataset: 'balanco', coluna: m, valor: soma(m), formato: 'brl' as const })),
    });
    const barras = v.metricas.filter((m) => m !== 'saldo');
    if (barras.length) secoes.push({ type: 'bar_chart', titulo: 'Mês a mês', dataset: 'balanco', x: 'mes', series: barras });
    if (v.metricas.includes('saldo')) secoes.push({ type: 'area_chart', titulo: 'Evolução do saldo', dataset: 'balanco', x: 'mes', series: ['saldo'] });
    if (v.comparar) secoes.push({ type: 'comparison', titulo: 'Comparação entre meses', dataset: 'comparar', x: 'mes', a: 0, b: 1, colunas: v.metricas });
    secoes.push({ type: 'table', titulo: 'Tabela', dataset: 'balanco', colunas: ['mes', ...v.metricas] });
  }
  return {
    versao: 1,
    titulo: v.titulo,
    subtitulo: `${SELO_EXEMPLO} · dados até ${DADOS_ATE}`,
    origem: 'demo',
    geradoEm: '2026-10-30T12:00:00.000Z',
    datasets: ds,
    secoes,
    avisos: [],
  };
}

/** Resposta mock do chat (sem IA): texto curto + cartão compacto. */
export type RespostaMock = {
  texto: string;
  cartao: {
    titulo: string;
    tipo: 'kpi' | 'mini_area' | 'mini_barras';
    valor: number;
    rotulo: string;
    delta?: number;
    serie: number[];
    serie2?: number[];
    eixo: string[];
    visao: Visao;
  };
};

const MES_CURTO = ['abr', 'mai', 'jun', 'jul', 'ago', 'set'];

export function responderMock(pergunta: string): RespostaMock | null {
  const q = pergunta.toLowerCase();
  if (/pilates/.test(q)) {
    return {
      texto: 'Em setembro entraram R$ 12.350,50 de Pilates (exemplo), o maior valor dos últimos 6 meses.',
      cartao: {
        titulo: 'Pilates · setembro',
        tipo: 'kpi',
        valor: 12350.5,
        rotulo: 'Entradas de Pilates',
        delta: ((12350.5 - 11480) / 11480) * 100,
        serie: PILATES_MESES,
        eixo: MES_CURTO,
        visao: { id: 'pilates', titulo: 'Pilates — evolução', meses: 6, metricas: ['entradas'], comparar: null, foco: 'pilates' },
      },
    };
  }
  if (/compar|agosto|setembro|ago|set/.test(q)) {
    const a = MESES_EX[4]!;
    const b = MESES_EX[5]!;
    return {
      texto: 'Setembro superou agosto: as entradas subiram cerca de 10% e o saldo ficou maior (exemplo).',
      cartao: {
        titulo: 'Agosto × setembro',
        tipo: 'mini_barras',
        valor: b.saldo,
        rotulo: 'Saldo de setembro',
        delta: ((b.saldo - a.saldo) / Math.abs(a.saldo)) * 100,
        serie: [a.entradas, b.entradas],
        serie2: [a.saidas, b.saidas],
        eixo: ['ago', 'set'],
        visao: { id: 'ago-set', titulo: 'Agosto × setembro', meses: 3, metricas: ['entradas', 'saidas', 'saldo'], comparar: [4, 5] },
      },
    };
  }
  if (/balan|saldo|meses|resumo|como (foi|está)/.test(q)) {
    const ult = MESES_EX.slice(-4);
    const saldo = ult.reduce((s, m) => s + m.saldo, 0);
    return {
      texto: 'Nos últimos 4 meses o saldo ficou positivo em todos eles e somou R$ 29.735,20 (exemplo). Setembro foi o melhor mês.',
      cartao: {
        titulo: 'Balanço · jun–set',
        tipo: 'mini_area',
        valor: Math.round(saldo * 100) / 100,
        rotulo: 'Saldo acumulado',
        serie: ult.map((m) => m.saldo),
        eixo: MES_CURTO.slice(-4),
        visao: { id: 'balanco-4m', titulo: 'Balanço dos últimos 4 meses', meses: 4, metricas: ['entradas', 'saidas', 'saldo'], comparar: [2, 5] },
      },
    };
  }
  return null;
}

export const SUGESTOES_CHAT = ['Como foi o balanço dos últimos 4 meses?', 'Quanto entrou de Pilates em setembro?', 'Compare agosto com setembro'];
