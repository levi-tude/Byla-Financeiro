# Prompt — Implementação: Página Despesas (classificação de saídas)

Prompt mestre para **implementar** a Página Despesas após desenho aprovado. Baseado em engenharia de prompt (Role, Context, Instruction, Output constraint, verificação).

**Pré-requisito:** desenho em `docs/PROMPT_DESENHO_PAGINA_DESPESAS.md` + confirmação do gestor (**ok** em 2026-06-03).

---

## Uso

| Item | Valor |
|------|--------|
| **Quem executa** | Agente Cursor / dev no repo `Byla-Financeiro` |
| **Modo** | Agent (implementação) — **não** Plan-only |
| **Quando** | Sessão dedicada; colar o bloco **Prompt para o agente** abaixo |
| **Parar se** | Migração SQL falhar no Supabase remoto sem credencial — documentar e pedir apply manual |

---

## Técnicas de prompt aplicadas

| Técnica | Aplicação neste prompt |
|---------|-------------------------|
| **Role** | Engenheiro full-stack Byla; conhece o repo; não reinventa arquitetura |
| **Context embedding** | Caminhos de arquivo, decisões fechadas, APIs existentes |
| **Instruction tuning** | Fases A→E ordenadas; critérios de done por fase |
| **Output constraining** | Lista de arquivos, testes obrigatórios, o que **não** fazer |
| **Negative prompting** | Sem planilha Google como fonte primária; sem reintroduzir Conciliação |
| **Verification** | Comandos `npm test` / `npm run build` antes de declarar concluído |

---

## Decisões do gestor (fechadas — não reabrir)

1. **Categoria** = linha do Controle de Caixa (`template_key` + `label`), não só o bloco pai.
2. **Regra permanente** por `byla_norm_pessoa(pessoa)`; `aplica_tipo = 'saida'`.
3. **UI:** abas Pendentes (default), Classificados, Por categoria; KPIs no topo.
4. **Pendentes com sugestão:** exibir hint de heurística (somente leitura); gestor confirma no dropdown; **nunca** auto-persistir sugestão.
5. **Desativar regra (Opção A):** `ativo = false` → mês **atual** continua classificado na UI; efeito de “pendente” só em **meses futuros** (derivado da view sem regra ativa).
6. **Fonte de dados:** **somente extrato** (`transacoes` + `v_transacoes_export` + `mapeamento_pessoa_categoria`). Tabela legada `despesas` **não** alimenta UI nova; migrar Overview para nova API.
7. **Escopo:** só saídas. Entradas = fase 2 (não implementar).

---

## Verificação prévia (já feita no desenho)

| Recurso legado | Uso ativo hoje | Ação na implementação |
|----------------|----------------|------------------------|
| `GET /api/despesas`, `GET /api/saidas` | Só `OverviewPage` via `getDespesas()` | Migrar Overview → `GET /api/despesas/resumo` |
| `useDespesas` hook | **Nenhuma página** importa | Remover ou redirecionar para novo hook |
| `categorias-banco` `por_funcionario` | Lê tabela `despesas`; sem tela saída ativa | Remover dependência de `despesas` ou agrupar por `pessoa` do extrato |
| `DespesasPage.tsx` legada | Rota redireciona para `/transacoes` | **Substituir** implementação; não copiar fluxo planilha |

---

## Prompt para o agente (copiar e colar)

````
Você é engenheiro full-stack no repositório Byla-Financeiro. Implemente a Página Despesas conforme desenho aprovado. Trabalhe no código real; não produza só documentação.

---

## ROLE

- Implementador full-stack (Node/Express + React/TypeScript + Supabase).
- Reutiliza padrões existentes: `FilterBar`, `MonthYearPicker`, `KpiCard`/`KpiStrip`, `ErrorPanel`, `MonthYearContext`, `requireRoles(['admin'])`, `filtrarTransacoesOficiais`.
- Escopo mínimo: entrega pedida, sem refatorações paralelas.

---

## CONTEXT

