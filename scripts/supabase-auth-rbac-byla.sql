-- BYLA - Auth + RBAC (secretaria x admin)
-- Execute no SQL Editor do Supabase.
-- Objetivo:
-- 1) Criar tabela profiles vinculada ao auth.users
-- 2) Definir papel por usuário: secretaria ou admin
-- 3) Aplicar políticas RLS por domínio

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'secretaria')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at_profiles()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at_profiles();

-- Helper: verifica papel do usuário logado.
create or replace function public.has_role(target_role text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = target_role
  );
$$;

alter table public.profiles enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
on public.profiles
for select
using (id = auth.uid() or public.has_role('admin'));

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
on public.profiles
for update
using (public.has_role('admin'))
with check (public.has_role('admin'));

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin
on public.profiles
for insert
with check (public.has_role('admin'));

-- Tabelas operacionais (secretaria + admin)
alter table if exists public.alunos enable row level security;
alter table if exists public.atividades enable row level security;
alter table if exists public.aluno_planos enable row level security;
alter table if exists public.planos enable row level security;

drop policy if exists alunos_operacional_select on public.alunos;
create policy alunos_operacional_select on public.alunos for select using (public.has_role('admin') or public.has_role('secretaria'));
drop policy if exists alunos_operacional_write on public.alunos;
create policy alunos_operacional_write on public.alunos for all using (public.has_role('admin') or public.has_role('secretaria')) with check (public.has_role('admin') or public.has_role('secretaria'));

drop policy if exists atividades_operacional_select on public.atividades;
create policy atividades_operacional_select on public.atividades for select using (public.has_role('admin') or public.has_role('secretaria'));
drop policy if exists atividades_operacional_write on public.atividades;
create policy atividades_operacional_write on public.atividades for all using (public.has_role('admin') or public.has_role('secretaria')) with check (public.has_role('admin') or public.has_role('secretaria'));

drop policy if exists aluno_planos_operacional_select on public.aluno_planos;
create policy aluno_planos_operacional_select on public.aluno_planos for select using (public.has_role('admin') or public.has_role('secretaria'));
drop policy if exists aluno_planos_operacional_write on public.aluno_planos;
create policy aluno_planos_operacional_write on public.aluno_planos for all using (public.has_role('admin') or public.has_role('secretaria')) with check (public.has_role('admin') or public.has_role('secretaria'));

drop policy if exists planos_operacional_select on public.planos;
create policy planos_operacional_select on public.planos for select using (public.has_role('admin') or public.has_role('secretaria'));
drop policy if exists planos_operacional_write on public.planos;
create policy planos_operacional_write on public.planos for all using (public.has_role('admin') or public.has_role('secretaria')) with check (public.has_role('admin') or public.has_role('secretaria'));

-- Tabelas financeiras sensíveis (somente admin)
alter table if exists public.transacoes enable row level security;
alter table if exists public.despesas enable row level security;
alter table if exists public.validacao_pagamentos_vinculos enable row level security;

drop policy if exists transacoes_admin_only on public.transacoes;
create policy transacoes_admin_only
on public.transacoes
for all
using (public.has_role('admin'))
with check (public.has_role('admin'));

drop policy if exists despesas_admin_only on public.despesas;
create policy despesas_admin_only
on public.despesas
for all
using (public.has_role('admin'))
with check (public.has_role('admin'));

drop policy if exists validacao_pagamentos_vinculos_admin_only on public.validacao_pagamentos_vinculos;
create policy validacao_pagamentos_vinculos_admin_only
on public.validacao_pagamentos_vinculos
for all
using (public.has_role('admin'))
with check (public.has_role('admin'));

-- Exemplo inicial (troque o UUID e role conforme seus usuários):
-- insert into public.profiles (id, role) values ('00000000-0000-0000-0000-000000000000', 'admin')
-- on conflict (id) do update set role = excluded.role, updated_at = now();
