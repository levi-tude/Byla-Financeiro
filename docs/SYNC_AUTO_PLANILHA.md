# Sync automático da planilha FLUXO DE CAIXA (só inserir)

## O que faz
Quando a secretária edita a planilha **FLUXO DE CAIXA**, o Google espera **~4 minutos sem novas edições** e avisa o sistema. O sistema então **só adiciona** alunos novos e pagamentos novos.

- **Nunca** altera, sobrescreve ou apaga nada.
- **Nunca** marca aluno como inativo e **nunca** mexe em vínculos.
- Pagamento repetido (mesmo aluno + modalidade + data + valor + competência) é ignorado — rodar de novo não duplica.
- Se aparecer **qualquer conflito** (linha já ocupada, nome ambíguo/duplicado, pagamento sem aluno, aba que não leu, data inválida), **nada é gravado** e o resumo mostra o conflito. Aí é rodar o dry-run manual (`npm run sync:fluxo-so-inserir -- 2026`) para ver os detalhes.
- Só um sync roda por vez (trava). Se chegar outro no meio, ele é recusado (HTTP 409) e o script tenta de novo depois.

## Como o resumo chega ao Levi
1. **Sempre:** linha de log JSON no Render (`msg: sync_fluxo_so_inserir`), só com contagens (sem nomes). Ver em Render → Logs.
2. **Opcional:** se `SYNC_NOTIFY_WEBHOOK_URL` estiver configurada (ex.: webhook do n8n que manda WhatsApp/e-mail), o backend envia o resumo quando **inseriu**, **bloqueou por conflito** ou **deu erro** (não avisa quando não havia nada novo).
3. **Opcional:** tabela `fluxo_sync_execucoes` (proposta em `scripts/supabase-schema-fluxo-sync-execucoes.sql`, **não aplicada**). Só depois de revisar e aplicar, ligar `SYNC_LOG_TABLE_ENABLED=true`.

## Passos de configuração (Levi)
1. **Render** → serviço do backend → Environment: criar `SYNC_WEBHOOK_SECRET` com um valor longo e aleatório (ex.: `openssl rand -hex 32`). Opcional: `SYNC_NOTIFY_WEBHOOK_URL`.
2. Fazer o merge do PR e esperar o deploy.
3. Na planilha FLUXO DE CAIXA: **Extensões → Apps Script**. Criar arquivo `syncFluxo.gs` e colar o conteúdo de `apps-script/syncFluxo.gs`.
4. **Configurações do projeto (engrenagem) → Propriedades do script**:
   - `SYNC_URL` = `https://<seu-backend>.onrender.com/api/sync/fluxo-so-inserir`
   - `SYNC_SECRET` = mesmo valor do `SYNC_WEBHOOK_SECRET`
5. No editor, escolher a função `instalarGatilhos` e clicar **Executar** (autorizar com a conta dona da planilha). Isso cria os gatilhos de edição/alteração.
6. Testar: editar uma célula qualquer, esperar ~5 min, ver **Execuções** no Apps Script e o log no Render.

## Plano de volta (rollback)
- **Parar na hora:** no Apps Script, executar `desinstalarGatilhos` (ou apagar os gatilhos em "Acionadores"). **ou** apagar `SYNC_WEBHOOK_SECRET` no Render → o endpoint responde 503 e não faz nada.
- **Remover o código:** reverter o PR (`git revert`) e fazer deploy.
- **Dados:** o sync só insere com `origem = 'migracao_planilha'`. Se algo indevido entrar, os registros estão nos logs/resumo (contagens antes/depois) e podem ser revisados manualmente — nada existente foi alterado.
