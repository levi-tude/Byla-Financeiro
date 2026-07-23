# Segurança e privacidade

Resumo dos controles visíveis no código público. Não substitui parecer jurídico ou avaliação LGPD formal.

## Autenticação e autorização

- Login via Supabase Auth (e-mail/senha)
- Perfis com roles: `admin` (acesso total) e `secretaria` (operação diária, campos sensíveis ocultos)
- Backend valida JWT e role em rotas protegidas (`BYLA_AUTH_ENFORCE`)
- Rotas administrativas críticas (ex.: entradas) exigem role `admin`

## Banco de dados

- Row Level Security (RLS) em tabelas sensíveis
- Views ajustadas para respeitar o usuário logado, não service role no cliente
- Migrations versionadas em `scripts/`

## Proteção de API

| Controle | Onde |
|----------|------|
| Rate limit IA | `POST /api/relatorios/gerar-texto-ia` |
| Rate limit sync | Rotas com `X-Byla-Sync-Secret` |
| Payload limit | 1 MB global; rotas sync autenticadas podem elevar |
| CORS | Apenas origens em `CORS_ORIGIN`; localhost só fora de produção |
| Sync secret | Comparação timing-safe (`timingSafeEqual`) |

## Privacidade em relatórios IA

Quando `BYLA_IA_MINIMIZE_PII=true` (padrão):

- Nomes de alunos, pagadores e listas nominais são omitidos antes do prompt
- Totais, categorias e datas são preservados
- Prompt reforça: não inventar nomes

Provedores suportados: Gemini, Groq, OpenAI (configuráveis por env).

## Frontend

- Headers de segurança na Vercel (CSP, frame denial, etc.)
- Blur opcional para valores e nomes na tela
- Apenas chave `anon` do Supabase no frontend — nunca service role

## CI e secrets

- Gitleaks com regras customizadas (Pluggy UUID, PagBank hex)
- Workflow `security-check.yml` com actions pinadas por SHA
- `.env.example` sem valores reais

## Recomendações Supabase (painel)

Ativar manualmente no dashboard:

- **Prevent use of leaked passwords** (HIBP)
- **Site URL** e **Redirect URLs** alinhados ao domínio de deploy

## Dados neste repositório

Seeds, exemplos de planilha e workflows n8n usam **personas e valores fictícios**. Nenhum dado real de alunos ou parceiros deve ser commitado.
