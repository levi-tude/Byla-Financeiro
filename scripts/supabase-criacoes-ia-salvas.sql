-- Visões salvas do painel "Criações da IA".
-- APLICADO no projeto Byla em 01/11/2026 (migration criacoes_ia_salvas), com aprovação do Levi.
-- Regras: só admin/gestor; privada ou compartilhada; só o dono edita/apaga; dono imutável;
-- spec JSON (objeto, <= 64 KB), nunca código; updated_at automático; RLS ligada; sem acesso anon.

create table if not exists public.criacoes_ia_salvas (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo       text not null check (char_length(btrim(titulo)) between 3 and 120),
  prompt       text check (prompt is null or char_length(prompt) <= 500),
  visibilidade text not null default 'privada' check (visibilidade in ('privada', 'compartilhada')),
  spec         jsonb not null
               check (jsonb_typeof(spec) = 'object')
               check (pg_column_size(spec) <= 65536),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column public.criacoes_ia_salvas.spec is
  'Somente o spec JSON declarativo do painel (validado no backend por criacoesSpec). Nunca código/JS/SQL.';

create index if not exists criacoes_ia_salvas_owner_idx
  on public.criacoes_ia_salvas (owner_id, created_at desc);
create index if not exists criacoes_ia_salvas_compart_idx
  on public.criacoes_ia_salvas (created_at desc) where visibilidade = 'compartilhada';

-- updated_at automático
create or replace function public.criacoes_ia_salvas_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.owner_id := old.owner_id;  -- dono não pode ser trocado
  return new;
end $$;

drop trigger if exists trg_criacoes_ia_salvas_touch on public.criacoes_ia_salvas;
create trigger trg_criacoes_ia_salvas_touch
  before update on public.criacoes_ia_salvas
  for each row execute function public.criacoes_ia_salvas_touch();

alter table public.criacoes_ia_salvas enable row level security;

-- Ler: precisa ser admin/gestor E (ser o dono OU a visão ser compartilhada)
create policy criacoes_ia_salvas_select on public.criacoes_ia_salvas
  for select to authenticated
  using (
    (public.has_role('admin') or public.has_role('gestor'))
    and (owner_id = (select auth.uid()) or visibilidade = 'compartilhada')
  );

-- Criar: admin/gestor, sempre em nome próprio
create policy criacoes_ia_salvas_insert on public.criacoes_ia_salvas
  for insert to authenticated
  with check (
    (public.has_role('admin') or public.has_role('gestor'))
    and owner_id = (select auth.uid())
  );

-- Editar: só o dono (e ainda admin/gestor)
create policy criacoes_ia_salvas_update on public.criacoes_ia_salvas
  for update to authenticated
  using ((public.has_role('admin') or public.has_role('gestor')) and owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Apagar: só o dono
create policy criacoes_ia_salvas_delete on public.criacoes_ia_salvas
  for delete to authenticated
  using ((public.has_role('admin') or public.has_role('gestor')) and owner_id = (select auth.uid()));

revoke all on public.criacoes_ia_salvas from anon, public;
grant select, insert, update, delete on public.criacoes_ia_salvas to authenticated;
