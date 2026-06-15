# Prompt — Modelagem e desenho técnico: Página Despesas (classificação de saídas)

Use este prompt em **modo Plan** ou em uma sessão dedicada **antes de implementar**. Objetivo: produzir especificação + desenho técnico aprovável; **não escrever código** até o usuário confirmar o desenho com **ok**.

---

## Prompt (copiar e colar)

```
Você é arquiteto de produto + engenheiro full-stack no repositório Byla-Financeiro.

## Objetivo

Projetar a nova **Página Despesas** (`/despesas`) para classificar **saídas** do extrato bancário, com regras permanentes por destinatário e categorias alinhadas ao **Controle de Caixa**.

**Escopo desta entrega:** apenas **saídas** (`transacoes.tipo = 'saida'`).  
**Fora de escopo (fase 2):** classificação de **entradas** — mencionar no roadmap, não implementar.

**Não implementar ainda.** Entregar:
1. Modelo de domínio (entidades, regras, estados)
2. Fluxos de UX (wireframe em texto ou mermaid)
3. Contrato de API (endpoints, payloads, erros)
4. Modelo de dados (tabelas/colunas novas ou reuso)
5. Plano de implementação em fases com arquivos afetados
6. Critérios de aceite testáveis
7. Riscos e decisões em aberto (se houver)

Aguardar **ok** do usuário antes de codificar.

---

## Decisões já confirmadas pelo gestor

1. **Categoria = linha do Controle de Caixa** (ex.: "Salários / Pró-labore", "Repasse Pilates"), não apenas o bloco pai ("Gastos Fixos").
2. **Regra permanente por destinatário:** match pelo **mesmo destinatário** (nome normalizado). Todo pagamento futuro para aquela pessoa herda a categoria salva.
3. **Prioridade na UI:** foco em **pendentes** (sem classificação), mas a tela **deve** permitir ver **já classificados** e **resumo por categoria**.

---

## Ideia de produto (resumo)

- Saídas chegam do extrato (`transacoes` via PagBank/n8n).
- O sistema **agrupa automaticamente** por destinatário (`pessoa` normalizada).
- Destinatários que **se repetem** no mês ou ao longo do tempo são sugestões fortes para criar regra.
- O gestor escolhe uma **categoria** (linha do template de saídas do Controle de Caixa) e **salva para sempre**.
- No mês seguinte, pagamentos ao mesmo destinatário já aparecem **classificados automaticamente**.

Exemplo: todo mês há PIX para funcionários e repasses a parceiros → agrupar "LUCIANA COSTA" → classificar como "Salários / Pró-labore" → abril já vem classificado.

---

## Contexto técnico do repositório (obrigatório consultar)

### Dados existentes

| Recurso | Caminho / nota |
|---------|----------------|
| Transações bancárias | `public.transacoes` — `data`, `pessoa`, `valor`, `descricao`, `tipo`, `id_unico` |
| Normalização de nome | `public.byla_norm_pessoa(text)` em `scripts/supabase-mapeamento-categoria-e-view-export.sql` |
| Mapeamento manual persistente | `public.mapeamento_pessoa_categoria` — `pessoa_normalizada`, `categoria`, `subcategoria`, `aplica_tipo` (`entrada`/`saida`/`todos`), `ativo` |
| View com sugestão | `public.v_transacoes_export` — `categoria_sugerida`, `origem_categoria` (join com mapeamento) |
| Template categorias saída | `backend/src/domain/controleCaixa/template.ts` — blocos `saida_parceiros`, `saida_gastos_fixos`, `saida_aluguel_coworking` e `linhas[].label` |
| Classificação heurística atual | `backend/src/logic/classificacaoSaidaBanco.ts`, rota `GET /api/saidas/painel` em `backend/src/routes/saidasPainel.ts` |
| Página legada (referência, não copiar cegamente) | `frontend/src/pages/DespesasPage.tsx` — fluxo antigo complexo (match planilha) |
| Rota atual | `frontend/src/App.tsx` — `/despesas` redireciona para `/transacoes`; reativar rota própria |
| Menu | `frontend/src/app/navConfig.ts` — adicionar item Despesas em Finanças (admin) |
| Filtro mês | `MonthYearContext` — padrão das outras páginas |

### Categorias de saída do Controle de Caixa (fonte da verdade para o dropdown)

Blocos e linhas em `buildControleCaixaTemplate()`:

- **Total Saídas (Parceiros):** Repasse Pilates, Repasse Dança, Repasse Teatro, Repasse Yoga, Repasse Funcional, Outros repasses
- **Gastos Fixos:** Aluguel, Energia, Água, Internet, Salários / Pró-labore, Impostos e taxas, Sistemas / assinaturas, Marketing, Outros gastos fixos
- **Saídas Aluguel:** Limpeza, Manutenção, Condomínio, Outras saídas aluguel

O desenho deve expor `template_key` + `label` + `bloco_titulo` para persistência estável (não só texto livre).

---

## Requisitos funcionais

### RF1 — Agrupamento automático por destinatário

- Agrupar saídas do mês selecionado por `byla_norm_pessoa(pessoa)`.
- Exibir: nome exibido (última ocorrência ou mais frequente), quantidade de lançamentos, total R$, datas.
- **Score de repetição:** destacar grupos com ≥2 lançamentos no mês OU histórico em meses anteriores (definir janela, ex. últimos 6 meses).
- Não fundir destinatários diferentes por similaridade fuzzy — apenas **mesmo destinatário normalizado**.

### RF2 — Estados de classificação

Por grupo/destinatário:

| Estado | Definição |
|--------|-----------|
| `pendente` | Sem regra ativa em `mapeamento_pessoa_categoria` para `saida`/`todos` |
| `classificado` | Regra ativa existe; todas as transações do destinatário no mês herdam a categoria |
| `parcial` (opcional) | Se houver override pontual — documentar se v1 suporta ou não |

Por transação individual: exibir categoria efetiva + origem (`mapeamento_manual`, `heuristica`, `pendente`).

### RF3 — Ação do gestor: classificar e salvar regra

- Modal ou painel lateral: lista de transações do grupo + dropdown de **linha do Controle de Caixa**.
- Botão **Salvar regra** → upsert em `mapeamento_pessoa_categoria`:
  - `pessoa_normalizada` = `byla_norm_pessoa(pessoa)`
  - `categoria` = label da linha (e/ou `template_key` se modelado)
  - `aplica_tipo` = `saida`
  - `ativo` = true
- Após salvar: transações do mês (e futuras) refletem categoria sem novo clique.
- Permitir **editar** e **desativar** regra (não apagar histórico silenciosamente — definir comportamento).

### RF4 — Abas / seções da página

1. **Pendentes** (default): grupos sem regra; ordenar por repetição e valor total.
2. **Classificados:** grupos com regra; permitir editar categoria.
3. **Por categoria:** cards/tabela espelhando linhas do Controle de Caixa com total do mês + drill-down para transações.

KPIs no topo: total saídas do mês | % classificado | valor pendente | qtd destinatários pendentes.

### RF5 — Integração com visão geral / relatórios

- Documentar como `OverviewPage` / relatórios consumirão totais por categoria (API agregada ou view).
- Alinhar nomenclatura com "Saídas por categoria" já existente no Overview (evitar duas fontes conflitantes).

### RF6 — Permissões

- Rota e APIs: `admin` (mesmo padrão de Transações / Controle de Caixa).
- RLS Supabase: seguir `scripts/supabase-security-hardening.sql` para escrita em mapeamento.

---

## Requisitos não funcionais

- Reutilizar padrões UI: `FilterBar`, `MonthYearPicker`, `KpiCard`, `ErrorPanel`, formatação BRL.
- Performance: paginação ou limite razoável se >500 saídas/mês.
- Idempotência no save de regra (`UNIQUE (pessoa_normalizada, aplica_tipo)`).
- Testes: unitários para normalização + resolução de categoria; pelo menos 1 teste de integração da rota de save.

---

## Entregáveis do desenho técnico

### 1. Diagrama de fluxo (mermaid)

Fluxo: extrato → agrupamento → gestor classifica → mapeamento → próximo mês automático.

### 2. Contrato API proposto (mínimo)

Sugerir endpoints (nomes ajustáveis):

| Método | Rota | Uso |
|--------|------|-----|
| GET | `/api/despesas/resumo?mes=&ano=` | KPIs + totais por categoria |
| GET | `/api/despesas/grupos?mes=&ano=&filtro=pendente\|classificado` | Lista agrupada por destinatário |
| GET | `/api/despesas/grupos/:pessoaNorm/transacoes?mes=&ano=` | Drill-down |
| GET | `/api/despesas/categorias` | Linhas do template Controle de Caixa (saída) |
| PUT | `/api/despesas/mapeamento` | Criar/atualizar regra destinatário → categoria |
| DELETE ou PATCH | `/api/despesas/mapeamento/:id` | Desativar regra |

Documentar relação com `GET /api/saidas/painel` existente: substituir, encapsular ou deprecar.

### 3. Modelo de dados

- Avaliar se `mapeamento_pessoa_categoria.categoria` (texto) basta ou se precisa coluna `template_key` / `bloco_template_key`.
- Avaliar coluna `classificacao_origem` em transação (provavelmente **não** — derivar da view).
- Migração SQL se necessário (arquivo em `scripts/`).

### 4. Wireframes textuais

Descrever layout das 3 abas + modal de classificação + empty states.

### 5. Plano de implementação (ordem)

Exemplo de fases:
- Fase A: SQL + endpoints leitura
- Fase B: endpoints escrita mapeamento + atualizar view se preciso
- Fase C: `DespesasPage` nova (substituir legado)
- Fase D: nav + rota + invalidação React Query
- Fase E: testes + smoke UAT

Listar arquivos prováveis: `backend/src/routes/despesas.ts`, `frontend/src/pages/DespesasPage.tsx`, `frontend/src/services/backendApi.ts`, `frontend/src/app/navConfig.ts`, `frontend/src/App.tsx`.

### 6. Critérios de aceite

- [ ] Gestor abre Despesas março → vê pendentes agrupados por destinatário
- [ ] Classifica "X" como "Salários / Pró-labore" → salva → grupo sai de pendentes
- [ ] Abre abril → pagamento para "X" já aparece classificado sem ação
- [ ] Aba "Por categoria" bate com soma das transações classificadas
- [ ] Dois nomes diferentes no extrato (normalizações diferentes) **não** compartilham regra
- [ ] Build frontend e testes backend passam

### 7. Roadmap fase 2 (só documentar)

Mesma mecânica para **entradas** com blocos `entrada_parceiros`, `entrada_aluguel_coworking` e `aplica_tipo = entrada`.

---

## Restrições

- Não editar `.cursor/plans/*.plan.md` de planos antigos.
- Minimizar escopo: não reintroduzir Conciliação/Divergências.
- Não depender de planilha Google como fonte primária de categoria (Supabase + template Controle de Caixa).
- Commits/deploy só se o usuário pedir explicitamente.

---

## Formato da resposta

Escrever em **português**, linguagem clara para gestor + dev.
Usar tabelas e mermaid onde ajudar.
Terminar com: **"Confirme com ok para iniciar implementação"** e lista de até 3 perguntas apenas se algo crítico ficar ambíguo.
```

---

## Como usar

1. Abrir modo **Plan** no Cursor (ou nova conversa focada em design).
2. Colar o bloco entre ` ``` ` acima (conteúdo do prompt).
3. Revisar o desenho gerado.
4. Responder **ok** na conversa de implementação (sessão separada).

---

## Histórico

| Data | Nota |
|------|------|
| 2026-06-03 | Criado após validação: categoria = linha Controle de Caixa; match = mesmo destinatário; UI prioriza pendentes + abas classificados/categorias |
