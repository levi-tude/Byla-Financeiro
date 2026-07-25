-- Memória sticky: aluno (Fluxo) ↔ pagador no extrato, aprendida nos vínculos manuais.
-- Sobrevive a remigrações; usada para casar automaticamente nos meses seguintes.

create table if not exists public.mapeamento_aluno_pagador (
  id uuid primary key default gen_random_uuid(),
  aluno_normalizado text not null,
  pessoa_banco_normalizada text not null,
  pessoa_banco_exibicao text not null,
  aba text null,
  evidencias int not null default 1,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aluno_normalizado, pessoa_banco_normalizada)
);

create index if not exists idx_mapeamento_aluno_pagador_aluno
  on public.mapeamento_aluno_pagador (aluno_normalizado)
  where ativo = true;

comment on table public.mapeamento_aluno_pagador is
  'Regra sticky aluno Fluxo → nome no extrato; alimentada pela validação dia a dia.';
