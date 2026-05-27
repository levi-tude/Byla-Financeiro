# Relatório UAT — Teste com Gestão (Samuel)

**Data:** 26/05/2026  
**Mês de referência:** Abril/2026  
**Dispositivo:** Computador (notebook/desktop)  
**Duração estimada:** ~90 min  
**Facilitador:** Levi  
**Respondente:** Samuel (Gestão/Admin)

---

## 1. Resumo executivo

| Métrica | Resultado |
|---------|-----------|
| **NPS (recomendação 0–10)** | **7** (zona neutra — bom mas com ressalvas) |
| **Usaria Visão Geral semanalmente?** | Não usaria (usaria mais no fechamento de mês) |
| **Pronto para a equipe usar?** | "Sim, mas só depois dos ajustes que citei" |
| **Média de notas (escala 1–5)** | **4.1** (13 perguntas) |
| **Tarefas completadas** | 8/20 testadas no roteiro |

### Veredicto da gestão

> O painel tem valor, mas a **forma como entrega os dados está desorganizada**. Foco deve ser no **benchmark** e na **clareza de visualização**.  
> Módulos aprovados para uso imediato: **Visão Geral** e **Transações/Extrato**.  
> Módulos que precisam de ajuste: **Controle de Caixa**, **Fluxo**, **Relatórios/IA**.  
> Módulos reprovados por agora: **Validação de Pagamentos**, **Conciliação/Divergências**.

---

## 2. Notas por área (escala 1–5)

| # | Área | Nota | Interpretação |
|---|------|------|---------------|
| Q5 | Visão geral | **5** | Excelente |
| Q6 | Fechamento do mês | **5** | Excelente |
| Q7 | Conferência extrato | **5** | Excelente |
| Q8 | Mensalidades por atividade (gráfico) | **5** | Excelente |
| Q9 | Transações (extrato banco) | **4** | Bom, mas com atrito |
| Q10 | Controle de caixa | **3** | Mediano — difícil visualizar |
| Q11 | Validação de pagamentos | **1** | Crítico — confuso, não entendeu propósito |
| Q12 | Fluxo de caixa (alunos) | **5** | Excelente |
| Q13 | Divergências | **5** | Excelente |
| Q14 | Calendário financeiro | **5** | Excelente |
| Q15 | Conciliação | **5** | Excelente |
| Q16 | Relatórios com IA | **3** | Mediano |
| Q17 | Performance/ranking | **3** | Mediano |

### Destaques

- **Nota 1 (crítica):** Validação de pagamentos → usuário não entendeu para que serve
- **Nota 3 (medianas):** Controle de caixa, Relatórios IA, Performance → visualização ou propósito confusos

---

## 3. Confiança nos números

| Pergunta | Resposta |
|----------|----------|
| Entendeu que mensalidades vêm do Fluxo? | **Sim, entendi** |
| Confia nos números para decidir? | **Sim, confio** |
| Diferencia Fechamento × Extrato × Fluxo (1–5) | **5** |
| O que mais confundiu? | "A parte de visualização dos dados e o formato como a interface entrega todos os dados, talvez não estejam de forma mais organizada e a ideia é focar no benchmark." |

---

## 4. Aprovação por módulo

| Módulo | Decisão | Status |
|--------|---------|--------|
| Visão geral | **Usar já** | ✅ Liberado |
| Transações e extrato | **Usar já** | ✅ Liberado |
| Controle de caixa (fechamento) | **Ajustar antes** | ⚠️ Ajustar |
| Validação de pagamentos | **Não usar ainda** | ❌ Bloqueado |
| Fluxo de caixa (operação) | **Ajustar antes** | ⚠️ Ajustar |
| Relatórios IA e performance | **Ajustar antes** | ⚠️ Ajustar |
| Conciliação e divergências | **Não usar ainda** | ❌ Bloqueado |

---

## 5. O que é obrigatório corrigir (palavras da gestão)

> "Controle de caixa, e aba mensal detalhado/filtros"

