# Workflow: BYLA — Resumo mensal de aluguel de salas (WhatsApp)

Gera o **texto do resumo de reservas** do mês anterior via backend BYLA e, opcionalmente, envia no WhatsApp da gerência.

---

## O que o workflow faz

1. **Disparo:** Manual (testar) ou agendado (1º dia de cada mês às 8h — cron `0 8 1 * *`).
2. **Backend:** `GET https://byla-backend.onrender.com/api/aluguel/resumo-whatsapp-auto` com header `X-Byla-Sync-Secret`.
3. **Resposta:** JSON com `texto`, `periodo_label`, `total_dias`, `total_reservas`, `por_sala`, `gerado_em`.
4. **Entrega (padrão):** nó **Log (sem envio)** com preview do texto.

O painel também tem **Copiar texto** / **Abrir WhatsApp** (`wa.me`) em **Aluguel de salas** — use isso no dia a dia; o fluxo n8n é o canal automático.

> **Nota:** neste n8n, `$env` nos nós está bloqueado (`N8N_BLOCK_ENV_ACCESS_IN_NODE`). Por isso o fluxo **não** usa variáveis de ambiente para ligar/desligar o WhatsApp.

---

## Configuração necessária

### 1. Credencial BYLA Backend Sync

Igual ao relatório mensal:

- **Settings → Credentials → Header Auth**
- **Name:** `BYLA Backend Sync`
- **Header Name:** `X-Byla-Sync-Secret`
- **Header Value:** mesmo `BYLA_SYNC_SECRET` do Render

### 2. Testar (sem WhatsApp)

1. No nó **Enviar WhatsApp?**, a condição deve ser o texto fixo `false` igual a `true` (não use `$env`).
2. Execute **Manual (testar agora)** → deve ir para **Log (sem envio)**.
3. Confira `texto` / `periodo_label` (mês anterior = junho/2026 se rodar em julho).
4. Para um mês específico: na URL do GET acrescente `?mes=5&ano=2026`.

### 3. Enviar WhatsApp de verdade (opcional)

1. Preencha o nó **POST Evolution sendText** com URL, `apikey` e número **fixos** (não use `$env`).
2. No IF, mude o `false` para `true`.
3. Ajuste URL/body se usar **Z-API** ou **Meta Cloud API**.

---

## API relacionada

| Rota | Auth |
|------|------|
| `GET /api/aluguel/resumo-whatsapp?mes=&ano=&sala_id?` | JWT (secretaria/admin) — painel |
| `GET /api/aluguel/resumo-whatsapp-auto?mes=&ano?` | `X-Byla-Sync-Secret` — n8n |

Sem `mes`/`ano` no auto → mês **anterior** (America/Sao_Paulo).

---

## Painel

Rota: `/aluguel-salas` (Operação). Seed: **Sala do Teatro**. Admin pode cadastrar mais salas.
