-- Grupos família/casal para Validação N→1 (sticky).
-- Schema público sem dados de clientes. Seed operacional só no Supabase (fora do Git).

create table if not exists public.grupo_familia_pagamento (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  rotulo text not null,
  -- Cada membro: array de tokens que devem aparecer no nome normalizado do aluno.
  -- Ex.: [["MARINA","COSTA"],["SOFIA","COSTA"]]
  membros jsonb not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grupo_familia_pagamento_membros_array check (jsonb_typeof(membros) = 'array')
);

create index if not exists idx_grupo_familia_pagamento_ativo
  on public.grupo_familia_pagamento (ativo)
  where ativo = true;

comment on table public.grupo_familia_pagamento is
  'Catálogo sticky de pares/grupos que pagam juntos (N→1). Dados reais só no banco.';
