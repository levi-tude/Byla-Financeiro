# Byla - Painel Financeiro e Operacional

Aplicacao para controle financeiro e operacional da Byla, com:

- frontend em React/TypeScript para operacao diaria;
- backend em Node/Express para consolidar regras de negocio;
- integracao de dados com Supabase e Google Sheets.

## Uso rapido do agente (sempre visivel)

- Guia fixo de prompts: `docs/PROMPTS_USO_CURSOR.md`
- Dica: abra esse arquivo no inicio do dia e copie os blocos "Abertura do dia" e "Prompt padrao por tarefa".

## Arquitetura resumida

- `frontend/`: painel (visao geral, conciliacao, validacao, relatorios, calendario). Usa TanStack Query em hooks de backend para cache e estado de carregamento.
- `backend/`: APIs de consolidacao, regras de conciliacao e relatorios, com validacao centralizada (Zod).
- `docs/`: diretrizes de negocio, arquitetura, operacao, decisoes e historico de mudancas.

### Backend — rotas (`backend/src/routes/`)

O arquivo `api.ts` apenas monta os routers; cada area tem seu modulo:

- `calendario.ts` — calendario financeiro
- `conciliacao.ts` — validacao diaria, conciliacao por vencimento
- `relatorios.ts` — relatorios + IA (factory com fluxo)
- `planilhaFluxoByla.ts` — debug e pagamentos por aba
- `fontes.ts`, `transacoes.ts`, `despesas.ts` — status das fontes e listagens Supabase
- `cadastroCompleto.ts` — dados-completos, endpoints *-completo e fluxo-completo

## Como rodar

### 1) Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Backend padrao: `http://localhost:3001`.

### 2) Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend padrao: `http://localhost:5174`.

## Requisitos de ambiente

- Node.js 18+
- Credenciais Supabase configuradas no backend e/ou frontend
- Credenciais Google Sheets para endpoints que leem planilhas

## Documentacao recomendada (ordem)

1. `docs/ARQUITETURA_SISTEMA_BYLA.md`
2. `docs/CONTRATOS_OPERACAO_QUALIDADE_BYLA.md`
3. `docs/API_CONTRATOS.md`
4. `docs/REGRAS_FONTES_SUPABASE_PLANILHAS.md`
5. `docs/DECISOES_ARQUITETURAIS_ADR.md`
6. `docs/EVOLUCAO_E_MUDANCAS_BYLA.md`
7. `docs/INDEX.md`

## Scripts uteis

- Backend typecheck: `cd backend && npx tsc --noEmit`
- Backend testes: `cd backend && npm test`
- Frontend typecheck: `cd frontend && npx tsc --noEmit`
- Frontend build: `cd frontend && npm run build`
