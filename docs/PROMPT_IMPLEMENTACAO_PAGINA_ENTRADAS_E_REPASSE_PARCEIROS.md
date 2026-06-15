# Prompt — Implementação: Página Entradas + Repasse automático (Parceiros)

Prompt mestre para **implementar** a classificação de **entradas** (mensalidades por aba do fluxo) e o **cálculo automático** de **Saídas Parceiros** no Controle de Caixa. Baseado no desenho aprovado na conversa de 2026-06-03.

**Pré-requisito:** Página Despesas já implementada (`docs/PROMPT_IMPLEMENTACAO_PAGINA_DESPESAS.md`). Este prompt **estende** o mesmo padrão para entradas e repasses.

---

## Uso

| Item | Valor |
|------|--------|
| **Quem executa** | Agente Cursor / dev no repo `Byla-Financeiro` |
| **Modo** | Agent (implementação) — **não** Plan-only |
| **Quando** | Sessão dedicada; colar o bloco **Prompt para o agente** abaixo |
| **Parar se** | Migração SQL falhar no Supabase remoto — documentar e pedir apply manual |

---

## Decisões do gestor (fechadas — não reabrir)

### Controle de Caixa — estrutura real

| Tipo | Blocos |
|------|--------|
| **Entradas** | (1) **Entradas Parceiros** — mensalidades por parceiro/aba; (2) **Entradas Aluguel / Coworking** — salas, coworking, locações (ex. Pholha/Funcional **não** é parceiro) |
| **Saídas** | (1) **Total Saídas (Parceiros)** — repasses; (2) **Gastos Fixos** (saídas fixas). **Não existe** bloco “Saídas Aluguel” no Controle operacional do gestor — **não** criar nem exigir esse bloco no template padrão nem na UI principal |

### Linhas Entradas / Saídas Parceiros (parceiros)

| Entrada (label) | Saída (repasse) | Fórmula (`E` = entrada do mês na linha) |
|-----------------|-----------------|----------------------------------------|
| Dança | Repasse Dança | `0,60 × E` |
| Yoga | Repasse Yoga | `(E + 480) / 2` |
| Pilates Mari | Repasse Pilates Mari | `0,55 × (E + 460)` |
| Teatro | Repasse Teatro | `0,50 × E` |
| Teatro Infantil | Repasse Teatro Infantil | `0,50 × E` |
| Bruna GR | Repasse Bruna GR | `0,50 × E` |

- R$ **480** (Yoga) e R$ **460** (Pilates Mari): **fixos todo mês**.
- **Funcional** não entra em parceiros; é atividade em **Entradas Aluguel / Coworking** (subcategoria Coworking).

### Página Entradas

1. **Categoria de classificação** = linha de **Entradas Parceiros** do Controle do mês (`template_key` + `label`), alinhada à **aba do fluxo** (Dança, Yoga, Pilates Mari, Teatro, Teatro Infantil, Bruna GR). **Modalidade** = detalhe na UI (drill-down), não linha separada no Controle salvo custom do gestor.
2. **Regra permanente** em `mapeamento_pessoa_categoria` com `aplica_tipo = 'entrada'` (ou `'todos'` se já existir regra Coworking — preferir `'entrada'` para mensalidades).
3. **UI:** abas Pendentes (default), Classificados, Por categoria; KPIs no topo — **mesmo padrão** que `DespesasPage`.
4. **Sugestões:** somente leitura; **nunca** auto-persistir. Stack: mapeamento ativo → `v_transacoes_export` / `aluno_planos` → validação planilha×banco (`conciliacaoPagamentoMatch`) → fluxo operacional → mapa aba→linha Controle.
5. **Desativar regra (Opção A):** igual Despesas — mês da desativação permanece em Classificados; meses futuros → pendente.
6. **Fonte do total em Entradas Parceiros no Controle:** **soma do extrato classificado** no mês (não valor digitado manualmente como fonte primária).
7. **Repasse no banco (PIX ao parceiro):** **Opção A** — repasse aparece **só** como valor **calculado** em Saídas Parceiros no Controle; **não** exigir classificação extra na Despesas para “criar” o repasse. Conciliação PIX real vs previsto = **fase 2** (opcional).

