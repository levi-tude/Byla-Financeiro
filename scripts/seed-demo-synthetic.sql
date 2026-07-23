-- seed-demo-synthetic.sql
-- Dados 100% fictícios para demonstração / portfólio.
-- NÃO usar nomes, e-mails ou valores de produção.
-- Execute após supabase-schema-cadastros.sql

-- Atividades (modalidades demo)
INSERT INTO public.atividades (nome)
SELECT x FROM (VALUES
  ('Pilates Demo'),
  ('Dança Demo'),
  ('Teatro Demo')
) AS t(x)
WHERE NOT EXISTS (SELECT 1 FROM public.atividades a WHERE a.nome = t.x);

-- Planos
INSERT INTO public.planos (atividade_id, nome, valor_mensal)
SELECT a.id, 'Mensalidade', 150.00
FROM public.atividades a
WHERE a.nome IN ('Pilates Demo', 'Dança Demo', 'Teatro Demo')
AND NOT EXISTS (SELECT 1 FROM public.planos p WHERE p.atividade_id = a.id);

-- Alunos fictícios
INSERT INTO public.alunos (nome)
SELECT n FROM (VALUES
  ('Aluno Demo Um'),
  ('Aluna Demo Dois'),
  ('Aluno Demo Três'),
  ('Responsavel Exemplo Silva')
) AS t(n)
WHERE NOT EXISTS (SELECT 1 FROM public.alunos a WHERE a.nome = t.n);

-- Vínculos aluno–plano (competência demo)
INSERT INTO public.aluno_planos (aluno_id, plano_id, valor, data_referencia, forma_pagamento, nome_pagador_pix)
SELECT al.id, pl.id, 150.00, '2026-01-10'::date, 'pix', 'Responsavel Exemplo Silva'
FROM public.alunos al
JOIN public.planos pl ON pl.atividade_id = (SELECT id FROM public.atividades WHERE nome = 'Pilates Demo' LIMIT 1)
WHERE al.nome = 'Aluno Demo Um'
AND NOT EXISTS (
  SELECT 1 FROM public.aluno_planos ap
  WHERE ap.aluno_id = al.id AND ap.plano_id = pl.id AND ap.data_referencia = '2026-01-10'::date
);

INSERT INTO public.aluno_planos (aluno_id, plano_id, valor, data_referencia, forma_pagamento, nome_pagador_pix)
SELECT al.id, pl.id, 180.00, '2026-01-12'::date, 'credito', 'Aluna Demo Dois'
FROM public.alunos al
JOIN public.planos pl ON pl.atividade_id = (SELECT id FROM public.atividades WHERE nome = 'Dança Demo' LIMIT 1)
WHERE al.nome = 'Aluna Demo Dois'
AND NOT EXISTS (
  SELECT 1 FROM public.aluno_planos ap
  WHERE ap.aluno_id = al.id AND ap.plano_id = pl.id AND ap.data_referencia = '2026-01-12'::date
);

-- Despesa demo (sem nomes de staff reais)
INSERT INTO public.despesas (data, valor, descricao, categoria, subcategoria, centro_custo, funcionario, origem)
SELECT '2026-01-05'::date, 99.00, 'Material de escritório demo', 'Operacional', 'Suprimentos', 'Administração', 'Funcionario Demo', 'manual'
WHERE NOT EXISTS (
  SELECT 1 FROM public.despesas d WHERE d.descricao = 'Material de escritório demo'
);
