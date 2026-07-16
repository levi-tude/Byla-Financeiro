-- BYLA — Aluguel de salas (calendário operacional)
-- Teatro seedado; multi-sala preparado (admin cadastra/classifica).

CREATE TABLE IF NOT EXISTS public.aluguel_salas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  classificacao text NOT NULL DEFAULT 'outro'
    CHECK (classificacao IN ('teatro', 'ensaio', 'coworking', 'outro')),
  ativa boolean NOT NULL DEFAULT true,
  cor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aluguel_salas_ativa
  ON public.aluguel_salas(ativa);

CREATE TABLE IF NOT EXISTS public.aluguel_reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sala_id uuid NOT NULL REFERENCES public.aluguel_salas(id) ON DELETE RESTRICT,
  titulo text NOT NULL,
  data date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  observacao text,
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aluguel_reservas_hora_fim_depois CHECK (hora_fim > hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_aluguel_reservas_sala_data
  ON public.aluguel_reservas(sala_id, data);
CREATE INDEX IF NOT EXISTS idx_aluguel_reservas_data
  ON public.aluguel_reservas(data);

ALTER TABLE public.aluguel_salas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aluguel_reservas ENABLE ROW LEVEL SECURITY;

-- Sem policies para anon/authenticated: acesso só via service_role (backend Express).

INSERT INTO public.aluguel_salas (nome, slug, classificacao, ativa, cor)
VALUES ('Sala do Teatro', 'sala-teatro', 'teatro', true, '#7c3aed')
ON CONFLICT (slug) DO NOTHING;
