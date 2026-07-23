# Demo — Supabase to Google Sheets

Modelo didático (`active: false`) para exportar novas transações do Supabase para uma planilha Google.

## Objetivo

Replicar cada **INSERT** na tabela `transacoes` como uma linha na aba de movimentações da planilha operacional, mantendo o extrato oficial espelhado fora do banco.

## Gatilho

- **Webhook** POST do Database Webhook do Supabase (`INSERT` em `transacoes`).
- Caminho de exemplo: `/webhook/byla-transacao-export` (ajuste no seu n8n).

## Fluxo de dados (passos)

1. Webhook recebe payload `{ type, table, record }`.
2. Nó Code valida se é `INSERT` em `transacoes` com `record.id`.
3. IF descarta eventos inválidos.
4. Supabase GET em view `v_transacoes_export` pelo `id`.
5. HTTP POST ao backend (`/api/planilha-entrada-saida/montar-linhas`) para montar linha no formato da planilha.
6. Google Sheets append na aba configurada.

## Validações

- Só processa `type === 'INSERT'` e `table === 'transacoes'`.
- Exige `record.id` presente.
- Backend monta colunas; planilha recebe apenas linhas já normalizadas.

## Idempotência

- O webhook dispara por insert; reprocessamento manual pode duplicar linhas na planilha se não houver dedupe no destino.
- Use chave composta (data + pessoa + valor) ou controle no Apps Script se reimportar.

## Tratamento de erros

- Eventos não-INSERT terminam cedo com `proceed: false`.
- Falhas de credencial Google/Supabase aparecem no histórico de execução do n8n.
- Configure retry no nó HTTP se o backend estiver cold-start.

## Credenciais necessárias (tipos, nunca valores)

| Tipo n8n | Uso |
|----------|-----|
| Supabase API | Ler `v_transacoes_export` |
| Google Sheets OAuth2 | Append na planilha |
| Header Auth (opcional) | `X-Byla-Sync-Secret` no backend |

Variáveis de ambiente sugeridas: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SHEETS_ENTRADA_SAIDA_ID`, `BYLA_SYNC_SECRET`.

## Segurança

- Template sem IDs reais, URLs de produção ou credenciais embutidas.
- Proteja o webhook (segredo compartilhado ou rede privada).
- Não versionar JSON de service account.

## Como importar este modelo

1. n8n → **Workflows** → **Import from File** → `workflow.template.json`.
2. Crie credenciais Supabase, Google Sheets e Header Auth no seu ambiente.
3. Ajuste IDs de planilha/aba e URL do backend para o seu deploy.
4. Ative **somente** após testar com um insert de sandbox.
5. Regere a partir do original com `node scripts/sanitize-n8n-workflow.mjs` se precisar atualizar a lógica.
