-- Vinculos manuais entre lancamentos de banco e planilha
-- Regra: 1 banco -> N planilha, e 1 planilha -> 1 banco

create table if not exists public.validacao_pagamentos_vinculos (
  id bigint generated always as identity primary key,
  data_ref date not null,
  mes int not null check (mes between 1 and 12),
  ano int not null check (ano between 2000 and 2100),
  banco_id text not null,
  planilha_id text not null unique,
  observacao text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_validacao_pagamentos_vinculos_data on public.validacao_pagamentos_vinculos (data_ref, mes, ano);
create index if not exists idx_validacao_pagamentos_vinculos_banco on public.validacao_pagamentos_vinculos (banco_id);

