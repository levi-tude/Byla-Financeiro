# Consulta Byla (chatbot de consulta) — Design

**Data:** 2026-07-31  
**Status:** aprovado (modelagem)

## Problema

O Assistente do Byla atual só orienta “como usar a tela”. A gestão precisa de um chatbot no estilo operacional (inspirado em bot Telegram de consulta) que responda com **dados reais** do sistema, com **mensagens pré-planejadas**.

## Decisões

| Decisão | Escolha |
|---------|---------|
| Modo | Só consulta (leitura) |
| Quem usa | Só Admin/gestão |
| Entrada | Mesmo botão flutuante do assistente atual |
| Assistente antigo | Removido para todo mundo (Secretária sem botão) |
| Motor | Híbrido: menu → tool fixa; texto livre → IA escolhe tool/params e formata; números só das APIs |
| Canal | App primeiro; Telegram fora do MVP (mesmo motor depois) |

## Arquitetura

```text
Admin → Botão/Painel Consulta Byla
     → POST /ai/consulta/chat
     → Roteador de intenção
        ├─ menu/atalho → tool determinística
        └─ texto livre → LLM escolhe tool + params
     → Tools de leitura (serviços já existentes)
     → Fatos (números/listas)
     → Resposta em PT para gestão
```

**Regra de ouro:** a IA nunca inventa saldo, aluno ou status. Se não houver tool adequada, recusar e sugerir o menu.

## Menu MVP (mensagens prontas)

### Resumos
- Resumo do mês (competência do contexto)
- Resumo da semana
- Resumo do dia
- Resumo por período (início/fim)
- Entradas por modalidade / parceiros
- Controle oficial vs sistema (totais / divergência)
- Resumo por categoria do extrato
- Resumo por meio de pagamento (e entrada × saída)

### Operação
- Pendentes de conciliação (visão Admin)
- Pagamentos do Fluxo no dia
- Movimentos do banco no dia
- Validação: sem vínculo (hoje ou mês)

### Busca
- Situação do aluno… (pede nome se faltar)
- Lançamento de R$ … ? (valor + dia/mês)

## Tools MVP (leitura)

- `resumo_mes`, `resumo_semana`, `resumo_dia`, `resumo_periodo`
- `resumo_modalidades`, `controle_oficial_vs_sistema`
- `resumo_categoria_extrato`, `resumo_meio_pagamento`
- `pendentes_conciliacao`, `pagamentos_fluxo_dia`, `movimentos_banco_dia`, `sem_vinculo_validacao`
- `busca_aluno`, `busca_por_valor`

Fontes: reutilizar a mesma lógica das telas Admin — sem fonte paralela de verdade.

## UX

- Competência/mês do contexto da tela; se faltar, uma pergunta objetiva
- Listas grandes: top N + “refine”
- Falha de dado: mensagem honesta, sem número parcial inventado
- Copy para gestão (não jargão de planilha)
- Link opcional “ver na tela X” sem auto-navegar no MVP

## Segurança

- Gate Admin no frontend e backend
- Tools sem mutação
- Dados reais só no app autenticado
- Log leve: usuário, tool, competência

## Critérios de pronto

1. Admin abre botão → menu com atalhos acima
2. Clique no menu → números alinhados à tela equivalente
3. Texto livre aluno/valor → tool certa ou 1 esclarecimento
4. Fora do catálogo → recusa + menu
5. Secretária sem botão
6. Nenhuma escrita via chat

## Fora do MVP

Telegram; drill fino de linha do Controle; crédito recorrente/Vendas detalhado; relatórios IA longos; perfil Secretária.
