-- APLICADO em produção em 30/10/2026 (migration 20261030165101 fix_has_role_security_definer).
-- Corrige "stack depth limit exceeded" (54001) para usuários não-admin (ex.: secretaria):
-- has_role() era SECURITY INVOKER e lia public.profiles, cuja policy
-- profiles_select_self_or_admin chama has_role('admin') -> recursão infinita de RLS.
begin;
create or replace function public.has_role(target_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = target_role
  );
$$;
revoke execute on function public.has_role(text) from public, anon;
grant execute on function public.has_role(text) to authenticated, service_role;
commit;
