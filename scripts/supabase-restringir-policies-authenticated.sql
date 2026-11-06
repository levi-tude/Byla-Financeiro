-- APLICADO em produção em 30/10/2026 (migration 20261030164302 restringir_policies_authenticated).
-- Endurecimento: reafirma REVOKEs do anon e restringe 13 policies a TO authenticated.
-- service_role (backend/n8n) ignora RLS; frontend logado usa authenticated.
begin;
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
alter policy transacoes_admin_only                      on public.transacoes                     to authenticated;
alter policy fluxo_pagamentos_operacionais_select       on public.fluxo_pagamentos_operacionais  to authenticated;
alter policy fluxo_pagamentos_operacionais_write        on public.fluxo_pagamentos_operacionais  to authenticated;
alter policy fluxo_alunos_operacionais_select           on public.fluxo_alunos_operacionais      to authenticated;
alter policy fluxo_alunos_operacionais_write            on public.fluxo_alunos_operacionais      to authenticated;
alter policy alunos_operacional_select                  on public.alunos                         to authenticated;
alter policy alunos_operacional_write                   on public.alunos                         to authenticated;
alter policy profiles_select_self_or_admin              on public.profiles                       to authenticated;
alter policy profiles_insert_admin                      on public.profiles                       to authenticated;
alter policy profiles_update_admin                      on public.profiles                       to authenticated;
alter policy validacao_pagamentos_vinculos_admin_only   on public.validacao_pagamentos_vinculos  to authenticated;
alter policy mapeamento_aluno_pagador_select_operacional on public.mapeamento_aluno_pagador      to authenticated;
alter policy mapeamento_aluno_pagador_write_admin       on public.mapeamento_aluno_pagador       to authenticated;
commit;
