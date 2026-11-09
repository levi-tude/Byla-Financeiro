import type { CriacaoSpec } from './types';

/**
 * Fixture de DEMONSTRAÇÃO — valores 100% FICTÍCIOS (não são dados do Espaço Byla).
 * Permite ver o painel sem Gemini/backend. Modalidades com nomes genéricos.
 */
export const DEMO_BALANCO_4_MESES: CriacaoSpec = {
  versao: 1,
  titulo: 'Balanço dos últimos 4 meses',
  subtitulo: 'Demonstração com dados fictícios · jun–set/2026',
  origem: 'demo',
  geradoEm: '2026-10-30T15:00:00.000Z',
  avisos: ['Dados fictícios de demonstração.'],
  datasets: [
    {
      id: 'balanco_4m',
      titulo: 'Balanço dos últimos 4 meses',
      fonte: 'Demo (fictício) — no real: extrato bancário oficial',
      colunas: [
        { key: 'mes', label: 'Mês', formato: 'mes' },
        { key: 'entradas', label: 'Entradas', formato: 'brl' },
        { key: 'saidas', label: 'Saídas', formato: 'brl' },
        { key: 'saldo', label: 'Saldo', formato: 'brl' },
      ],
      linhas: [
        { mes: '2026-06', entradas: 42150.0, saidas: 35820.4, saldo: 6329.6 },
        { mes: '2026-07', entradas: 38900.5, saidas: 36410.0, saldo: 2490.5 },
        { mes: '2026-08', entradas: 46780.25, saidas: 37990.75, saldo: 8789.5 },
        { mes: '2026-09', entradas: 51230.9, saidas: 39105.3, saldo: 12125.6 },
      ],
    },
    {
      id: 'modalidades_2026_09',
      titulo: 'Entradas por modalidade — 09/2026',
      fonte: 'Demo (fictício)',
      colunas: [
        { key: 'modalidade', label: 'Modalidade', formato: 'texto' },
        { key: 'total', label: 'Total', formato: 'brl' },
        { key: 'qtd', label: 'Lançamentos', formato: 'numero' },
      ],
      linhas: [
        { modalidade: 'Dança', total: 18420.0, qtd: 92 },
        { modalidade: 'Pilates', total: 12350.5, qtd: 48 },
        { modalidade: 'Yoga', total: 8640.0, qtd: 41 },
        { modalidade: 'Teatro', total: 5210.4, qtd: 22 },
        { modalidade: 'G.R.', total: 3980.0, qtd: 19 },
        { modalidade: 'Aluguel de salas', total: 2630.0, qtd: 7 },
      ],
    },
    {
      id: 'meios_2026_09',
      titulo: 'Meios de pagamento — 09/2026',
      fonte: 'Demo (fictício)',
      colunas: [
        { key: 'meio', label: 'Meio', formato: 'texto' },
        { key: 'entradas', label: 'Entradas', formato: 'brl' },
        { key: 'saidas', label: 'Saídas', formato: 'brl' },
        { key: 'qtd', label: 'Lançamentos', formato: 'numero' },
      ],
      linhas: [
        { meio: 'PIX', entradas: 29870.4, saidas: 31200.0, qtd: 164 },
        { meio: 'Crédito recorrente', entradas: 10240.0, saidas: 0, qtd: 31 },
        { meio: 'Crédito', entradas: 6120.5, saidas: 0, qtd: 22 },
        { meio: 'Débito', entradas: 5000.0, saidas: 7905.3, qtd: 26 },
      ],
    },
  ],
  secoes: [
    {
      type: 'kpi_cards',
      titulo: 'Resumo do período',
      itens: [
        { label: 'Entradas', dataset: 'balanco_4m', coluna: 'entradas', valor: 179061.65, formato: 'brl' },
        { label: 'Saídas', dataset: 'balanco_4m', coluna: 'saidas', valor: 149326.45, formato: 'brl' },
        { label: 'Saldo', dataset: 'balanco_4m', coluna: 'saldo', valor: 29735.2, formato: 'brl' },
        { label: 'Saldo de set', dataset: 'balanco_4m', coluna: 'saldo', valor: 12125.6, formato: 'brl' },
      ],
    },
    { type: 'bar_chart', titulo: 'Entradas × saídas por mês', descricao: 'Clique na legenda para isolar uma série.', dataset: 'balanco_4m', x: 'mes', series: ['entradas', 'saidas'] },
    { type: 'area_chart', titulo: 'Evolução do saldo', dataset: 'balanco_4m', x: 'mes', series: ['saldo'] },
    { type: 'comparison', titulo: 'Junho × setembro', dataset: 'balanco_4m', x: 'mes', a: 0, b: 3, colunas: ['entradas', 'saidas', 'saldo'] },
    { type: 'donut', titulo: 'Entradas por modalidade (set)', dataset: 'modalidades_2026_09', label: 'modalidade', valor: 'total' },
    { type: 'ranking', titulo: 'Meios de pagamento (set)', dataset: 'meios_2026_09', label: 'meio', valor: 'entradas' },
    { type: 'table', titulo: 'Tabela mês a mês', dataset: 'balanco_4m' },
    {
      type: 'narrative',
      titulo: 'Leitura',
      texto:
        'O saldo ficou positivo nos quatro meses, com recuperação forte depois de julho. Setembro teve as maiores entradas do período, puxadas por Dança e Pilates, e o PIX segue como o principal meio de pagamento.',
    },
  ],
};
