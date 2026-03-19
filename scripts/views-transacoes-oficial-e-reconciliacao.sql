-- =============================================================================
-- BYLA - Views: transações OFICIAIS (banco) e conciliação com cadastro
-- Fonte oficial para valores e "quem pagou" = tabela transacoes (extrato bancário).
-- Cadastro (aluno_planos) = expectativa; conferir com transacoes para "confirmado no banco".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) ENTRADAS OFICIAIS (só transacoes do banco, tipo = entrada)
-- Use esta view para "quanto entrou" de verdade. Ordenado por data mais recente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_entradas_oficial AS
SELECT
  id,
  data,
  pessoa,
  valor,
  descricao AS forma_pagamento_banco,
  tipo,
  id_unico,
  EXTRACT(YEAR FROM data)::int AS ano,
  EXTRACT(MONTH FROM data)::int AS mes,
  created_at
FROM public.transacoes
WHERE tipo = 'entrada'
ORDER BY data DESC;

COMMENT ON VIEW public.v_entradas_oficial IS
'Entradas oficiais: apenas transacoes do extrato bancário (tipo=entrada). Fonte da verdade para "quanto entrou".';


-- -----------------------------------------------------------------------------
-- 2) RESUMO OFICIAL POR MÊS (totais de entrada e saída do BANCO)
-- Valores oficiais: somados a partir de transacoes. Use para relatório gerencial.
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
FROM public.transacoes
GROUP BY EXTRACT(YEAR FROM data), EXTRACT(MONTH FROM data)
ORDER BY ano DESC, mes DESC;

COMMENT ON VIEW public.v_resumo_mensal_oficial IS
'Resumo mensal OFICIAL: totais de entradas e saídas a partir da tabela transacoes (banco). Fonte da verdade para fluxo de caixa.';


-- -----------------------------------------------------------------------------
-- 3) CONCILIAÇÃO: mensalidades do cadastro + conferência com o banco
-- Regra: transações são conferidas pelo NOME DO PAGADOR (nome_pagador_pix), não pelo nome do aluno.
-- Confirmado quando: (1) existe entrada no banco com mesma data, mesmo valor e pessoa = pagador,
-- ou (2) mesmo pagador pagou várias mensalidades na mesma data num único PIX (ex.: 460 = 230+230);
-- aí a transação no valor total confirma todas as linhas daquele pagador naquela data.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_reconciliacao_mensalidades AS
WITH grupos_pagador_data AS (
  SELECT
    ap.data_referencia,
    COALESCE(TRIM(LOWER(ap.nome_pagador_pix)), TRIM(LOWER(al.nome))) AS pagador_norm,
    SUM(ap.valor) AS total_valor_grupo
  FROM public.aluno_planos ap
  JOIN public.alunos al ON al.id = ap.aluno_id
  WHERE ap.valor IS NOT NULL
    AND (ap.ativo IS NULL OR ap.ativo = true)
  GROUP BY ap.data_referencia, COALESCE(TRIM(LOWER(ap.nome_pagador_pix)), TRIM(LOWER(al.nome)))
),
transacao_por_grupo AS (
  SELECT DISTINCT ON (g.data_referencia, g.pagador_norm)
    g.data_referencia,
    g.pagador_norm,
    g.total_valor_grupo,
    t.id AS transacao_id,
    t.pessoa AS pessoa_banco,
    t.valor AS valor_banco
  FROM grupos_pagador_data g
  JOIN public.transacoes t ON t.tipo = 'entrada'
    AND t.data = g.data_referencia
    AND t.valor = g.total_valor_grupo
    AND (
      TRIM(LOWER(t.pessoa)) = g.pagador_norm
      OR g.pagador_norm LIKE '%' || TRIM(LOWER(t.pessoa)) || '%'
      OR TRIM(LOWER(t.pessoa)) LIKE '%' || g.pagador_norm || '%'
    )
  ORDER BY g.data_referencia, g.pagador_norm, t.created_at DESC
)
SELECT DISTINCT ON (ap.id)
  ap.id AS aluno_plano_id,
  a.nome AS atividade_nome,
  al.nome AS aluno_nome,
  ap.valor,
  ap.data_referencia AS data_pagamento,
  ap.forma_pagamento,
  ap.nome_pagador_pix AS nome_pagador_cadastro,
  (ap.valor IS NOT NULL) AS valor_preenchido,
  tg.transacao_id,
  tg.pessoa_banco,
  ap.data_referencia AS data_banco,
  tg.valor_banco,
  CASE WHEN tg.transacao_id IS NOT NULL THEN true ELSE false END AS confirmado_banco
FROM public.aluno_planos ap
JOIN public.alunos al ON al.id = ap.aluno_id
JOIN public.planos p ON p.id = ap.plano_id
JOIN public.atividades a ON a.id = p.atividade_id
LEFT JOIN transacao_por_grupo tg ON tg.data_referencia = ap.data_referencia
  AND tg.pagador_norm = COALESCE(TRIM(LOWER(ap.nome_pagador_pix)), TRIM(LOWER(al.nome)))
  AND ap.valor IS NOT NULL
WHERE (ap.ativo IS NULL OR ap.ativo = true)
ORDER BY ap.id;

COMMENT ON VIEW public.v_reconciliacao_mensalidades IS
'Conciliação pelo PAGADOR: transacoes.pessoa bate com nome_pagador_pix (quem pagou). Aceita 1:1 (mesmo valor) ou N:1 (um PIX no valor total confirma várias mensalidades do mesmo pagador na mesma data).';


-- -----------------------------------------------------------------------------
-- 4) RESUMO: cadastro vs oficial (para comparação rápida)
-- Total esperado (cadastro) e total oficial (banco) por mês, quando houver dados.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_comparativo_cadastro_vs_oficial AS
SELECT
  COALESCE(cad.ano, ofi.ano) AS ano,
  COALESCE(cad.mes, ofi.mes) AS mes,
  COALESCE(cad.total_cadastro, 0) AS total_cadastro,
  COALESCE(ofi.total_oficial_entradas, 0) AS total_oficial_entradas,
  COALESCE(ofi.total_oficial_entradas, 0) - COALESCE(cad.total_cadastro, 0) AS diferenca
FROM (
  SELECT
    EXTRACT(YEAR FROM ap.data_referencia)::int AS ano,
    EXTRACT(MONTH FROM ap.data_referencia)::int AS mes,
    SUM(COALESCE(ap.valor, 0)) AS total_cadastro
  FROM public.aluno_planos ap
  WHERE (ap.ativo IS NULL OR ap.ativo = true)
    AND ap.data_referencia IS NOT NULL
  GROUP BY EXTRACT(YEAR FROM ap.data_referencia), EXTRACT(MONTH FROM ap.data_referencia)
) cad
FULL OUTER JOIN (
  SELECT
    EXTRACT(YEAR FROM data)::int AS ano,
    EXTRACT(MONTH FROM data)::int AS mes,
    SUM(valor) AS total_oficial_entradas
  FROM public.transacoes
  WHERE tipo = 'entrada'
  GROUP BY EXTRACT(YEAR FROM data), EXTRACT(MONTH FROM data)
) ofi ON cad.ano = ofi.ano AND cad.mes = ofi.mes
ORDER BY COALESCE(cad.ano, ofi.ano) DESC, COALESCE(cad.mes, ofi.mes) DESC;

COMMENT ON VIEW public.v_comparativo_cadastro_vs_oficial IS
'Comparativo por mês: total do cadastro (aluno_planos) vs total oficial de entradas (transacoes). diferenca = oficial - cadastro.';
