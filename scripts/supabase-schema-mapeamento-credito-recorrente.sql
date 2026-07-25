create table if not exists public.mapeamento_credito_recorrente (
  id uuid primary key default gen_random_uuid(),
  rotulo text not null,
  dia_pagamento_fluxo int not null check (dia_pagamento_fluxo between 1 and 31),
  offset_dias_extrato int not null default 5,
  itens jsonb not null default '[]'::jsonb,
  -- itens: [{ "aluno_norm": "ALUNA DEMO A", "aluno_exibicao": "Aluna Demo A", "aba": "BYLA DANÇA", "modalidade": "Contemporânea" }, ...]
  valor_mensalidades_soma numeric(12,2) not null,
  valor_banco_ultimo numeric(12,2) null,
  bandeira_pista text null,
  codigo_ultimo text null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mapeamento_credito_recorrente_ativo
  on public.mapeamento_credito_recorrente (ativo)
  where ativo = true;
