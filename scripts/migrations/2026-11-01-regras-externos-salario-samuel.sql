-- =============================================================================
-- BYLA — Regra "salário do outro trabalho do Samuel" (pagadores externos + repasse)
-- Data: 01/11/2026. NÃO APLICADO. Aplicar só com o ok explícito do Levi, no SQL Editor
-- do Supabase (projeto Byla), numa única transação.
--
-- O que muda:
-- 1) Tabela public.regras_externos: lista configurável de pagadores externos (padrões LIKE
--    em minúsculas sobre pessoa OU descricao). Seed: EA, Blead Ad Tech, Rbc Marketing.
-- 2) View public.v_pares_salario_samuel: ids a ignorar (entradas externas + saídas Samuel
--    que formam par). Mesma regra do backend (backend/src/services/transacoesFiltro.ts):
--      a) par 1:1, ±1 dia, |Δvalor| <= 800, melhor candidato dos dois lados;
--      b) par por soma: saída Samuel sem par 1:1 = soma de 2+ entradas externas sem par (±1 dia).
--    Tolerância 800 e janela 1 dia: iguais a businessRules.transacoes (teste de paridade).
-- 3) v_resumo_mensal_oficial e v_entradas_oficial passam a usar essa view.
-- 4) v_transacoes_export: "Repasse / compensação (par)" só para saídas Samuel que formam par.
-- Permissões iguais às atuais: security_invoker, sem anon/public, SELECT p/ authenticated e service_role.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.regras_externos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  padrao text NOT NULL UNIQUE CHECK (padrao = lower(padrao) AND length(trim(padrao)) > 0),
  descricao text NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.regras_externos IS
'Pagadores externos (salário do outro trabalho do Samuel). padrao = LIKE em minúsculas aplicado a lower(trim(pessoa)) ou lower(trim(descricao)). Essas entradas e o repasse pareado ao Samuel ficam fora dos totais oficiais.';

INSERT INTO public.regras_externos (padrao, descricao) VALUES
  ('ea %', 'EA Entretenimento e Esportes — salário do outro trabalho do Samuel'),
  ('%blead ad tech%', 'Blead Ad Tech — salário do outro trabalho do Samuel'),
  ('rbc marketing%', 'Rbc Marketing Ltda — salário do outro trabalho do Samuel (confirmado pelo Levi em 01/11/2026)')
ON CONFLICT (padrao) DO NOTHING;

ALTER TABLE public.regras_externos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.regras_externos FROM anon, public;
GRANT SELECT ON public.regras_externos TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.regras_externos TO authenticated, service_role;

DROP POLICY IF EXISTS regras_externos_select_operacional ON public.regras_externos;
CREATE POLICY regras_externos_select_operacional
ON public.regras_externos FOR SELECT
USING (public.has_role('admin') OR public.has_role('secretaria'));

DROP POLICY IF EXISTS regras_externos_write_admin ON public.regras_externos;
CREATE POLICY regras_externos_write_admin
ON public.regras_externos FOR ALL
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

-- -----------------------------------------------------------------------------
-- Pares (ids a ignorar nos totais oficiais)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_pares_salario_samuel AS
WITH ext AS (
  SELECT t.id, t.data, t.valor
  FROM public.transacoes t
  WHERE t.tipo = 'entrada'
    AND EXISTS (
      SELECT 1 FROM public.regras_externos r
      WHERE r.ativo
        AND (lower(trim(coalesce(t.pessoa, ''))) LIKE r.padrao
          OR lower(trim(coalesce(t.descricao, ''))) LIKE r.padrao)
    )
), sam AS (
  SELECT s.id, s.data, s.valor
  FROM public.transacoes s
  WHERE s.tipo = 'saida' AND lower(trim(coalesce(s.pessoa, ''))) LIKE 'samuel davi tude silva%'
), cand AS (
  SELECT s.id AS sid, e.id AS eid,
    row_number() OVER (PARTITION BY e.id ORDER BY abs(s.data - e.data), abs(s.valor - e.valor), s.id::text) AS re,
    row_number() OVER (PARTITION BY s.id ORDER BY abs(s.data - e.data), abs(s.valor - e.valor), e.id::text) AS rs
  FROM sam s
  JOIN ext e ON abs(s.data - e.data) <= 1 AND abs(s.valor - e.valor) <= 800
), um AS (
  SELECT sid, eid FROM cand WHERE re = 1 AND rs = 1
), soma AS (
  SELECT s.id AS sid
  FROM sam s
  CROSS JOIN LATERAL (
    SELECT count(*) AS n, coalesce(sum(e.valor), 0) AS total
    FROM ext e
    WHERE abs(e.data - s.data) <= 1 AND NOT EXISTS (SELECT 1 FROM um WHERE um.eid = e.id)
  ) x
  WHERE NOT EXISTS (SELECT 1 FROM um WHERE um.sid = s.id)
    AND x.n >= 2 AND abs(s.valor - x.total) <= 800
)
SELECT id, 'entrada_externa'::text AS motivo FROM ext
UNION ALL SELECT sid, 'repasse_par_1a1' FROM um
UNION ALL SELECT sid, 'repasse_par_soma' FROM soma;

