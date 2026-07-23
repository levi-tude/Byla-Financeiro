# Decisões técnicas (resumo público)

ADR condensados para portfólio. Detalhes operacionais e regras de negócio ficam no arquivo privado local.

## D1 — Supabase como destino da migração

Google Sheets permanece como legado legível, mas o fluxo operacional e o extrato oficial migram para Postgres com RLS.

**Motivo:** consultas, conciliação e auth unificados; menos dependência de API Sheets em runtime.

## D2 — Dois modos de controle de caixa

- **Oficial:** espelha abas migradas da planilha mensal
- **Sistema:** construído a partir de entradas/despesas classificadas

**Motivo:** comparar legado × sistema durante a transição sem misturar fontes.

## D3 — Competência vs data bancária

Pagamentos podem aparecer no mês da competência da planilha mesmo quando o crédito bancário cai em outro dia.

**Motivo:** alinhar visão gestão/planilha com aviso explícito na UI.

## D4 — Auth Supabase + RBAC no backend

Frontend usa anon key; backend valida JWT e role para mutações e dados sensíveis.

**Motivo:** defense in depth — RLS no banco + guard no API.

## D5 — Minimização de PII em IA

Payloads de relatório são sanitizados antes de Gemini/Groq/OpenAI.

**Motivo:** reduzir vazamento de nomes de alunos/pagadores para terceiros.

## D6 — Sync n8n com segredo dedicado

Rotas de sincronização exigem header `X-Byla-Sync-Secret`, rate limit e comparação timing-safe.

**Motivo:** webhook não pode ser aberto à internet sem autenticação forte.

## D7 — Repositório público = portfólio

Código funcional sanitizado; dados reais, docs operacionais e integrações obsoletas fora do Git.

**Motivo:** demonstrar engenharia sem expor PII ou segredos.

## D8 — Remoção Pluggy / PagBank EDI

Integrações não utilizadas foram retiradas do código e do histórico planejado.

**Motivo:** reduzir superfície de ataque e confusão no portfólio.

## D9 — CORS explícito

Sem wildcard `*.vercel.app`; lista fixa em `CORS_ORIGIN`.

**Motivo:** evitar que qualquer preview Vercel acesse a API de demo/produção.

## D10 — Payload JSON 1 MB padrão

Limite global baixo; rotas sync autenticadas podem usar limite maior localmente.

**Motivo:** mitigar DoS por body oversized.
