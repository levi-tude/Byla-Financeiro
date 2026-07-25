---
name: subir-alteracoes-site
description: >-
  Publica ondas de alteração do Byla Financeiro no GitHub público e no site
  (Render/Vercel) sem PII. Use when the user asks to subir pro site, atualizar
  produção, publicar no GitHub, deploy, push da main, ou liberar Wave B/C/D.
---

# Subir alterações para o site (sem PII)

Repo público: `levi-tude/Byla-Financeiro`. Deploy: Render (`main`, backend) + Vercel (frontend). Spec: `docs/superpowers/specs/2026-07-25-publicar-site-sem-pii-design.md`.

## Antes de qualquer push

1. Confirmar com o usuário **qual onda** (ex.: Wave B = Validação + crédito/assinaturas/vendas).
2. Se `main` local estiver divergente de `origin/main`, **não** fazer `git push --force`. Preferir branch a partir de `origin/main` + commits limpos / cherry-pick do pacote.
3. Commit só do pacote da onda; push/PR só com pedido (esta skill conta como pedido de publicar).

## Passos

### 1. Inventário

- `git fetch origin`
- `git status -sb` e `git rev-list --left-right --count origin/main...HEAD`
- Listar pacotes: o que entra na onda vs o que fica local (estágio, `_tmp`, controle, etc.)
- Mostrar ao usuário a lista curta do que **vai** e do que **não vai**; só seguir se ele confirmar (ou se já tiver aprovado a onda nesta conversa).

### 2. Portão de PII (obrigatório)

No diff que será publicado, buscar e **bloquear** se houver:

- Nomes reais de alunos/responsáveis da operação Byla
- E-mails, telefones, documentos
- Relatório de estágio, anexos, inventários privados
- `.env` com valores; JSON/CSV de produção; scripts `_tmp` / `_audit`

Correções aceitas:

- Testes/fixtures → nomes **fictícios**
- Regras com pessoas reais → **Supabase/config**, não hardcoded no Git público
- Arquivo sensível → fora do stage (e preferir fora do tree versionado)

Não publicar até o portão passar.

### 3. Preparar branch limpa

```text
git fetch origin
git checkout -b publish/<onda>-<yyyy-mm-dd> origin/main
```

Trazer só os commits/arquivos da onda (cherry-pick ou checkout pontual de paths). Resolver conflitos sem reintroduzir PII.

### 4. Verificar

Na raiz do repo:

- `npm run verify:push` (preferido) ou `npm run verify:push:quick` se o usuário pedir rapidez
- Testes do pacote tocado (ex.: backend `npm test` nos arquivos da onda)

### 5. Publicar

- `git push -u origin HEAD`
- `gh pr create` com resumo da onda + nota “sem PII / base origin/main”
- Após merge em `main`: Render auto-deploy; conferir Vercel se o frontend entrou na onda
- Devolver ao usuário: URL do PR, o que subiu, o que ficou local, status do deploy se disponível

### 6. Se divergência for bloqueante

Parar e explicar em português simples. Opções: cherry-pick na branch limpa, ou aguardar aprovação explícita para outra estratégia. **Nunca** force-push em `main` sem o usuário pedir com essas palavras.

## Ondas conhecidas

| Onda | Inclui | Exclui sempre |
|------|--------|---------------|
| Wave B | Validação N→1; crédito recorrente / assinaturas / vendas / Finanças Alunos | Estágio, anexos, `_tmp`, controle modos (Wave C) |
| Wave C | Controle de caixa (oficial/sistema) | PII / estágio |
| Wave D | Relatórios, n8n sanitizado, hardening residual de UI | PII / estágio |

## Nunca

- Commitar docs de estágio / `docs/anexos/` / PDFs pessoais
- Subir catálogo família/casal com nomes reais no código público
- Empurrar “49 commits locais” por cima da `main` sanitizada
- Mencionar ou colar secrets do `.env` no PR
