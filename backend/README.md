# Backend Byla – Supabase + Planilhas

API que une **Supabase** (fonte principal para extrato/saldo) e **planilhas Google** (complemento para alunos, modalidades e pendências). Regras em `docs/REGRAS_FONTES_SUPABASE_PLANILHAS.md`.

## Objetivo

- Rotas de **alunos**, **modalidades** e **pendências** leem Supabase + Google Sheets e devolvem dados combinados (planilhas prevalecem quando há dados).
- **Extrato, saldo, entradas** continuam só no Supabase; o front pode chamar o Supabase direto para essas telas.

## Variáveis de ambiente

Crie um arquivo `.env` na pasta `backend/` (não versionado). Exemplo:

```env
PORT=3001
CORS_ORIGIN=http://localhost:5173

# Supabase (obrigatório para dados do banco)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
# Ou use anon: SUPABASE_ANON_KEY=sua_anon_key

# Google Sheets – duas planilhas (harmonia: ambas + Supabase – ver docs/HARMONIA_FONTES_DADOS.md)
# 1) FLUXO DE CAIXA BYLA: alunos, aba ATENDIMENTOS; opcional: abas Modalidades, Pendencias
GOOGLE_SHEETS_SPREADSHEET_ID=id_da_planilha_fluxo_byla
GOOGLE_SHEETS_ALUNOS_RANGE=ATENDIMENTOS!A:Z
# true = ler todas as abas da planilha (cada modalidade); false = só a aba acima
GOOGLE_SHEETS_ALUNOS_TODAS_ABAS=true
# 2) CONTROLE DE CAIXA: totais do mês (entrada, saída, lucro). Aba M = dados do mês M-1 (fechamento)
GOOGLE_SHEETS_FLUXO_ID=id_da_planilha_controle_caixa
GOOGLE_SHEETS_FLUXO_RANGE=MARÇO 26!A:Z
# Pares de colunas (0-based): 0-1,2-3,4-5,7-8 = A-B, C-D, E-F, H-I (pula G). Opcional; padrão acima.
# GOOGLE_SHEETS_FLUXO_PARES_COLUNAS=0-1,2-3,4-5,7-8

# Credenciais (uma para as duas; dê acesso de Viewer às duas planilhas ao e-mail do Service Account)
GOOGLE_SHEETS_CREDENTIALS_JSON={"type":"service_account",...}
# ou GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# Ranges adicionais da planilha FLUXO BYLA (opcional; padrão Modalidades/Pendencias se não existir aba)
GOOGLE_SHEETS_MODALIDADES_RANGE=Modalidades!A:Z
GOOGLE_SHEETS_PENDENCIAS_RANGE=Pendencias!A:Z

# IA para relatórios (Relatórios IA no painel). Use uma das duas:
# Grátis: chave em https://aistudio.google.com/app/apikey
GEMINI_API_KEY=sua_chave_gemini_aqui
# Ou pago (OpenAI):
# OPENAI_API_KEY=sk-...
```

- **SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY:** em [Supabase](https://supabase.com/dashboard) → Project Settings → API (URL e `service_role` key; não exponha no front).
- **GOOGLE_SHEETS_SPREADSHEET_ID:** na URL da planilha: `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`.
- **Credenciais Google:** [Google Cloud Console](https://console.cloud.google.com/) → criar Service Account → baixar JSON → dar acesso de “Viewer” à planilha para o e-mail do Service Account.

## Como rodar

```bash
cd backend
npm install
npm run dev
```

Servidor em `http://localhost:3001` (ou `PORT` do `.env`). Build: `npm run build`; produção: `npm run start`.

## Rotas expostas

| Método | Rota | Descrição |
|--------|------|------------|
| GET | `/health` | Saúde do serviço. |
| GET | `/api/fontes` | **Status das fontes:** Supabase + planilha 1 (FLUXO BYLA) + planilha 2 (CONTROLE DE CAIXA). Usado para garantir que as duas planilhas e o Supabase estão acessíveis. |
| GET | `/api/planilha-fluxo-byla/abas` | Lista os nomes de todas as abas da planilha FLUXO DE CAIXA BYLA (para análise/config). |
| GET | `/api/planilha-fluxo-byla/verificar-aba?aba=PILATES%20MARINA` | Verifica a leitura de uma aba: retorna `rowCount`, `ativos`, `inativos`, `colunas`, `amostra` (10 primeiras linhas). Use para conferir se os dados da planilha estão 100% no sistema. |
| GET | `/api/dados-completos` | Supabase (atividades) + planilha; retorna `supabase`, `planilha`, `combinado`, `regra_usada`. |
| GET | `/api/alunos-completo` | Alunos: planilha 1 (todas as abas se ALUNOS_TODAS_ABAS=true, senão só ATENDIMENTOS); fallback Supabase. Retorna `abas_lidas` quando multi-aba. |
| GET | `/api/modalidades-completo` | Modalidades: planilha 1 prevalece; fallback Supabase. |
| GET | `/api/pendencias-completo` | Pendências: planilha 1 prevalece; fallback Supabase. |
| GET | `/api/fluxo-completo` | Planilha 2 (CONTROLE DE CAIXA): entrada/saída/lucro do mês. Query: `?mes=3&ano=2026`. |

Respostas em JSON. Erros com status 4xx/5xx.

## Regras de merge

Ver **`docs/REGRAS_FONTES_SUPABASE_PLANILHAS.md`**: extrato/saldo = só Supabase; alunos, matriculados, modalidades e pendências = planilhas complementam ou prevalecem.

## Arquitetura (Clean Architecture / DDD)

- **`src/domain/`** – Entidades e value objects (MesAno, OrigemDados, FluxoPlanilhaTotais); sem dependências de framework.
- **`src/ports/`** – Interfaces (IAlunosRepository, IPlanilhaAlunosRepository, IPlanilhaRangeRepository, IAtividadesRepository, IPendenciasRepository, IFluxoPlanilhaRepository).
- **`src/adapters/`** – Implementações (Supabase alunos/atividades/pendências; planilhas FLUXO BYLA e CONTROLE DE CAIXA; cache TTL para fluxo).
- **`src/useCases/`** – Casos de uso (GetAlunosCompletoUseCase, GetModalidadesCompletoUseCase, GetPendenciasCompletoUseCase, GetFluxoCompletoUseCase); as rotas chamam os use cases.
- **Testes:** `npm run test` (merge e regras de prioridade planilha/Supabase).

Contextos e trade-offs: **`docs/BOUNDED_CONTEXTS_BYLA.md`**, **`docs/TRADE-OFFS_ARQUITETURA.md`**.

### Cache (planilha fluxo)

- Leitura da planilha CONTROLE DE CAIXA é cacheada em memória (TTL padrão 5 min).
- Variável opcional no `.env`: **`FLUXO_PLANILHA_CACHE_TTL_MS`** (em ms; ex.: `300000` = 5 min).
