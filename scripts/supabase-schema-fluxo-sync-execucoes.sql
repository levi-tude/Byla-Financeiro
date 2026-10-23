-- BYLA — PROPOSTA (NÃO APLICADA) — log das execuções do sync automático só-inserir do Fluxo.
-- Revisar antes de aplicar. Depois de aplicar, ligar SYNC_LOG_TABLE_ENABLED=true no Render.
-- Só contagens/tipos; sem nomes de alunos.
-- Acesso: apenas service role (backend). RLS ligado e SEM policies → anon/authenticated não leem nem escrevem.

CREATE TABLE IF NOT EXISTS public.fluxo_sync_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL,
  iniciado_em timestamptz NOT NULL,
  finalizado_em timestamptz NOT NULL,
  ano int,
  alunos_inseridos int NOT NULL DEFAULT 0,
  pagamentos_inseridos int NOT NULL DEFAULT 0,
  contagens jsonb,   -- { antes: {...}, depois: {...} }
  conflitos jsonb NOT NULL DEFAULT '[]'::jsonb,
  avisos jsonb NOT NULL DEFAULT '[]'::jsonb,
  erros jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fluxo_sync_execucoes_created_at
  ON public.fluxo_sync_execucoes(created_at DESC);

ALTER TABLE public.fluxo_sync_execucoes ENABLE ROW LEVEL SECURITY;
