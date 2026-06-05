-- Competência efetiva por transação bancária (extrato)
-- Caixa = data no extrato; competência = mês de referência da mensalidade/repasse

create table if not exists public.transacao_competencia (
  transacao_id text primary key,
  mes_competencia int not null check (mes_competencia between 1 and 12),
  ano_competencia int not null check (ano_competencia between 2000 and 2100),
  confirmada boolean not null default false,
  origem_sugestao text not null default 'manual'
    check (origem_sugestao in ('data_extrato', 'validacao_fluxo', 'heuristica_repasso', 'manual')),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transacao_competencia_mes_ano
  on public.transacao_competencia (ano_competencia, mes_competencia);
