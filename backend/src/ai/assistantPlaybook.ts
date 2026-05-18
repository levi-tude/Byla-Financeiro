import type { AssistantIntent } from './intentCatalog.js';

type Action = { type: 'navigate'; label: string; to: string };

const FLUXO_ACTION: Action = { type: 'navigate', label: 'Abrir Fluxo de Caixa', to: '/fluxo-caixa' };

const quickReplies = [
  'Lançar entrada',
  'Lançar saída',
  'Resumo por pagamento',
  'Pendências e cobranças',
  'Saldo não bateu',
];

type PlaybookResult = {
  message: string;
  actions: Action[];
  needsConfirmation: boolean;
  quickReplies: string[];
};

export function buildAssistantPlaybookResponse(intent: AssistantIntent): PlaybookResult {
  switch (intent) {
    case 'fluxo_lancar_entrada':
      return {
        message:
          'Para lançar uma entrada:\n1. Abra o Fluxo de Caixa.\n2. Clique em Nova Entrada.\n3. Preencha valor, categoria e descrição.\n4. Salve e confira o total do dia.\nPosso abrir o Fluxo para você agora, se confirmar.',
        actions: [FLUXO_ACTION],
        needsConfirmation: true,
        quickReplies,
      };
    case 'fluxo_lancar_saida':
      return {
        message:
          'Para lançar uma saída:\n1. Abra o Fluxo de Caixa.\n2. Clique em Nova Saída.\n3. Preencha valor, categoria e motivo.\n4. Salve e valide o saldo.\nPosso abrir o Fluxo para você agora, se confirmar.',
        actions: [FLUXO_ACTION],
        needsConfirmation: true,
        quickReplies,
      };
    case 'fluxo_editar_lancamento':
      return {
        message:
          'Para corrigir um lançamento:\n1. Filtre pelo período.\n2. Localize o item.\n3. Edite os campos necessários.\n4. Salve e confira o total atualizado.\nSe quiser, eu abro o Fluxo para você mediante confirmação.',
        actions: [FLUXO_ACTION],
        needsConfirmation: true,
        quickReplies,
      };
    case 'fluxo_excluir_lancamento':
      return {
        message:
          'Posso te guiar para excluir esse lançamento.\nConfirme antes, porque essa ação altera o saldo e o histórico do período.',
        actions: [FLUXO_ACTION],
        needsConfirmation: true,
        quickReplies,
      };
    case 'fluxo_conferir_total_dia':
      return {
        message:
          'Para conferir o total de hoje:\n1. Selecione a data do dia.\n2. Revise entradas e saídas.\n3. Valide se o saldo final bate com os lançamentos.\nPosso abrir o Fluxo para você agora, se confirmar.',
        actions: [FLUXO_ACTION],
        needsConfirmation: true,
        quickReplies,
      };
    case 'fluxo_conferir_total_mes':
      return {
        message:
          'Para conferir o total mensal:\n1. Confirme a competência no topo.\n2. Revise totais de entradas e saídas.\n3. Confira o saldo consolidado.\nPosso abrir o Fluxo para você agora, se confirmar.',
        actions: [FLUXO_ACTION],
        needsConfirmation: true,
        quickReplies,
      };
    case 'fluxo_fechamento_mes':
      return {
        message:
          'Checklist de fechamento do mês:\n1. Conferir lançamentos pendentes.\n2. Validar categorias críticas.\n3. Revisar edições e exclusões.\n4. Confirmar saldo final.\nSe quiser, eu abro o Fluxo para você agora com confirmação.',
        actions: [FLUXO_ACTION],
        needsConfirmation: true,
        quickReplies,
      };
    case 'fluxo_filtrar_periodo':
      return {
        message:
          'Use o filtro de período para buscar dia, semana ou mês.\nDepois valide os lançamentos encontrados antes de fechar o caixa.\nPosso abrir o Fluxo para você agora, se confirmar.',
        actions: [FLUXO_ACTION],
        needsConfirmation: true,
        quickReplies,
      };
    case 'fluxo_resumo_pagamento':
      return {
        message:
          'Para ver pagamentos por forma (Pix, cartão, dinheiro etc.):\n1. Abra o Fluxo de Caixa.\n2. Vá na aba Resumo por meio de pagamento.\n3. Ajuste o mês ou o período no calendário.\n4. Confira pagador e aluno em cada linha.\nPosso abrir o Fluxo para você agora, se confirmar.',
        actions: [FLUXO_ACTION],
        needsConfirmation: true,
        quickReplies,
      };
    case 'fluxo_pendencias_cobrancas':
      return {
        message:
          'Na aba Pendências e cobranças você separa correção interna de contato de cobrança:\n1. Pendências internas: corrigir cadastro/lançamento.\n2. Cobranças: quem contatar hoje, amanhã ou vencido.\n3. Use os botões Resolver pendência e Cobrar agora em cada card.\nPosso abrir o Fluxo para você agora, se confirmar.',
        actions: [FLUXO_ACTION],
        needsConfirmation: true,
        quickReplies,
      };
    case 'fluxo_cobranca_acao':
      return {
        message:
          'Para cobrar agora com segurança:\n1. Abra Pendências e cobranças no Fluxo.\n2. Localize o aluno no bloco Cobranças.\n3. Clique em Cobrar agora e registre o retorno.\n4. Se houver dado faltando, use Resolver pendência antes.\nPosso abrir o Fluxo para você agora, se confirmar.',
        actions: [FLUXO_ACTION],
        needsConfirmation: true,
        quickReplies,
      };
    case 'fluxo_categoria_lancamento':
      return {
        message:
          'Para escolher a categoria correta:\n1. Defina se é entrada ou saída.\n2. Use a mesma categoria para lançamentos parecidos.\n3. Evite criar variações desnecessárias.\nPosso abrir o Fluxo para você agora, se confirmar.',
        actions: [FLUXO_ACTION],
        needsConfirmation: true,
        quickReplies,
      };
    case 'fluxo_erro_saldo':
      return {
        message:
          'Quando o saldo não bate:\n1. Revise os últimos lançamentos.\n2. Confira o período selecionado.\n3. Valide categorias.\n4. Verifique se houve edição ou exclusão recente.\nPosso abrir o Fluxo para você agora, se confirmar.',
        actions: [FLUXO_ACTION],
        needsConfirmation: true,
        quickReplies,
      };
    case 'abrir_fluxo_caixa':
      return {
        message: 'Posso te encaminhar para o Fluxo de Caixa agora. Confirma?',
        actions: [FLUXO_ACTION],
        needsConfirmation: true,
        quickReplies,
      };
    case 'fallback_duvida_operacional':
    default:
      return {
        message:
          'Posso te ajudar em Fluxo de Caixa e Pendências/Cobranças.\n1. Lançar entrada ou saída.\n2. Conferir saldo do dia/mês.\n3. Ver resumo por forma de pagamento.\n4. Tratar pendências e cobranças.\nMe diga qual dessas quatro você quer agora.',
        actions: [],
        needsConfirmation: false,
        quickReplies: ['Lançar entrada', 'Lançar saída', 'Pendências e cobranças', 'Resumo por pagamento', 'Abrir Fluxo de Caixa'],
      };
  }
}
