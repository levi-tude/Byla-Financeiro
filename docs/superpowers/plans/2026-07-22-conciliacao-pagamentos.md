# Conciliação de pagamentos (em dia / atrasado / pendente) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a tela **Operação → Conciliação de pagamentos** (`/conciliacao`) com KPIs e lista em dia / atrasado / pendente, cruzando vencimento do Fluxo com crédito no extrato, reusando o matching da validação; secretaria sem campos bancários.

**Architecture:** Classificador puro (data do crédito × dia de vencimento) + serviço mensal que carrega alunos ativos do Fluxo Supabase, resolve crédito via vínculos `fluxo::…` e/ou `matchUmPagamentoPlanilhaBanco` (já usado em `conciliacao.ts` / validação), + `GET /api/conciliacao-pagamentos` com strip de campos bancários para `secretaria`, + página React no design system atual. A rota antiga `GET /api/conciliacao-vencimentos` permanece no v1 (admin, legado); a UI nova consome só o endpoint novo.

**Tech Stack:** Node/Express/tsx, `node:test`, React + TanStack Query, MonthYearContext, Topbar, `RequireAuth`, Supabase (`fluxo_alunos_operacionais`, `fluxo_pagamentos_operacionais`, `transacoes`, `validacao_pagamentos_vinculos`).

**Spec:** `docs/superpowers/specs/2026-07-22-conciliacao-pagamentos-design.md`

## Global Constraints

- Regra “em dia”: dia do crédito no extrato **≤** dia de vencimento do cadastro no **mês de referência** (sem folga / sem `graceDiasAposVencimento` nesta tela).
- Matching: reutilizar `backend/src/logic/conciliacaoPagamentoMatch.ts` e/ou `listVinculosMes` / `planilha_id = fluxo::<uuid>` — **não** criar matcher paralelo.
- RBAC: `admin` e `secretaria` acessam; **filtrar campos bancários no backend** para secretaria.
- Menu: **Operação** (não Finanças).
- Fora do v1: editar vínculos na tela, folga de dias, despesas/aluguel.
- Commits só se Levi pedir explicitamente.
- Explicações ao usuário em português, simples.

---

## File map

| Path | Responsabilidade |
|------|------------------|
| `backend/src/logic/conciliacaoStatusExtrato.ts` | Classificador puro status + parse dia vencimento |
| `backend/src/logic/conciliacaoStatusExtrato.test.ts` | Testes do classificador |
| `backend/src/services/conciliacaoPagamentosMes.ts` | Monta totais + itens do mês (Fluxo + extrato) |
| `backend/src/services/conciliacaoPagamentosMes.test.ts` | Testes com fixtures (sem rede) |
| `backend/src/routes/conciliacao.ts` | Adicionar `GET /conciliacao-pagamentos` |
| `backend/src/routes/api.ts` | Guard: `/conciliacao-pagamentos` para admin+secretaria |
| `frontend/src/services/backendApi.ts` | Cliente tipado `getConciliacaoPagamentos` |
| `frontend/src/pages/ConciliacaoPagamentosPage.tsx` | UI Operação |
| `frontend/src/app/navConfig.ts` | Item Conciliação em Operação |
| `frontend/src/App.tsx` | Rota real `/conciliacao` |
| `docs/CONCILIACAO_VENCIMENTOS.md` | Nota apontando a tela/API novas |
| Spec status | Marcar plano pronto |

---

### Task 1: Classificador puro (status)

