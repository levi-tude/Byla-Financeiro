# Byla – Painel Financeiro (frontend)

Frontend do painel administrativo da Byla: visão geral financeira, conciliação, entradas, atividades e despesas.

## Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- React Router
- Recharts
- Supabase (client)

## Como rodar

1. **Instalar dependências**

   ```bash
   cd frontend
   npm install
   ```

2. **Configurar Supabase**

   - Copie `.env.example` para `.env`.
   - No Supabase: **Project Settings → API**.
   - Preencha:
     - `VITE_SUPABASE_URL` = Project URL (ex.: `https://flbimmwxxsvixhghmmfu.supabase.co`).
     - `VITE_SUPABASE_ANON_KEY` = anon public key.

   Para a primeira tela (Visão geral) funcionar, a view `v_resumo_mensal_oficial` precisa estar acessível para o role `anon` (ou o role que sua anon key usa). No SQL Editor do Supabase:

   ```sql
   GRANT SELECT ON public.v_resumo_mensal_oficial TO anon;
   ```

3. **Subir o servidor de desenvolvimento**

   ```bash
   npm run dev
   ```

   Acesse **http://localhost:5174** (porta configurada no `vite.config.ts`).

## Estrutura

- `src/app/` – layout (Shell, Sidebar, Topbar).
- `src/pages/` – páginas (Overview, Conciliação, etc.).
- `src/components/` – UI e gráficos reutilizáveis.
- `src/services/` – chamadas ao Supabase.
- `src/hooks/` – hooks de dados.
- `src/types/` – tipos TypeScript.

## Build

```bash
npm run build
```

Saída em `dist/`. Para preview: `npm run preview`.