### Agrupamento na UI (entradas)

- **Híbrido:** se sugestão forte com aluno + modalidade + aba → card “Aluno · Modalidade” + PIX; senão → card por `pessoa` do extrato (pagador).
- **Regra permanente:** gravar por `pessoa_normalizada` do extrato (pagador PIX); opcional `subcategoria` = `"aba · modalidade"` ou `modalidade` para desambiguar.

---

## Verificação prévia (repo)

| Recurso | Caminho | Nota |
|---------|---------|------|
| Despesas (espelhar) | `backend/src/routes/despesasClassificacao.ts`, `backend/src/domain/despesas/*`, `frontend/src/pages/DespesasPage.tsx` | Reutilizar padrões |
| Template Controle (desatualizado) | `backend/src/domain/controleCaixa/template.ts`, `frontend/src/pages/ControleCaixaPage.tsx` `createDefaultDraft()` | Ainda tem Funcional em parceiros e bloco Saídas Aluguel — **alinhar** ao gestor |
| View export | `scripts/supabase-mapeamento-categoria-e-view-export.sql` → `v_transacoes_export` | Join `aluno_planos` em entradas |
| Match pagamentos | `backend/src/logic/conciliacaoPagamentoMatch.ts`, `backend/src/services/fluxoValidacaoPlanilhaItens.ts` | Sugestão |
| Cadastro alunos | `fluxo_alunos_operacionais` via `SupabaseAlunosAdapter` | `aba`, `modalidade`, `pagador_pix`, `responsaveis` |
| Controle read/write | `backend/src/services/controleCaixaRead.ts`, `backend/src/routes/controleCaixa.ts` | Sincronizar valores |
| Página legada entradas | `frontend/src/pages/EntradasPage.tsx` (se existir) | Substituir ou redirecionar |
| Índice Pilates/Teatro | `backend/src/logic/pagadorControleIndice.ts` | Atualizar para linhas separadas Teatro / Teatro Infantil / Pilates Mari |

---

## Prompt para o agente (copiar e colar)

````
Você é engenheiro full-stack no repositório Byla-Financeiro. Implemente a Página Entradas (classificação de entradas de mensalidade) e o motor de repasse automático em Saídas Parceiros do Controle de Caixa. Trabalhe no código real; não produza só documentação.

---

## ROLE

- Implementador full-stack (Node/Express + React/TypeScript + Supabase).
- Reutiliza o que já existe em Despesas (`despesasClassificacao`, `DespesasPage`, `categoriasSaida` / `readControleCaixa`).
- Escopo mínimo: entrega pedida; sem refatorações paralelas.

---

## CONTEXT

### Produto

- Nova rota admin: **`/entradas`** (ou substituir `EntradasPage` legada se já houver rota).
- Classificar **entradas** oficiais do extrato (`tipo = entrada`, `filtrarTransacoesOficiais`).
- Categorias do dropdown = linhas do bloco **`entrada_parceiros`** do Controle de Caixa **do mês** (inclui custom), lidas via `readControleCaixa(mes, ano)` — **não** só `buildControleCaixaTemplate()` fixo.
- Ao classificar/sincronizar o mês: totais de **Entradas Parceiros** = soma das transações classificadas por `template_key`; **Saídas Parceiros** = fórmulas por parceiro (somente leitura na UI do Controle).

### Mapa aba fluxo → linha Controle (sugestão heurística)

Implementar em `backend/src/domain/entradas/abaControleMap.ts` (ou similar):

| Normalização aba/modalidade (fluxo) | `template_key` alvo (preferencial) | Label esperado |
|-------------------------------------|-----------------------------------|----------------|
| BYLA DANÇA, DANÇA | `ent_parc_danca` | Dança |
| YOGA | `ent_parc_yoga` | Yoga |
| PILATES, PILATES MARI, MARINA | `ent_parc_pilates_mari` | Pilates Mari |
| TEATRO (não infantil) | `ent_parc_teatro` | Teatro |
| TEATRO INFANTIL | `ent_parc_teatro_infantil` | Teatro Infantil |
| GR, BRUNA GR | `ent_parc_bruna_gr` | Bruna GR |

