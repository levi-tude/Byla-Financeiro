export type AssistantIntent =
  | 'fluxo_lancar_entrada'
  | 'fluxo_lancar_saida'
  | 'fluxo_editar_lancamento'
  | 'fluxo_excluir_lancamento'
  | 'fluxo_conferir_total_dia'
  | 'fluxo_conferir_total_mes'
  | 'fluxo_fechamento_mes'
  | 'fluxo_filtrar_periodo'
  | 'fluxo_resumo_pagamento'
  | 'fluxo_pendencias_cobrancas'
  | 'fluxo_cobranca_acao'
  | 'fluxo_categoria_lancamento'
  | 'fluxo_erro_saldo'
  | 'abrir_fluxo_caixa'
  | 'fallback_duvida_operacional';

type IntentRule = {
  intent: AssistantIntent;
  keywords: string[];
};

const rules: IntentRule[] = [
  { intent: 'fluxo_lancar_entrada', keywords: ['entrada', 'recebimento', 'receber', 'caiu pagamento', 'dar baixa recebido'] },
  { intent: 'fluxo_lancar_saida', keywords: ['saida', 'saída', 'despesa', 'pagar', 'boleto', 'conta', 'tirar do caixa'] },
  { intent: 'fluxo_editar_lancamento', keywords: ['editar', 'corrigir', 'ajustar', 'alterar', 'valor errado'] },
  { intent: 'fluxo_excluir_lancamento', keywords: ['excluir', 'apagar', 'remover', 'deletar'] },
  { intent: 'fluxo_conferir_total_dia', keywords: ['hoje', 'dia', 'fechou hoje', 'total hoje', 'conferir hoje', 'saldo de hoje', 'receita de hoje'] },
  { intent: 'fluxo_conferir_total_mes', keywords: ['mes', 'mês', 'total do mes', 'fechamento do mes', 'consolidado', 'total mensal', 'saldo do mês'] },
  { intent: 'fluxo_fechamento_mes', keywords: ['fechar mes', 'encerrar mes', 'virar mes', 'finalizar periodo'] },
  {
    intent: 'fluxo_filtrar_periodo',
    keywords: ['filtrar', 'periodo', 'período', 'semana', 'ontem', 'intervalo', 'calendario', 'calendário', 'data'],
  },
  {
    intent: 'fluxo_resumo_pagamento',
    keywords: [
      'resumo por',
      'resumo pagamento',
      'meio de pagamento',
      'por forma',
      'totais por pix',
      'agrupar pagamento',
      'pagamentos por tipo',
    ],
  },
  {
    intent: 'fluxo_pendencias_cobrancas',
    keywords: [
      'pendencia',
      'pendência',
      'pendencias',
      'pendências',
      'cobranca',
      'cobrança',
      'quem cobrar',
      'quem contatar',
      'vencido',
      'vence hoje',
      'vence amanha',
      'vence amanhã',
    ],
  },
  {
    intent: 'fluxo_cobranca_acao',
    keywords: ['cobrar agora', 'abrir cobranca', 'abrir cobrança', 'registrar pagamento', 'lancar pagamento', 'lançar pagamento'],
  },
  {
    intent: 'fluxo_categoria_lancamento',
    keywords: ['categoria', 'classificar', 'tipo de gasto', 'modalidade', 'qual rubrica'],
  },
  {
    intent: 'fluxo_erro_saldo',
    keywords: [
      'saldo nao bate',
      'saldo não bate',
      'diferenca',
      'diferença',
      'nao fechou',
      'não fechou',
      'valor não bate',
      'errado o total',
    ],
  },
  {
    intent: 'abrir_fluxo_caixa',
    keywords: [
      'abrir fluxo',
      'ir fluxo',
      'fluxo de caixa',
      'tela do fluxo',
      'ir para o fluxo',
      'mostrar fluxo',
      'acessar fluxo',
    ],
  },
];

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[~`^]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyIntent(message: string): { intent: AssistantIntent; confidence: number } {
  const text = normalize(message);
  if (!text) return { intent: 'fallback_duvida_operacional', confidence: 0.35 };

  if ((text.includes('pendenc') || text.includes('cobranc')) && (text.includes('fluxo') || text.includes('caixa'))) {
    return { intent: 'fluxo_pendencias_cobrancas', confidence: 0.72 };
  }

  if (text.includes('entrada') && text.includes('saida')) {
    return { intent: 'fluxo_filtrar_periodo', confidence: 0.6 };
  }

  const scored = rules
    .map((rule) => {
      const hits = rule.keywords.filter((kw) => text.includes(normalize(kw))).length;
      return { intent: rule.intent, score: hits / Math.max(1, rule.keywords.length / 3) };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score <= 0) {
    return { intent: 'fallback_duvida_operacional', confidence: 0.4 };
  }
  const confidence = Math.min(0.95, 0.55 + best.score * 0.2);
  return { intent: best.intent, confidence };
}