**Files:**
- Create: `backend/src/logic/conciliacaoStatusExtrato.ts`
- Create: `backend/src/logic/conciliacaoStatusExtrato.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces:
  - `export type ConciliacaoPagamentoStatus = 'em_dia' | 'atrasado' | 'pendente' | 'sem_vencimento' | 'bolsa'`
  - `export function parseDiaVencimentoCadastro(venc: string | null | undefined): number | null`
  - `export function isPlanoBolsaConciliacao(plano: string | null | undefined): boolean`
  - `export function classificarStatusConciliacao(input: { diaVencimento: number \| null; dataCreditoIso: string \| null; mes: number; ano: number; planoBolsa: boolean }): ConciliacaoPagamentoStatus`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classificarStatusConciliacao,
  parseDiaVencimentoCadastro,
  isPlanoBolsaConciliacao,
} from './conciliacaoStatusExtrato.js';

test('parseDiaVencimentoCadastro: "10" e "todo dia 10" → 10', () => {
  assert.equal(parseDiaVencimentoCadastro('10'), 10);
  assert.equal(parseDiaVencimentoCadastro('todo dia 10'), 10);
  assert.equal(parseDiaVencimentoCadastro(''), null);
});

test('bolsa não entra como pendente', () => {
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 10,
      dataCreditoIso: null,
      mes: 7,
      ano: 2026,
      planoBolsa: true,
    }),
    'bolsa',
  );
});

test('sem crédito → pendente; crédito dia 10 com venc 10 → em_dia; dia 11 → atrasado', () => {
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 10,
      dataCreditoIso: null,
      mes: 7,
      ano: 2026,
      planoBolsa: false,
    }),
    'pendente',
  );
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 10,
      dataCreditoIso: '2026-07-10',
      mes: 7,
      ano: 2026,
      planoBolsa: false,
    }),
    'em_dia',
  );
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 10,
      dataCreditoIso: '2026-07-11',
      mes: 7,
      ano: 2026,
      planoBolsa: false,
    }),
    'atrasado',
  );
});

test('crédito fora do mês de referência conta como pendente (não usa outro mês)', () => {
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: 10,
      dataCreditoIso: '2026-06-10',
      mes: 7,
      ano: 2026,
      planoBolsa: false,
    }),
    'pendente',
  );
});

test('sem dia de vencimento → sem_vencimento', () => {
  assert.equal(
    classificarStatusConciliacao({
      diaVencimento: null,
      dataCreditoIso: '2026-07-05',
      mes: 7,
      ano: 2026,
      planoBolsa: false,
    }),
    'sem_vencimento',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --import tsx --test src/logic/conciliacaoStatusExtrato.test.ts`  
Expected: FAIL (módulo inexistente)

- [ ] **Step 3: Implement**

```ts
export type ConciliacaoPagamentoStatus =
  | 'em_dia'
  | 'atrasado'
  | 'pendente'
  | 'sem_vencimento'
  | 'bolsa';

export function parseDiaVencimentoCadastro(venc: string | null | undefined): number | null {
  const raw = String(venc ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // Prefer last 1–2 digit group that looks like a day (1–31)
  const m = raw.match(/\b([12]?\d|3[01])\b/);
  const n = m ? Number(m[1]) : Number(digits.slice(0, 2));
  if (!Number.isFinite(n) || n < 1 || n > 31) return null;
  return n;
}

export function isPlanoBolsaConciliacao(plano: string | null | undefined): boolean {
  const n = String(plano ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
  return n === 'bolsa' || n.includes('bolsa');
}

export function classificarStatusConciliacao(input: {
  diaVencimento: number | null;
  dataCreditoIso: string | null;
  mes: number;
  ano: number;
  planoBolsa: boolean;
}): ConciliacaoPagamentoStatus {
  if (input.planoBolsa) return 'bolsa';
  if (input.diaVencimento == null) return 'sem_vencimento';
  const iso = (input.dataCreditoIso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'pendente';
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (y !== input.ano || m !== input.mes) return 'pendente';
  if (d <= input.diaVencimento) return 'em_dia';
  return 'atrasado';
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd backend && node --import tsx --test src/logic/conciliacaoStatusExtrato.test.ts`

---

### Task 2: Serviço mensal (Fluxo + extrato)

**Files:**
- Create: `backend/src/services/conciliacaoPagamentosMes.ts`
- Create: `backend/src/services/conciliacaoPagamentosMes.test.ts`

**Interfaces:**
- Consumes: `classificarStatusConciliacao`, `parseDiaVencimentoCadastro`, `isPlanoBolsaConciliacao`; `listVinculosMes`; `matchUmPagamentoPlanilhaBanco`; `filtrarTransacoesOficiais`; `getSupabase`
- Produces:
  - `export type ConciliacaoPagamentoItem = { … }`
  - `export type ConciliacaoPagamentosMesResult = { mes; ano; totais; itens }`
  - `export function stripCamposBancariosConciliacao(result, role): ConciliacaoPagamentosMesResult`
  - `export async function getConciliacaoPagamentosMes(mes, ano): Promise<ConciliacaoPagamentosMesResult>`
  - `export function montarItensConciliacaoPagamentos(…fixtures…): ConciliacaoPagamentosMesResult` (puro, para teste)

**Shapes (fixar):**

```ts
export type ConciliacaoPagamentoItem = {
  aluno_id: string;
  aluno_nome: string;
  aba: string;
  modalidade: string;
  dia_vencimento: number | null;
  status: ConciliacaoPagamentoStatus;
  // bancários (omitidos para secretaria):
  data_credito?: string | null;
  valor_credito?: number | null;
  pessoa_banco?: string | null;
  transacao_id?: string | null;
  vinculo_id?: string | null;
  banco_status?: 'vinculo' | 'match' | 'nenhum';
};

export type ConciliacaoPagamentosTotais = {
  em_dia: number;
  atrasado: number;
  pendente: number;
  sem_vencimento: number;
  bolsa: number;
  total: number;
};
```

