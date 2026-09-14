---
name: nao-commitar-ou-vazar
description: >-
  Use when the user asks to commit, git add, stage, push, abrir PR, subir ou
  publicar, or when any path might be .env, PII, estágio, dump, or n8n with
  credentials. Mandatory gate before Git writes on Byla Financeiro.
---

# Não commitar / não vazar

Repo público: `levi-tude/Byla-Financeiro`. Lista oficial: `docs/NAO_COMMITAR.md`. Rule curta: `.cursor/rules/nao-commitar-pii.mdc`.

**Portão obrigatório.** Não stagear, commitar nem dar push antes de passar nesta skill. Publicar no site continua exigindo também `.cursor/skills/subir-alteracoes-site/SKILL.md`.

## Checklist (bloquear se qualquer item for sim)

- Segredos: `.env` com valores, service account, `*.credentials.json`, PEM, `.cursor/mcp.json`
- PII: nomes reais de alunos/responsáveis, e-mails, telefones, documentos
- Docs: relatório de estágio, `docs/anexos/`, PDFs pessoais, auditoria cyber local
- Scripts: `_tmp*`, `scripts/_*`, `backend/scripts/_audit*`, `_diag*`, exports de produção
- Seeds/dumps com cadastro real; workflows n8n com credenciais ou URLs reais

## Passos

### 1. Inventário

- `git status -sb` e `git diff --cached --stat`
- Separar o que **pode** ir (código/produto, fixtures fictícios) do que **fica local** (estágio, `_tmp`, dumps, `.env`)
- Se o usuário pediu “subir o site”, seguir a skill de publicar por **onda** — não o WIP inteiro

### 2. Portão

Na raiz do repo:

- Commit / stage → `npm run verify:commit`
- Push / PR / publicar → `npm run verify:push` (ou `verify:push:quick` se combinado)

O script `scripts/verify-forbidden-paths.mjs` barra paths da lista oficial. Isso **não** substitui a leitura humana de PII dentro de arquivos que *parecem* código (nomes reais em testes, seeds, prints).

Correções aceitas:

- Testes/fixtures → nomes **fictícios**
- Regra com pessoas reais → Supabase / `Byla-Privado`, não Git público
- Arquivo sensível → fora do stage (preferir fora da árvore versionada)

Não commitar até o portão passar.

### 3. Só então Git

- Stage só do pacote limpo
- Commit com mensagem descritiva
- Push em branch; PR contra `main`
- **Nunca** `git push --force` em `main` sem pedido explícito do mantenedor

## Nunca

- Commitar `.env`, dumps, relatório de estágio, anexos, PDFs pessoais
- Subir catálogo/teste com nomes reais de alunos/responsáveis
- Versionar n8n com credencial (só templates sanitizados em `n8n-workflows/`)
- Mencionar ou colar secrets no PR
- Force-push em `main` sem o usuário pedir com essas palavras

## Se já entrou no commit / no remoto

Seguir a seção **Se já foi commitado** em `docs/NAO_COMMITAR.md`: tirar do stage, não reescrever `main`, rotacionar segredo se vazou, avisar o mantenedor.
