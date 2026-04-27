-- BYLA - Auditoria operacional do FLUXO (secretária/admin)
-- Guarda histórico de criação/edição/remoção em alunos/pagamentos do fluxo.

CREATE TABLE IF NOT EXISTS public.fluxo_operacional_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade text NOT NULL CHECK (entidade IN ('aluno', 'pagamento')),
  acao text NOT NULL CHECK (acao IN ('create', 'update', 'delete')),
  registro_id text,
  aba text,
  modalidade text,
  aluno_nome text,
  user_id uuid,
  user_email text,
  user_role text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fluxo_operacional_auditoria_created_at
  ON public.fluxo_operacional_auditoria(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fluxo_operacional_auditoria_entidade
  ON public.fluxo_operacional_auditoria(entidade, created_at DESC);

ALTER TABLE public.fluxo_operacional_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fluxo_operacional_auditoria_select ON public.fluxo_operacional_auditoria;
CREATE POLICY fluxo_operacional_auditoria_select
ON public.fluxo_operacional_auditoria
FOR SELECT
USING (public.has_role('admin') OR public.has_role('secretaria'));

DROP POLICY IF EXISTS fluxo_operacional_auditoria_write ON public.fluxo_operacional_auditoria;
CREATE POLICY fluxo_operacional_auditoria_write
ON public.fluxo_operacional_auditoria
FOR INSERT
WITH CHECK (public.has_role('admin') OR public.has_role('secretaria'));