**Algoritmo de `getConciliacaoPagamentosMes`:**

1. Carregar alunos ativos: `fluxo_alunos_operacionais` onde `ativo = true` (campos: id, aba, modalidade, aluno_nome, venc, plano, valor_referencia, responsaveis, pagador_pix).
2. Carregar pagamentos do mês: `fluxo_pagamentos_operacionais` com `mes_competencia=mes` e `ano_competencia=ano`.
3. Carregar entradas oficiais do mês em `transacoes` (`data` entre 1º e último dia; `filtrarTransacoesOficiais`).
4. `vinculos = await listVinculosMes(mes, ano)` → mapa `planilha_id → { banco_id, id }`.
5. Para cada aluno:
   - `planoBolsa = isPlanoBolsaConciliacao(plano)`
   - `diaVenc = parseDiaVencimentoCadastro(venc)`
   - Escolher crédito:
     - a) Pagamentos do aluno no mês (match por `aba`+`aluno_nome` normalizado); para cada pagamento, `planilha_id = fluxo::<pagamento.id>`; se houver vínculo, usar `transacoes` pelo `banco_id`.
     - b) Senão, se houver pagamento, montar `PlanilhaItem` e `matchUmPagamentoPlanilhaBanco` contra entradas do mês (Set `usadosBanco` global na requisição).
     - c) Sem pagamento / sem match → `dataCredito = null`.
   - Se vários créditos, usar o **mais cedo** no mês (melhor para “em dia”).
   - `status = classificarStatusConciliacao(...)`.
6. Totais por status; ordenar itens por modalidade, nome.

- [ ] **Step 1: Testes unitários de `montarItensConciliacaoPagamentos` + `stripCamposBancariosConciliacao`**

Cobrir: 1 aluno em dia (crédito dia ≤ venc), 1 atrasado, 1 pendente, 1 bolsa, strip remove `data_credito`/`valor_credito`/`pessoa_banco`/`transacao_id` para role `secretaria` e mantém para `admin`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement service + helpers**

- [ ] **Step 4: Run — expect PASS**

Run: `cd backend && node --import tsx --test src/services/conciliacaoPagamentosMes.test.ts src/logic/conciliacaoStatusExtrato.test.ts`

---

### Task 3: Rota API + RBAC

**Files:**
- Modify: `backend/src/routes/conciliacao.ts` (adicionar handler)
- Modify: `backend/src/routes/api.ts` (guards)

**Interfaces:**
- Consumes: `getConciliacaoPagamentosMes`, `stripCamposBancariosConciliacao`, `mesAnoQuerySchema`, `req.authUser`
- Produces: `GET /api/conciliacao-pagamentos?mes=&ano=`

- [ ] **Step 1: Em `api.ts`, incluir o path no guard operacional**

Alterar o bloco `requireRoles(['secretaria', 'admin'])` para incluir `'/conciliacao-pagamentos'` (ao lado de `/fluxo-operacional`, `/aluguel`).

Manter `'/conciliacao-vencimentos'` só no bloco admin (legado).

- [ ] **Step 2: Adicionar rota**

No final de `conciliacao.ts` (antes do `export default`):

```ts
router.get('/conciliacao-pagamentos', async (req: Request, res: Response) => {
  try {
    const mq = parseQuery(mesAnoQuerySchema, req.query as Record<string, unknown>);
    if (!mq.ok) return res.status(400).json({ error: mq.message });
    const { mes, ano } = mq.data;
    const role = req.authUser?.role;
    if (role !== 'admin' && role !== 'secretaria') {
      return res.status(401).json({ error: 'Autenticação obrigatória.' });
    }
    const raw = await getConciliacaoPagamentosMes(mes, ano);
    const payload = stripCamposBancariosConciliacao(raw, role);
    return res.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Supabase')) return res.status(503).json({ error: msg });
    return res.status(500).json({ error: msg });
  }
});
```

- [ ] **Step 3: Smoke manual (com backend rodando e JWT)**

```powershell
# admin: deve trazer campos data_credito quando houver match
# secretaria: mesmos status, sem data_credito/valor_credito/pessoa_banco/transacao_id
```

Expected: 200; totais coerentes com o mês do Topbar.

---

### Task 4: Frontend — página + menu Operação

**Files:**
- Create: `frontend/src/pages/ConciliacaoPagamentosPage.tsx`
- Modify: `frontend/src/services/backendApi.ts`
- Modify: `frontend/src/app/navConfig.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useMonthYear`, `useAuth`, `getConciliacaoPagamentos(mes, ano)`, `Topbar`, `KpiStrip` / cards no padrão Entradas
- Produces: rota `/conciliacao` funcional

