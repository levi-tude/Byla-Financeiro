-- =============================================================================
-- BYLA - Views: mensalidades e alunos claramente por atividade
-- Deixa explícito: (1) preço da mensalidade vinculado a cada atividade,
-- (2) alunos divididos por atividade, (3) cada pagamento ligado à atividade.
-- Execute no SQL Editor do Supabase após o schema e os seeds.
-- Requer aluno_planos com data_referencia e nome_pagador_pix (ou edite para data e nome_pagador).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) PREÇOS DA MENSALIDADE POR ATIVIDADE (produto = mensalidade, vinculado à atividade)
-- Mostra: atividade, nome do plano (produto), valor de referência e faixa paga
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_precos_mensalidade_por_atividade AS
SELECT
  a.id AS atividade_id,
  a.nome AS atividade_nome,
  p.id AS plano_id,
  p.nome AS plano_nome,
  COALESCE(p.valor_mensal, 0) AS valor_mensal_referencia,
  MIN(ap.valor) AS valor_minimo_pago,
  MAX(ap.valor) AS valor_maximo_pago,
  ROUND(AVG(ap.valor)::numeric, 2) AS valor_medio_pago,
  COUNT(ap.id) AS total_pagamentos_registrados
FROM public.atividades a
JOIN public.planos p ON p.atividade_id = a.id
LEFT JOIN public.aluno_planos ap ON ap.plano_id = p.id
  AND (ap.ativo IS NULL OR ap.ativo = true)
GROUP BY a.id, a.nome, p.id, p.nome, p.valor_mensal
ORDER BY a.nome;

COMMENT ON VIEW public.v_precos_mensalidade_por_atividade IS
'Mensalidade por atividade: produto (plano) e preço claramente vinculados à atividade. valor_mensal_referencia = preço de referência no plano; min/max/medio = valores realmente pagos.';


-- -----------------------------------------------------------------------------
-- 2) ALUNOS POR ATIVIDADE (divisão clara: quem é aluno de cada modalidade)
-- Uma linha por (atividade, aluno). Alunos podem aparecer em várias atividades.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_alunos_por_atividade AS
SELECT
  a.id AS atividade_id,
  a.nome AS atividade_nome,
  al.id AS aluno_id,
  al.nome AS aluno_nome,
  p.id AS plano_id,
  p.nome AS plano_nome
FROM public.atividades a
JOIN public.planos p ON p.atividade_id = a.id
JOIN public.aluno_planos ap ON ap.plano_id = p.id
  AND (ap.ativo IS NULL OR ap.ativo = true)
JOIN public.alunos al ON al.id = ap.aluno_id
GROUP BY a.id, a.nome, al.id, al.nome, p.id, p.nome
ORDER BY a.nome, al.nome;

COMMENT ON VIEW public.v_alunos_por_atividade IS
'Lista de alunos por atividade (modalidade). Divisão clara: cada linha = um aluno vinculado a uma atividade.';


-- -----------------------------------------------------------------------------
-- 3) MENSALIDADES DETALHADAS POR ATIVIDADE (cada pagamento com atividade e aluno)
-- Cada linha = um pagamento de mensalidade, com atividade, aluno, valor, data, forma, nome do pagador
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_mensalidades_por_atividade AS
SELECT
  ap.id,
  a.id AS atividade_id,
  a.nome AS atividade_nome,
  p.nome AS plano_nome,
  al.id AS aluno_id,
  al.nome AS aluno_nome,
  ap.valor,
  ap.data_referencia AS data_pagamento,
  ap.forma_pagamento,
  ap.nome_pagador_pix AS nome_pagador,
  ap.ativo
FROM public.aluno_planos ap
JOIN public.alunos al ON al.id = ap.aluno_id
JOIN public.planos p ON p.id = ap.plano_id
JOIN public.atividades a ON a.id = p.atividade_id
WHERE (ap.ativo IS NULL OR ap.ativo = true)
ORDER BY a.nome, al.nome, ap.data_referencia DESC;

COMMENT ON VIEW public.v_mensalidades_por_atividade IS
'Cada mensalidade paga: atividade, aluno, valor, data, forma de pagamento e nome do pagador. Preço e produto claramente vinculados à atividade.';


-- -----------------------------------------------------------------------------
-- 4) RESUMO POR ATIVIDADE (total de alunos e totais financeiros por modalidade)
-- Útil para relatório: quantos alunos por atividade, quanto entrou por atividade
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_resumo_atividade AS
SELECT
  a.id AS atividade_id,
  a.nome AS atividade_nome,
  COUNT(DISTINCT ap.aluno_id) AS total_alunos,
  COUNT(ap.id) AS total_mensalidades,
  COALESCE(SUM(COALESCE(ap.valor, 0)), 0) AS total_valor
FROM public.atividades a
LEFT JOIN public.planos p ON p.atividade_id = a.id
LEFT JOIN public.aluno_planos ap ON ap.plano_id = p.id
  AND (ap.ativo IS NULL OR ap.ativo = true)
GROUP BY a.id, a.nome
ORDER BY a.nome;

COMMENT ON VIEW public.v_resumo_atividade IS
'Resumo por atividade: total de alunos, quantidade de mensalidades e soma dos valores.';


-- -----------------------------------------------------------------------------
-- 5) MENSALIDADES: ALUNO E PAGADOR EXPLÍCITOS (evitar confusão)
-- Sempre mostra: quem é o ALUNO (faz a atividade) e quem é o PAGADOR (efetuou o pagamento).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_mensalidades_aluno_e_pagador AS
SELECT
  ap.id,
  a.nome AS atividade_nome,
  p.nome AS plano_nome,
  al.nome AS aluno_quem_faz_atividade,
  ap.nome_pagador_pix AS pagador_quem_efetuou_pagamento,
  ap.valor AS valor_mensalidade,
  ap.data_referencia AS data_pagamento,
  ap.forma_pagamento,
  ap.ativo
FROM public.aluno_planos ap
JOIN public.alunos al ON al.id = ap.aluno_id
JOIN public.planos p ON p.id = ap.plano_id
JOIN public.atividades a ON a.id = p.atividade_id
WHERE (ap.ativo IS NULL OR ap.ativo = true)
ORDER BY a.nome, al.nome, ap.data_referencia DESC;

COMMENT ON VIEW public.v_mensalidades_aluno_e_pagador IS
'Sempre exibe aluno (quem faz a atividade) e pagador (quem efetuou o pagamento) para não confundir. Valor pode ser NULL em registros antigos.';


-- -----------------------------------------------------------------------------
-- 6) MENSALIDADES SEM VALOR (para preencher depois)
-- Lista registros em que valor está NULL; use para completar o cadastro.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_mensalidades_sem_valor AS
SELECT
  ap.id,
  a.nome AS atividade_nome,
  al.nome AS aluno_quem_faz_atividade,
  ap.nome_pagador_pix AS pagador_quem_efetuou_pagamento,
  ap.data_referencia,
  ap.forma_pagamento,
  p.valor_mensal AS valor_referencia_plano
FROM public.aluno_planos ap
JOIN public.alunos al ON al.id = ap.aluno_id
JOIN public.planos p ON p.id = ap.plano_id
JOIN public.atividades a ON a.id = p.atividade_id
WHERE (ap.ativo IS NULL OR ap.ativo = true)
  AND ap.valor IS NULL
ORDER BY ap.data_referencia DESC;

COMMENT ON VIEW public.v_mensalidades_sem_valor IS
'Mensalidades com valor NULL. Use para preencher: UPDATE aluno_planos SET valor = ... WHERE id = ...';