### Produto
- Rota: `/despesas` (admin).
- Classificar **saídas** do extrato agrupadas por destinatário normalizado.
- Salvar regra em `mapeamento_pessoa_categoria` → próximos meses automáticos via `v_transacoes_export`.

### Arquivos obrigatórios (consultar antes de codar)
| Recurso | Caminho |
|---------|---------|
| Template categorias saída | `backend/src/domain/controleCaixa/template.ts` → `buildControleCaixaTemplate()` |
| View + mapeamento SQL | `scripts/supabase-mapeamento-categoria-e-view-export.sql` |
| RLS mapeamento | `scripts/supabase-security-hardening.sql`, `scripts/supabase-auth-rbac-byla.sql` |
| Filtro extrato oficial | `backend/src/services/transacoesFiltro.ts` |
| Heurística (só sugestão) | `backend/src/logic/classificacaoSaidaBanco.ts`, `backend/src/routes/saidasPainel.ts` |
| API router | `backend/src/routes/api.ts` |
| Legado a substituir | `frontend/src/pages/DespesasPage.tsx` |
| Overview (migrar fonte) | `frontend/src/pages/OverviewPage.tsx` |
| Nav + rotas | `frontend/src/app/navConfig.ts`, `frontend/src/App.tsx` |

### Estado atual do repo
- `/despesas` → `Navigate` para `/transacoes`.
- `GET /api/despesas` lê tabela `despesas` (legado).
- `mapeamento_pessoa_categoria` tem `categoria` texto; **falta** `template_key` / `bloco_template_key` (adicionar migração).

---

## INSTRUCTION (executar em ordem)

### Fase A — SQL + domínio backend

1. Criar `scripts/supabase-despesas-mapeamento-template-key.sql`:
   - `ALTER TABLE mapeamento_pessoa_categoria ADD COLUMN template_key text NULL, bloco_template_key text NULL`.
   - Comentários nas colunas.
   - Opcional: view auxiliar `v_saidas_classificadas` (transações saída + campos da export) se simplificar queries.
   - **Não** adicionar `classificacao_origem` em `transacoes`.

2. Criar módulos:
   - `backend/src/domain/despesas/categoriasSaida.ts` — lista linhas `tipo === 'saida'` do template (`templateKey`, `label`, `blocoTemplateKey`, `blocoTitulo`, `ordem`).
   - `backend/src/logic/normalizePessoa.ts` — espelho de `byla_norm_pessoa` (testável).
   - `backend/src/logic/despesasAgrupamento.ts` — agrupa saídas do mês; calcula `score_repeticao` (≥2 no mês + histórico 6 meses); estado `pendente` | `classificado`; **sem** estado `parcial` v1.

3. Regra **desativar (Opção A)** na API de grupos:
   - Se `ativo = false` mas existiam transações classificadas por regra **antes** da desativação no mesmo mês: continuar `classificado` até virar mês novo **OU** definir explicitamente: classificado = existe match efetivo na view para aquele mês (view sem join ativo → pendente só em meses onde não há regra ativa no momento da consulta).
   - Implementação recomendada: estado do grupo = `classificado` iff `origem_categoria === 'mapeamento_manual'` na view para aquele destinatário no mês; desativar remove join ativo → **mês atual já classificado na prática só se a view ainda reflete** — como desativar tira o join, mês atual **vira pendente na view**. Para honrar Opção A do gestor: na listagem de grupos, se regra existe com `ativo=false` **e** houve classificação manual histórica no mês, tratar como `classificado` via flag `regra_desativada_mes_corrente` OU manter snapshot: **mais simples**: ao PATCH desativar, **não** alterar exibição do mês corrente no backend usando cache de categorias já resolvidas no primeiro load do mês — **decisão de implementação preferida**: endpoint grupos usa para o **mês da query** a categoria efetiva da view; para desativados, se `ativo=false` mas `updated_at` está no mesmo mês/ano da competência, ainda retornar última `categoria_label`/`template_key` gravada no registro inativo como "classificado (regra desativada)" na aba Classificados. Documentar no código em 1 comentário.

   **Instrução simplificada para Opção A (obrigatória):**
   - PATCH desativar: `ativo = false`.
   - GET grupos do **mesmo** `mes/ano` da desativação: destinatário permanece em `filtro=classificado` com badge "Regra desativada".
   - GET grupos de **meses posteriores**: destinatário em `pendente`.

