-- =============================================================================
-- BYLA - Tabela transacoes (extrato bancário / movimentações)
-- Execute no SQL Editor do Supabase se a tabela ainda não existir.
-- Usada pelas views oficiais e conciliação (v_entradas_oficial, v_reconciliacao_mensalidades).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.transacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data date NOT NULL,
  pessoa text NOT NULL,
  valor numeric(12, 2) NOT NULL,
  descricao text NULL,
  tipo text NOT NULL,
  created_at timestamp without time zone NULL DEFAULT now(),
  id_unico text NULL,
  mes text NULL,
  ano integer NULL,
  CONSTRAINT transacoes_pkey PRIMARY KEY (id),
  CONSTRAINT transacoes_id_unico_key UNIQUE (id_unico),
  CONSTRAINT transacoes_tipo_check CHECK (tipo IN ('entrada', 'saida'))
);

-- Índice para buscas por id_unico (evitar duplicatas)
CREATE INDEX IF NOT EXISTS idx_transacoes_id_unico ON public.transacoes (id_unico);
CREATE INDEX IF NOT EXISTS idx_transacoes_data ON public.transacoes (data);
CREATE INDEX IF NOT EXISTS idx_transacoes_tipo ON public.transacoes (tipo);

-- Comentário
COMMENT ON TABLE public.transacoes IS 'Movimentações do extrato bancário. Alimentada por planilha, PagBank EDI ou (antigo) Pluggy. Fonte da verdade para entradas/saídas e conciliação.';
