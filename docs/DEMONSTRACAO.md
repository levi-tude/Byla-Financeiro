# Demonstração e dados fictícios

## Objetivo

Permitir que revisores de portfólio executem o sistema **sem acesso a dados reais** do Espaço Byla ou de clientes.

## O que é fictício

| Item | Descrição |
|------|-----------|
| Seeds SQL | Alunos, transações e pagamentos inventados |
| Planilhas de exemplo | IDs placeholder (`YOUR_SHEET_ID`) |
| Workflows n8n | Templates desativados, sem webhooks reais |
| `.env.example` | Apenas nomes de variáveis e placeholders |

## Ambiente demo recomendado

1. **Projeto Supabase novo** — não compartilhe com produção
2. **Backend Render ou local** — env preenchido a partir de `.env.example`
3. **Frontend Vercel preview ou local** — `VITE_*` apontando para o Supabase demo
4. **Usuários de teste** — crie admin/secretaria no Auth do Supabase demo

## Repositório demo separado

Existe (ou existirá) um app `Byla-Portfolio-Demo` com dados totalmente fictícios e sem ligação com produção. Este repositório (`Byla-Financeiro`) é o código-fonte sanitizado; o demo pode ser um fork configurado só com seeds sintéticos.

## O que você verá funcionando

- Login e roles
- Listagens de entradas/despesas (dados seed)
- Fluxos de conciliação e calendário (com dados limitados)
- Relatórios estruturados; IA opcional se configurar chave própria
- Importação planilha (se configurar Google credentials de teste)

## O que não está disponível publicamente

- Planilhas Google reais
- Webhooks n8n de produção
- Regras de repasse a parceiros
- Documentos contratuais ou relatórios de estágio

## Isolamento

Antes de tornar o repo público novamente, validar:

- Gitleaks / secret scan limpos
- Nenhum ID real em env examples ou código
- Seeds passam revisão humana (sem nomes reais)
- Preview deploy usa recursos isolados

Consulte também a spec de sanitização em `docs/superpowers/specs/2026-07-21-public-repository-sanitization-design.md`.
