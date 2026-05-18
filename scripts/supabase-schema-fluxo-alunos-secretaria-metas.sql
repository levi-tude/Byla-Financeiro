-- Metadados de secretaria no cadastro operacional (pendências ignoradas + histórico de cobrança)
-- Rode no SQL Editor do Supabase ou via CLI após revisar.

ALTER TABLE public.fluxo_alunos_operacionais
  ADD COLUMN IF NOT EXISTS pendencia_campos_ignorados jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.fluxo_alunos_operacionais
  ADD COLUMN IF NOT EXISTS cobranca_tentativas jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.fluxo_alunos_operacionais.pendencia_campos_ignorados IS
  'Lista de chaves de campo que não entram como pendência para este aluno: wpp, responsaveis, venc, valor_ref, pagador_pix, plano';

COMMENT ON COLUMN public.fluxo_alunos_operacionais.cobranca_tentativas IS
  'Histórico curto de tentativas de cobrança: [{ nota, registrado_em }]';
