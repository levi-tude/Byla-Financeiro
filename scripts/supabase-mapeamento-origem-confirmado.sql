-- BYLA — Sugestões de Entradas vindas da validação fluxo × banco (Opção 1 com revisão)
-- Execute no SQL Editor do Supabase após supabase-despesas-mapeamento-template-key.sql

ALTER TABLE public.mapeamento_pessoa_categoria
  ADD COLUMN IF NOT EXISTS origem_regra text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS confirmado boolean NOT NULL DEFAULT true;

ALTER TABLE public.mapeamento_pessoa_categoria
  DROP CONSTRAINT IF EXISTS mapeamento_pessoa_categoria_origem_regra_check;

ALTER TABLE public.mapeamento_pessoa_categoria
  ADD CONSTRAINT mapeamento_pessoa_categoria_origem_regra_check
  CHECK (origem_regra IN ('manual', 'validacao_fluxo'));

COMMENT ON COLUMN public.mapeamento_pessoa_categoria.origem_regra IS
  'manual = regra confirmada pelo gestor em Entradas; validacao_fluxo = sugerida ao vincular PIX no Pagamento dia a dia.';

COMMENT ON COLUMN public.mapeamento_pessoa_categoria.confirmado IS
  'false = sugestão pendente de confirmação em Entradas; true = regra ativa para fechamento e sync Controle.';

-- Regras existentes permanecem confirmadas
UPDATE public.mapeamento_pessoa_categoria
SET confirmado = true, origem_regra = 'manual'
WHERE confirmado IS NULL OR origem_regra IS NULL;
