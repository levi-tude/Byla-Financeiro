# Deploy público

Guia genérico para publicar uma instância de demonstração. Substitua placeholders pelos seus recursos.

## Serviços

| Serviço | Função | Variáveis principais |
|---------|--------|---------------------|
| Vercel | Frontend estático | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL`, `VITE_SITE_URL` |
| Render | Backend Node | Ver `backend/.env.example` |
| Supabase | Postgres + Auth | URL, anon key, service role (só backend) |

## Backend (Render)

1. Crie um **Web Service** apontando para `backend/`
2. Build: `npm install && npm run build` (ou conforme `package.json`)
3. Start: `npm start`
4. Bind: `0.0.0.0:$PORT` (exigido pelo Render)
5. Configure variáveis a partir de `backend/.env.example`

Obrigatórias para demo funcional:

```
PORT=3001
CORS_ORIGIN=https://seu-frontend.vercel.app
BYLA_AUTH_ENFORCE=true
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
BYLA_SYNC_SECRET=generate_a_long_random_secret
```

Opcionais conforme features: chaves de IA, Google Sheets, rate limits.

## Frontend (Vercel)

1. Root directory: `frontend/`
2. Framework preset: Vite
3. Env de build:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_BACKEND_URL=https://your-backend.onrender.com
VITE_SITE_URL=https://your-frontend.vercel.app
```

4. No Supabase → Authentication → URL Configuration:
   - Site URL = `VITE_SITE_URL`
   - Redirect URLs incluem `/redefinir-senha` no domínio do frontend

## Supabase

1. Crie projeto isolado para demo (não reutilize produção)
2. Execute migrations em `scripts/supabase-schema-*.sql` na ordem documentada nos comentários
3. Carregue seed sintético se disponível (`scripts/seed-demo-synthetic.sql`)
4. Configure RLS e roles conforme migrations de hardening

## n8n (opcional)

Importe templates de `n8n-workflows/*/workflow.template.json`. Recrie credenciais no seu n8n; não use valores de exemplos antigos.

## Checklist pré-publicação

- [ ] `.env` e secrets fora do Git
- [ ] `npm test` no backend passando
- [ ] Frontend build sem erros
- [ ] Gitleaks local sem achados críticos
- [ ] CORS apontando só para seu frontend
- [ ] Demo usando projeto Supabase separado

## Rollback

Mantenha deploy anterior no Render/Vercel. Nunca faça rollback para commit que continha segredos no histórico.
