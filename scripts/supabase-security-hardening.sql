-- BYLA — Endurecimento de segurança (Supabase)
-- Aplicar via SQL Editor ou: supabase migration / MCP apply_migration
-- 1) RLS na tabela de mapeamento (estava aberta para anon)
-- 2) search_path fixo em funções críticas
-- 3) Views com security_invoker (respeitam RLS do usuário logado)

-- -----------------------------------------------------------------------------
-- 1) mapeamento_pessoa_categoria — RLS + revoga acesso anônimo
-- -----------------------------------------------------------------------------
ALTER TABLE public.mapeamento_pessoa_categoria ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.mapeamento_pessoa_categoria FROM anon;

DROP POLICY IF EXISTS mapeamento_select_operacional ON public.mapeamento_pessoa_categoria;
CREATE POLICY mapeamento_select_operacional
ON public.mapeamento_pessoa_categoria
FOR SELECT
USING (public.has_role('admin') OR public.has_role('secretaria'));

DROP POLICY IF EXISTS mapeamento_write_admin ON public.mapeamento_pessoa_categoria;
CREATE POLICY mapeamento_write_admin
ON public.mapeamento_pessoa_categoria
FOR ALL
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

-- -----------------------------------------------------------------------------
-- 2) Funções — search_path imutável (evita hijack de schema)
-- -----------------------------------------------------------------------------
ALTER FUNCTION public.has_role(text) SET search_path = public;
ALTER FUNCTION public.byla_norm_pessoa(text) SET search_path = public;
ALTER FUNCTION public.set_updated_at_profiles() SET search_path = public;
ALTER FUNCTION public.set_updated_at_controle_caixa_periodos() SET search_path = public;
ALTER FUNCTION public.set_updated_at_fluxo_alunos_operacionais() SET search_path = public;

-- -----------------------------------------------------------------------------
-- 3) Views — security_invoker (não ignoram RLS do caller)
-- -----------------------------------------------------------------------------
ALTER VIEW IF EXISTS public.v_comparativo_cadastro_vs_oficial SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_transacoes_export SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_mensalidades_sem_valor SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_reconciliacao_mensalidades SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_alunos_por_atividade SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_resumo_mensal_oficial SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_mensalidades_por_atividade SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_mensalidades_aluno_e_pagador SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_entradas_oficial SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_precos_mensalidade_por_atividade SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_resumo_atividade SET (security_invoker = true);
