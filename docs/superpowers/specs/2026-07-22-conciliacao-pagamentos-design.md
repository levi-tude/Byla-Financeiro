# Conciliação mensal de pagamentos (em dia / atrasado / pendente)

**Data:** 22 de julho de 2026  
**Status:** desenho aprovado; plano em docs/superpowers/plans/2026-07-22-conciliacao-pagamentos.md  
**Menu:** Operação (não Finanças)

## 1. Objetivo

Dar uma visão mensal clara de **quem pagou em dia**, **quem pagou atrasado** e **quem ainda não pagou**, cruzando:

- vencimento do **cadastro no Fluxo operacional**;
- crédito no **extrato/transações**, usando o **mesmo matching/vínculo** já usado na validação de pagamentos e entradas.

A secretaria usa a tela para cobrança. O admin usa a mesma tela com detalhe bancário.

## 2. Decisões aprovadas

| Tema | Decisão |
|------|----------|
| Fonte | Cruzar Fluxo + extrato (não só o Fluxo) |
| Em dia | Data do crédito no extrato, no mês de referência, **≤** dia de vencimento do cadastro |
| Atrasado | Há crédito vinculado no mês, mas a data é **depois** do dia de vencimento |
| Pendente | Não há crédito vinculado no extrato para aquele aluno/mês |
| Matching | Reutilizar lógica existente de validação / mapeamento / vínculos (não inventar matcher novo no v1) |
| Status da secretaria | **Mesma regra** do admin; só não mostra dados de banco |
| Acesso | Admin e secretaria |
| Onde fica | Menu **Operação**, rota `/conciliacao` (hoje redireciona para `/fluxo-caixa`) |
| Mês | Mesmo seletor de mês/ano do painel (Topbar) |
| Visual | Mesmo design system das outras telas (Topbar, cards KPI, abas/filtros, tipografia Byla) |

## 3. Fora do v1

- Folga de dias após o vencimento (ex.: +2 dias ainda “em dia”).
- Criar ou editar vínculo aluno ↔ extrato **dentro** desta tela (continua em Validação / Entradas).
- Conciliação de despesas, aluguel ou parceiros (só mensalidades / alunos do Fluxo).
- Alterar regras do extrato ou da importação Pluggy/Sheets.
- Blur/OCR de portfólio (outra frente).

## 4. Comportamento

### 4.1 Universo de alunos

Para o mês/ano selecionado, considerar alunos **ativos** do Fluxo operacional (todas as modalidades elegíveis), com o dia de vencimento vindo do cadastro (`venc` / `venc_exibicao`).

Casos especiais (tratar de forma explícita na UI, sem inventar status falso):

- **Sem dia de vencimento** no cadastro → status auxiliar `sem_vencimento` (ou agrupamento “Cadastro incompleto”), **não** misturar com pendente/atrasado/em dia.
- **Bolsa / isento** (se o sistema já marcar plano bolsa) → fora da cobrança ou grupo à parte; não contar como pendente de pagamento.

### 4.2 Classificação

Para cada aluno no mês:

1. Resolver vínculo/crédito no extrato com a lógica já existente.
2. Se não houver crédito → `pendente`.
3. Se houver crédito com data `D` e vencimento dia `V` no mês:
   - `D.dia <= V` → `em_dia`
   - `D.dia > V` → `atrasado`

A data usada é a do **crédito no extrato** (visão caixa), não a data de lançamento manual no Fluxo.

### 4.3 API (orientação)

Endpoint dedicado, por exemplo:

`GET /api/conciliacao-pagamentos?mes=&ano=`

Resposta agregada:

- totais: `em_dia`, `atrasado`, `pendente`, `sem_vencimento` (e bolsa se houver);
- lista de itens com aluno, modalidade/aba, dia de vencimento, status;
- campos de extrato (**somente se** `role === admin`): data crédito, valor, pessoa/PIX, id da transação / vínculo.

Secretaria recebe o mesmo JSON **sem** campos bancários (filtro no backend, não só no frontend).

Autorização: `admin` e `secretaria`.

### 4.4 Interface

- Entrada no menu **Operação**, perto de Fluxo de caixa / Aluguel de salas.
- Título claro (ex.: “Conciliação de pagamentos”).
- Três KPIs clicáveis: Em dia | Atrasado | Pendente.
- Filtros: status, modalidade/aba; busca por nome.
- Lista/tabela no padrão do painel.
- Admin: colunas extras do extrato + link útil para Validação/Entradas quando faltar vínculo.
- Secretaria: colunas só operacionais (aluno, modalidade, vencimento, status).
- Faixa de ajuda curta explicando a regra em uma frase.

### 4.5 RBAC na navegação

- Item visível para admin e secretaria em Operação.
- Remover o `Navigate` atual de `/conciliacao` → `/fluxo-caixa` e montar a página real.

## 5. Relação com telas existentes

| Tela | Papel |
|------|--------|
| Fluxo de caixa | Cadastro, vencimento, lançamentos operacionais |
| Validação (dia a dia) / Entradas | Criar e confirmar vínculos aluno ↔ extrato |
| **Conciliação (nova)** | Só ler e classificar o mês: em dia / atrasado / pendente |

Não substitui o Fluxo nem a Validação.

## 6. Critérios de aceite (v1)

1. Com mês selecionado, admin vê KPIs e lista coerentes com extrato + vencimento.
2. Secretaria vê os mesmos status, **sem** valor/PIX/descrição bancária na rede (payload).
3. Aluno com crédito até o dia do vencimento → Em dia.
4. Aluno com crédito após o dia do vencimento → Atrasado.
5. Aluno sem crédito vinculado → Pendente.
6. Sem vencimento no cadastro → não classificado como os três status principais.
7. Layout alinhado ao design system atual; rota em Operação.
8. Matching reutiliza código/serviço existente (sem matcher paralelo no v1).

## 7. Riscos e notas

- Qualidade depende dos vínculos já feitos na Validação/Entradas; alunos sem vínculo aparecem como pendente mesmo que o PIX exista “solto” no extrato.
- Regra “aba do controle = mês+1” **não** se aplica aqui; esta tela usa o mês de referência do Topbar sobre Fluxo + extrato.
- Nomes e matching já têm normalização no sistema; edge cases de homônimos continuam tratados como hoje na validação.

## 8. Próximo passo

Após Levi revisar e confirmar este arquivo, gerar o plano de implementação em `docs/superpowers/plans/` (tarefas pequenas, TDD onde couber) e só então codar.
