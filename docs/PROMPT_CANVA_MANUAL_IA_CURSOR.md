# Prompt para gerar o Manual IA Cursor no Canva

Use este arquivo para criar uma **versão visual** consultável (poster, PDF, deck ou doc Canva) a partir do conteúdo em `MANUAL_IA_CURSOR_BYLA.md`.

---

## Opção A — Canva Magic Design / Doc (recomendado)

1. Abra o Canva → **Doc** ou **Apresentação** (formato A4 vertical ou 16:9).
2. Copie o bloco **PROMPT COMPLETO** abaixo.
3. Cole no **Magic Write**, **Canva AI** ou no ChatGPT/Claude com saída para você colar no Canva.
4. Ajuste cores com a paleta Byla (navy `#1e293b`, indigo `#4f46e5`, emerald para "ok", rose para "não use").

---

## Opção B — ChatGPT / Claude → colar no Canva

Mesmo prompt abaixo. Peça saída **página por página** com título, bullets curtos e 1 tabela por slide.

---

## PROMPT COMPLETO (copiar da linha seguinte até o fim do bloco)

```txt
## ROLE
Você é designer de documentação técnica e redator de playbooks operacionais para o projeto **Espaço Byla** — painel financeiro React + Node usado em estágio de desenvolvimento. Seu público é um desenvolvedor iniciante/intermediário que usa Cursor Pro (~US$ 20/mês) e precisa consultar o manual em 30 segundos.

## CONTEXT
- Repositório: Byla-Financeiro
- Stack: React/Vite/Tailwind (frontend), Express/TypeScript/Zod (backend), Supabase, Google Sheets, Vercel + Render
- Páginas críticas: TransacoesPage, EntradasPage, DespesasPage, FluxoCaixaOperacionalPage (~208KB — evitar contexto gigante)
- Perfis: admin e secretaria
- Já existe doc operacional: PROMPTS_USO_CURSOR.md
- Objetivo deste material: **consulta rápida** — não tutorial longo

## INSTRUCTION
Produza o conteúdo estruturado para um **documento visual no Canva** (10–14 páginas/slides). Cada página deve ter:
- Título curto (máx. 6 palavras)
- Subtítulo de 1 linha
- Corpo: bullets (máx. 5 por página) OU 1 tabela compacta
- 1 "callout" por página (caixa de destaque: dica, alerta ou regra de ouro)
- Ícone sugerido entre colchetes para eu escolher no Canva [ex.: ⚡ 📁 🎯 💰]

Não invente features que não existem. Use apenas o conteúdo abaixo.

## OUTPUT CONSTRAINT
- Idioma: português (Brasil)
- Tom: direto, amigável, zero jargão desnecessário
- Formato de entrega:

---
### PÁGINA [N]: [TÍTULO]
**Subtítulo:** ...
**Conteúdo:**
- bullet 1
- bullet 2
**Callout:** ...
**Ícone sugerido:** [...]
---

- Última página: "Cola rápida" com 3 prompts de 2 linhas cada
- Penúltima página: "Árvore de decisão de modelo" em texto ASCII ou lista if/then

## CONTEÚDO OBRIGATÓRIO (não omitir seções)

### PÁGINA 1 — Capa
Título: Manual IA no Cursor — Byla
Sub: Consulta rápida · Projeto Espaço Byla · Cursor Pro
Incluir: data "Atualizado jun/2026", versão "1.0"

### PÁGINA 2 — Mapa do projeto
Tabela: Frontend | Backend | Dados | Deploy
Lista rotas: /transacoes, /entradas, /despesas, /fluxo-caixa, /controle-caixa, /relatorios-ia
Callout: "Arquivos pesados — sempre use @arquivo no Cursor"

Arquivos a citar:
- FluxoCaixaOperacionalPage.tsx (~208KB)
- backendApi.ts (~1.730 linhas)
- fluxoOperacional.ts (~1.194 linhas)

### PÁGINA 3 — Comandos que importam
```
cd backend && npx tsc --noEmit && npm test
cd frontend && npm run build
```
Callout: 151 testes no backend

### PÁGINA 4 — Auto mode
USE: typo, label, 1 arquivo, import
NÃO USE: competência multi-tela, deploy, refatorar fluxo
Exemplo Byla: "Mudar label do filtro de categoria"

### PÁGINA 5 — Claude Sonnet 4.6
USE: feature 2–5 arquivos, endpoint + Zod + teste
NÃO USE: arquitetura nova, ler repo inteiro
Exemplo: "Coluna competência na DataTable de Transações"

### PÁGINA 6 — Claude Fable 5
USE: bugs sistêmicos, competência/conciliação, planejar antes de codar, GitHub+Vercel+Render
NÃO USE: CSS, renomear variável
Exemplo: "Views salvas + filtro excluir aluguel/coworking"

### PÁGINA 7 — Árvore de decisão
```
1 arquivo, escopo fechado? → Auto
2–5 arquivos, contrato claro? → Sonnet
Cruza telas / regra de negócio / deploy? → Fable
Só conversar? → Fable (Ask)
```

### PÁGINA 8 — Prompt: abertura do dia
Bloco copy/paste (6 linhas):
Prioridade #1, #2 | uma tarefa | @arquivos | npm test | não commitar

### PÁGINA 9 — Prompt: feature fechada
Bloco copy/paste:
Tarefa + @arquivos + objetivo + "não mexer em" + critérios de pronto + build

### PÁGINA 10 — Prompt: diagnóstico produção
Sintoma → git → GitHub → Vercel → Render → sem refatorar

### PÁGINA 11 — Consumo de créditos
Tabela relativa:
- typo 1×
- endpoint+teste 4–6×
- feature Transações 15–25×
- competência ponta a ponta 25–40×
- refatorar fluxo inteiro 50–100× ⚠️

Callout: conversa longa = +20–40% por turno

### PÁGINA 12 — Estratégia mensal US$ 20
Pizza ou tabela: Auto 25% | Sonnet 45% | Fable 25% | Reserva 10%
5 regras de ouro (1 linha cada)

### PÁGINA 13 — Cola rápida
3 mini-prompts:
1. Abertura do dia
2. Diagnóstico
3. Commit aprovado

### PÁGINA 14 — Onde achar mais
- docs/MANUAL_IA_CURSOR_BYLA.md (completo)
- docs/PROMPTS_USO_CURSOR.md (copy/paste)
- docs/INDEX.md

## CHAIN-OF-THOUGHT (interno — não imprimir na resposta)
Antes de gerar, verifique: (1) cada página cabe em 1 tela A4 sem scroll excessivo; (2) nenhum bullet passa de 12 palavras; (3) tabelas têm no máximo 4 colunas.

## NEGATIVE CONSTRAINTS
- Não escreva parágrafos longos
- Não use inglês nos títulos de página (só nomes de modelo: Auto, Sonnet, Fable)
- Não prometa preços exatos do Cursor
- Não inclua código completo de arquivos — só comandos shell curtos
- Não crie seções extras além das 14 páginas definidas

Gere agora as 14 páginas no formato especificado.
```

