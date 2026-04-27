-- BYLA - Schema operacional do CONTROLE DE CAIXA no Supabase
-- Objetivo: tornar o fluxo mensal independente da planilha como fonte principal.

CREATE TABLE IF NOT EXISTS public.controle_caixa_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano int NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  aba_ref text,
  entrada_total numeric(12,2),
  saida_total numeric(12,2),
  lucro_total numeric(12,2),
  saida_parceiros_total numeric(12,2),
  saida_fixas_total numeric(12,2),
  saida_soma_secoes_principais numeric(12,2),
  origem text NOT NULL DEFAULT 'sistema',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mes, ano)
);

CREATE TABLE IF NOT EXISTS public.controle_caixa_blocos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES public.controle_caixa_periodos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  titulo text NOT NULL,
  ordem int NOT NULL DEFAULT 0,
  template_key text,
  is_default boolean NOT NULL DEFAULT false,
  is_custom boolean NOT NULL DEFAULT true,
  locked_level text NOT NULL DEFAULT 'none' CHECK (locked_level IN ('none', 'warn', 'strong')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (periodo_id, tipo, titulo)
);

CREATE TABLE IF NOT EXISTS public.controle_caixa_linhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloco_id uuid NOT NULL REFERENCES public.controle_caixa_blocos(id) ON DELETE CASCADE,
  label text NOT NULL,
  valor numeric(12,2),
  valor_texto text,
  ordem int NOT NULL DEFAULT 0,
  template_key text,
  is_default boolean NOT NULL DEFAULT false,
  is_custom boolean NOT NULL DEFAULT true,
  locked_level text NOT NULL DEFAULT 'none' CHECK (locked_level IN ('none', 'warn', 'strong')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.controle_caixa_blocos
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS locked_level text NOT NULL DEFAULT 'none';

ALTER TABLE public.controle_caixa_linhas
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS locked_level text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'controle_caixa_blocos_locked_level_check'
  ) THEN
    ALTER TABLE public.controle_caixa_blocos
      ADD CONSTRAINT controle_caixa_blocos_locked_level_check
      CHECK (locked_level IN ('none', 'warn', 'strong'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'controle_caixa_linhas_locked_level_check'
  ) THEN
    ALTER TABLE public.controle_caixa_linhas
      ADD CONSTRAINT controle_caixa_linhas_locked_level_check
      CHECK (locked_level IN ('none', 'warn', 'strong'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_controle_caixa_periodos_mes_ano
  ON public.controle_caixa_periodos(ano, mes);
CREATE INDEX IF NOT EXISTS idx_controle_caixa_blocos_periodo
  ON public.controle_caixa_blocos(periodo_id, tipo, ordem);
CREATE INDEX IF NOT EXISTS idx_controle_caixa_linhas_bloco
  ON public.controle_caixa_linhas(bloco_id, ordem);

CREATE OR REPLACE FUNCTION public.set_updated_at_controle_caixa_periodos()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_controle_caixa_periodos_updated_at ON public.controle_caixa_periodos;
CREATE TRIGGER trg_controle_caixa_periodos_updated_at
BEFORE UPDATE ON public.controle_caixa_periodos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_controle_caixa_periodos();

ALTER TABLE public.controle_caixa_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controle_caixa_blocos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controle_caixa_linhas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS controle_caixa_periodos_operacional_select ON public.controle_caixa_periodos;
CREATE POLICY controle_caixa_periodos_operacional_select
ON public.controle_caixa_periodos
FOR SELECT
USING (public.has_role('admin') OR public.has_role('secretaria'));

DROP POLICY IF EXISTS controle_caixa_periodos_operacional_write ON public.controle_caixa_periodos;
CREATE POLICY controle_caixa_periodos_operacional_write
ON public.controle_caixa_periodos
FOR ALL
USING (public.has_role('admin') OR public.has_role('secretaria'))
WITH CHECK (public.has_role('admin') OR public.has_role('secretaria'));

DROP POLICY IF EXISTS controle_caixa_blocos_operacional_select ON public.controle_caixa_blocos;
CREATE POLICY controle_caixa_blocos_operacional_select
ON public.controle_caixa_blocos
FOR SELECT
USING (public.has_role('admin') OR public.has_role('secretaria'));

DROP POLICY IF EXISTS controle_caixa_blocos_operacional_write ON public.controle_caixa_blocos;
CREATE POLICY controle_caixa_blocos_operacional_write
ON public.controle_caixa_blocos
FOR ALL
USING (public.has_role('admin') OR public.has_role('secretaria'))
WITH CHECK (public.has_role('admin') OR public.has_role('secretaria'));

DROP POLICY IF EXISTS controle_caixa_linhas_operacional_select ON public.controle_caixa_linhas;
CREATE POLICY controle_caixa_linhas_operacional_select
ON public.controle_caixa_linhas
FOR SELECT
USING (public.has_role('admin') OR public.has_role('secretaria'));

DROP POLICY IF EXISTS controle_caixa_linhas_operacional_write ON public.controle_caixa_linhas;
CREATE POLICY controle_caixa_linhas_operacional_write
ON public.controle_caixa_linhas
FOR ALL
USING (public.has_role('admin') OR public.has_role('secretaria'))
WITH CHECK (public.has_role('admin') OR public.has_role('secretaria'));
