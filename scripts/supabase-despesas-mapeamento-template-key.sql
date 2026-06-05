-- BYLA - Colunas template_key no mapeamento pessoa → categoria (Página Despesas)
-- Execute no SQL Editor do Supabase após supabase-mapeamento-categoria-e-view-export.sql

ALTER TABLE public.mapeamento_pessoa_categoria
  ADD COLUMN IF NOT EXISTS template_key text NULL,
  ADD COLUMN IF NOT EXISTS bloco_template_key text NULL;

COMMENT ON COLUMN public.mapeamento_pessoa_categoria.template_key IS
  'Chave estável da linha do Controle de Caixa (ex. sai_fixo_salarios).';

COMMENT ON COLUMN public.mapeamento_pessoa_categoria.bloco_template_key IS
  'Chave do bloco do template (ex. saida_gastos_fixos).';
