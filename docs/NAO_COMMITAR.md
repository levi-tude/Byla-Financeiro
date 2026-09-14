# O que NUNCA pode ir para o Git (Byla Financeiro)

**Lista oficial.** Usar em todo **commit**, **push** ou **publicação no site**.

Repositório público = portfólio. Dados reais de clientes ficam no **Supabase** (app autenticado) ou em pasta **fora do Git** (ex.: `Byla-Privado`).

---

## 1. Segredos e credenciais

| Nunca commitar | Motivo |
|----------------|--------|
| `.env`, `.env.local`, `.env.production`, etc. | Chaves reais (Supabase, Google, IA, sync) |
| `**/service-account*.json`, `**/*.credentials.json` | Service account Google |
| `backend/n8n-byla-*.json` | Credencial n8n |
| Chaves PEM/PFX, tokens Pluggy/PagBank, API keys em código | Vazamento imediato |
| Valores reais em `.env.example` | Só nomes de variável + placeholders |

**Pode:** `backend/.env.example`, `frontend/.env.example` (sem valores reais).

---

## 2. PII — dados de pessoas reais

| Nunca commitar | Motivo |
|----------------|--------|
| Nomes reais de **alunos** ou **responsáveis** da operação Byla | LGPD / privacidade |
| E-mails, telefones, CPF/CNPJ de clientes | PII |
| Seeds SQL com cadastro real (`seed-modalidades-alunos*`, `seed-profiles-roles*`, etc.) | Dump de produção |
| JSON/CSV exportados do Supabase ou planilha com dados reais | Dump operacional |
| `backend/_tmp*.json` e similares | Exports locais de validação |

**Pode:** `scripts/seed-demo-synthetic.sql` e fixtures com nomes **claramente fictícios** (ex.: "Aluno Demo Um").

**Regra de negócio com pessoas reais** (grupos família/casal, mapeamentos): tabela/config no **Supabase**, não catálogo hardcoded no Git público.

---

## 3. Documentos pessoais e de estágio

| Nunca commitar | Motivo |
|----------------|--------|
| `docs/RELATORIO_PARCIAL*` (DOCX, PDF) | Relatório de estágio |
| `docs/anexos/` (contratos, prints, anexos I/II) | Documentos pessoais/empresa |
| `docs/PROMPT_*ESTAGIO*`, `docs/PROMPT_ANEXO*` | Prompts com contexto privado |
| `docs/AUDITORIA_CYBER*`, `docs/CYBER_SKILLS*`, `docs/HARDENING_*` | Inventário interno sensível |
| `docs/superpowers/audits/` com exports JSON de produção | Auditorias com dados reais |

**Pode:** docs curados de portfólio (`ARQUITETURA_PUBLICA.md`, `SEGURANCA_E_PRIVACIDADE.md`, specs de design sem PII).

---

## 4. Scripts e ferramentas só locais

| Nunca commitar | Motivo |
|----------------|--------|
| `backend/scripts/_audit*`, `_diag*`, `_check*`, `_list*` | Scripts de auditoria com dados reais |
| `scripts/_*` (prefixo underscore) | Utilitários locais / estágio |
| `scripts/build_anexo*`, `generate_relatorio*`, `merge_relatorio*` | Geração de relatório de estágio |
| `scripts/setup-gh-e-renomear-repo.ps1` | Setup local com contexto privado |

---

## 5. Integrações obsoletas / credenciais em workflow

| Nunca commitar | Motivo |
|----------------|--------|
| Workflows n8n com URLs/credenciais/IDs reais de produção | Vazamento operacional |
| `workflow-pluggy*`, `verificar-retorno-edi*`, EDI PagBank | Integrações descontinuadas com segredos |

**Pode:** templates em `n8n-workflows/*/workflow.template.json` + README (sem credenciais).

---

## 6. Nomes de equipe vs alunos

| Pode no Git (com cuidado) | Nunca no Git |
|---------------------------|--------------|
| Nomes de **funcionários/equipe** em regras de despesa (Nilson, etc.) — regra de negócio documentada | Nomes de **alunos** ou responsáveis reais em código, seeds ou testes |

---

## Antes de commit ou push

1. Ler esta lista (ou a skill `.cursor/skills/nao-commitar-ou-vazar/SKILL.md`).
2. `git status` — nada da tabela acima no stage.
3. `npm run verify:push` (push) ou `npm run verify:commit` (commit).
4. Publicação no site: também seguir `.cursor/skills/subir-alteracoes-site/SKILL.md`.

## Se algo sensível já foi commitado

- **Não** fazer push.
- Remover do stage, adicionar ao `.gitignore`, usar `git rm --cached` se já estava rastreado.
- Se já foi para o GitHub: rotacionar credenciais expostas e avaliar rewrite de histórico (só com aprovação explícita).

## Referências

- Regra Cursor: `.cursor/rules/nao-commitar-pii.mdc`
- Skill commit/push: `.cursor/skills/nao-commitar-ou-vazar/SKILL.md`
- Skill publicar site: `.cursor/skills/subir-alteracoes-site/SKILL.md`
- Spec: `docs/superpowers/specs/2026-07-25-publicar-site-sem-pii-design.md`