Resolver linha pelo **catálogo do mês** (match label ou template_key); se só label existir sem key, usar `linha:{uuid}` como em Despesas.

### Motor de repasse (`backend/src/domain/entradas/repasseParceiros.ts`)

```ts
// Tipos de regra (enum interno)
type RegraRepasse =
  | { tipo: 'percentual'; pct: number }           // Dança, Teatro, Teatro Infantil, Bruna GR
  | { tipo: 'percentual_base_ajustada'; pct: number; ajusteFixo: number }  // Pilates Mari
  | { tipo: 'metade_base_ajustada'; ajusteFixo: number };  // Yoga: (E + ajuste) / 2
```

Mapeamento estável `ent_parc_*` → `sai_parc_*` (mesmo índice ou tabela explícita no módulo).

Função: `calcularRepasse(templateKeyEntrada: string, valorEntrada: number): number` — arredondar 2 casas (`Math.round(n*100)/100`).

Função: `aplicarRepassesAoControle(blocos, valoresEntradaPorTemplateKey): void` — preenche `valor` nas linhas `saida_parceiros` correspondentes; marcar metadado opcional `valorTexto` ou campo derivado na API: `origem_valor: 'calculado_repasse'`.

**Não** recalcular Gastos Fixos nesta entrega.

### Template Controle — atualizar padrão

Em `backend/src/domain/controleCaixa/template.ts` e `frontend/src/pages/ControleCaixaPage.tsx` (`createDefaultDraft`):

**Entradas Parceiros** (ordem sugerida):
- Dança (`ent_parc_danca`)
- Yoga (`ent_parc_yoga`)
- Pilates Mari (`ent_parc_pilates_mari`)
- Teatro (`ent_parc_teatro`)
- Teatro Infantil (`ent_parc_teatro_infantil`)
- Bruna GR (`ent_parc_bruna_gr`)

**Saídas Parceiros** (pares):
- Repasse Dança, Repasse Yoga, Repasse Pilates Mari, Repasse Teatro, Repasse Teatro Infantil, Repasse Bruna GR

**Remover** do template padrão de parceiros: Funcional, Outros parceiros genéricos (gestor pode adicionar custom no mês se precisar).

**Remover** bloco padrão **`saida_aluguel_coworking` / “Saídas Aluguel”** do draft e do template backend — o gestor **não** usa. Manter **Entradas Aluguel / Coworking** intacto.

**Migração de períodos existentes:** script opcional `scripts/supabase-controle-caixa-parceiros-linhas.sql` que **não** apaga dados; só documentar que meses já salvos no Supabase mantêm linhas antigas até o gestor editar o Controle. Novos períodos usam template novo.

### Controle de Caixa UI

- Linhas em **Saídas Parceiros** com repasse calculado: **readonly** (input disabled) + tooltip com fórmula (`entrada R$ X + 480 → /2 = …`).
- Botão opcional **“Recalcular repasses do mês”** (admin) que: (1) agrega extrato classificado → entradas parceiros; (2) aplica fórmulas → saídas parceiros; (3) persiste via API controle-caixa existente.
- Entradas Parceiros: valor pode ser **readonly** quando `origem = extrato_classificado` ou exibir badge “Sincronizado do extrato”; permitir override manual só com confirmação explícita (v1: readonly se implementação simples).

---

## INSTRUCTION (executar em ordem)

### Fase A — Domínio + template Controle

1. Criar `backend/src/domain/entradas/repasseParceiros.ts` com fórmulas e testes unitários (`repasseParceiros.test.ts`) — casos:
   - Dança: E=1000 → 600
   - Yoga: E=2000 → 1240
   - Pilates Mari: E=3000 → 1903
   - Teatro / Infantil / GR: E=800 → 400

2. Criar `backend/src/domain/entradas/categoriasEntrada.ts` — espelho de `categoriasSaida.ts` para bloco `entrada_parceiros` via `readControleCaixa`.

3. Criar `backend/src/domain/entradas/abaControleMap.ts` + testes.

4. Atualizar `buildControleCaixaTemplate()` e `createDefaultDraft()` conforme seção Template acima.

