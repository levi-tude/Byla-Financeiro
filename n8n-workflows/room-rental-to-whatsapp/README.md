# Demo — Room rental to WhatsApp

Modelo didático (`active: false`) para gerar resumo mensal de aluguel de salas e entregar via WhatsApp (opcional).

## Objetivo

No 1º dia útil do mês, buscar no backend o texto consolidado de reservas do mês anterior e enviar à gerência — ou apenas registrar preview em log.

## Gatilho

- **Manual** para testes.
- **Agendado** cron `0 8 1 * *` (dia 1, 8h).

## Fluxo de dados (passos)

1. Trigger dispara GET em `/api/aluguel/resumo-whatsapp-auto`.
2. Backend retorna JSON com `texto`, `periodo_label`, totais por sala.
3. IF **Enviar WhatsApp?** (padrão demo: `false` → ramo de log).
4. Ramo verdadeiro: POST para API Evolution/Z-API/Meta (configure no seu ambiente).

## Validações

- Header `X-Byla-Sync-Secret` obrigatório no auto-endpoint.
- Sem `mes`/`ano` na query → backend usa mês anterior (fuso America/Sao_Paulo).

## Idempotência

- Cada execução agendada gera novo texto; não altera dados no Supabase.
- Evite reenvio manual duplicado no mesmo dia se o WhatsApp já foi disparado.

## Tratamento de erros

- Timeout no backend Render → aumente timeout do nó HTTP ou use retry.
- WhatsApp desligado no IF → fluxo cai em **Log (sem envio)** sem falhar.

## Credenciais necessárias (tipos, nunca valores)

| Tipo n8n | Uso |
|----------|-----|
| Header Auth | `X-Byla-Sync-Secret` (= `BYLA_SYNC_SECRET`) |
| HTTP genérico / Evolution | Envio WhatsApp (URL + apikey no seu painel) |

## Segurança

- Segredo de sync só em credencial n8n ou env do servidor — nunca no JSON publicado.
- Números de telefone e URLs de API real foram removidos deste template.
- Mantenha o ramo WhatsApp desligado (`false`) até validar texto em sandbox.

## Como importar este modelo

1. Importe `workflow.template.json`.
2. Crie credencial Header Auth com seu `BYLA_SYNC_SECRET`.
3. Ajuste URL do backend para seu deploy demo.
4. Para envio real, preencha nó WhatsApp e altere IF para `true` apenas em produção controlada.
