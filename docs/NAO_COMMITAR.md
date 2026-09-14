# Não commitar / não vazar

Lista **oficial** do que nunca entra no GitHub público `levi-tude/Byla-Financeiro`.

GitHub público = portfólio + fonte do deploy (Render/Vercel). Dados reais de clientes ficam no **Supabase** (app autenticado) ou numa pasta **fora do Git** (`Byla-Privado`). Testes e fixtures no Git usam **somente nomes fictícios**.

Agentes e clones devem seguir este arquivo, a rule `.cursor/rules/nao-commitar-pii.mdc` e a skill `.cursor/skills/nao-commitar-ou-vazar/SKILL.md`. O portão automático é `npm run verify:commit` / `npm run verify:push`.

## 1. Segredos e credenciais

Nunca stagear, commitar ou colar no PR:

- `.env`, `.env.*` (exceto `.env.example` só com nomes de variáveis)
- JSON de service account (`**/service-account*.json`)
- `**/*.credentials.json`, tokens, chaves PEM/P12/PFX
- `.cursor/mcp.json` (MCP com chaves)
- `backend/n8n-byla-14b9ea6e929d.json` e qualquer dump de credencial n8n
- Headers, webhooks, connection strings ou API keys com valores reais

`.env.example` pode existir; nunca copie valores de produção para o Git.

## 2. PII — dados reais de clientes

Nunca no Git:

- Nomes reais de **alunos** ou **responsáveis**
- E-mails, telefones, documentos (RG, CPF, etc.)
- Endereços, dados de pagamento pessoais, prints de planilha operacional
- Seeds, CSV, JSON ou dumps de **produção** / cadastro real
- Catálogos família/casal com pessoas reais (isso vive no Supabase)

Operação diária → Supabase. Demonstração / teste → personas fictícias.

## 3. Relatório de estágio, anexos e PDFs pessoais

Nunca:

- `docs/RELATORIO_PARCIAL*`
- `docs/PROMPT_*ESTAGIO*`, `docs/PROMPT_ANEXO*`
- `docs/anexos/`
- PDFs, DOCX ou prints pessoais / de estágio
- `docs/AUDITORIA_CYBER*`, `docs/CYBER_SKILLS*`, `docs/HARDENING_*` (inventário local)
- `docs/superpowers/audits/`

Esses materiais, se ainda forem úteis, ficam em `Byla-Privado` (fora do Git).

## 4. Scripts e dumps locais

Nunca:

- `_tmp*`, `backend/_tmp*`, `_publish-wave/`
- `backend/scripts/_audit*`, `_diag*`, `_check*`, `_list*`
- `scripts/_*` (underscore = rascunho local, não produto)
- `scripts/build_anexo*`, `scripts/generate_relatorio*`, `scripts/merge_relatorio*`, `scripts/generate_quimica*`
- `scripts/setup-gh-e-renomear-repo.ps1`
- `.worktrees/`, `.superpowers/`
- Skills genéricas de cyber em `.cursor/skills/` listadas no `.gitignore` (não são código do produto)
- Exports JSON/CSV de produção, dumps de banco, planilhas baixadas

Scripts de **produto** versionados (ex.: `scripts/verify-*.mjs`, `backend/scripts/auditClassificacaoReplay.ts` sem prefixo `_`) são outra coisa — não confundir com rascunhos `_audit*`.

## 5. n8n obsoleto / com credenciais

Nunca:

- Workflows com credenciais, IDs reais, URLs, telefones ou planilhas de produção
- JSON de credencial n8n, service account Google, tokens de WhatsApp
- Workflows **inativos** / experimentos (Pluggy, PagBank API, EDI, etc.)

Pode ir no Git **somente** templates sanitizados em `n8n-workflows/` (credential-free, `active: false`, placeholders). Ver `scripts/sanitize-n8n-workflow.mjs`.

## 6. Nomes da equipe vs nomes de alunos

| Pode aparecer no Git | Nunca no Git |
| --- | --- |
| Papéis do produto (Secretária, Admin, gestão) | Nome real de aluno |
| Nome do mantenedor em commits/docs de processo, se já for público | Nome real de responsável / pagador |
| Personas **fictícias** em testes e seeds de demo | E-mail, telefone, documento de cliente |

Se a regra de negócio depende de pessoas reais (família, casal, exceção), a decisão fica no **Supabase**, não hardcoded no código público.

## Antes de commitar

1. Ler este arquivo.
2. Inventário: `git status` e `git diff --cached --stat` — conferir **cada** path.
3. Checklist rápido: segredos? PII? estágio/anexos? scripts `_tmp`/`_audit`? n8n com credencial? seed real?
4. Rodar **`npm run verify:commit`** (`node scripts/verify-forbidden-paths.mjs --staged-only`).
5. Se for push / publicar no site: **`npm run verify:push`** (ou `verify:push:quick`) e a skill `.cursor/skills/subir-alteracoes-site/SKILL.md`.
6. Base = `origin/main` limpa; branch + PR. **Sem force-push** em `main` sem pedido explícito.

## Se já foi commitado

1. Tirar do stage: `git restore --staged -- <path>` (ou equivalente).
2. Tirar do commit local **ainda não publicado** (amend/reset só no que você criou nesta branch, sem reescrever `main`).
3. Mover o arquivo para fora do Git (`Byla-Privado`) ou apagar a cópia local se for lixo.
4. Se **já foi para o GitHub**: parar. Rotacionar o segredo se vazou. **Não** fazer force-push em `main` sem o mantenedor pedir com essas palavras.
5. Avisar o mantenedor: o que vazou (tipo, não o valor), em qual commit/PR.

## Referências

- Rule: `.cursor/rules/nao-commitar-pii.mdc`
- Rule de publicação: `.cursor/rules/publicar-site-sem-pii.mdc`
- Skill: `.cursor/skills/nao-commitar-ou-vazar/SKILL.md`
- Skill de publicar: `.cursor/skills/subir-alteracoes-site/SKILL.md`
- Portão: `scripts/forbidden-git-paths.mjs`, `scripts/verify-forbidden-paths.mjs`
- `.gitignore` (bloco Local-only / PII)
- Spec: `docs/superpowers/specs/2026-07-25-publicar-site-sem-pii-design.md`
- `docs/SEGURANCA_E_PRIVACIDADE.md`, `SECURITY.md`