---

## PROMPT CURTO (versão cola rápida — 1 tela)

Use quando já conhece o fluxo e quer só regenerar o Canva:

```txt
Crie 14 slides Canva (PT-BR) do "Manual IA Cursor — Byla" para consulta rápida.
Público: dev estágio, Cursor Pro US$20/mês.
Inclua: mapa stack, arquivos pesados (@arquivo), Auto vs Sonnet 4.6 vs Fable 5 com exemplos Byla (TransacoesPage, competência, deploy), árvore de decisão, 3 prompts copy/paste, tabela custo relativo de créditos, estratégia mensal 25/45/25/10.
Formato por slide: título + 5 bullets max + 1 callout + ícone sugerido.
Tom direto. Sem parágrafos longos.
Fonte: docs/MANUAL_IA_CURSOR_BYLA.md
```

---

## Dicas de montagem no Canva

| Elemento | Sugestão |
|----------|----------|
| Formato | Doc A4 vertical (consulta) ou Apresentação 16:9 (treinamento) |
| Paleta | Navy `#1e293b`, indigo `#4f46e5`, fundo `#f8fafc`, texto `#0f172a` |
| Tipografia | Título: Montserrat Bold · Corpo: Open Sans ou Inter |
| Página decisão | Use elemento "Fluxograma" ou tabela 2 colunas USE / NÃO USE |
| Cola rápida | Fundo indigo claro, fonte monospace para prompts |
| Export | PDF (consulta offline) + link Canva (editar depois) |

---

## Manutenção

Quando o projeto mudar (nova página, novo modelo Cursor, novo deploy):

1. Atualize `docs/MANUAL_IA_CURSOR_BYLA.md`
2. Reexecute o **PROMPT COMPLETO** no Canva AI
3. Atualize a data na capa

---

## Referências

- Manual completo (texto): `docs/MANUAL_IA_CURSOR_BYLA.md`
- Prompts operacionais: `docs/PROMPTS_USO_CURSOR.md`
- Engenharia de prompt (método): `docs/ENGENHARIA_DE_PROMPT_E_SW_BYLA.md`
