# Publicar alterações no site sem PII no GitHub

**Data:** 25 de julho de 2026  
**Status:** aprovado (caminho C)  
**Responsável pela aprovação:** Levi

## 1. Objetivo

Ter um jeito fixo e repetível de levar features do PC para o site (GitHub → Render/Vercel), sem expor dados de clientes no repositório público `levi-tude/Byla-Financeiro`.

## 2. Decisões

- GitHub permanece **público** (portfólio).
- **Nenhum dado de cliente** no Git: nomes reais, CPF, e-mails, valores de casos reais, PDFs de estágio, dumps, seeds com PII.
- Dados reais de operação ficam no **Supabase** (app autenticado) e em pastas **fora do Git**.
- Regras de negócio com pessoas reais (ex.: grupos família/casal) → **tabela/config no banco**, não catálogo hardcoded com nomes reais no código público.
- Testes e fixtures no Git usam **apenas nomes fictícios**.
- Publicação por **ondas** (pacotes), não “tudo que está na pasta”.
- Sem **force-push** em `main` sem aprovação explícita do Levi.
- Commit só quando pedido; push/PR só quando pedido (ou quando a skill de publicar for invocada com aprovação).

## 3. Ferramentas no Cursor

| Peça | Função |
|------|--------|
| Regra `.cursor/rules/publicar-site-sem-pii.mdc` | Freio curto sempre ativo: PII, force-push, ondas |
| Skill `.cursor/skills/subir-alteracoes-site/SKILL.md` | Passo a passo de inventário → limpeza → verify → PR → deploy |

## 4. Ondas iniciais

| Onda | Conteúdo | Pré-requisito |
|------|----------|---------------|
| **Wave B** | Validação N→1 + crédito recorrente / assinaturas / vendas / Finanças Alunos | PII removido do código/testes; catálogo família no Supabase (`grupo_familia_pagamento`) — pré-trabalho feito |
| Wave C (depois) | Controle de caixa (modos) | Idem portão PII |
| Wave D (depois) | Relatórios / n8n / blur / rate limit residual | Idem |

Docs de estágio, anexos, scripts `_tmp`/`_audit*`, cyber install prompts → **nunca** nas ondas.

## 5. Portão de PII (obrigatório antes de push)

Bloquear se o diff/staged contiver:

- nomes de alunos/responsáveis reais da operação;
- e-mails, telefones, documentos;
- paths de relatório de estágio / anexos / inventário privado;
- `.env` com valores reais;
- exports JSON/CSV de produção.

Ações: fictício nos testes; regra real só no banco; arquivo sensível fora do stage.

## 6. Alinhamento com `origin/main`

A `main` local pode estar divergente da `main` sanitizada no GitHub. O fluxo padrão:

1. Base = `origin/main` limpa.
2. Branch nova com o pacote da onda (cherry-pick / patch limpo), não “empurrar 49 commits locais” por cima.
3. PR → merge → auto-deploy Render (`main`) / Vercel.
4. Sem `git push --force` em `main` sem pedido explícito.

## 7. Fora de escopo desta spec

- Implementar agora a migração do catálogo família para Supabase (fica como pré-trabalho da Wave B).
- Tornar o repo privado.
- Force-push de sanitização histórica (só com aprovação específica).

## 8. Critério de sucesso

- Levi diz “subir pro site” → agente segue a skill.
- Wave B no ar sem nomes reais no GitHub.
- Site (Validação + crédito/assinaturas) usa dados reais só via Supabase autenticado.
