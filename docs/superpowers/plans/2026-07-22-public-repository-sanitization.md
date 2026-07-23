# Public Repository Sanitization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o repositório `levi-tude/Byla-Financeiro` em um portfólio público sanitizado, sem derrubar o site, removendo PII, credenciais, docs internos e histórico sensível.

**Architecture:** Contenção (repo privado) → arquivo privado fora do Git → sanitização do estado atual → correções de segurança → modelos n8n didáticos → reescrita de histórico em clone separado → validação → reabertura pública. Spec: `docs/superpowers/specs/2026-07-21-public-repository-sanitization-design.md`.

**Tech Stack:** Git/GitHub (`gh`), Node.js/Express/React, Supabase, n8n, Vercel, Render, `git filter-repo`, Gitleaks, TruffleHog.

## Global Constraints

- Não imprimir segredos completos; mascarar no máximo 4 caracteres iniciais e finais.
- Não testar credenciais contra serviços externos.
- Não alterar workflows de produção no n8n nesta implementação.
- Não apagar arquivos em `Byla-Privado/revisar-para-exclusao/` sem aprovação explícita de Levi.
- Não executar force push nem tornar o repo público sem aprovação explícita de Levi.
- Não fazer commit de `.env`, chaves Google, `*.local` ou contrato/PDFs com PII.
- Licença pública: direitos reservados (somente visualização de portfólio).
- Ambiente demo (dados fictícios) é tratado em outra conversa; aqui só validar isolamento.
- Commits só quando Levi pedir; durante a execução, agrupar mudanças sanitizadas e pedir aprovação antes de cada commit/push sensível.

---

## File map (unidades e responsabilidades)