- [ ] **Step 1: API client**

Em `backendApi.ts`:

```ts
export type ConciliacaoPagamentoStatus =
  | 'em_dia'
  | 'atrasado'
  | 'pendente'
  | 'sem_vencimento'
  | 'bolsa';

export type ConciliacaoPagamentosResponse = {
  mes: number;
  ano: number;
  totais: {
    em_dia: number;
    atrasado: number;
    pendente: number;
    sem_vencimento: number;
    bolsa: number;
    total: number;
  };
  itens: Array<{
    aluno_id: string;
    aluno_nome: string;
    aba: string;
    modalidade: string;
    dia_vencimento: number | null;
    status: ConciliacaoPagamentoStatus;
    data_credito?: string | null;
    valor_credito?: number | null;
    pessoa_banco?: string | null;
    transacao_id?: string | null;
    vinculo_id?: string | null;
    banco_status?: 'vinculo' | 'match' | 'nenhum';
  }>;
};

export async function getConciliacaoPagamentos(
  mes: number,
  ano: number,
): Promise<ConciliacaoPagamentosResponse> {
  return request<ConciliacaoPagamentosResponse>(
    `/api/conciliacao-pagamentos?mes=${mes}&ano=${ano}`,
  );
}
```

- [ ] **Step 2: `navConfig.ts` — item em Operação**

Após “Aluguel de salas”:

```ts
{
  path: '/conciliacao',
  label: 'Conciliação',
  roles: ['secretaria', 'admin'],
},
```

- [ ] **Step 3: `App.tsx`**

Substituir o redirect por:

```tsx
<Route
  path="conciliacao"
  element={
    <RequireAuth roles={['secretaria', 'admin']}>
      <ConciliacaoPagamentosPage />
    </RequireAuth>
  }
/>
```

- [ ] **Step 4: Página**

`ConciliacaoPagamentosPage.tsx` (padrão visual Entradas/Fluxo):

- `Topbar` + título “Conciliação de pagamentos”
- Faixa de ajuda: “Em dia = crédito no extrato até o dia do vencimento do cadastro, no mês selecionado.”
- `useQuery` com `mes/ano` do contexto
- KPIs clicáveis: Em dia | Atrasado | Pendente (filtro local)
- Filtros: busca nome + select modalidade
- Tabela: Aluno | Modalidade | Venc. | Status | (se admin) Data crédito | Valor | Pessoa banco
- Link admin quando `pendente`: “Conferir na Validação” → `/validacao-pagamentos-diaria` (sem criar vínculo nesta tela)
- Estados loading / erro / vazio com componentes já usados no painel

- [ ] **Step 5: Verificar no browser**

1. Login secretaria → menu Operação mostra Conciliação → lista sem colunas/valores de banco (Network: payload sem campos bancários).  
2. Login admin → mesmos status + colunas de extrato.  
3. Mudar mês no Topbar → refetch.

---

### Task 5: Docs + status da spec

**Files:**
- Modify: `docs/CONCILIACAO_VENCIMENTOS.md` (adicionar seção no topo apontando a nova tela)
- Modify: `docs/superpowers/specs/2026-07-22-conciliacao-pagamentos-design.md` (status: plano pronto)

- [ ] **Step 1: No topo de `CONCILIACAO_VENCIMENTOS.md`**

```markdown
> **Atualização (2026-07-22):** A tela do painel é **Operação → Conciliação** (`/conciliacao`), API `GET /api/conciliacao-pagamentos`.  
> Regra de “em dia” **sem folga** (crédito ≤ dia do vencimento).  
> `GET /api/conciliacao-vencimentos` permanece como legado admin (tolerância `graceDias`).
```

- [ ] **Step 2: Spec — status**

Trocar para: `Status: desenho aprovado; plano em docs/superpowers/plans/2026-07-22-conciliacao-pagamentos.md`

---

## Spec coverage (self-review)

| Requisito da spec | Task |
|-------------------|------|
| Em dia / atrasado / pendente por crédito × venc | 1, 2 |
| Matching reutilizado | 2 |
| API + strip secretaria | 2, 3 |
| Menu Operação + `/conciliacao` | 4 |
| KPIs + filtros + design system | 4 |
| Sem vencimento / bolsa | 1, 2 |
| Fora do v1 (vínculos na tela, grace) | respeitado |
| Aceite 1–8 | Tasks 1–4 |

## Placeholder scan

Nenhum TBD/TODO aberto neste plano.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-22-conciliacao-pagamentos.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — um subagente por task, review entre tasks  
2. **Inline Execution** — executar as tasks nesta sessão com checkpoints  

Which approach?
