-- =============================================================================
-- BYLA - Mapeamento pessoa → categoria (export planilha) + view v_transacoes_export
-- Execute no SQL Editor do Supabase (projeto Byla).
-- Depois: Database Webhooks (INSERT em transacoes) → n8n → Google Sheets.
-- =============================================================================

-- Normalização para match (minúsculas, trim, espaços colapsados)
CREATE OR REPLACE FUNCTION public.byla_norm_pessoa(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')));
$$;

COMMENT ON FUNCTION public.byla_norm_pessoa(text) IS 'Normaliza nome do extrato para comparar com mapeamento e cadastro.';

-- -----------------------------------------------------------------------------
-- Tabela: exceções e coworking (editar linhas conforme a operação)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mapeamento_pessoa_categoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_normalizada text NOT NULL,
  categoria text NOT NULL,
  subcategoria text NULL,
  aplica_tipo text NOT NULL DEFAULT 'todos' CHECK (aplica_tipo IN ('entrada', 'saida', 'todos')),
  prioridade int NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  observacao text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mapeamento_pessoa_tipo UNIQUE (pessoa_normalizada, aplica_tipo)
);

CREATE INDEX IF NOT EXISTS idx_mapeamento_pessoa_ativo ON public.mapeamento_pessoa_categoria (pessoa_normalizada) WHERE ativo = true;

COMMENT ON TABLE public.mapeamento_pessoa_categoria IS
'Regras manuais: nome normalizado (byla_norm_pessoa) → categoria/subcategoria para export e planilha. Coworking e nomes especiais.';

-- Seeds iniciais (ajuste nomes se no extrato vier diferente)
INSERT INTO public.mapeamento_pessoa_categoria (pessoa_normalizada, categoria, subcategoria, observacao, aplica_tipo)
VALUES
  ('orville neto', 'Coworking', 'Jiu-jitsu', 'Exemplo coworking — conferir grafia no extrato', 'entrada'),
  ('wendel pholha', 'Coworking', 'Funcional', 'Exemplo — conferir grafia', 'entrada'),
  ('deane', 'Coworking', 'A definir', 'Completar quando souber a atividade', 'entrada'),
  ('fabi', 'Coworking', 'Pilates 2', 'Exemplo — conferir se é Fabi completo no banco', 'entrada')
ON CONFLICT (pessoa_normalizada, aplica_tipo) DO UPDATE SET
  categoria = EXCLUDED.categoria,
  subcategoria = EXCLUDED.subcategoria,
  observacao = EXCLUDED.observacao,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- View: uma linha por transação + categoria sugerida (fonte única para n8n)
-- Requer tabelas de cadastro (aluno_planos, alunos, planos, atividades) se quiser
-- match automático de mensalidade; senão essa parte fica NULL e cai em regras/mapeamento.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_transacoes_export AS
SELECT
  t.id,
  t.data,
  t.pessoa,
  t.valor,
  t.descricao,
  t.tipo,
  t.created_at,
  t.id_unico,
  COALESCE(
    mp.categoria,
    CASE
      WHEN t.tipo = 'entrada' AND (
        lower(trim(t.pessoa)) LIKE 'ea %'
        OR lower(trim(t.pessoa)) LIKE '%blead%'
        OR lower(coalesce(t.descricao, '')) LIKE '%blead%'
      ) THEN 'Aluguel / Locação (externo)'
      WHEN t.tipo = 'saida' AND lower(trim(t.pessoa)) LIKE 'samuel%' THEN 'Repasse / compensação (par)'
      WHEN act.modalidade IS NOT NULL THEN 'Mensalidade'
      ELSE NULL
    END,
    'A classificar'
  ) AS categoria_sugerida,
  COALESCE(
    mp.subcategoria,
    CASE WHEN act.modalidade IS NOT NULL THEN act.modalidade ELSE NULL END
  ) AS subcategoria_sugerida,
  act.modalidade AS modalidade,
  act.nome_aluno AS nome_aluno,
  act.plano_nome AS plano_produto,
  CASE
    WHEN mp.id IS NOT NULL THEN 'mapeamento_manual'
    WHEN t.tipo = 'entrada' AND (
      lower(trim(t.pessoa)) LIKE 'ea %'
      OR lower(trim(t.pessoa)) LIKE '%blead%'
      OR lower(coalesce(t.descricao, '')) LIKE '%blead%'
    ) THEN 'regra_aluguel_externo'
    WHEN t.tipo = 'saida' AND lower(trim(t.pessoa)) LIKE 'samuel%' THEN 'regra_repasse_samuel'
    WHEN act.modalidade IS NOT NULL THEN 'cadastro_mensalidade'
    ELSE 'fallback'
  END AS origem_categoria
FROM public.transacoes t
LEFT JOIN public.mapeamento_pessoa_categoria mp
  ON mp.ativo = true
  AND (mp.aplica_tipo = 'todos' OR mp.aplica_tipo = t.tipo)
  AND public.byla_norm_pessoa(t.pessoa) = mp.pessoa_normalizada
LEFT JOIN LATERAL (
  SELECT
    a.nome AS modalidade,
    al.nome AS nome_aluno,
    pl.nome AS plano_nome
  FROM public.aluno_planos ap
  INNER JOIN public.planos pl ON pl.id = ap.plano_id
  INNER JOIN public.atividades a ON a.id = pl.atividade_id
  INNER JOIN public.alunos al ON al.id = ap.aluno_id
  WHERE t.tipo = 'entrada'
    AND (ap.ativo IS NULL OR ap.ativo = true)
    AND ap.data_referencia = t.data
    AND abs(ap.valor::numeric - t.valor::numeric) <= 0.02
    AND (
      public.byla_norm_pessoa(t.pessoa) = public.byla_norm_pessoa(coalesce(ap.nome_pagador_pix, ''))
      OR public.byla_norm_pessoa(t.pessoa) = public.byla_norm_pessoa(al.nome)
      OR public.byla_norm_pessoa(t.pessoa) LIKE '%' || public.byla_norm_pessoa(al.nome) || '%'
    )
  ORDER BY abs(ap.valor::numeric - t.valor::numeric) ASC
  LIMIT 1
) act ON true;

COMMENT ON VIEW public.v_transacoes_export IS
'Export oficial: transações + categoria_sugerida + modalidade e nome do aluno quando há match com cadastro (mensalidade).';

-- API REST: expor view (PostgREST). Garantir permissões conforme sua política RLS.
GRANT SELECT ON public.mapeamento_pessoa_categoria TO service_role;
GRANT SELECT ON public.v_transacoes_export TO service_role;
