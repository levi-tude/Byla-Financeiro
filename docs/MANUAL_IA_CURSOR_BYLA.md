# Manual de IA no Cursor — Projeto Espaço Byla

Documento de consulta rápida para uso diário no Cursor IDE.  
Complementa: `PROMPTS_USO_CURSOR.md` (copy/paste operacional) e `PROMPT_CANVA_MANUAL_IA_CURSOR.md` (gerar versão visual).

---

## Como usar este manual

| Situação | Onde ir |
|----------|---------|
| "Qual modelo escolher agora?" | [Seção 2](#2-quando-usar-cada-modelo) |
| "Preciso de um prompt pronto" | [Seção 3](#3-prompts-prontos) ou `PROMPTS_USO_CURSOR.md` |
| "Vai gastar muito crédito?" | [Seção 4](#4-consumo-de-créditos) |
| "Como organizar o mês?" | [Seção 5](#5-estratégia-mensal) |
| "O que o projeto tem?" | [Seção 1](#1-mapeamento-do-projeto) |
| Versão visual / poster | Use `PROMPT_CANVA_MANUAL_IA_CURSOR.md` no Canva ou no ChatGPT |

---

## 1. Mapeamento do projeto

### Stack

| Camada | Tecnologia | Pasta |
|--------|------------|-------|
| Frontend | React 18, TS, Vite, Tailwind, TanStack Query | `frontend/` |
| Backend | Node 20+, Express, TS, Zod | `backend/` |
| Banco | Supabase (transações, auth) | `backend/src/services/supabaseClient.ts` |
| Planilhas | Google Sheets | `backend/src/services/googleSheetsClient.ts` |
| Relatórios IA | Gemini (+ Groq fallback) | `backend/src/routes/relatorios.ts` |
| Automação | n8n | `n8n-workflows/` |
| Deploy | Vercel (front) + Render (back) | `vercel.json`, `render.yaml` |
| Perfis | `admin` / `secretaria` | `frontend/src/auth/` |

### Arquivos pesados (evite pedir "leia tudo")

| Arquivo | Tamanho aprox. | Nota |
|---------|----------------|------|
| `frontend/src/pages/FluxoCaixaOperacionalPage.tsx` | ~208 KB | Maior página |
| `frontend/src/services/backendApi.ts` | ~60 KB / ~1.730 linhas | Todos os endpoints |
| `backend/src/routes/fluxoOperacional.ts` | ~1.194 linhas | API fluxo |
| `frontend/src/pages/TransacoesPage.tsx` | ~50 KB | Filtros, views, competência |
| `frontend/src/pages/ValidacaoPagamentosDiariaPage.tsx` | ~57 KB | Conciliação |
| `backend/src/services/entradasClassificacaoService.ts` | ~618 linhas | Classificação entradas |

**Regra:** cite com `@arquivo` em vez de "explore o repositório".

### Módulos do painel (implementados)

| Rota | Função |
|------|--------|
| `/` | Visão geral (admin) |
| `/transacoes` | Extrato, filtros, views, caixa/competência |
| `/entradas` | Classificação, por categoria, competência |
| `/despesas` | Idem entradas |
| `/controle-caixa` | Controle mensal + sync planilha |
| `/fluxo-caixa` | Fluxo operacional (secretaria + admin) |
| `/validacao-pagamentos-diaria` | Banco × planilha |
| `/calendario-financeiro` | Calendário mensal |
| `/relatorios-ia` | Relatórios com IA |
| `/performance-atividades` | KPIs por atividade |

### Pendências conhecidas

- Catálogo R2–R5 de relatórios IA (`docs/RELATORIOS_IA_ARQUITETURA_EXPANSAO.md`) — parcial
- n8n export — depende da instância (`docs/N8N_STATUS_VERIFICACAO.md`)
- Refatoração de arquivos gigantes (fluxo operacional) — não feita
- Features locais (views multi-filtro, competência) — validar e commitar quando aprovado

### Comandos de validação

```bash
cd backend && npx tsc --noEmit && npm test    # 151 testes
cd frontend && npm run build
node scripts/verify-security-config.mjs
node scripts/verify-vercel-config.mjs
```

---

## 2. Quando usar cada modelo

| Modelo | Use para | Não use para |
|--------|----------|--------------|
| **Auto** | Typo, label, 1 arquivo, import, doc curto | Competência multi-tela, deploy, refatoração grande |
| **Claude Sonnet 4.6** | Feature 2–5 arquivos, endpoint + teste, UI seguindo padrão existente | Arquitetura nova, ler projeto inteiro |
| **Claude Fable 5** | Bugs sistêmicos, competência/conciliação, planejar antes de codar, verificar GitHub/Vercel/Render | Ajuste de CSS, renomear variável |

### Decisão rápida (Byla)

```
É 1 arquivo e escopo fechado?     → Auto
É feature com arquivos nomeados?  → Sonnet 4.6
Cruza várias telas / regra de negócio / deploy? → Fable 5
Quer só conversar antes de codar? → Fable 5 (Ask/Plan)
```

### Exemplos reais

| Tarefa | Modelo |
|--------|--------|
| Label "Categoria" em filtro | Auto |
| Coluna competência na DataTable | Sonnet |
| "Tudo menos aluguel/coworking" + views + backend | Fable |
| Render falhou no `tsc` | Fable |
| Commit + push + checar Vercel | Sonnet ou Fable |

**Nota:** trocar modelo mantém o histórico da conversa; você troca o agente, não o contexto.

---

## 3. Prompts prontos

### Abertura do dia

```txt
Projeto: Byla-Financeiro. Mês no sistema: [MM/AAAA].

Prioridade #1: [resultado]
Prioridade #2: [resultado]

Regras: uma tarefa por vez | @arquivos específicos | npm test no backend | não commitar sem eu pedir

Comece pela Prioridade #1.
```

### Feature com escopo fechado

```txt
Tarefa: [nome]

Arquivos: @[arquivo1] @[arquivo2]

Objetivo: [comportamento esperado]
Não mexer em: [ex.: FluxoCaixaOperacionalPage.tsx]

Pronto quando:
1. [critério funcional]
2. cd backend && npx tsc --noEmit && npm test
3. cd frontend && npm run build

Execute e reporte evidências.
```

### Diagnóstico produção

```txt
Modo diagnóstico.

Sintoma: [o que você viu no site]

Verifique: git status | SHA no GitHub | Vercel | Render | CORS
Não refatore. Só evidências + próximo passo.
```

### Pedir commit (seu fluxo)

```txt
Aprovei no browser. Commit e push.
Depois confirme SHA no GitHub, Vercel e Render.
```

Mais templates: `docs/PROMPTS_USO_CURSOR.md`

---

## 4. Consumo de créditos

Estimativa **relativa** (Cursor Pro ~US$ 20/mês). Varia com tamanho do chat e arquivos abertos.

| Tarefa | Custo relativo |
|--------|----------------|
| Fix typo / 1 arquivo | 1× (Auto) |
| Componente + endpoint pequeno | 4–6× |
| Feature TransacoesPage completa | 15–25× |
| Competência ponta a ponta | 25–40× |
| "Refatore fluxo operacional inteiro" | 50–100× ⚠️ |

### O que mais gasta

1. Abrir arquivos gigantes sem `@`
2. Conversas longas sem fechar tarefa
3. Fable/Sonnet em tarefas triviais
4. Agent com muitos builds/terminais

### O que economiza

- `@arquivo` específico
- Nova conversa por entrega
- Modo Ask para dúvidas (sem código)
- Você cola só o erro do `npm test`

---

## 5. Estratégia mensal (estágio)

Orçamento mental: **100 unidades = mês**

| Uso | % |
|-----|---|
| Auto (microtarefas) | 25% |
| Sonnet (features fechadas) | 45% |
| Fable (bugs + crítico) | 25% |
| Reserva (produção quebrou) | 10% |

### Regras de ouro

1. **Uma conversa = uma entrega**
2. **Debate → código** (economiza retrabalho)
3. **Nunca** refatorar `FluxoCaixaOperacionalPage` de uma vez
4. **Teste manual** o que precisa login Supabase
5. **Fim do mês:** priorize Auto + Sonnet; guarde Fable para produção

### Rotina semanal sugerida

| Dia | Ação |
|-----|------|
| Seg | Planejar (1 msg, Fable Ask) |
| Ter–Qui | Implementar 1 feature (Sonnet/Fable) |
| Sex | Testar no browser + commit se ok |
| Sáb (opc) | Auto para pendências pequenas |

---

## Referências cruzadas

- Prompts copy/paste: `docs/PROMPTS_USO_CURSOR.md`
- Gerar poster/Canva: `docs/PROMPT_CANVA_MANUAL_IA_CURSOR.md`
- Engenharia de prompt (relatórios): `docs/ENGENHARIA_DE_PROMPT_E_SW_BYLA.md`
- Arquitetura: `docs/ARQUITETURA_SISTEMA_BYLA.md`
- Índice geral: `docs/INDEX.md`

---

*Última revisão: jun/2026 — alinhado ao repositório Byla-Financeiro.*