4. Aplicar migração no Supabase se MCP/CLI disponível; senão deixar script pronto e seguir com service_role local.

### Fase B — API REST (`backend/src/routes/despesasClassificacao.ts`)

Montar router e registrar em `api.ts` sob prefixo admin (junto a `/transacoes`, `/controle-caixa`).

| Método | Rota | Comportamento |
|--------|------|----------------|
| GET | `/api/despesas/categorias` | Linhas saída do template |
| GET | `/api/despesas/resumo?mes=&ano=` | KPIs + `por_categoria` + bloco `pendente` |
| GET | `/api/despesas/grupos?mes=&ano=&filtro=pendente\|classificado&limit=&offset=` | Lista agrupada |
| GET | `/api/despesas/grupos/:pessoaNorm/transacoes?mes=&ano=` | Drill-down |
| PUT | `/api/despesas/mapeamento` | Upsert regra (`pessoa_normalizada`, `template_key`, `bloco_template_key`, `categoria` = label, `aplica_tipo: 'saida'`, `ativo: true`) |
| PATCH | `/api/despesas/mapeamento/:id` | Desativar ou editar categoria |

**Dados:**
- Ler saídas via `v_transacoes_export` + `filtrarTransacoesOficiais`.
- `pessoaNorm` na URL: URL-encoded; validar com mesmo normalizador.

**Sugestão em pendentes:**
- Chamar `classificarSaidaCompleta` **sem** Google obrigatório: se `GetFluxoCompletoUseCase` pesado, passar `planilhaLinhas: []` e aceitar regras fixas/funcionário; ou carregar planilha como `saidasPainel` faz — **preferência**: reutilizar função com planilha opcional; campo `sugestao_heuristica: { label, confianca, regra } | null` só em `filtro=pendente`.

**Compatibilidade:**
- Manter `GET /api/despesas` legado (tabela `despesas`) sem breaking change OU marcar deprecated em comentário.
- `GET /api/saidas/painel`: não remover; deprecar comentário.

**Validação:** estender `backend/src/validation/apiQuery.ts` (schemas Zod).

**Testes obrigatórios:**
- `backend/src/logic/normalizePessoa.test.ts`
- `backend/src/logic/despesasMapeamento.test.ts` (resolução template_key ↔ label)
- 1 teste integração supertest do PUT mapeamento (mock Supabase ou test double existente no repo)

### Fase C — Frontend página nova

1. **Substituir** `frontend/src/pages/DespesasPage.tsx`:
   - Topbar + `MonthYearPicker` / `FilterBar`.
   - KPI strip: total saídas, % classificado, valor pendente, qtd destinatários pendentes.
   - Tabs: Pendentes | Classificados | Por categoria.
   - Card de grupo: nome, totais, datas, badge repetição, sugestão (se houver).
   - Modal classificar: lista transações + select agrupado por bloco do Controle de Caixa + botão "Salvar regra".
   - Ações em classificados: editar, desativar (confirm dialog).

2. Criar `frontend/src/hooks/useDespesasClassificacao.ts` e tipos em `frontend/src/services/backendApi.ts`.

3. `frontend/src/App.tsx`: rota `/despesas` com `RequireAuth roles={['admin']}` → `DespesasPage`.

4. `frontend/src/app/navConfig.ts`: item "Despesas" em Finanças (após Transações ou Controle de caixa).

5. Estilo: alinhar a `TransacoesPage` / componentes `finance/*`.

### Fase D — Integração Overview + limpeza legado

1. `OverviewPage`: trocar `getDespesas` → `getDespesasResumo` (nova rota); ajustar cards "Saídas por categoria" para estrutura `por_categoria` com `label` / `template_key`.

2. `backend/src/routes/categoriasBanco.ts`: remover leitura de `despesas` em `por_funcionario`; para `tipo=saida`, derivar `por_funcionario` de agrupamento `pessoa` do extrato **ou** omitir array vazio com comentário.

