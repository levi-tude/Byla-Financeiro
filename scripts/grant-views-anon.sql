-- Permite que o frontend (chave anon) leia as views do painel.
-- Execute no SQL Editor do Supabase: app.supabase.com -> seu projeto -> SQL Editor -> New query -> cole e rode.

GRANT SELECT ON public.v_resumo_mensal_oficial TO anon;
GRANT SELECT ON public.v_entradas_oficial TO anon;
GRANT SELECT ON public.v_reconciliacao_mensalidades TO anon;
GRANT SELECT ON public.v_resumo_atividade TO anon;
GRANT SELECT ON public.v_alunos_por_atividade TO anon;
GRANT SELECT ON public.v_mensalidades_por_atividade TO anon;
