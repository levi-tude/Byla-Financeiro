-- =====================================================================
-- ROLLBACK — só se algo quebrar depois de aplicar 01-restringir-anon.sql
-- NÃO aplique sem necessidade. Restaura policies TO public e
-- EXECUTE da função touch p/ anon (estado anterior frágil).
-- NÃO devolve grants de tabelas ao anon (isso era o buraco antigo).
-- =====================================================================

begin;

alter policy aluno_planos_operacional_select              on public.aluno_planos                      to public;
alter policy aluno_planos_operacional_write               on public.aluno_planos                      to public;
alter policy assinatura_credito_recorrente_select_operacional on public.assinatura_credito_recorrente to public;
alter policy assinatura_credito_recorrente_write_admin    on public.assinatura_credito_recorrente     to public;
alter policy atividades_operacional_select                on public.atividades                       to public;
alter policy atividades_operacional_write                 on public.atividades                       to public;
alter policy controle_caixa_blocos_operacional_select     on public.controle_caixa_blocos            to public;
alter policy controle_caixa_blocos_operacional_write      on public.controle_caixa_blocos            to public;
alter policy controle_caixa_linhas_operacional_select     on public.controle_caixa_linhas            to public;
alter policy controle_caixa_linhas_operacional_write      on public.controle_caixa_linhas            to public;
alter policy controle_caixa_periodos_operacional_select   on public.controle_caixa_periodos          to public;
alter policy controle_caixa_periodos_operacional_write    on public.controle_caixa_periodos          to public;
alter policy despesas_admin_only                          on public.despesas                         to public;
alter policy fluxo_operacional_auditoria_select           on public.fluxo_operacional_auditoria      to public;
alter policy fluxo_operacional_auditoria_write            on public.fluxo_operacional_auditoria      to public;
alter policy grupo_familia_pagamento_select_operacional   on public.grupo_familia_pagamento          to public;
alter policy grupo_familia_pagamento_write_admin          on public.grupo_familia_pagamento          to public;
alter policy mapeamento_credito_recorrente_select_operacional on public.mapeamento_credito_recorrente to public;
alter policy mapeamento_credito_recorrente_write_admin    on public.mapeamento_credito_recorrente     to public;
alter policy mapeamento_select_operacional                on public.mapeamento_pessoa_categoria      to public;
alter policy mapeamento_write_admin                       on public.mapeamento_pessoa_categoria      to public;
alter policy planos_operacional_select                    on public.planos                           to public;
alter policy planos_operacional_write                     on public.planos                           to public;
alter policy regras_externos_select_operacional           on public.regras_externos                  to public;
alter policy regras_externos_write_admin                  on public.regras_externos                  to public;
alter policy transacao_competencia_select_operacional     on public.transacao_competencia            to public;
alter policy transacao_competencia_write_admin            on public.transacao_competencia            to public;

-- NÃO reverter as policies que já estavam em authenticated antes desta proposta
-- (alunos, fluxo_*, profiles, transacoes, validacao_*, mapeamento_aluno_pagador).

-- Função touch: devolver EXECUTE ao anon só se precisar (não recomendado)
-- grant execute on function public.criacoes_ia_salvas_touch() to anon;

-- Views: se alguma tela quebrar, reabrir ALL ao authenticated (estado anterior frouxo)
-- grant select, insert, update, delete, truncate, references, trigger
--   on public.v_resumo_mensal_oficial to authenticated;
-- (e o mesmo nas demais v_*)

commit;
