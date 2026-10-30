-- ============================================================================
-- APLICADO em produção em 30/10/2026 (migration 20261030165119 profiles_role_gestor).
-- Nenhum usuário recebeu o papel gestor ainda.
-- ============================================================================
-- Objetivo: permitir o papel 'gestor' (só leitura) em public.profiles.
-- Hoje a coluna role tem CHECK (role in ('admin','secretaria')), então o código
-- já aceita 'gestor', mas o banco recusaria gravar esse valor.
--
-- O que NÃO muda: nenhuma política RLS nem grant. has_role('admin') /
-- has_role('secretaria') continuam iguais, então o gestor não ganha escrita
-- direta em nenhuma tabela. Ele só lê dados pelo backend (Consulta Byla),
-- que bloqueia o gestor em todas as outras rotas (middleware restrictGestor).
--
-- Confira antes o nome real da constraint:
--   select conname from pg_constraint
--   where conrelid = 'public.profiles'::regclass and contype = 'c';
-- ============================================================================

begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'secretaria', 'gestor'));

commit;

-- Para dar o papel a alguém (exemplo, depois de aprovado):
--   update public.profiles set role = 'gestor' where id = '<uuid do usuário>';
