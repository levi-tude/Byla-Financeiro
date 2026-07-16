# Workflow: BYLA — Resumo mensal de aluguel de salas (WhatsApp)

Gera o **texto do resumo de reservas** do mês anterior via backend BYLA e, opcionalmente, envia no WhatsApp da gerência.

---

## O que o workflow faz

1. **Disparo:** Manual (testar) ou agendado (1º dia de cada mês às 8h — cron `0 8 1 * *`).
2. **Backend:** `GET https://byla-backend.onrender.com/api/aluguel/resumo-whatsapp-auto` com header `X-Byla-Sync-Secret`.
3. **Resposta:** JSON com `texto`, `periodo_label`, `total_dias`, `total_reservas`, `por_sala`, `gerado_em`.
4. **Entrega:**
   - Se `BYLA_ALUGUEL_WPP_ENVIAR=true` → HTTP POST para Evolution API / Z-API (credencial no n8n).
   - Senão → nó **Log (sem envio)** com preview do texto.

O painel também tem **Copiar texto** / **Abrir WhatsApp** (`wa.me`) na aba **Aluguel de salas** — este fluxo é o canal automático.

---

## Configuração necessária

### 1. Credencial BYLA Backend Sync

Igual ao relatório mensal:

- **Settings → Credentials → Header Auth**
- **Name:** `BYLA Backend Sync`
- **Header Name:** `X-Byla-Sync-Secret`
- **Header Value:** mesmo `BYLA_SYNC_SECRET` do Render

### 2. Variáveis no n8n

| Variável | Obrigatório | Default | Descrição |
|----------|-------------|---------|-------------|
| `BYLA_ALUGUEL_WPP_ENVIAR` | Não | `false` | `true` para enviar WhatsApp |
| `BYLA_ALUGUEL_WPP_TO` | Se enviar | — | Número destino (ex.: `5571999999999`) |
| `BYLA_EVOLUTION_BASE_URL` | Se Evolution | — | Ex.: `https://evolution.seudominio.com` |
| `BYLA_EVOLUTION_INSTANCE` | Se Evolution | — | Nome da instância |
| `BYLA_EVOLUTION_API_KEY` | Se Evolution | — | API key (ou use credencial Header Auth) |

### 3. WhatsApp (Evolution ou Z-API)

O JSON do workflow usa um nó **HTTP Request** genérico apontando para Evolution:

`POST {BYLA_EVOLUTION_BASE_URL}/message/sendText/{BYLA_EVOLUTION_INSTANCE}`

Body típico:
```json
{
  "number": "{{ $env.BYLA_ALUGUEL_WPP_TO }}",
  "text": "{{ $json.texto }}"
}
```

Ajuste URL/body se usar **Z-API** ou **Meta Cloud API**.

### 4. Testar

1. Importe `workflow-aluguel-salas-whatsapp.json` no n8n.
2. Execute **Manual (testar agora)** com `BYLA_ALUGUEL_WPP_ENVIAR=false`.
3. Confira `texto` / `periodo_label` no Log.
4. Para um mês específico: altere a URL para `...?mes=5&ano=2026`.
5. Só depois ligue o envio real.

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
