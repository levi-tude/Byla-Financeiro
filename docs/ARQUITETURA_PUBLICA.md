# Arquitetura pública — Byla Financeiro

Visão de alto nível para revisão de portfólio. Sem detalhes operacionais, IDs de planilha ou regras financeiras internas.

## Propósito

Painel web para gestão financeira de um estúdio multidisciplinar: entradas, despesas, conciliação de pagamentos, controle de caixa, calendário e relatórios com apoio de IA.

## Camadas

```
┌─────────────┐     HTTPS/JWT      ┌─────────────┐
│   Frontend  │ ◄──────────────► │   Backend   │
│  React/Vite │                   │ Node/Express│
└──────┬──────┘                   └──────┬──────┘
       │                                 │
       │ anon key                        │ service role
       ▼                                 ▼
┌─────────────────────────────────────────────┐
│              Supabase (Postgres)            │
│  Auth · RLS · views · migrations · seeds    │
└─────────────────────────────────────────────┘
       ▲                                 ▲
       │                                 │
┌──────┴──────┐                   ┌──────┴──────┐
│ Google      │                   │ n8n         │
│ Sheets      │                   │ (modelos)   │
│ (legado)    │                   │             │
└─────────────┘                   └─────────────┘
```

## Frontend

- SPA React com rotas por perfil (`admin`, `secretaria`)
- TanStack Query para cache de APIs
- Autenticação via Supabase Auth; token enviado ao backend quando `BYLA_AUTH_ENFORCE=true`
- Toggle de blur para dados sensíveis na UI

## Backend

- Express com routers modulares em `backend/src/routes/`
- Validação centralizada com Zod
- Domínio separado: parsers de planilha, conciliação, controle de caixa, relatórios
- Adapters Supabase para leitura/escrita operacional

## Áreas funcionais (API)

| Área | Responsabilidade |
|------|------------------|
| Conciliação | Pagamentos do fluxo × extrato bancário |
| Entradas / Despesas | Classificação e categorias |
| Controle de caixa | Modos oficial (planilha) e sistema (classificados) |
| Calendário | Visão mensal de vencimentos e pagamentos |
| Relatórios | Payloads estruturados + geração de texto (IA opcional) |
| Sync planilha | Rotas protegidas por segredo para automação n8n |

## Fontes de dados

- **Primária (migração):** Supabase — transações, fluxo operacional, cadastro
- **Legado:** Google Sheets — leitura/escrita controlada por variáveis de ambiente
- **Seeds públicos:** dados sintéticos apenas

## Automação

Três workflows-modelo n8n (desativados, sem credenciais) demonstram padrões de integração. Não são a fonte operacional de produção.

## Deploy típico

- Frontend: Vercel (static + env `VITE_*`)
- Backend: Render (web service Node)
- Banco: Supabase hosted

Detalhes em [DEPLOY_PUBLICO.md](./DEPLOY_PUBLICO.md).
