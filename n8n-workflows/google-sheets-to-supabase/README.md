# Demo — Google Sheets to Supabase

Modelo didático (`active: false`) para importar transações de uma aba de planilha para a tabela `transacoes`.

## Objetivo

Ler linhas novas da aba **Importar** (extrato bancário colado manualmente ou via Apps Script) e inserir apenas registros ainda inexistentes no Supabase.

## Gatilho

- **Manual** para testes.
- **Agendado** (ex.: cron `0 6 * * *`) para sincronização diária.

## Fluxo de dados (passos)

1. Google Sheets lê aba `Importar` (range configurável).
2. Code **Normalizar linhas** extrai data, pessoa, valor, tipo e monta `id_unico`.
3. Supabase lista transações existentes.
4. Code **Só linhas novas** filtra duplicatas pela chave `data-pessoa-valor`.
5. Supabase INSERT em lote nas linhas restantes.

## Validações

- Ignora linhas sem data, pessoa ou valor.
- Normaliza datas `DD/MM/AAAA` → `AAAA-MM-DD`.
- Classifica tipo entrada/saída a partir de colunas ou heurística de sinal.

## Idempotência

- Chave `id_unico = data + pessoa + valor` evita reinsert do mesmo lançamento.
- Reexecutar o fluxo só insere o delta.

## Tratamento de erros

- Planilha vazia → fluxo termina sem inserts.
- Falha de OAuth Google ou Supabase → ver execução no n8n e logs do projeto.

## Credenciais necessárias (tipos, nunca valores)

| Tipo n8n | Uso |
|----------|-----|
| Google Sheets OAuth2 | Leitura da aba Importar |
| Supabase API | SELECT + INSERT em `transacoes` |

Variáveis sugeridas: `GOOGLE_SHEETS_SPREADSHEET_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Segurança

- Template sem spreadsheet ID real nem tokens.
- Service role só no n8n/server-side; nunca no frontend.
- Revise RLS/policies antes de abrir INSERT automático.

## Como importar este modelo

1. Importe `workflow.template.json` no n8n.
2. Configure credenciais Google e Supabase.
3. Aponte `documentId` e nome da aba para sua planilha demo.
4. Teste com 2–3 linhas fictícias antes de ativar o agendamento.
