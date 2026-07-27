# Recuperar vínculos órfãos (P0) — pronto para publicar

## O que faz

Após remigração do Fluxo, UUIDs de `fluxo_pagamentos_operacionais` mudam e
`validacao_pagamentos_vinculos.planilha_id` (`fluxo::<uuid>`) fica órfão.

O job:

1. Casa órfãos **1:1 inequívocos** (data_ref ±1 dia + valor do banco ≈ valor do pagamento)
2. Atualiza `planilha_id` no Supabase (não cria vínculos novos)
3. Roda backfill sticky `mapeamento_aluno_pagador`
4. Ignora ambíguos N→1

Na remigração (`npm run migrate:fluxo-operacional`), o hook faz snapshot →
fingerprint remap → heurística residual → sticky.

## Rodar uma vez em produção (após deploy)

### Opção A — script local com service role

```bash
cd backend
npm run recuperar:vinculos-orfaos -- 2026 --dry-run
npm run recuperar:vinculos-orfaos -- 2026
```

### Opção B — rota admin (JWT admin)

`POST /api/migracao/fluxo/recuperar-vinculos-orfaos?ano=2026`
`POST /api/migracao/fluxo/recuperar-vinculos-orfaos?ano=2026&dryRun=true`

## Métricas esperadas

JSON com `orfaosEncontrados`, `remapeados`, `ambiguosIgnorados`, `semCandidato`,
`stickyUpserted`. Casos como vínculo confirmado com pagamento único na janela
devem entrar em `remapeados` e reaparecer no Cadastro / Validação.

## Status

**Pronto para publicar** (código + testes; execução em prod = 1× após deploy).