| Path | Responsabilidade |
|------|------------------|
| `C:\Users\55719\Byla-Privado\` | Arquivo privado fora do Git (guardar / revisar / inventário / backups) |
| `backend/src/routes/api.ts` | Adicionar `/entradas` ao guard `requireRoles(['admin'])` |
| `backend/src/routes/entradasAuth.test.ts` | Testes 401/403 das rotas `/entradas/*` |
| `backend/src/index.ts` | Limite JSON menor + CORS allowlist |
| `backend/src/middleware/syncSecret.ts` | Já existe; garantir uso em todas as rotas sync |
| `backend/src/middleware/rateLimit.ts` | Já existe localmente; aplicar nas rotas IA/sync |
| `backend/src/relatorios/sanitizePayloadForIa.ts` | Já existe localmente; garantir uso em relatórios |
| `scripts/seed-*.sql` | Substituir PII real por dados fictícios ou remover |
| `n8n-workflows/{supabase-to-google-sheets,google-sheets-to-supabase,room-rental-to-whatsapp}/` | Modelos públicos sanitizados |
| `docs/{ARQUITETURA_PUBLICA,SEGURANCA_E_PRIVACIDADE,DEPLOY_PUBLICO,DECISOES_TECNICAS,DEMONSTRACAO}.md` | Docs públicas curadas |
| `LICENSE` | Aviso de direitos reservados |
| `SECURITY.md` | Política de segurança pública |
| `.github/workflows/security-check.yml` | SHA pinning + scanners |
| `.gitleaks.toml` | Regras custom para UUID/hex |

---

### Task 1: Contenção — tornar o repositório privado

**Files:**
- None (apenas GitHub settings via `gh`)
- Create: `C:\Users\55719\Byla-Privado\inventario\estado-pre-limpeza.md` (sem segredos)

**Interfaces:**
- Consumes: nenhuma
- Produces: repositório `private`; inventário de URLs/serviços sem valores secretos

- [ ] **Step 1: Confirmar estado atual do deploy (sem valores secretos)**

Run:

```powershell
gh repo view levi-tude/Byla-Financeiro --json name,visibility,url,defaultBranchRef
gh api repos/levi-tude/Byla-Financeiro/deployments --jq ".[0:5] | .[] | {environment, created_at, description}"
```

Expected: `visibility` = `PUBLIC`; listar ambientes `Production` e `main - byla-backend`.

- [ ] **Step 2: Registrar inventário pré-limpeza**

Create `C:\Users\55719\Byla-Privado\inventario\estado-pre-limpeza.md` with only:

```markdown
# Estado pré-limpeza

- Repo: levi-tude/Byla-Financeiro
- Visibilidade anterior: public
- Branch: main
- Frontend URL: (colar URL pública Vercel)
- Backend URL: (colar URL pública Render)
- Data/hora UTC:
- Observação: valores de env NÃO registrados aqui
```

- [ ] **Step 3: Tornar o repositório privado**

Run:

```powershell
gh repo edit levi-tude/Byla-Financeiro --visibility private
gh repo view levi-tude/Byla-Financeiro --json visibility
```

Expected: `"visibility":"PRIVATE"`.

- [ ] **Step 4: Verificar que o site ainda responde**

Run:

```powershell
curl -I https://frontend-flame-mu-43.vercel.app
curl -I https://byla-backend.onrender.com/health
```

Expected: respostas HTTP (200/301/302 no frontend; 200 no health). Se falhar, **parar** e investigar sem reabrir o repo.

- [ ] **Step 5: Checkpoint**

Informar Levi: "Repo privado; site ainda online. Prosseguir para arquivo privado?"

---

### Task 2: Criar arquivo privado e inventário de arquivos

**Files:**
- Create dirs under `C:\Users\55719\Byla-Privado\`
- Create: `C:\Users\55719\Byla-Privado\inventario\mapa-arquivos.csv`

**Interfaces:**
- Consumes: árvore `docs/`, `n8n-workflows/`, `scripts/seed-*.sql`
- Produces: cópias verificadas + CSV origem→destino→hash→decisão

- [ ] **Step 1: Criar estrutura privada**

```powershell
New-Item -ItemType Directory -Force -Path @(
  'C:\Users\55719\Byla-Privado\guardar',
  'C:\Users\55719\Byla-Privado\revisar-para-exclusao',
  'C:\Users\55719\Byla-Privado\inventario',
  'C:\Users\55719\Byla-Privado\backups'
) | Out-Null
```

- [ ] **Step 2: Gerar inventário com hash (sem abrir segredos)**

```powershell
$root = 'C:\Users\55719\Byla-Landingpage'
$out = 'C:\Users\55719\Byla-Privado\inventario\mapa-arquivos.csv'
'origem,destino_sugerido,sha256,decisao' | Set-Content $out -Encoding utf8

$candidates = @(
  Get-ChildItem "$root\docs" -Recurse -File
  Get-ChildItem "$root\n8n-workflows" -Recurse -File
  Get-ChildItem "$root\scripts" -Filter 'seed*.sql' -File
)

foreach ($f in $candidates) {
  $rel = $f.FullName.Substring($root.Length + 1).Replace('\','/')
  $hash = (Get-FileHash $f.FullName -Algorithm SHA256).Hash
  $dest = if ($rel -match 'PLUGGY|PAGBANK|EDI|resp-|My-workflow|contrato|RELATORIO_.*ESTAGIO|seed-modalidades|seed-profiles') {
    'revisar-para-exclusao'
  } elseif ($rel -match '^docs/') {
    'guardar'
  } else {
    'revisar-para-exclusao'
  }
  Add-Content $out "$rel,$dest,$hash,pendente"
}
```

- [ ] **Step 3: Copiar para arquivo privado preservando caminhos relativos**

```powershell
$root = 'C:\Users\55719\Byla-Landingpage'
$priv = 'C:\Users\55719\Byla-Privado'
Import-Csv "$priv\inventario\mapa-arquivos.csv" | ForEach-Object {
  $src = Join-Path $root $_.origem
  $dst = Join-Path $priv $_.destino_sugerido $_.origem
  New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
  Copy-Item $src $dst -Force
}
```

- [ ] **Step 4: Verificar integridade (hash)**

```powershell
$root = 'C:\Users\55719\Byla-Landingpage'
$priv = 'C:\Users\55719\Byla-Privado'
$bad = @()
Import-Csv "$priv\inventario\mapa-arquivos.csv" | ForEach-Object {
  $dst = Join-Path $priv $_.destino_sugerido $_.origem
  $h = (Get-FileHash $dst -Algorithm SHA256).Hash
  if ($h -ne $_.sha256) { $bad += $_.origem }
}
if ($bad.Count) { throw "Hash mismatch: $($bad -join ', ')" } else { 'OK: hashes batem' }
```

Expected: `OK: hashes batem`.

- [ ] **Step 5: Pedir backup externo**

Pedir a Levi para copiar `C:\Users\55719\Byla-Privado` para um backup privado (OneDrive pessoal / disco externo / zip criptografado). **Não** continuar remoção até Levi confirmar: "backup feito".

---

### Task 3: Lista de exclusão definitiva (gate de aprovação)

**Files:**
- Create: `C:\Users\55719\Byla-Privado\inventario\lista-exclusao-definitiva.md`

**Interfaces:**
- Consumes: inventário da Task 2
- Produces: lista aprovável por Levi

- [ ] **Step 1: Montar lista proposta**

Incluir no mínimo:

```markdown
# Lista para exclusão definitiva (após cópia)

## n8n / integrações obsoletas
- n8n-workflows/My-workflow.json
- n8n-workflows/workflow-gerar-token-update-pluggy.json
- n8n-workflows/workflow-pluggy-supabase-corrigido.json
- n8n-workflows/workflow-pagbank-edi-para-supabase.json
- n8n-workflows/verificar-retorno-edi-pix.cjs
- n8n-workflows/pagbank-edi-*.json
- n8n-workflows/resp-*.json
- n8n-workflows/README-VERIFICAR-PIX.md
- docs/pluggy-connect-update.html
- docs/*PLUGGY*
- docs/*PAGBANK*
- docs/*EDI*

## Seeds com PII
- scripts/seed-modalidades-alunos-byla.sql
- scripts/seed-modalidades-alunos-byla-2026.sql
- scripts/seed-profiles-roles-byla-usuarios.sql

## Docs operacionais (sair do Git; já em guardar/)
- docs/CONFIGURAR_DOMINIO_E_HTTPS_N8N.md
- docs/CONFIGURAR_DOMINIO_E_HTTPS_N8N.docx
- docs/SUPABASE_PROJETO_BYLA.md
- docs/RELATORIO_TESTE_GESTAO_2026-05-26.md
- docs/RELATORIO_UAT_V2_FINAL.md
- (demais docs não curados — ver mapa-arquivos.csv)
```

- [ ] **Step 2: Gate — perguntar a Levi**

Perguntar: "Aprova esta lista de exclusão definitiva do GitHub (os arquivos já estarão no Byla-Privado)?"  
Só avançar após aprovação explícita.

---

### Task 4: Revogação Pluggy/PagBank + inventário de rotação

**Files:**
- Create: `C:\Users\55719\Byla-Privado\inventario\rotacao-credenciais.md` (somente nomes de variáveis, sem valores)

**Interfaces:**
- Consumes: decisão "não uso mais Pluggy/PagBank"
- Produces: checklist de revogação/rotação com status

- [ ] **Step 1: Criar checklist sem valores**

```markdown
# Rotação / revogação

| Item | Ação | Status | Quem |
|------|------|--------|------|
| Pluggy clientId/clientSecret | Revogar/excluir app no painel Pluggy | pendente | Levi |
| PagBank EDI user/token | Revogar no painel PagBank | pendente | Levi |
| Google service account (local) | Rotacionar chave se ainda usada | pendente | Levi |
| GEMINI_API_KEY / Groq / OpenRouter | Rotacionar se exposta em máquina | pendente | Levi |
| BYLA_SYNC_SECRET | Rotacionar após webhook protegido | pendente | Levi |
| SUPABASE_SERVICE_ROLE_KEY | Só se houver suspeita de vazamento | N/A ou pendente | Levi |
```

- [ ] **Step 2: Gate — ações manuais nos provedores**

Instruir Levi (sem colar secrets):

1. Painel Pluggy → revogar/excluir aplicação.
2. Painel PagBank → revogar token EDI.
3. Confirmar no chat: "Pluggy revogado" / "PagBank revogado".

- [ ] **Step 3: Não testar as chaves**

Não executar scripts que chamem Pluggy/PagBank com as chaves antigas.

---

### Task 5: Proteger `/api/entradas/*` (TDD)

**Files:**
- Create: `backend/src/routes/entradasAuth.test.ts`
- Modify: `backend/src/routes/api.ts` (lista do `requireRoles(['admin'])`)

**Interfaces:**
- Consumes: `attachAuthUser`, `requireRoles` de `backend/src/middleware/auth.ts`
- Produces: `/entradas` protegido; testes 401 sem auth

- [ ] **Step 1: Escrever teste que falha (401 sem Bearer)**

Create `backend/src/routes/entradasAuth.test.ts`:

```typescript
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import express from 'express';
import request from 'supertest';

/**
 * Sobe o router real de api.ts com auth enforce ligado.
 * Sem token → 401 em /api/entradas/*.
 */
