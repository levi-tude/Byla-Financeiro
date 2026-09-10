-- Confirmação de extrato por aluno/competência antes do lançamento no Fluxo.
-- Service role do backend grava; RLS admin-only para authenticated.

create table if not exists public.validacao_extrato_antes_fluxo (
  id bigint generated always as identity primary key,
  aluno_id uuid not null references public.fluxo_alunos_operacionais(id) on delete cascade,
  mes int not null check (mes between 1 and 12),
  ano int not null check (ano between 2000 and 2100),
  banco_id text not null,
  data_ref date not null,
  observacao text null,
  promoted_planilha_id text null,
  promoted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aluno_id, mes, ano)
);

create index if not exists idx_validacao_extrato_antes_fluxo_mes
  on public.validacao_extrato_antes_fluxo (ano, mes);

create index if not exists idx_validacao_extrato_antes_fluxo_banco
  on public.validacao_extrato_antes_fluxo (banco_id);

create index if not exists idx_validacao_extrato_antes_fluxo_pendente_promo
  on public.validacao_extrato_antes_fluxo (ano, mes)
  where promoted_planilha_id is null;

alter table public.validacao_extrato_antes_fluxo enable row level security;

drop policy if exists validacao_extrato_antes_fluxo_admin_only on public.validacao_extrato_antes_fluxo;
create policy validacao_extrato_antes_fluxo_admin_only
on public.validacao_extrato_antes_fluxo
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

comment on table public.validacao_extrato_antes_fluxo is
  'Extrato confirmado por aluno/competência antes do lançamento no Fluxo; promove a validacao_pagamentos_vinculos no sync.';