COMMENT ON VIEW public.v_pares_salario_samuel IS
'Ids fora dos totais oficiais: entradas de regras_externos e saídas Samuel pareadas (1:1 ou soma, ±1 dia, tolerância R$ 800). Espelha filtrarTransacoesOficiais do backend.';

-- -----------------------------------------------------------------------------
-- Resumo mensal oficial (Visão geral + chat) — mesmas colunas
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_resumo_mensal_oficial AS
SELECT
  EXTRACT(YEAR FROM data)::int AS ano,
  EXTRACT(MONTH FROM data)::int AS mes,
  SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END) AS total_entradas,
  SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END) AS total_saidas,
  SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END) - SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END) AS saldo_mes,
  COUNT(*) FILTER (WHERE tipo = 'entrada') AS qtd_entradas,
  COUNT(*) FILTER (WHERE tipo = 'saida') AS qtd_saidas
FROM public.transacoes t
WHERE NOT EXISTS (SELECT 1 FROM public.v_pares_salario_samuel p WHERE p.id = t.id)
GROUP BY EXTRACT(YEAR FROM data), EXTRACT(MONTH FROM data)
ORDER BY ano DESC, mes DESC;

CREATE OR REPLACE VIEW public.v_entradas_oficial AS
SELECT
  t.id, t.data, t.pessoa, t.valor,
  t.descricao AS forma_pagamento_banco,
  t.tipo, t.id_unico,
  EXTRACT(YEAR FROM t.data)::int AS ano,
  EXTRACT(MONTH FROM t.data)::int AS mes,
  t.created_at
FROM public.transacoes t
WHERE t.tipo = 'entrada'
  AND NOT EXISTS (SELECT 1 FROM public.v_pares_salario_samuel p WHERE p.id = t.id)
ORDER BY t.data DESC;

-- -----------------------------------------------------------------------------
-- Export (categorias / n8n → planilha) — repasse só quando forma par
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_transacoes_export AS
SELECT
  t.id, t.data, t.pessoa, t.valor, t.descricao, t.tipo, t.created_at, t.id_unico,
  COALESCE(
    mp.categoria,
    CASE
      WHEN t.tipo = 'entrada' AND (par.motivo = 'entrada_externa' OR lower(trim(t.pessoa)) LIKE '%blead%' OR lower(coalesce(t.descricao, '')) LIKE '%blead%')
        THEN 'Aluguel / Locação (externo)'
      WHEN t.tipo = 'saida' AND par.motivo IN ('repasse_par_1a1', 'repasse_par_soma') THEN 'Repasse / compensação (par)'
      WHEN act.modalidade IS NOT NULL THEN 'Mensalidade'
      ELSE NULL
    END,
    'A classificar'
  ) AS categoria_sugerida,
  COALESCE(mp.subcategoria, CASE WHEN act.modalidade IS NOT NULL THEN act.modalidade ELSE NULL END) AS subcategoria_sugerida,
  act.modalidade AS modalidade,
  act.nome_aluno AS nome_aluno,
  act.plano_nome AS plano_produto,
  CASE
    WHEN mp.id IS NOT NULL THEN 'mapeamento_manual'
    WHEN t.tipo = 'entrada' AND (par.motivo = 'entrada_externa' OR lower(trim(t.pessoa)) LIKE '%blead%' OR lower(coalesce(t.descricao, '')) LIKE '%blead%')
      THEN 'regra_aluguel_externo'
    WHEN t.tipo = 'saida' AND par.motivo IN ('repasse_par_1a1', 'repasse_par_soma') THEN 'regra_repasse_samuel'
    WHEN act.modalidade IS NOT NULL THEN 'cadastro_mensalidade'
    ELSE 'fallback'
  END AS origem_categoria
FROM public.transacoes t
LEFT JOIN public.v_pares_salario_samuel par ON par.id = t.id
LEFT JOIN public.mapeamento_pessoa_categoria mp
  ON mp.ativo = true
  AND (mp.aplica_tipo = 'todos' OR mp.aplica_tipo = t.tipo)
  AND public.byla_norm_pessoa(t.pessoa) = mp.pessoa_normalizada
LEFT JOIN LATERAL (
  SELECT a.nome AS modalidade, al.nome AS nome_aluno, pl.nome AS plano_nome
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

-- Permissões (iguais às views atuais)
ALTER VIEW public.v_pares_salario_samuel SET (security_invoker = true);
ALTER VIEW public.v_resumo_mensal_oficial SET (security_invoker = true);
ALTER VIEW public.v_entradas_oficial SET (security_invoker = true);
ALTER VIEW public.v_transacoes_export SET (security_invoker = true);
REVOKE ALL ON public.v_pares_salario_samuel, public.v_resumo_mensal_oficial, public.v_entradas_oficial, public.v_transacoes_export FROM anon, public;
GRANT SELECT ON public.v_pares_salario_samuel, public.v_resumo_mensal_oficial, public.v_entradas_oficial, public.v_transacoes_export TO authenticated, service_role;

COMMIT;

-- Reverter: reexecutar scripts/views-transacoes-oficial-e-reconciliacao.sql e
-- scripts/supabase-mapeamento-categoria-e-view-export.sql nas versões anteriores + DROP VIEW v_pares_salario_samuel; DROP TABLE regras_externos.
