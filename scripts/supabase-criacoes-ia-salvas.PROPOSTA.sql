-- =====================================================================
-- PRECISA APROVAÇÃO DO LEVI — NÃO APLICADO
-- Proposta: salvar "Criações da IA" (prompt + spec JSON) por usuário.
-- Não rodar em nenhum ambiente sem aprovação explícita.
-- O protótipo atual salva só no localStorage do navegador.
-- =====================================================================

create table if not exists public.criacoes_ia (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  prompt text not null check (char_length(prompt) between 3 and 500),
  spec jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists criacoes_ia_owner_created_idx
  on public.criacoes_ia (owner_id, created_at desc);

alter table public.criacoes_ia enable row level security;

-- Somente o dono enxerga/edita as próprias criações.
create policy criacoes_ia_select_own on public.criacoes_ia
  for select to authenticated using (owner_id = (select auth.uid()));
create policy criacoes_ia_insert_own on public.criacoes_ia
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy criacoes_ia_update_own on public.criacoes_ia
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy criacoes_ia_delete_own on public.criacoes_ia
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.criacoes_ia from anon;
grant select, insert, update, delete on public.criacoes_ia to authenticated;
