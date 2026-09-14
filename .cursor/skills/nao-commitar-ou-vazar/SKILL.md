---
name: nao-commitar-ou-vazar
description: >-
  Portão obrigatório antes de git commit ou git push. Lista o que NUNCA pode
  entrar no Git (PII, segredos, estágio, dumps, scripts _audit). Use when the
  user asks to commit, push, subir, publicar, stagear, ou "posso commitar isso?".
---

# Não commitar / não vazar (portão PII)

**Lista canônica:** `docs/NAO_COMMITAR.md` — ler antes de qualquer commit ou push.

## Quando usar

- Usuário pede **commit**, **push**, **subir**, **publicar**, ou pergunta se pode versionar algo.
- Antes de `git add` de arquivos novos em `docs/`, `scripts/`, `backend/_tmp*`.
- Sempre **antes** da skill `subir-alteracoes-site` (publicar no site).

## Checklist rápido (bloquear se qualquer item for sim)

### Segredos
- [ ] Nenhum `.env` (só `.env.example` sem valores reais)
- [ ] Nenhum JSON de service account / credencial n8n
- [ ] Nenhuma API key, token Pluggy/PagBank, ou chave PEM no diff

### PII e dados reais
- [ ] Nenhum nome real de aluno/responsável da operação Byla
- [ ] Nenhum e-mail, telefone ou documento de cliente
- [ ] Nenhum seed SQL com cadastro real (`seed-modalidades-alunos*`, `seed-profiles*`, etc.)
- [ ] Nenhum `backend/_tmp*.json` ou export CSV/JSON de produção

### Documentos privados
- [ ] Nenhum relatório de estágio (`docs/RELATORIO_PARCIAL*`)
- [ ] Nenhum `docs/anexos/` (PDFs, contratos, prints)
- [ ] Nenhum prompt/doc de estágio ou inventário cyber interno

### Scripts locais
- [ ] Nenhum `scripts/_*`, `backend/scripts/_audit*`, `_diag*`, `_check*`, `_list*`
- [ ] Nenhum workflow n8n com credencial/URL real de produção

## Passos

### 1. Inventário

```text
git status -sb
git diff --cached --name-only
```

Listar ao usuário o que **vai** e o que **não pode ir** (referência: `docs/NAO_COMMITAR.md`).

### 2. Verificação automática

| Ação | Comando |
|------|---------|
| Commit | `npm run verify:commit` |
| Push | `npm run verify:push` ou `verify:push:quick` |

Se falhar: corrigir, **não** commitar/pushar.

### 3. Corrigir antes de seguir

| Problema | Ação |
|----------|------|
| Arquivo sensível untracked | Manter fora do `git add`; confirmar `.gitignore` |
| Arquivo sensível já staged | `git restore --staged <path>` |
| Nome real em teste | Trocar por fictício (`Aluno Demo`, `Responsavel Exemplo`) |
| Regra com pessoas reais | Mover para Supabase/config |
| Segredo no código | Remover + rotacionar credencial no painel |

### 4. Commit / push

- Commit **só** com pedido explícito do usuário.
- Push/PR: seguir também `subir-alteracoes-site` se for publicar no site.

## Nunca

- Commitar `.env`, dumps, estágio, anexos, `_tmp`, `_audit`
- Dizer "parece ok" sem `git status` + verify
- Colar valores de secrets no chat ou no PR
