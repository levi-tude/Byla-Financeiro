-- =============================================================================
-- BYLA - Total de entradas e total de saídas (tabela transacoes)
-- Execute no SQL Editor do Supabase.
-- Colunas da tabela: id, data, pessoa, valor, descricao, tipo, created_at, id_unico, mes, ano
-- =============================================================================

-- Retorna uma linha com dois valores: total_entrada e total_saida
SELECT
  COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) AS total_entrada,
  COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END), 0)   AS total_saida
FROM public.transacoes;
