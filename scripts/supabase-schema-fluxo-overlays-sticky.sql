-- Marcações do app (ativo / bolsa / exceção) que sobrevivem à remigração.
-- Esta tabela NÃO é apagada no import da planilha.

create table if not exists public.fluxo_alunos_overlays_sticky (
  aba_norm text not null,
  aluno_nome_norm text not null,
  aba text not null,
  aluno_nome text not null,
  linha_planilha integer not null default 0,
  ativo boolean not null default true,
  regime_cobranca text not null default 'normal',
  pendencia_campos_ignorados jsonb not null default '[]'::jsonb,
  cobranca_tentativas jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (aba_norm, aluno_nome_norm)
);

alter table public.fluxo_alunos_overlays_sticky enable row level security;
