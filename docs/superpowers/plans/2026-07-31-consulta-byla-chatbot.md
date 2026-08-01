# Consulta Byla Chatbot — Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o Assistente de orientação por um chatbot só-leitura (Admin) que responde com dados reais via menu + tools determinísticas.

**Architecture:** `POST /api/ai/consulta/chat` (Admin) → roteador (menu fixo / keywords / LLM opcional) → tools de leitura sobre serviços existentes → texto PT. UI: botão flutuante só Admin no `LayoutShell`.

**Tech Stack:** Express + Zod + Supabase (backend); React + MonthYearContext (frontend); testes `node --test` no backend.

## Global Constraints

- Só leitura; sem mutação via chat
- Só role `admin` no frontend e `requireRoles(['admin'])` no backend
- Números nunca inventados pela IA
- Copy para gestão (sem jargão de planilha)
- Telegram fora do MVP

---

### Task 1: Catálogo menu + roteamento determinístico

**Files:**
- Create: `backend/src/ai/consultaCatalog.ts`
- Create: `backend/src/ai/consultaCatalog.test.ts`

**Produces:**
- `CONSULTA_MENU_LABELS: string[]`
- `resolveConsultaIntent(message: string): { tool: ConsultaToolId; params: Record<string, string>; confidence: number } | null`
- `parseMonthYearContext(monthYear?: string): { mes: number; ano: number } | null`

- [ ] Implementar catálogo com todos os tools do spec
- [ ] Testes: cada label do menu resolve para a tool certa; “aluno Maria” → busca_aluno; valor R$ → busca_por_valor; lixo → null
- [ ] Run: `cd backend && npm test -- src/ai/consultaCatalog.test.ts`

---

### Task 2: Tools de leitura + orquestrador

**Files:**
- Create: `backend/src/services/consultaBylaTools.ts`
- Create: `backend/src/services/consultaBylaService.ts`
- Create: `backend/src/services/consultaBylaService.test.ts`

**Produces:**
- `executeConsultaTool(tool, params, ctx): Promise<{ ok: true; factsText: string } | { ok: false; error: string }>`
- `gerarConsultaReply(input): Promise<ConsultaServiceOutput>`

Tools usam: `v_resumo_mensal_oficial`, transações oficiais, `categorias-banco` logic inline, `getConciliacaoPagamentosMes`, `getFinancasAlunos`, `loadControleCaixaExisting` (oficial + sistema), fluxo pagamentos por data.

- [ ] Implementar tools + formatação BRL / top N
- [ ] Orquestrador: menu/keyword → tool; se null → recusa + menu; LLM só formata se disponível (opcional, não inventa fatos)
- [ ] Testes unitários do orquestrador com tools mockadas / stubs
- [ ] Run tests

---

### Task 3: Rota API Admin

**Files:**
- Create: `backend/src/routes/aiConsulta.ts`
- Modify: `backend/src/routes/api.ts`
- Modify: `backend/src/validation/apiQuery.ts` (schema `consultaChatBodySchema` se necessário)

- [ ] `POST /ai/consulta/chat` + `GET /ai/consulta/status`
- [ ] Registrar com `requireRoles(['admin'])`
- [ ] Log: userId, tool, competência

---

### Task 4: Frontend Consulta Byla

**Files:**
- Modify/rename: `frontend/src/components/ai/AccessibilityChatButton.tsx` → Consulta Byla
- Modify: `frontend/src/components/ai/AccessibilityChatPanel.tsx`
- Modify: `frontend/src/components/ai/types.ts`
- Modify: `frontend/src/services/backendApi.ts`
- Modify: `frontend/src/app/LayoutShell.tsx`

- [ ] Botão + painel só se `auth.role === 'admin'`
- [ ] Menu = labels do catálogo (espelhados no frontend)
- [ ] Chamar `/api/ai/consulta/chat` com `monthYear` do `useMonthYear`
- [ ] Remover fluxo de navegação/confirmação do assistente antigo no painel

---

### Task 5: Verificação

- [ ] `cd backend && npm test -- src/ai/consultaCatalog.test.ts src/services/consultaBylaService.test.ts`
- [ ] Smoke: Typecheck backend se possível
