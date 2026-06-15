# Plano de deploy — API BYLA no Render (execução por fases)

Este documento é o **roteiro único** para publicar o backend e ligar o n8n. Cada fase tem **critério de passagem** (gate): só avance quando o gate estiver verde.

---

## Objetivo

- Serviço **`byla-backend`** no Render com URL pública HTTPS.
- **Health** em `GET /health`.
- **n8n** (`https://n8n.espacobyla.online/`) com credencial **Header Auth** (`X-Byla-Sync-Secret` = `BYLA_SYNC_SECRET` do Render).

---

## Fase A — Repositório (IaC)

| # | Ação | Gate (obrigatório) |
|---|------|----------------------|
| A1 | Arquivo **`render.yaml`** na **raiz** do repo (já versionado). | `render.yaml` existe e define `buildCommand` / `startCommand` em `backend/`. |
| A2 | Branch de deploy = **`main`**. | `git branch` mostra `main` como branch de trabalho. |
| A3 | **`render.yaml` commitado** e **push** para `origin/main`. | GitHub mostra `render.yaml` na web no último commit. |

**Link Blueprint (após A3):**  
[Abrir Blueprint no Render](https://dashboard.render.com/blueprint/new?repo=https://github.com/levi-tude/Byla-Financeiro)

---

## Fase B — Verificação local (automatizada)

Rodar na pasta `backend`:

```bash
npm run verify:render-deploy
```

| Gate | Esperado |
|------|----------|
| B1 | `tsc` conclui sem erro. |
| B2 | Script imprime checklist de variáveis (sem vazar segredos). |

Se falhar, **não** abra o Blueprint no Render até corrigir o build.

---

## Fase C — Painel Render (manual, uma vez)

1. Login em [dashboard.render.com](https://dashboard.render.com).
2. **New → Blueprint** (ou link da Fase A).
3. Autorizar **GitHub** e selecionar repo **`levi-tude/Byla-Financeiro`**.
4. Revisar serviço **`byla-backend`**.
5. Preencher **todas** as variáveis com `sync: false` (segredos):

| Variável | Origem típica |
|----------|----------------|
| `SUPABASE_URL` | `backend/.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → **Project Settings → API → service_role** (recomendado em produção). Se no `.env` local só existir anon, crie/copie a service role **só para o painel Render** — não commite. |
| `GOOGLE_SHEETS_ENTRADA_SAIDA_ID` | `backend/.env` |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ID da planilha **FLUXO DE CAIXA BYLA** (igual ao local). Sem isso, telas que unem alunos/modalidades com planilha falham em produção. |
| `GOOGLE_SHEETS_FLUXO_ID` | ID da planilha **CONTROLE DE CAIXA** (igual ao local). |
| `GOOGLE_SHEETS_FLUXO_RANGE` | Opcional (ex.: `MARÇO 26!A:Z`). Se vazio, o backend usa padrão. |
| `GOOGLE_SHEETS_CREDENTIALS_JSON` | Conteúdo JSON da service account (uma string; no Windows, minificar JSON numa linha ou colar no painel). |
| `BYLA_SYNC_SECRET` | Senha forte **iguais** no Render e no n8n. |
| `GEMINI_API_KEY` | Opcional (só relatórios IA). |

6. **Apply** e aguardar status **Live** (pode levar vários minutos no plano free).

**Gate C1:** deploy conclui sem erro de build.

---

## Fase D — Pós-deploy (smoke tests)

Substitua `BASE` pela URL do Render (ex.: `https://byla-backend-xxxx.onrender.com`).

| # | Teste | Gate |
|---|--------|------|
| D1 | Navegador ou curl: `BASE/health` | JSON com `status` ok / serviço vivo. |
| D2 | `curl -sS -o NUL -w "%{http_code}" BASE/api/...` não deve ser 404 no root do serviço | (Opcional) |

**Gate D:** `/health` retorna 200.

---

## Fase E — n8n

| # | Ação |
|---|------|
| E1 | Credencial **Header Auth** no n8n: nome do header **`X-Byla-Sync-Secret`**, valor = mesmo **`BYLA_SYNC_SECRET`** do Render (ver `n8n-workflows/HOST_ENV_BYLA.md`). |
| E2 | Importar / atualizar o workflow; mapear a credencial no node **HTTP POST montar-linhas**. URL padrão no JSON = `BASE` (Render). |
| E3 | Executar workflow de teste e conferir linha na planilha **Movimentações**. |

**Por quê:** o segredo fica só nas **Credentials** do n8n; não depende de variável no Docker.

---

## Fase G — Frontend (painel Vite)

| # | Ação | Gate |
|---|------|------|
| G1 | No **`frontend/.env`** (não commitar), defina **`VITE_BACKEND_URL=https://byla-backend.onrender.com`** (sem `/` no fim). | Telas que usam `backendApi` deixam de acusar “VITE_BACKEND_URL não configurado”. |
| G2 | **`npm run dev`** de novo (Vite só lê `.env` ao subir). | Alunos / conciliação / fontes batem no Render. |
| G3 | Se o painel for publicado em **domínio próprio** (ex.: Vercel), inclua a **origem exata** (`https://seu-dominio.com`) em **`CORS_ORIGIN`** no serviço Render (Environment → editar `CORS_ORIGIN`, vírgula entre origens). | Browser não bloqueia por CORS. |

**Por quê:** o cliente HTTP usa `import.meta.env.VITE_BACKEND_URL` (`frontend/src/services/backendApi.ts`). Em produção build (`vite build`), só entram variáveis com prefixo `VITE_` definidas **no ambiente de build** (CI) ou no `.env` local na hora do build.

---

## Fase F — Falhas comuns (tabela rápida)

| Sintoma | Causa provável |
|---------|----------------|
| Build falha com `tsc` | Dependência ou erro TS; rodar `npm run build` local. |
| 503 `BYLA_SYNC_SECRET não configurado` | Secret não setado no Render ou nome errado. |
| CORS no n8n | Ajustar `CORS_ORIGIN` no Render (já inclui n8n no blueprint). |
| Google Sheets não escreve | JSON da service account inválido ou planilha sem permissão para o e-mail da SA. |
| Serviço “dorme” (free) | Primeira requisição após idle pode demorar ~1 min — normal no free tier. |

---

## Ordem de execução para o agente (automação)

1. Rodar `npm run verify:render-deploy` em `backend/`.  
2. Garantir `render.yaml` + este plano rastreados no git.  
3. Informar o humano: **push obrigatório** → link Blueprint → preencher secrets → testar `/health`.  
4. Não expor API keys em commits ou no chat.

---

## Limitações honestas

- **Push para GitHub** e **cliques no Render** exigem conta humana ou token já configurado na máquina.  
- O agente **não** substitui OAuth do GitHub no Render na primeira vez.