5. Ajustar `pagadorControleIndice.ts` / testes: Teatro Infantil → linha própria; Pilates Mari → linha Pilates Mari (não unificar Teatro se gestor separou linhas).

### Fase B — API classificação entradas

Criar `backend/src/routes/entradasClassificacao.ts` e registrar em `api.ts` (admin).

| Método | Rota | Comportamento |
|--------|------|----------------|
| GET | `/api/entradas/categorias?mes=&ano=` | Linhas `entrada_parceiros` do Controle do mês |
| GET | `/api/entradas/resumo?mes=&ano=` | KPIs + `por_categoria` + por bloco |
| GET | `/api/entradas/grupos?mes=&ano=&filtro=pendente\|classificado` | Grupos híbridos |
| GET | `/api/entradas/grupos/:grupoKey/transacoes?mes=&ano=` | Drill-down |
| PUT | `/api/entradas/mapeamento` | Upsert `aplica_tipo: 'entrada'`, `template_key`, `bloco_template_key`, `categoria` = label |
| PATCH | `/api/entradas/mapeamento/:id` | Desativar / editar (Opção A) |

**Serviços:** `entradasAgrupamento.ts`, `entradasClassificacaoService.ts` — reutilizar `normalizePessoa`, padrão de `despesasClassificacao`.

**Sugestões em pendentes:** carregar `fluxo_alunos_operacionais` + itens validação do mês; expor `sugestao: { aba, modalidade, aluno_nome, template_key?, label?, origem, confianca }`.

**Dados:** `v_transacoes_export` + `filtrarTransacoesOficiais` + `tipo === 'entrada'`.

**Validação PUT:** `template_key` deve existir no catálogo do mês (mesmo padrão Despesas).

**Testes:** `entradasMapeamento.test.ts`, `abaControleMap.test.ts`, estender se necessário `normalizePessoa.test.ts`.

### Fase C — Sincronização Controle (entradas + repasses)

1. Criar `backend/src/services/controleCaixaSincronizarEntradas.ts`:
   - Input: `mes`, `ano`
   - Agrega transações **classificadas** (mapeamento ativo + origem na view) por `template_key` em Entradas Parceiros
   - Escreve `valor` nas linhas de entrada correspondentes
   - Chama `aplicarRepassesAoControle` → preenche Saídas Parceiros
   - Persiste via lógica existente de `persistControleCaixa` / read-merge-write

2. Expor POST admin: `/api/controle-caixa/sincronizar-entradas?mes=&ano=` (ou nome equivalente) — idempotente.

3. Hook opcional: após PUT mapeamento em entradas, disparar sync **assíncrono** do mês (ou botão manual apenas em v1 — **preferência gestor:** recalcular ao salvar classificação **e** botão explícito no Controle).

### Fase D — Frontend

1. Nova **`frontend/src/pages/EntradasPage.tsx`** (substituir legado):
   - Mesma estrutura que `DespesasPage`: KPIs, abas Pendentes | Classificados | Por categoria, modal classificar, badge repetição, sugestão read-only com aluno/modalidade/aba.

2. `frontend/src/hooks/useEntradasClassificacao.ts` + tipos em `backendApi.ts`.

3. `App.tsx` + `navConfig.ts`: rota `/entradas` admin, item “Entradas” em Finanças.

4. **`ControleCaixaPage.tsx`:** readonly repasses; botão sincronizar; remover bloco Saídas Aluguel do default draft; alinhar linhas parceiros.

5. **`OverviewPage`:** se houver card entradas por categoria legado, apontar para `GET /api/entradas/resumo` (opcional nesta fase se já existir equivalente).

### Fase E — Integração e limpeza

1. Documentar em comentário no router: `GET /api/categorias-banco?tipo=entrada` permanece; nova página usa `/api/entradas/*`.

2. **Não** classificar repasses parceiros na Despesas como fluxo obrigatório.

3. Seeds SQL: revisar `mapeamento_pessoa_categoria` — Coworking/Funcional com `aplica_tipo = 'entrada'` em bloco aluguel, não parceiros.

### Fase F — Verificação

```bash
cd backend && npm test
cd frontend && npm run build
```

