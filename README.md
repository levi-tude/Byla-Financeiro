# Byla Financeiro

Sistema financeiro e operacional para estúdios de dança, yoga, pilates e teatro — publicado como **portfólio técnico**.

> **Aviso:** este repositório usa **dados fictícios** em seeds, exemplos e demonstrações. Não contém dados reais de alunos, parceiros ou transações bancárias. Ambientes de produção usam credenciais configuradas apenas nos painéis de deploy (Render, Vercel, Supabase), nunca no Git.

## Direitos reservados

Consulte [LICENSE](./LICENSE). O código é exibido para revisão de portfólio; **não há licença de uso, cópia ou redistribuição** sem autorização prévia por escrito.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React, TypeScript, Vite, TanStack Query |
| Backend | Node.js, Express, Zod |
| Dados | Supabase (Postgres + Auth + RLS) |
| Legado | Google Sheets (migração gradual) |
| Automação | n8n (modelos didáticos sanitizados) |

## Como rodar localmente

### Backend

```bash
cd backend
npm install
cp .env.example .env   # preencha com seus placeholders de demo
npm run dev
```

Padrão: `http://localhost:3001`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Padrão: `http://localhost:5174` (ou a porta indicada no terminal).

### Testes

```bash
cd backend && npm test
cd frontend && npx tsc --noEmit
```

## Documentação pública

| Documento | Conteúdo |
|-----------|----------|
| [docs/ARQUITETURA_PUBLICA.md](./docs/ARQUITETURA_PUBLICA.md) | Visão geral do sistema |
| [docs/SEGURANCA_E_PRIVACIDADE.md](./docs/SEGURANCA_E_PRIVACIDADE.md) | Controles de segurança e privacidade |
| [docs/DEPLOY_PUBLICO.md](./docs/DEPLOY_PUBLICO.md) | Deploy e variáveis de ambiente |
| [docs/DECISOES_TECNICAS.md](./docs/DECISOES_TECNICAS.md) | Decisões arquiteturais resumidas |
| [docs/DEMONSTRACAO.md](./docs/DEMONSTRACAO.md) | Ambiente demo e dados fictícios |
| [SECURITY.md](./SECURITY.md) | Como reportar vulnerabilidades |
| [n8n-workflows/README.md](./n8n-workflows/README.md) | Modelos de automação sanitizados |

## Workflows n8n (modelos)

Três templates didáticos, sem credenciais nem IDs de produção:

- Supabase → Google Sheets
- Google Sheets → Supabase
- Resumo de aluguel → WhatsApp

## O que não está neste repositório

Documentação operacional, contratos, relatórios de estágio, regras financeiras internas e integrações obsoletas (Pluggy, PagBank EDI) foram arquivadas localmente fora do Git público.
