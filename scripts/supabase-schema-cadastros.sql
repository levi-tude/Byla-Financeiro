-- =============================================================================
-- BYLA - Schema das tabelas de cadastro (atividades, planos, alunos, aluno_planos)
-- Execute no SQL Editor do Supabase se as tabelas ainda não existirem.
-- Se já existirem com estrutura diferente, adapte ou pule este bloco.
-- =============================================================================

-- Atividades (modalidades): Pilates, Contemporânea, Ballet, Jazz, Teatro, GR, etc.
CREATE TABLE IF NOT EXISTS public.atividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  created_at timestamp without time zone DEFAULT now()
);

-- Planos: um por atividade (ex.: "Mensalidade"); valor de referência em valor_mensal; valor real por pagamento em aluno_planos
CREATE TABLE IF NOT EXISTS public.planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id uuid NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Mensalidade',
  valor_mensal numeric(12, 2) DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  UNIQUE(atividade_id)
);

-- Alunos
CREATE TABLE IF NOT EXISTS public.alunos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamp without time zone DEFAULT now()
);

-- Vínculo aluno–plano (quem faz qual atividade, valor pago, data, forma de pagamento e nome do pagador)
-- IMPORTANTE: aluno_id = ALUNO (quem faz a atividade); nome_pagador_pix = PAGADOR (quem efetuou o pagamento; pode ser o próprio aluno ou outra pessoa).
CREATE TABLE IF NOT EXISTS public.aluno_planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  plano_id uuid NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  valor numeric(12, 2) NOT NULL,
  data date NOT NULL,
  forma_pagamento text,
  nome_pagador text,
  created_at timestamp without time zone DEFAULT now(),
  UNIQUE(aluno_id, plano_id, data)
);

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_planos_atividade_id ON public.planos(atividade_id);
CREATE INDEX IF NOT EXISTS idx_aluno_planos_aluno_id ON public.aluno_planos(aluno_id);
CREATE INDEX IF NOT EXISTS idx_aluno_planos_plano_id ON public.aluno_planos(plano_id);
CREATE INDEX IF NOT EXISTS idx_aluno_planos_data ON public.aluno_planos(data);

-- Compatibilidade: se o banco já existia sem valor_mensal ou com data_referencia/nome_pagador_pix
ALTER TABLE public.planos ADD COLUMN IF NOT EXISTS valor_mensal numeric(12, 2) DEFAULT 0;
ALTER TABLE public.aluno_planos ADD COLUMN IF NOT EXISTS data_referencia date;
ALTER TABLE public.aluno_planos ADD COLUMN IF NOT EXISTS nome_pagador_pix text;
ALTER TABLE public.aluno_planos ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
-- Se existir "data" e não existir data_referencia preenchida, pode copiar: UPDATE aluno_planos SET data_referencia = data WHERE data_referencia IS NULL;
