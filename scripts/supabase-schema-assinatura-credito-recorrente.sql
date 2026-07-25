-- Cadastro de assinaturas PagBank (crédito recorrente / Vendas).
-- Seed inicial: scripts/seed-assinatura-credito-recorrente.sql

create table if not exists public.assinatura_credito_recorrente (
  id uuid primary key default gen_random_uuid(),
  pagbank_subs_id text not null unique,
  pagbank_cust_id text null,
  nome_exibicao text not null,
  status_pagbank text not null default 'Ativa'
    check (status_pagbank in ('Ativa', 'Cancelada')),
  status_byla text not null default 'ativa'
    check (status_byla in ('ativa', 'cancelada', 'parou_de_pagar', 'concluida')),
  valor_bruto numeric(12,2) not null,
  plano_rotulo text null,
  dia_cobranca int not null check (dia_cobranca between 1 and 31),
  ciclo_atual int not null default 1 check (ciclo_atual >= 0),
  ciclo_total int not null default 1 check (ciclo_total >= 1),
  data_criacao_assinatura date null,
  proxima_cobranca date null,
  historico_cobrancas jsonb not null default '[]'::jsonb,
  offset_dias_extrato int not null default 5,
  regra_sticky_id uuid null references public.mapeamento_credito_recorrente(id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assinatura_credito_recorrente_status_byla
  on public.assinatura_credito_recorrente (status_byla)
  where ativo = true;

create index if not exists idx_assinatura_credito_recorrente_dia
  on public.assinatura_credito_recorrente (dia_cobranca)
  where ativo = true and status_byla = 'ativa';

comment on table public.assinatura_credito_recorrente is
  'Cadastro Byla de assinaturas PagBank (SUBS_); espelho informativo + status operacional Byla.';