Checklist manual:
- [ ] Março: pendentes de entrada agrupados com sugestão de aba quando cadastro/validação existir
- [ ] Classificar pagador → linha “Dança” → sai de pendentes
- [ ] Abril: mesma regra → classificado automático
- [ ] Sincronizar Controle: Entradas Parceiros Dança = soma extrato classificado
- [ ] Repasse Dança = 60% da entrada; Yoga com +480; Pilates Mari com +460
- [ ] Saídas Parceiros readonly no Controle
- [ ] Template novo sem Funcional em parceiros e sem bloco Saídas Aluguel
- [ ] Desativar regra: Opção A (mês atual classificado; futuro pendente)
- [ ] `npm test` e `npm run build` OK

---

## OUTPUT CONSTRAINT

- TypeScript; erros em português onde o repo já usa PT.
- JSON nas APIs; HTTP 400/403/404/409/502.
- Sem credenciais no código.
- **Não** editar `.cursor/plans/*.plan.md`.
- **Não** commit/push/deploy salvo pedido explícito.
- Resposta final em português: resumo, arquivos, testes/build, SQL pendente, fase 2 (conciliação PIX repasse vs banco).

---

## ANTI-PADRÕES (não fazer)

- Não usar planilha Google como fonte primária de totais de parceiros.
- Não colocar Funcional em Entradas/Saídas Parceiros no template padrão.
- Não exigir bloco “Saídas Aluguel” no Controle.
- Não auto-salvar sugestões de classificação.
- Não unificar Teatro + Teatro Infantil em uma linha se o Controle do gestor tem duas linhas (cada uma com 50% do **seu** E).
- Não fuzzy-merge pagadores diferentes.
- Não duplicar 1400 linhas de páginas legadas.
- Não implementar conciliação obrigatória PIX repasse ↔ extrato saída (fase 2).

---

## CRITÉRIOS DE ACEITE (Definition of Done)

1. Gestor abre `/entradas` → vê pendentes com sugestão (cadastro/validação quando existir).
2. Classifica entrada → linha Entradas Parceiros correta → grupo sai de pendentes.
3. Mês seguinte → mesma identidade classificada automaticamente.
4. Aba “Por categoria” lista todas as linhas de entrada do Controle do mês.
5. Sincronização: totais Entradas Parceiros = soma extrato classificado.
6. Saídas Parceiros = fórmulas corretas por parceiro; UI readonly.
7. Controle padrão: 6 parceiros + aluguel/coworking; saídas = parceiros + gastos fixos apenas.
8. Desativar regra: Opção A.
9. `npm test` (backend) e `npm run build` (frontend) OK.

---

## ROADMAP FASE 2 (só mencionar na entrega)

- Classificação dedicada **Entradas Aluguel / Coworking** (Pholha, salas, etc.).
- Conciliação opcional: PIX de repasse no extrato (saída) vs valor calculado em Saídas Parceiros.
- Alertas de divergência sem bloquear o fechamento.
````

---

## Como usar

1. Abrir **nova conversa** em modo **Agent**.
2. Copiar o bloco entre ` ```` ` acima (seção **Prompt para o agente**).
3. Opcional: anexar `@docs/PROMPT_IMPLEMENTACAO_PAGINA_DESPESAS.md` e `@backend/src/pages/DespesasPage.tsx` (ou frontend equivalente).
4. Implementar fases **A → F** sem novo ok (gestor aprovou em 2026-06-03).

---

## Relação com outros docs

| Documento | Papel |
|-----------|--------|
| `PROMPT_IMPLEMENTACAO_PAGINA_DESPESAS.md` | Referência de padrão (saídas / gastos fixos) |
| `PROMPT_DESENHO_PAGINA_DESPESAS.md` | Desenho original; fase 2 entradas estava lá — agora coberta por **este** arquivo |
| **Este arquivo** | Implementação entradas + repasse parceiros |

---

## Histórico

| Data | Nota |
|------|------|
| 2026-06-03 | Criado após aprovação do gestor: 6 parceiros, fórmulas fixas 480/460, totais = extrato, repasse Opção A, Controle sem Saídas Aluguel |
| 2026-06-03 | Funcional = aluguel/coworking; saídas operacionais = parceiros + gastos fixos |