3. Remover uso morto: `frontend/src/hooks/useDespesas.ts` se ficar órfão — ou reexportar do novo hook.

### Fase E — Verificação final

Executar e colar resultado resumido na resposta:
```bash
cd backend && npm test
cd frontend && npm run build
```

Checklist manual (declarar feito/não feito):
- [ ] Março: pendentes agrupados por destinatário
- [ ] Classificar + salvar → sai de pendentes
- [ ] Abril: mesmo destinatário classificado sem ação
- [ ] Aba Por categoria soma = transações classificadas
- [ ] Dois nomes com norm diferente = regras separadas
- [ ] Desativar: mês atual permanece em Classificados; mês seguinte pendente
- [ ] Overview usa extrato (não tabela `despesas`)

---

## OUTPUT CONSTRAINT

- Código TypeScript; mensagens de erro em português onde o repo já usa PT.
- Respostas API JSON; HTTP 400/403/404/409/502 adequados.
- Nenhuma credencial no código.
- **Não** editar `.cursor/plans/*.plan.md`.
- **Não** commit/push/deploy salvo pedido explícito do usuário.
- Ao terminar, resposta em português com:
  1. Resumo do que foi feito (bullets)
  2. Arquivos principais alterados
  3. Resultado dos comandos de teste/build
  4. Script SQL pendente de apply manual (se houver)
  5. Itens deixados para fase 2 (entradas)

---

## ANTI-PADRÕES (não fazer)

- Não usar planilha Google como fonte primária de categoria na UI nova.
- Não reintroduzir fluxo de Conciliação/Divergências na DespesasPage.
- Não fuzzy-merge destinatários diferentes.
- Não auto-salvar `sugestao_heuristica`.
- Não copiar 1400 linhas da DespesasPage legada.
- Não apagar tabela `despesas` do Supabase nesta entrega.

---

## CRITÉRIOS DE ACEITE (Definition of Done)

Todos devem passar:

1. Gestor abre `/despesas` março → vê pendentes agrupados.
2. Classifica destinatário → "Salários / Pró-labore" → grupo sai de pendentes.
3. Abril → mesmo destinatário já classificado.
4. Aba "Por categoria" consistente com soma das classificadas.
5. Normalizações diferentes = regras independentes.
6. Desativar regra: Opção A (mês atual classificado; futuro pendente).
7. Pendentes mostram sugestão quando heurística existir.
8. `npm test` (backend) e `npm run build` (frontend) OK.

---

## ROADMAP FASE 2 (só mencionar na entrega final)

Classificação de **entradas** (`entrada_parceiros`, `entrada_aluguel_coworking`, `aplica_tipo = entrada`). Não implementar agora.
````

---

## Como usar

1. Abrir **nova conversa** em modo **Agent** (implementação).
2. Copiar o bloco entre ` ```` ` acima (seção **Prompt para o agente**).
3. Opcional: anexar `@docs/PROMPT_DESENHO_PAGINA_DESPESAS.md` para contexto extra.
4. O agente implementa fases A→E sem pedir novo **ok** (já concedido).

---

## Relação com outros docs

| Documento | Papel |
|-----------|--------|
| `PROMPT_DESENHO_PAGINA_DESPESAS.md` | Desenho / Plan (já aprovado) |
| **Este arquivo** | Implementação |
| `ENGENHARIA_DE_PROMPT_E_SW_BYLA.md` | Princípios gerais de software |
| `PROMPT_IMPLEMENTAR_BACKEND_PLANILHAS.md` | Referência de estrutura de prompt mestre |

---

## Histórico

| Data | Nota |
|------|------|
| 2026-06-03 | Criado após **ok** do gestor; decisões: sugestão em pendentes, desativar Opção A, só extrato |
| 2026-06-03 | Verificação: tabela `despesas` só ativa em Overview + `categorias-banco`; migrar na Fase D |
| 2026-06-03 | Implementação A–E concluída no repo (ver commit local / sessão agente) |
