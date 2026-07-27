-- Regime de cobrança do aluno no Fluxo operacional (bolsa / exceção / normal).
-- Sem lista de nomes no Git: marcar via UI ou UPDATE pontual no Supabase.
-- Rode no SQL Editor do Supabase (ou apply_migration) após revisar.

ALTER TABLE public.fluxo_alunos_operacionais
  ADD COLUMN IF NOT EXISTS regime_cobranca text NOT NULL DEFAULT 'normal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fluxo_alunos_operacionais_regime_cobranca_check'
  ) THEN
    ALTER TABLE public.fluxo_alunos_operacionais
      ADD CONSTRAINT fluxo_alunos_operacionais_regime_cobranca_check
      CHECK (regime_cobranca IN ('normal', 'bolsa', 'excecao'));
  END IF;
END $$;

-- Compat: quem já tinha "Bolsa" no campo plano herda regime bolsa (só onde ainda é normal).
UPDATE public.fluxo_alunos_operacionais
SET regime_cobranca = 'bolsa'
WHERE regime_cobranca = 'normal'
  AND plano IS NOT NULL
  AND lower(translate(plano, 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
                              'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))
      LIKE '%bolsa%';

CREATE INDEX IF NOT EXISTS idx_fluxo_alunos_operacionais_regime
  ON public.fluxo_alunos_operacionais(regime_cobranca);

COMMENT ON COLUMN public.fluxo_alunos_operacionais.regime_cobranca IS
  'normal = cobrança usual; bolsa = sem mensalidade; excecao = staff/caso especial sem cobrança. Não misturar com pendente/sem vínculo.';