---

## 6. Feedback verbal detalhado (sessão pós-formulário)

### 6.1 Fluxo multi-mês — falta ordenação e filtros rápidos

**Problema:** A lista de alunos no Fluxo multi-mês não permite ordenar por nome (A→Z / Z→A) nem filtrar rapidamente por condições (pagos, pendentes, aba específica).

**Impacto:** Gestão não consegue encontrar pessoas rapidamente nem fazer análise comparativa.

**Solução proposta:**
- Cabeçalho clicável para ordenação crescente/decrescente por nome
- Filtros rápidos: status (pago/pendente/parcial), aba, busca por nome
- Botão "limpar filtros"

---

### 6.2 Aba mensal — rolagem horizontal impede visão geral

**Problema:** As colunas na lista mensal de alunos obrigam a rolar horizontalmente. O campo "Status" (ativo/inativo) está no meio das colunas em vez de ficar no final. As informações principais do aluno ficam fora da tela.

**Impacto:** Gestão perde tempo rolando e não vê rapidamente quem está ativo/pendente.

**Solução proposta:**
- Reorganizar colunas: informações principais (nome, aba, valor, pagamento) à esquerda
- Mover "Status ativo/inativo" para a **última coluna** (menos importante no dia a dia)
- Considerar layout responsivo ou colunas colapsáveis

---

### 6.3 Validação de pagamentos × Calendário financeiro — propósitos confusos

**Problema:** O usuário não entendeu a diferença entre Validação de Pagamentos e Calendário Financeiro. As duas telas parecem tratar do mesmo assunto sem se conectar.

**Impacto:** Nota 1 na Validação — pior nota do teste. Módulo **reprovado**.

**Solução proposta:**
- Unificar ou criar ponte clara entre as duas telas
- Microcopy explicando o propósito no topo de cada tela
- Validação: "Confira se os pagamentos de hoje/semana conferem com o banco"
- Calendário: "Veja quem tem vencimento próximo e planeje cobranças"
- Considerar fundir em uma única view com abas "Hoje" / "Mês" / "Próximos"

---

### 6.4 Categorização de saídas — inexistente

**Problema:** Não há forma de categorizar despesas/saídas no sistema (aluguel, material, funcionários, etc.).

**Impacto:** Gestão não consegue analisar para onde vai o dinheiro.

**Solução proposta:**
- Campo "categoria" nas saídas (selectable: Aluguel, Funcionários, Material, Marketing, Operacional, Outros)
- Resumo visual por categoria na Visão Geral ou em Transações
- Possível integração com tabela `despesas` que já existe no Supabase

---

### 6.5 Transações — card "Resumo por dia" sem detalhamento ao clicar

**Problema:** Na página de Transações, o card com entradas e saídas por dia mostra totais e quantidade, mas não permite ver **quais** transações compõem aquele dia.

**Impacto:** Gestão precisa rolar até a tabela de transações e buscar mentalmente o dia.

**Solução proposta:**
- Hover ou clique na linha do dia → expandir/popover mostrando as transações daquele dia
- Ou: clicar no dia filtra a tabela abaixo automaticamente

---

## 7. Visão da gestão sobre cada módulo (uso real)

| Módulo | Como a gestão usaria |
|--------|---------------------|
| Visão geral | **Análise de fechamento** no início e final do mês — não semanalmente |
| Transações | Conferir extrato quando precisar checar um valor específico |
| Controle de caixa | Principal ferramenta de fechamento — mas precisa ser mais visual |
| Fluxo | Secretária usa no dia a dia; gestão consulta para verificar operação |

---

## 8. Prioridades de implementação (baseado no teste)

### P0 — Impede uso (bloqueador)

| # | Item | Módulo afetado |
|---|------|----------------|
| P0-1 | Validação de pagamentos: redefinir propósito ou fundir com Calendário | Validação |
| P0-2 | Aba mensal do Fluxo: reorganizar colunas (nome e pagamento à frente, status no final) | Fluxo |