describe('entradas authorization', () => {
  let app: express.Express;

  before(async () => {
    process.env.BYLA_AUTH_ENFORCE = 'true';
    // import dinâmico após setar env
    const { default: apiRoutes } = await import('./api.js');
    app = express();
    app.use(express.json());
    app.use('/api', apiRoutes);
  });

  const paths = [
    '/api/entradas/categorias',
    '/api/entradas/resumo',
    '/api/entradas/grupos',
  ];

  for (const path of paths) {
    it(`GET ${path} returns 401 without auth`, async () => {
      const res = await request(app).get(path);
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Autenticação obrigatória.');
    });
  }

  it('PUT /api/entradas/mapeamento returns 401 without auth', async () => {
    const res = await request(app).put('/api/entradas/mapeamento').send({});
    assert.equal(res.status, 401);
  });

  it('DELETE /api/entradas/mapeamento/fake-id returns 401 without auth', async () => {
    const res = await request(app).delete('/api/entradas/mapeamento/fake-id');
    assert.equal(res.status, 401);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha (hoje as rotas respondem ≠ 401)**

```powershell
cd C:\Users\55719\Byla-Landingpage\backend
npx tsx --test src/routes/entradasAuth.test.ts
```

Expected: FAIL (status ≠ 401) porque `/entradas` ainda não está no guard.

- [ ] **Step 3: Adicionar `/entradas` ao guard admin**

In `backend/src/routes/api.ts`, inside the admin `requireRoles` array (around lines 84–108), add `'/entradas'`:

```typescript
router.use(
  [
    '/validacao-pagamentos-diaria',
    '/calendario-financeiro',
    '/validacao-vinculos',
    '/conciliacao-vencimentos',
    '/fontes',
    '/transacoes',
    '/planilha-entrada-saida',
    '/despesas',
    '/entradas',
    '/saidas',
    '/categorias-banco',
    '/entidades-byla',
    '/relatorios',
    '/saidas/painel',
    '/dados-completos',
    '/planilha-fluxo-byla/abas',
    '/planilha-fluxo-byla/verificar-aba',
    '/planilha-fluxo-byla/debug-cabecalho',
    '/planilha-fluxo-byla/debug-linha-bruta',
    '/planilha-fluxo-byla/debug-range-completo',
    '/controle-caixa',
    '/migracao/fluxo/conferencia',
  ],
  requireRoles(['admin'])
);
```

- [ ] **Step 4: Rodar testes novamente**

```powershell
cd C:\Users\55719\Byla-Landingpage\backend
npx tsx --test src/routes/entradasAuth.test.ts
```

Expected: PASS (todas 401).

- [ ] **Step 5: Pedir commit a Levi (quando autorizado)**

Mensagem sugerida: `fix: require admin auth on /api/entradas routes`

---

### Task 6: Remover seeds com PII e criar seed sintético

**Files:**
- Delete from repo (after archive): `scripts/seed-modalidades-alunos-byla.sql`, `scripts/seed-modalidades-alunos-byla-2026.sql`, `scripts/seed-profiles-roles-byla-usuarios.sql`
- Create: `scripts/seed-demo-synthetic.sql`

**Interfaces:**
- Consumes: Task 2/3 aprovação
- Produces: seed público sem nomes reais

- [ ] **Step 1: Criar seed fictício**

```sql
-- seed-demo-synthetic.sql
-- Dados 100% fictícios para demonstração / portfólio.
-- NÃO usar nomes, e-mails ou valores de produção.

-- Exemplo mínimo — ajustar às tabelas reais do schema demo:
-- INSERT INTO public.alunos (id, nome) VALUES
--   (gen_random_uuid(), 'Aluno Demo Um'),
--   (gen_random_uuid(), 'Aluna Demo Dois');
```

Preencher apenas com nomes claramente fictícios (`Aluno Demo`, `Responsavel Exemplo`, `demo@example.com`). Zero CPF, telefone real ou e-mail pessoal.

- [ ] **Step 2: Remover seeds reais do working tree**

```powershell
Remove-Item -Force @(
  'C:\Users\55719\Byla-Landingpage\scripts\seed-modalidades-alunos-byla.sql',
  'C:\Users\55719\Byla-Landingpage\scripts\seed-modalidades-alunos-byla-2026.sql',
  'C:\Users\55719\Byla-Landingpage\scripts\seed-profiles-roles-byla-usuarios.sql'
)
```

Confirmar que as cópias existem em `Byla-Privado` antes.

- [ ] **Step 3: Grep de segurança**

```powershell
cd C:\Users\55719\Byla-Landingpage
rg -n "Nilza|Tatiana|levidavi|espacobyla@gmail|@gmail.com" scripts/
```

Expected: sem matches de PII real.

---

### Task 7: Remover Pluggy/PagBank e workflows inativos do estado atual

**Files:**
- Delete listed n8n/docs paths from working tree (já copiados)
- Keep only sources needed for Task 8 templates

**Interfaces:**
- Consumes: Task 3 approval
- Produces: working tree sem Pluggy/PagBank/EDI samples

- [ ] **Step 1: Remover arquivos obsoletos (lista mínima)**

```powershell
$toRemove = @(
  'n8n-workflows\My-workflow.json',
  'n8n-workflows\workflow-gerar-token-update-pluggy.json',
  'n8n-workflows\workflow-pluggy-supabase-corrigido.json',
  'n8n-workflows\workflow-pagbank-edi-para-supabase.json',
  'n8n-workflows\verificar-retorno-edi-pix.cjs',
  'n8n-workflows\pagbank-edi-campos-detalhes-pix.json',
  'n8n-workflows\pagbank-edi-financial-sample.json',
  'n8n-workflows\pagbank-edi-transactional-sample.json',
  'n8n-workflows\resp-cashouts-2025-02-05.json',
  'n8n-workflows\resp-cashouts-2025-02-18.json',
  'n8n-workflows\resp-financial-2025-02-05.json',
  'n8n-workflows\resp-financial-2025-02-18.json',
  'n8n-workflows\resp-transactional-2025-02-05.json',
  'n8n-workflows\resp-transactional-2025-02-18.json',
  'n8n-workflows\README-VERIFICAR-PIX.md',
  'docs\pluggy-connect-update.html'
)
foreach ($p in $toRemove) {
  $full = Join-Path 'C:\Users\55719\Byla-Landingpage' $p
  if (Test-Path $full) { Remove-Item $full -Force }
}
```

- [ ] **Step 2: Remover docs Pluggy/PagBank/EDI por glob (já arquivados)**

```powershell
cd C:\Users\55719\Byla-Landingpage\docs
Get-ChildItem -File | Where-Object {
  $_.Name -match 'PLUGGY|PAGBANK|EDI_'
} | Remove-Item -Force
```

- [ ] **Step 3: Confirmar ausência de clientSecret/PAGBANK_EDI_TOKEN no tree**

```powershell
cd C:\Users\55719\Byla-Landingpage
rg -n "clientSecret|PAGBANK_EDI_TOKEN|PAGBANK_EDI_USER" --glob '!**/node_modules/**' --glob '!**/Byla-Privado/**'
```

Expected: sem matches (ou só menções genéricas em docs públicos novos, sem valores).

---

### Task 8: Criar três workflows-modelo sanitizados

**Files:**
- Create: `n8n-workflows/README.md` (reescrever)
- Create: `n8n-workflows/supabase-to-google-sheets/{README.md,workflow.template.json}`
- Create: `n8n-workflows/google-sheets-to-supabase/{README.md,workflow.template.json}`
- Create: `n8n-workflows/room-rental-to-whatsapp/{README.md,workflow.template.json}`
- Delete after templates exist: JSONs ativos originais no root de `n8n-workflows/` (arquivados)

**Interfaces:**
- Consumes: lógica dos workflows ativos (export/import/WhatsApp)
- Produces: templates `active:false` sem IDs/credenciais/URLs reais

- [ ] **Step 1: Criar pastas**

```powershell
$base = 'C:\Users\55719\Byla-Landingpage\n8n-workflows'
foreach ($d in @('supabase-to-google-sheets','google-sheets-to-supabase','room-rental-to-whatsapp')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $base $d) | Out-Null
}
```

- [ ] **Step 2: Escrever sanitizer local (script único)**

Create `scripts/sanitize-n8n-workflow.mjs`:

```javascript
import fs from 'node:fs';

const src = process.argv[2];
const dest = process.argv[3];
const name = process.argv[4] || 'Demo workflow';

const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
delete raw.id;
delete raw.versionId;
delete raw.meta;
delete raw.pinData;
raw.name = name;
raw.active = false;
raw.tags = [];

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'credentials') continue;
      if (k === 'id' && typeof v === 'string') {
        out[k] = 'NODE_ID_PLACEHOLDER';
        continue;
      }
      if (typeof v === 'string') {
        let s = v
          .replace(/https?:\/\/[^\s"'\\]+/g, 'https://example.com')
          .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '00000000-0000-4000-8000-000000000000')
          .replace(/n8n\.espacobyla\.online/gi, 'n8n.example.com')
          .replace(/espacobyla/gi, 'example-org');
        if (/secret|token|apikey|authorization/i.test(k)) s = '{{$env.SECRET_PLACEHOLDER}}';
        out[k] = s;
        continue;
      }
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
}

const clean = scrub(raw);
fs.writeFileSync(dest, JSON.stringify(clean, null, 2));
console.log('wrote', dest);
```

- [ ] **Step 3: Gerar os três templates a partir dos ativos**

```powershell
cd C:\Users\55719\Byla-Landingpage
node scripts/sanitize-n8n-workflow.mjs `
  "n8n-workflows/workflow-supabase-webhook-google-sheets-export.json" `
  "n8n-workflows/supabase-to-google-sheets/workflow.template.json" `
  "Demo - Supabase to Google Sheets"

node scripts/sanitize-n8n-workflow.mjs `
  "n8n-workflows/BYLA - Planilha Google para Supabase (transações) - CORRIGIDO OK.json" `
  "n8n-workflows/google-sheets-to-supabase/workflow.template.json" `
  "Demo - Google Sheets to Supabase"

node scripts/sanitize-n8n-workflow.mjs `
  "n8n-workflows/workflow-aluguel-salas-whatsapp.json" `
  "n8n-workflows/room-rental-to-whatsapp/workflow.template.json" `
  "Demo - Room rental to WhatsApp"
```

- [ ] **Step 4: Validar ausência de segredos nos templates**

```powershell
rg -n "clientSecret|credentials|espacobyla|AIza|eyJ|BEGIN PRIVATE|PAGBANK|pluggy" n8n-workflows/*/workflow.template.json
```

Expected: sem matches de segredos/domínios reais. Se restar algo, scrub manual.

- [ ] **Step 5: Escrever READMEs didáticos**

Cada README (`n8n-workflows/<pasta>/README.md`) deve ter seções fixas:

```markdown
# <Nome do fluxo>

## Objetivo
## Gatilho
## Fluxo de dados (passos)
## Validações
## Idempotência
## Tratamento de erros
## Credenciais necessárias (tipos, nunca valores)
## Segurança
## Como importar este modelo
```

Reescrever `n8n-workflows/README.md` listando só os três modelos e avisando que são didáticos/`active:false`.

- [ ] **Step 6: Remover JSONs operacionais do Git (já arquivados)**

Remover do working tree os JSON/README operacionais antigos que não forem templates públicos, **sem** tocar no n8n de produção.

---

### Task 9: Documentação pública curada + LICENSE

**Files:**
- Create/Replace: `README.md`, `SECURITY.md`, `LICENSE`
- Create: `docs/ARQUITETURA_PUBLICA.md`, `docs/SEGURANCA_E_PRIVACIDADE.md`, `docs/DEPLOY_PUBLICO.md`, `docs/DECISOES_TECNICAS.md`, `docs/DEMONSTRACAO.md`
- Remove from Git (já em `Byla-Privado/guardar`): restante de `docs/` operacional

**Interfaces:**
- Consumes: decisões da spec
- Produces: docs públicos sem IPs, IDs, PII, regras de repasse

- [ ] **Step 1: LICENSE (direitos reservados)**

```text
Copyright (c) 2026 Levi Davi / Espaço Byla (conforme autorização escrita).

All rights reserved.

This repository is published for portfolio review only.
No license is granted to copy, modify, distribute, or use this software
in production or for commercial purposes without prior written permission.
```

- [ ] **Step 2: README público**

Deve conter: o que é o projeto, stack, como rodar local com `.env.example`, aviso de dados fictícios, link para docs curadas, aviso de direitos reservados, e que demos não usam dados reais.

- [ ] **Step 3: Docs curadas**

Cada arquivo público deve evitar: IP de servidor, IDs de Sheets, URLs internas, nomes de alunos, faixas de repasse, CNPJ/CPF, e-mails pessoais.

- [ ] **Step 4: Remover docs não curados do working tree**

Manter apenas a lista curada + `docs/superpowers/specs/` e `docs/superpowers/plans/` desta sanitização. Todo o resto já deve estar em `Byla-Privado`.

- [ ] **Step 5: Gate — Levi revisa conteúdo público**

Perguntar aprovação do pacote de docs antes de seguir para history rewrite.

---

### Task 10: Hardening backend (payload, CORS, rate limit, PII IA)

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/src/routes/relatorios.ts`, `backend/src/routes/planilhaEntradaSaida.ts`, `backend/src/routes/aiAssistant.ts` (aplicar middlewares já existentes)
- Verify: `backend/src/relatorios/sanitizePayloadForIa.ts`, `backend/src/middleware/rateLimit.ts`, `backend/src/middleware/syncSecret.ts`

**Interfaces:**
- Consumes: `rateLimit()`, `sanitizePayloadForIa()`, `requireSyncSecret()`
- Produces: API mais resistente a abuso e vazamento

- [ ] **Step 1: Reduzir limite JSON global**

In `backend/src/index.ts`:

```typescript
const jsonBodyLimit = (process.env.BYLA_JSON_BODY_LIMIT ?? '1mb').trim() || '1mb';
app.use(express.json({ limit: jsonBodyLimit }));
```

Rotas sync que precisam de body grande devem declarar `express.json({ limit: '8mb' })` **depois** de `requireSyncSecret`, ou usar limite por rota.

- [ ] **Step 2: CORS allowlist**

Remover o branch `origin.endsWith('.vercel.app')`. Aceitar apenas:

- origens em `config.corsOrigin`
- localhost **somente** se `NODE_ENV !== 'production'`

- [ ] **Step 3: Garantir rate limit + sanitize em relatórios/IA**

Confirmar que rotas de geração IA chamam `sanitizePayloadForIa` antes do prompt e usam `rateLimit({ windowMs: 60_000, max: 10, name: 'ia' })` (valores ajustáveis via env já documentados em `.env.example`).

- [ ] **Step 4: Rodar testes backend**

```powershell
cd C:\Users\55719\Byla-Landingpage\backend
npm test
```

Expected: pass.

---

### Task 11: CI/security scanning

**Files:**
- Modify: `.github/workflows/security-check.yml`
- Create: `.gitleaks.toml`

**Interfaces:**
- Consumes: Task 7/8 tree limpa
- Produces: CI com checkout/setup pinados + gitleaks

- [ ] **Step 1: Criar `.gitleaks.toml` com regras custom**

```toml
title = "Byla Financeiro"

[[rules]]
id = "pluggy-uuid-pair"
description = "Possible Pluggy-style UUID client secret"
regex = '''(?i)clientSecret["'\s:=]+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'''

[[rules]]
id = "pagbank-edi-hex"
description = "Possible PagBank EDI hex token fallback"
regex = '''(?i)PAGBANK_EDI_TOKEN[^\n]{0,40}\|\|[^\n]{0,10}[0-9a-f]{32}'''
```

- [ ] **Step 2: Atualizar workflow com SHA pinning + gitleaks**

Substituir tags `actions/checkout@v4` / `setup-node@v4` por SHAs imutáveis da release atual no momento da implementação (consultar releases oficiais e colar SHAs reais no PR).

Adicionar step:

```yaml
- name: Gitleaks
  uses: gitleaks/gitleaks-action@<PINNED_SHA>
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 3: Rodar gitleaks local no working tree**

```powershell
gitleaks detect --source . --config .gitleaks.toml --no-git
```

Expected: 0 leaks (ou findings justificados documentados).

---

### Task 12: Remover docs restantes + limpar `.env.example`

**Files:**
- Modify: `backend/.env.example`, `frontend/.env.example`
- Ensure no real IDs/sheet names/business formulas

- [ ] **Step 1: Auditar `.env.example`**

```powershell
rg -n "flbimm|espacobyla|AIza|eyJ|clientSecret|[0-9a-f]{32}" backend/.env.example frontend/.env.example
```

Expected: sem valores reais. Substituir qualquer ID de planilha por `YOUR_SHEET_ID`.

- [ ] **Step 2: Remover regras financeiras detalhadas de exemplos**

Se `backend/.env.example` listar faixas/percentuais de repasse reais, generalizar para placeholders (`PARTNER_SHARE_EXAMPLE=0.5`).

---

### Task 13: Backup Git + reescrita de histórico em clone separado

**Files:**
- Operate on: `C:\Users\55719\Byla-Privado\backups\Byla-Financeiro-mirror.git`
- Work clone: `C:\Users\55719\Byla-Privado\backups\Byla-Financeiro-filter\`

**Interfaces:**
- Consumes: working tree sanitizado commitado (após aprovação)
- Produces: histórico reescrito pronto para force push (ainda sem push)

- [ ] **Step 1: Gate — commits sanitizados no working tree**

Antes de reescrever, o estado sanitizado precisa estar commitado na branch de trabalho (pedir a Levi autorização de commit(s) de sanitização).

- [ ] **Step 2: Mirror backup offline**

```powershell
git clone --mirror https://github.com/levi-tude/Byla-Financeiro.git `
  C:\Users\55719\Byla-Privado\backups\Byla-Financeiro-mirror.git
```

- [ ] **Step 3: Clone de trabalho para filter-repo**

```powershell
git clone C:\Users\55719\Byla-Privado\backups\Byla-Financeiro-mirror.git `
  C:\Users\55719\Byla-Privado\backups\Byla-Financeiro-filter
cd C:\Users\55719\Byla-Privado\backups\Byla-Financeiro-filter
```

- [ ] **Step 4: Remover caminhos sensíveis do histórico**

```powershell
# Exige git-filter-repo instalado
git filter-repo --invert-paths `
  --path n8n-workflows/My-workflow.json `
  --path n8n-workflows/workflow-gerar-token-update-pluggy.json `
  --path n8n-workflows/workflow-pluggy-supabase-corrigido.json `
  --path n8n-workflows/verificar-retorno-edi-pix.cjs `
  --path scripts/seed-modalidades-alunos-byla.sql `
  --path scripts/seed-modalidades-alunos-byla-2026.sql `
  --path scripts/seed-profiles-roles-byla-usuarios.sql `
  --path docs/CONFIGURAR_DOMINIO_E_HTTPS_N8N.md `
  --path docs/CONFIGURAR_DOMINIO_E_HTTPS_N8N.docx
```

Expandir a lista com **todos** os paths da lista aprovada na Task 3 (usar arquivo de paths se necessário: `--paths-from-file`).

- [ ] **Step 5: Escanear histórico novo**

```powershell
gitleaks detect --source . --config .gitleaks.toml
# se trufflehog disponível:
trufflehog git file://. --only-verified=false
```

Expected: 0 findings críticos.

- [ ] **Step 6: Gate — aprovação de force push**

Mostrar a Levi: commits reescritos, scanners limpos, e pedir: "Autorizo force push do histórico reescrito".

**NÃO executar o push nesta task.**

---

### Task 14: Force push coordenado + verificação de deploy

**Files:** none (remoto)

- [ ] **Step 1: Só após aprovação explícita**

```powershell
cd C:\Users\55719\Byla-Privado\backups\Byla-Financeiro-filter
git remote add origin https://github.com/levi-tude/Byla-Financeiro.git
git push --force --all origin
git push --force --tags origin
```

- [ ] **Step 2: Monitorar deploys**

```powershell
gh api repos/levi-tude/Byla-Financeiro/deployments --jq ".[0:3]"
curl -I https://frontend-flame-mu-43.vercel.app
curl -I https://byla-backend.onrender.com/health
```

- [ ] **Step 3: Instruir re-clone local**

Avisar Levi para arquivar o working tree antigo e clonar de novo (o histórico local antigo ficou obsoleto).

---

### Task 15: Hardening GitHub + Supabase (pós-push)

**Files:** none / settings

- [ ] **Step 1: Proteger `main`**

```powershell
gh api repos/levi-tude/Byla-Financeiro/branches/main/protection -X PUT -f required_status_checks='{"strict":true,"contexts":["verify"]}' -F enforce_admins=true -F allow_force_pushes=false -F allow_deletions=false
```

(Ajustar payload conforme API atual se necessário.)

- [ ] **Step 2: Confirmar secret scanning + push protection on**

```powershell
gh api repos/levi-tude/Byla-Financeiro --jq "{secret_scanning: .security_and_analysis.secret_scanning.status, push_protection: .security_and_analysis.secret_scanning_push_protection.status}"
```

- [ ] **Step 3: Habilitar HIBP no Supabase**

Usar script/dashboard já preparado (`scripts/configure-supabase-auth.mjs` ou painel Auth). Não logar tokens.

---

### Task 16: Auditoria final + reabertura pública

**Files:**
- Update: canvas/auditoria se necessário (opcional)

- [ ] **Step 1: Checklist de revalidação**

Confirmar um a um (spec §10):

- [ ] sem segredo/PII no tree
- [ ] sem segredo/PII no histórico (scanners)
- [ ] `/api/entradas` 401 sem auth
- [ ] 3 templates n8n `active:false` sanitizados
- [ ] docs curadas apenas
- [ ] LICENSE direitos reservados
- [ ] site e API saudáveis
- [ ] demo isolada (validação cruzada com a outra conversa)
- [ ] branch protection on

- [ ] **Step 2: Gate — reabrir**

Perguntar: "Autorizo tornar o repositório público novamente?"

Só então:

```powershell
gh repo edit levi-tude/Byla-Financeiro --visibility public
gh repo view levi-tude/Byla-Financeiro --json visibility
```

Expected: `PUBLIC`.

- [ ] **Step 3: Mensagem final a Levi**

Resumir o que ficou público, o que ficou em `Byla-Privado`, e lembrar que clones/caches antigos ainda podem ter dados — não republicar backups sensíveis.

---

## Self-review (plan vs spec)

| Spec section | Task coverage |
|--------------|---------------|
| §2 repo privado temporário | Task 1 |
| §4.2 arquivo privado + backup | Task 2 |
| §12 lista exclusão | Task 3 |
| §7 revogação Pluggy/PagBank | Task 4 |
| §6.1 `/entradas` + testes | Task 5 |
| §6.1 seeds PII | Task 6 |
| §5/§2 remover Pluggy/PagBank | Task 7–8 |
| §4.1 docs curadas + LICENSE | Task 9 |
| §6.1–6.2 hardening API | Task 10–11 |
| §8 history rewrite | Task 13–14 |
| §9–10 deploy + reopen | Task 14–16 |
| Demo isolada | Task 16 (validação cruzada; implementação noutra conversa) |

Placeholders scan: SHAs das GitHub Actions devem ser preenchidos na execução com valores reais da release atual (não inventar). Nenhum segredo real no plano.
