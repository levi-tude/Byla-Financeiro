-- Harden de permissões das views do painel.
-- Objetivo:
-- 1) nunca expor views para anon/public
-- 2) forçar evaluation com permissões do usuário (security_invoker)
-- 3) permitir leitura para usuários autenticados (RLS nas tabelas base controla o papel)

ALTER VIEW public.v_resumo_mensal_oficial SET (security_invoker = true);
ALTER VIEW public.v_entradas_oficial SET (security_invoker = true);
ALTER VIEW public.v_reconciliacao_mensalidades SET (security_invoker = true);
ALTER VIEW public.v_resumo_atividade SET (security_invoker = true);
ALTER VIEW public.v_alunos_por_atividade SET (security_invoker = true);
ALTER VIEW public.v_mensalidades_por_atividade SET (security_invoker = true);

REVOKE ALL ON public.v_resumo_mensal_oficial FROM anon, public;
REVOKE ALL ON public.v_entradas_oficial FROM anon, public;
REVOKE ALL ON public.v_reconciliacao_mensalidades FROM anon, public;
REVOKE ALL ON public.v_resumo_atividade FROM anon, public;
REVOKE ALL ON public.v_alunos_por_atividade FROM anon, public;
REVOKE ALL ON public.v_mensalidades_por_atividade FROM anon, public;

GRANT SELECT ON public.v_resumo_mensal_oficial TO authenticated;
GRANT SELECT ON public.v_entradas_oficial TO authenticated;
GRANT SELECT ON public.v_reconciliacao_mensalidades TO authenticated;
GRANT SELECT ON public.v_resumo_atividade TO authenticated;
GRANT SELECT ON public.v_alunos_por_atividade TO authenticated;
GRANT SELECT ON public.v_mensalidades_por_atividade TO authenticated;