### P1 — Confusão forte (precisa ajustar antes de liberar)

| # | Item | Módulo afetado |
|---|------|----------------|
| P1-1 | Fluxo multi-mês: ordenação A→Z / Z→A no cabeçalho | Fluxo |
| P1-2 | Fluxo multi-mês: filtros rápidos (status, aba, busca) | Fluxo |
| P1-3 | Controle de caixa: reduzir rolagem horizontal / melhorar layout | Controle de caixa |
| P1-4 | Calendário × Validação: microcopy explicando propósito | Calendário/Validação |
| P1-5 | Transações: clique/hover no resumo por dia → detalhamento | Transações |

### P2 — Melhoria (pode vir depois)

| # | Item | Módulo afetado |
|---|------|----------------|
| P2-1 | Categorização de saídas (aluguel, funcionários, material…) | Transações/Saídas |
| P2-2 | Relatórios IA: tornar mais visual/resumido | Relatórios |
| P2-3 | Performance/ranking: benchmark mais claro | Performance |

---

## 9. Próximos passos recomendados

```
Fase 1 (esta semana):
  → P0-1: Redesenhar/fundir Validação + Calendário
  → P0-2: Reorganizar colunas da lista mensal do Fluxo
  → P1-5: Clique/hover no resumo por dia em Transações

Fase 2 (próxima semana):
  → P1-1 + P1-2: Ordenação e filtros no Fluxo multi-mês
  → P1-3: Layout do Controle de caixa
  → P1-4: Microcopy nos módulos confusos

Fase 3 (quando equipe já estiver usando):
  → P2-1: Categorias de saídas
  → P2-2 + P2-3: Relatórios e benchmark
```

---

## 10. Dados brutos do formulário

```json
{
  "respondente": "Samuel",
  "data": "26/05/2026",
  "mes_teste": "abril/2026",
  "dispositivo": "Computador (notebook/desktop)",
  "notas_1a5": {
    "visao_geral": 5,
    "fechamento": 5,
    "conferencia_extrato": 5,
    "mensalidades_atividade": 5,
    "transacoes": 4,
    "controle_caixa": 3,
    "validacao_pagamentos": 1,
    "fluxo_caixa": 5,
    "divergencias": 5,
    "calendario": 5,
    "conciliacao": 5,
    "relatorios_ia": 3,
    "performance": 3
  },
  "nps": 7,
  "usaria_visao_geral": "Não usaria",
  "o_que_ajudou": "a parte de visão geral seria mais algo mais para analisar o fechamento de mês, isso é o mais importante, de usar e analisar no começo e final do mês.",
  "obrigatorio_corrigir": "controle de caixa, e aba mensal detalhado/filtros",
  "aprovacao_modulos": {
    "visao_geral": "Usar já",
    "transacoes_extrato": "Usar já",
    "controle_caixa": "Ajustar antes",
    "validacao_pagamentos": "Não usar ainda",
    "fluxo_operacao": "Ajustar antes",
    "relatorios_ia_performance": "Ajustar antes",
    "conciliacao_divergencias": "Não usar ainda"
  },
  "pronto_para_equipe": "Sim, mas só depois dos ajustes que citei",
  "o_que_confundiu": "o que mais confundiu foi a parte de visualização dos dados e o formato como a interface entrega todos os dados, talvez não estejam de forma mais organizada e a ideia é focar no benchmark."
}
```

---

## 11. Feedback da secretária (verbal — não preencheu formulário)

A secretária **não completou o formulário** no canvas. Feedback verbal incorporado nos itens 6.1 e 6.2 (filtros/ordenação e layout da lista mensal) que afetam diretamente o fluxo de trabalho dela.

**Recomendação:** Agendar sessão rápida (~20 min) com a secretária para preencher o formulário ou coletar notas verbais com o facilitador.

---

*Relatório gerado em 26/05/2026. Fonte: canvas `teste-usuario-byla.canvas.data.json` + feedback verbal pós-sessão.*
