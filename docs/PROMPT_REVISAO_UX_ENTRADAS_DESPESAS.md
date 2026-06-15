# Prompt — Revisão UX/UI: Páginas Entradas e Despesas

Prompt mestre para **auditar, padronizar e melhorar** as páginas **Entradas** (`/entradas`) e **Despesas** (`/despesas`), alinhadas ao restante do painel Byla. Baseado em engenharia de prompt (Role, Context, Instruction, Output constraint, verificação).

**Pré-requisito:** funcionalidade base já implementada (`PROMPT_IMPLEMENTACAO_PAGINA_DESPESAS.md`, `PROMPT_IMPLEMENTACAO_PAGINA_ENTRADAS_E_REPASSE_PARCEIROS.md`).

**Fonte da verdade para categorias:** linhas salvas no **Controle de Caixa do mês selecionado** (Supabase), **não** o template estático em `backend/src/domain/controleCaixa/template.ts` — esse arquivo pode estar desatualizado.

---

## Uso

| Item | Valor |
|------|--------|
| **Quem executa** | Agente Cursor / designer-dev no repo `Byla-Financeiro` |
| **Modo sugerido** | Plan (auditoria + proposta) → Agent (implementação após **ok** do gestor |
| **Quando** | Sessão dedicada; colar o bloco **Prompt para o agente** abaixo |
| **Não fazer sem ok** | Refatoração grande, mudança de fluxo de negócio, alteração de schema SQL |

---

## Referência obrigatória — Controle de Caixa maio/2026 (último mês fechado manualmente)

Consultar Supabase antes de propor categorias ou textos de UI:

```sql
SELECT b.tipo, b.titulo, l.label, l.template_key, l.ordem, l.is_custom
FROM controle_caixa_periodos p
JOIN controle_caixa_blocos b ON b.periodo_id = p.id
JOIN controle_caixa_linhas l ON l.bloco_id = b.id
WHERE p.mes = 5 AND p.ano = 2026
ORDER BY b.ordem, l.ordem;
```

### Blocos e linhas reais (maio/2026)

| Bloco (título no Controle) | Tipo | Linhas (`label`) |
|----------------------------|------|------------------|
| **ENTRADAS PARCEIROS** | entrada | Dança, Yoga, Pilates Mari, Teatro, Bruna GR |
| **ENTRADAS ALUGUEL / COWORKING** | entrada | Neto (SBA), Pholha (Funcional), Forró e Alma, Pilates Fabi, Loja (Everaldo) |
| **Saídas Parceiros** | saída | Dança, Yoga, Pilates Mari, Teatro, Teatro Infantil, Bruna GR |
| **Saídas Fixas** | saída | Energia, Água, Net, Materiais, Energia Solar, Contadora, Parcela Pilates, Eli Ar Condicionado, Impostos, IPTU, Samuel, Luciana, Funcionários, Transporte |

**Observações críticas para UX e código:**

1. Linhas de **Aluguel/Coworking** são **nomes de locatários/atividades**, não rótulos genéricos (“Aluguel sala 1”, “Coworking”).
2. **Gastos Fixos** mistura contas (Energia, IPTU), serviços (Contadora) e **pessoas** (Samuel, Luciana, Funcionários) — a UI de Despesas deve refletir isso sem “inventar” categorias do template.
3. Em maio/2026, `template_key` das linhas está **NULL** (linhas custom); o catálogo usa fallback `linha:{uuid}` — revisar se labels e agrupamento por bloco bastam para o gestor.
4. **Teatro Infantil** existe em Saídas Parceiros mas **não** em Entradas Parceiros no mês — documentar se é lacuna de dados ou regra de negócio.
5. Sincronização automática extrato → Controle vale **só a partir de jun/2026**; maio e anteriores permanecem manuais.

---

## Técnicas de prompt aplicadas

| Técnica | Aplicação |
|---------|-----------|
| **Role** | UX engineer + front-end Byla; conhece `docs/UX_PATTERNS.md` |
| **Context embedding** | Páginas, APIs, referência maio/2026, páginas irmãs |
| **Instruction tuning** | Fases A→F: auditoria → gaps → proposta → implementação mínima |
| **Output constraining** | Relatório estruturado + diffs pequenos; sem redesign total |
| **Negative prompting** | Não usar template.ts como lista de categorias; não copiar planilha legada |
| **Verification** | Comparar maio/2026 Controle × dropdown × aba “Por categoria” side-by-side |

---

## Prompt para o agente (copiar e colar)

````
Você é UX engineer + front-end no repositório Byla-Financeiro. Revise, padronize e proponha melhorias nas páginas **Entradas** e **Despesas** para ficarem consistentes com o sistema. Trabalhe no código e na documentação de UX quando necessário.

---

## ROLE

- Auditor de UX/UI e implementador incremental (React + Tailwind).
- Prioriza **clareza para o gestor** (Samuel/secretária), não densidade técnica.
- Reutiliza componentes e tokens existentes; evita biblioteca nova.
- **Não** altera regras de negócio de classificação/repasse sem flag explícita no relatório.

---

## CONTEXT

### Páginas alvo

| Rota | Arquivo | Função |
|------|---------|--------|
| `/entradas` | `frontend/src/pages/EntradasPage.tsx` | Classificar **entradas** do extrato → linhas do Controle |
| `/despesas` | `frontend/src/pages/DespesasPage.tsx` | Classificar **saídas** do extrato → linhas do Controle |

### APIs

| Endpoint | Uso |
|----------|-----|
| `GET /api/entradas/categorias?mes=&ano=` | Catálogo = blocos **entrada** do Controle do mês |
| `GET /api/entradas/grupos`, `/resumo`, `PUT /api/entradas/mapeamento` | Fluxo Entradas |
| `GET /api/despesas/categorias?mes=&ano=` | Catálogo = blocos **saída** do Controle do mês |
| `GET /api/despesas/grupos`, `/resumo`, `PUT /api/despesas/mapeamento` | Fluxo Despesas |
| `GET /api/controle-caixa?mes=&ano=` | Fonte da verdade das linhas |

Backend: `backend/src/domain/entradas/categoriasEntrada.ts`, `backend/src/domain/despesas/categoriasSaida.ts`.

### Páginas de referência (padrão visual/comportamental)

Consultar e **espelhar** onde fizer sentido:

| Página | Arquivo | O que copiar |
|--------|---------|--------------|
| Transações | `frontend/src/pages/TransacoesPage.tsx` | FilterBar, tabela, estados |
| Visão geral | `frontend/src/pages/OverviewPage.tsx` | KPIs, cards, FilterBar |
| Controle de Caixa | `frontend/src/pages/ControleCaixaPage.tsx` | Hierarquia bloco → linha, BRL |
| Fluxo de caixa | `frontend/src/pages/FluxoCaixaOperacionalPage.tsx` | Abas, filtros, empty states |

Documento: `docs/UX_PATTERNS.md` — FilterBar, KpiStrip, StatusBadge, StateBlocks.

### Modelo mental do gestor (Entradas)

1. **Mensalidades (Entradas Parceiros)** — PIX de alunos/responsáveis; ligado ao fluxo operacional (aba/modalidade).
2. **Aluguel / Coworking (Entradas Aluguel / Coworking)** — PIX de quem aluga ou faz coworking; linhas são **locatários** (ex.: Pholha (Funcional)), não categorias genéricas.

Repasse automático no Controle: **só** Entradas Parceiros → Saídas Parceiros; **não** para bloco Aluguel/Coworking.

### Modelo mental (Despesas)

- Saídas do extrato → linhas de **Saídas Parceiros** ou **Saídas Fixas** (e custom do mês).
- Regra permanente por **destinatário** (nome normalizado do PIX).

### Restrições já implementadas

- Sync Controle: `mes >= 6/2026` (`syncEntradasRepassesEligible.ts`).
- Sugestões: somente leitura; gestor confirma no dropdown.
- Desativar regra: mês atual permanece classificado; efeito em meses futuros.

---

## INSTRUCTION — Fase A: Auditoria comparativa (obrigatória)

1. Para **maio/2026** (`mes=5`, `ano=2026`), listar side-by-side:
   - Coluna A: linhas do Controle (SQL ou `GET /controle-caixa`)
   - Coluna B: opções no dropdown de classificação (Entradas e Despesas)
   - Coluna C: aba “Por categoria” (totais por linha)
2. Repetir smoke test visual para **junho/2026** se existir período no banco.
3. Registrar **cada divergência**: linha faltando, label diferente, bloco errado, template_key null confundindo usuário.
4. **Proibido** usar apenas `buildControleCaixaTemplate()` na auditoria.

Entregável A: tabela markdown “Controle × Entradas × Despesas”.

---

## INSTRUCTION — Fase B: Heurísticas UX (checklist)

Avaliar cada item nas duas páginas (Nota 1–5 + comentário):

### Navegação e hierarquia
- [ ] Topbar: título + subtítulo explicam o job-to-be-done em uma frase
- [ ] MonthYearPicker alinhado às outras páginas Finanças
- [ ] Ordem mental: KPIs → filtros/segmentos → abas → lista → modal
- [ ] Entradas: segmentos **Mensalidades** vs **Aluguel/Coworking** claros e mutuamente compreensíveis

### Padrões do sistema (`UX_PATTERNS.md`)
- [ ] FilterBar com título, subtítulo e texto de ajuda útil (não jargão)
- [ ] KpiStrip: mesma densidade e accent que Overview/Transações
- [ ] StatusBadge para pendente/classificado/repete (substituir chips ad-hoc se possível)
- [ ] EmptyState / ErrorPanel / loading skeleton consistentes

### Classificação (modal)
- [ ] Dropdown agrupa por **título real do bloco** do Controle (ex.: “ENTRADAS ALUGUEL / COWORKING”)
- [ ] Labels idênticos ao Controle do mês (ex.: “Neto (SBA)”, não “Aluguel sala 1”)
- [ ] Sugestão visível mas não invasiva; botão primário “Salvar regra” claro
- [ ] Feedback pós-salvar (toast) e invalidação de Controle quando aplicável

### Aba “Por categoria”
- [ ] Espelha blocos do Controle na ordem correta
- [ ] Mostra **todas** as linhas do mês (inclusive R$ 0) para visão de fechamento
- [ ] Drill-down ou lista de transações acessível (ou gap documentado)

### Paridade Entradas ↔ Despesas
- [ ] Mesma estrutura de abas (Pendentes / Classificados / Por categoria)
- [ ] Mesmos padrões de card de grupo, modal, KPIs
- [ ] Copy alinhada (entrada vs saída, pagador vs destinatário)

### Acessibilidade e mobile
- [ ] Modal focável, botões com área de toque adequada
- [ ] Tabelas/listas legíveis em viewport estreita

Entregável B: checklist preenchido + top 5 fricções ordenadas por impacto.

---

## INSTRUCTION — Fase C: Proposta de melhoria (design)

Propor mudanças **incrementais** (não redesign completo):

1. **Copy** — textos FilterBar, empty states, labels de segmento (tom igual Controle/Fluxo).
2. **Layout** — unificar cores de abas (Entradas usa verde em segmento e indigo em abas? padronizar).
3. **Componentização** — extrair `ClassificarModal` / `GrupoCard` compartilhados se duplicação > 60% entre Entradas e Despesas.
4. **Aluguel/Coworking** — UX para classificar PIX em linhas com nome de pessoa (ex.: busca no dropdown, hint “locatário do Controle”).
5. **Gastos Fixos** — quando destinatário = linha com nome de pessoa (Samuel, Luciana), sugestão mais forte no card.
6. **template_key null** — se maio usa só UUID, propor: exibir label + bloco apenas; ou migração opcional de keys (só documentar, não executar sem ok).

Entregável C: wireframes em texto ou mermaid + lista priorizada (P0/P1/P2).

---

## INSTRUCTION — Fase D: Implementação (só após ok do gestor)

Implementar **somente P0 e P1** aprovados:

- Ajustes de copy e layout usando componentes existentes.
- Paridade visual entre Entradas e Despesas.
- Correções onde catálogo não reflete Controle do mês (bug, não opinião).
- Testes: `npm run build` (frontend), `npm test` (backend se tocar domínio).

**Não implementar** na mesma sessão: migração massiva de template_key, sync retroativo, fase entradas extras.

---

## INSTRUCTION — Fase E: Validação com maio/2026

Checklist manual (gestor ou agente com print):

- [ ] Selecionar **maio/2026** em Entradas → dropdown lista exatamente as 5 + 5 linhas de entrada acima.
- [ ] Selecionar **maio/2026** em Despesas → dropdown lista 6 + 14 linhas de saída acima.
- [ ] Aba Por categoria mostra os mesmos blocos/títulos que Controle de Caixa.
- [ ] Nenhum rótulo genérico do template antigo (“Aluguel sala 1”, “Marketing”) aparece se não existir no Controle de maio.

---

## OUTPUT CONSTRAINT

Responder em **português**, estrutura:

1. **Resumo executivo** (5 bullets)
2. **Tabela Controle maio/2026 × UI** (Fase A)
3. **Checklist UX** (Fase B) — notas e fricções
4. **Propostas P0/P1/P2** (Fase C)
5. **Plano de implementação** — arquivos tocados, estimativa de escopo
6. **Perguntas ao gestor** — máximo 3, só se bloquear decisão

Se for implementar (Fase D): diff focado; sem commit/push/deploy salvo pedido explícito.

---

## ANTI-PADRÕES

- Usar `buildControleCaixaTemplate()` ou `createDefaultDraft()` como lista de categorias na documentação ou testes de aceite do gestor.
- Inventar categorias que não existem no Controle do mês.
- Tratar Aluguel/Coworking como “mesmas linhas de Parceiros”.
- Reintroduzir Conciliação/Divergências ou planilha Google como fonte primária.
- Duplicar lógica de catálogo no frontend (sempre via API).

---

## DEFINITION OF DONE (revisão)

- [ ] Auditoria maio/2026 documentada com dados reais do Supabase
- [ ] Gaps entre Controle e dropdowns listados e priorizados
- [ ] Proposta de padronização alinhada a `UX_PATTERNS.md` e páginas irmãs
- [ ] Gestor pode responder **ok** às P0/P1 antes de codificar
- [ ] Se implementado: build verde + maio/2026 smoke OK

Terminar com: **“Confirme quais itens P0/P1 implementar.”**
````

---

## Histórico

| Data | Nota |
|------|------|
| 2026-06-03 | Criado após feedback: categorias devem vir do Controle maio/2026, não do template em código |
