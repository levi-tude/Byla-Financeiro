# Segurança — explicação bem simples

## O que era o problema?

Pense no sistema como **uma casa com 3 portas**:

### Porta 1 — Caderno de regras no banco (mais grave)
- Tinha um caderno com regras de “quem é coworking, quem é mensalidade”.
- A **porta estava sem fechadura**: qualquer um com a “chave do site” podia ler e **mudar** o caderno.
- **O que fizemos:** colocamos fechadura. Só quem **entrou com login** (admin ou secretária) vê; só **admin** altera. Visitante sem login não entra.

### Porta 2 — Janelas que viam tudo
- Algumas “janelas” (views) no banco mostravam dados como se fossem o dono da casa, não o usuário logado.
- **O que fizemos:** as janelas agora mostram só o que **aquele usuário** pode ver.

### Porta 3 — Site na internet
- O site podia ser **embutido** em outra página (golpe visual).
- **O que fizemos:** trinco no site (headers de segurança na Vercel).
- O servidor (Render) já pede **login** nas APIs importantes.

---

## O que falta VOCÊ ligar (1 minuto)

Só no **painel do Supabase** (não dá para ligar só por código):

1. Abra [Supabase](https://supabase.com/dashboard) → seu projeto BYLA  
2. **Authentication** → **Sign In / Providers** → **Email**  
3. Ative **“Prevent use of leaked passwords”** (senhas que já vazaram na internet)  
4. **Authentication** → **URL Configuration**  
   - **Site URL:** `https://frontend-levi-tudes-projects.vercel.app`  
   - **Redirect URLs:** adicione  
     `https://frontend-levi-tudes-projects.vercel.app/redefinir-senha`  
     e `http://localhost:5173/redefinir-senha`

Pronto. Isso protege a **troca de senha** e bloqueia senhas fracas conhecidas.

---

## Está tudo certo?

| Item | Status |
|------|--------|
| Fechadura no caderno de regras (RLS) | Feito no banco |
| Janelas corrigidas (views) | Feito no banco |
| Trinco no site (headers) | Feito na Vercel |
| Alarme de senha vazada | **Você liga no painel** |
| Link de “esqueci senha” | **Você confere URLs no painel** |

Antes de cada atualização no GitHub: `npm run verify:push`

---

## Validação de pagamentos — fonte de dados (fluxo × banco)

A conferência diária **não usa planilha Google** no dia a dia. Os pagamentos vêm do **Fluxo operacional** no Supabase (`fluxo_pagamentos_operacionais`); o extrato vem de `transacoes` (entradas oficiais).

| Variável (backend `.env` / Render) | Padrão recomendado | Significado |
|-----------------------------------|-------------------|-------------|
| `BYLA_SOURCE_FLUXO_PRIMARY` | `true` | Pagamentos da validação e calendário vêm do fluxo no Supabase. |
| `BYLA_PLANILHA_READ` | `false` | Desliga leitura da planilha Google no servidor. |
| `BYLA_VALIDACAO_PLANILHA_FALLBACK` | `false` | Só use `true` em migração pontual; não é operação normal. |

**APIs principais**

- `GET /api/fluxo-operacional/validacao-indice-ano?ano=&aba=&modalidade=` — lista de datas (chips) e filtros.
- `GET /api/validacao-pagamentos-diaria?data=&aba=&modalidade=` — detalhe do dia (fluxo × banco).
- `GET /api/calendario-financeiro?mes=&ano=` — visão mensal (mesma fonte de pagamentos do fluxo).

Depois de alterar `.env`, **reinicie o backend**.
