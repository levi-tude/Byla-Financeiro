-- Separação Oficial (migração planilha) vs Sistema (sync/editor/template).
-- Um mês pode ter até 2 períodos: modo 'oficial' e modo 'sistema'.

ALTER TABLE public.controle_caixa_periodos
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'sistema';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'controle_caixa_periodos_modo_check'
  ) THEN
    ALTER TABLE public.controle_caixa_periodos
      ADD CONSTRAINT controle_caixa_periodos_modo_check
      CHECK (modo IN ('oficial', 'sistema'));
  END IF;
END;
$$;

-- Backfill: migração da planilha = oficial; demais = sistema (já é o default).
UPDATE public.controle_caixa_periodos
SET modo = 'oficial'
WHERE origem = 'migracao_planilha'
  AND modo <> 'oficial';

-- Troca UNIQUE (mes, ano) por (mes, ano, modo).
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.controle_caixa_periodos'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE '%(mes, ano)%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%modo%'
  LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.controle_caixa_periodos DROP CONSTRAINT %I', cname);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'controle_caixa_periodos_mes_ano_modo_key'
  ) THEN
    ALTER TABLE public.controle_caixa_periodos
      ADD CONSTRAINT controle_caixa_periodos_mes_ano_modo_key UNIQUE (mes, ano, modo);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_controle_caixa_periodos_mes_ano_modo
  ON public.controle_caixa_periodos(ano, mes, modo);
