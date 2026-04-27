-- BYLA - Estrutura operacional da planilha FLUXO DE CAIXA BYLA
-- Objetivo: preservar os dados da planilha (cadastro + pagamentos) no Supabase
-- para transição sem retrabalho da secretária.

CREATE TABLE IF NOT EXISTS public.fluxo_alunos_operacionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aba text NOT NULL,
  modalidade text NOT NULL,
  linha_planilha int NOT NULL,
  aluno_nome text NOT NULL,
  wpp text,
  responsaveis text,
  plano text,
  matricula text,
  fim text,
  venc text,
  valor_referencia numeric(12,2),
  pagador_pix text,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  raw_row jsonb NOT NULL DEFAULT '{}'::jsonb,
  origem text NOT NULL DEFAULT 'migracao_planilha',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aba, linha_planilha)
);

CREATE INDEX IF NOT EXISTS idx_fluxo_alunos_operacionais_aba
  ON public.fluxo_alunos_operacionais(aba);
CREATE INDEX IF NOT EXISTS idx_fluxo_alunos_operacionais_modalidade
  ON public.fluxo_alunos_operacionais(modalidade);
CREATE INDEX IF NOT EXISTS idx_fluxo_alunos_operacionais_aluno
  ON public.fluxo_alunos_operacionais(aluno_nome);
CREATE INDEX IF NOT EXISTS idx_fluxo_alunos_operacionais_ativo
  ON public.fluxo_alunos_operacionais(ativo);

CREATE TABLE IF NOT EXISTS public.fluxo_pagamentos_operacionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aba text NOT NULL,
  modalidade text NOT NULL,
  linha_planilha int NOT NULL,
  ordem_lancamento int NOT NULL DEFAULT 1,
  aluno_nome text NOT NULL,
  data_pagamento date NOT NULL,
  forma text,
  valor numeric(12,2) NOT NULL,
  mes_competencia int NOT NULL CHECK (mes_competencia BETWEEN 1 AND 12),
  ano_competencia int NOT NULL CHECK (ano_competencia BETWEEN 2000 AND 2100),
  responsaveis text,
  pagador_pix text,
  raw_pagamento jsonb NOT NULL DEFAULT '{}'::jsonb,
  origem text NOT NULL DEFAULT 'migracao_planilha',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aba, linha_planilha, ordem_lancamento, data_pagamento, forma, valor, mes_competencia, ano_competencia)
);

ALTER TABLE public.fluxo_pagamentos_operacionais
  ADD COLUMN IF NOT EXISTS ordem_lancamento int NOT NULL DEFAULT 1;

ALTER TABLE public.fluxo_pagamentos_operacionais
  DROP CONSTRAINT IF EXISTS fluxo_pagamentos_operacionais_aba_linha_planilha_data_pagam_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fluxo_pagamentos_operacionais_unique_lancamento'
  ) THEN
    ALTER TABLE public.fluxo_pagamentos_operacionais
      ADD CONSTRAINT fluxo_pagamentos_operacionais_unique_lancamento
      UNIQUE (aba, modalidade, linha_planilha, ordem_lancamento, aluno_nome, data_pagamento, forma, valor, mes_competencia, ano_competencia);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fluxo_pagamentos_operacionais_ano_comp
  ON public.fluxo_pagamentos_operacionais(ano_competencia, mes_competencia);
CREATE INDEX IF NOT EXISTS idx_fluxo_pagamentos_operacionais_aba
  ON public.fluxo_pagamentos_operacionais(aba);
CREATE INDEX IF NOT EXISTS idx_fluxo_pagamentos_operacionais_modalidade
  ON public.fluxo_pagamentos_operacionais(modalidade);
CREATE INDEX IF NOT EXISTS idx_fluxo_pagamentos_operacionais_aluno
  ON public.fluxo_pagamentos_operacionais(aluno_nome);

CREATE OR REPLACE FUNCTION public.set_updated_at_fluxo_alunos_operacionais()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fluxo_alunos_operacionais_updated_at ON public.fluxo_alunos_operacionais;
CREATE TRIGGER trg_fluxo_alunos_operacionais_updated_at
BEFORE UPDATE ON public.fluxo_alunos_operacionais
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_fluxo_alunos_operacionais();

ALTER TABLE public.fluxo_alunos_operacionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxo_pagamentos_operacionais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fluxo_alunos_operacionais_select ON public.fluxo_alunos_operacionais;
CREATE POLICY fluxo_alunos_operacionais_select
ON public.fluxo_alunos_operacionais
FOR SELECT
USING (public.has_role('admin') OR public.has_role('secretaria'));

DROP POLICY IF EXISTS fluxo_alunos_operacionais_write ON public.fluxo_alunos_operacionais;
CREATE POLICY fluxo_alunos_operacionais_write
ON public.fluxo_alunos_operacionais
FOR ALL
USING (public.has_role('admin') OR public.has_role('secretaria'))
WITH CHECK (public.has_role('admin') OR public.has_role('secretaria'));

DROP POLICY IF EXISTS fluxo_pagamentos_operacionais_select ON public.fluxo_pagamentos_operacionais;
CREATE POLICY fluxo_pagamentos_operacionais_select
ON public.fluxo_pagamentos_operacionais
FOR SELECT
USING (public.has_role('admin') OR public.has_role('secretaria'));

DROP POLICY IF EXISTS fluxo_pagamentos_operacionais_write ON public.fluxo_pagamentos_operacionais;
CREATE POLICY fluxo_pagamentos_operacionais_write
ON public.fluxo_pagamentos_operacionais
FOR ALL
USING (public.has_role('admin') OR public.has_role('secretaria'))
WITH CHECK (public.has_role('admin') OR public.has_role('secretaria'));
