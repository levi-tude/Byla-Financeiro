-- =====================================================================
-- APLICADO em produção 09/11/2026 (Bahia) via apply_migration restringir_anon_policies_views_2026_11_09
-- Projeto Supabase "Byla" (flbimmwxxsvixhghmmfu)
-- Registro no repo após aplicação aprovada pelo Levi ("pode fazer os 3")
--
-- ESTADO AO VIVO (lido em 09/11, sem alterar nada):
--   - anon: ZERO grants em tabelas/views/sequences do schema public
--     (já revogado na migration revoke_anon_public_grants, 22/10/2026)
--   - residual: função public.criacoes_ia_salvas_touch() ainda tem EXECUTE p/ anon
--   - várias policies ainda estão TO public (inclui anon na teoria);
--     na prática o anon não chega nelas porque não tem GRANT na tabela.
--   - authenticated mantém SELECT (e demais) nas tabelas/views; login e
--     telas pós-login dependem disso — este SQL NÃO remove SELECT do authenticated.
--
-- DEPENDÊNCIAS VERIFICADAS (não quebra):
--   - Frontend antes do login: só supabase.auth.* (GoTrue; não usa grants de public)
--   - Frontend depois do login: profiles + views (role authenticated)
--   - Backend: service_role (bypassa RLS/grants de anon)
--   - n8n: SUPABASE_SERVICE_ROLE_KEY (não usa anon key)
--
-- Risco esperado pro app: BAIXO / nenhum no caminho normal.
-- =====================================================================

begin;

-- 1) Reafirmar (idempotente) o fechamento do anon
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;

-- 2) Residual explícito: trigger touch das Criações da IA
--    (trigger roda sem EXECUTE do cliente; anon não precisa)
revoke execute on function public.criacoes_ia_salvas_touch() from anon, public;

-- 3) Policies que ainda estão TO public → só authenticated
--    (defesa em profundidade; já aplicadas em parte em 30/10)
alter policy aluno_planos_operacional_select              on public.aluno_planos                      to authenticated;
alter policy aluno_planos_operacional_write               on public.aluno_planos                      to authenticated;
alter policy assinatura_credito_recorrente_select_operacional on public.assinatura_credito_recorrente to authenticated;
alter policy assinatura_credito_recorrente_write_admin    on public.assinatura_credito_recorrente     to authenticated;
alter policy atividades_operacional_select                on public.atividades                       to authenticated;
alter policy atividades_operacional_write                 on public.atividades                       to authenticated;
alter policy controle_caixa_blocos_operacional_select     on public.controle_caixa_blocos            to authenticated;
alter policy controle_caixa_blocos_operacional_write      on public.controle_caixa_blocos            to authenticated;
alter policy controle_caixa_linhas_operacional_select     on public.controle_caixa_linhas            to authenticated;
alter policy controle_caixa_linhas_operacional_write      on public.controle_caixa_linhas            to authenticated;
alter policy controle_caixa_periodos_operacional_select   on public.controle_caixa_periodos          to authenticated;
alter policy controle_caixa_periodos_operacional_write    on public.controle_caixa_periodos          to authenticated;
alter policy despesas_admin_only                          on public.despesas                         to authenticated;
alter policy fluxo_operacional_auditoria_select           on public.fluxo_operacional_auditoria      to authenticated;
alter policy fluxo_operacional_auditoria_write            on public.fluxo_operacional_auditoria      to authenticated;
alter policy grupo_familia_pagamento_select_operacional   on public.grupo_familia_pagamento          to authenticated;
alter policy grupo_familia_pagamento_write_admin          on public.grupo_familia_pagamento          to authenticated;
alter policy mapeamento_credito_recorrente_select_operacional on public.mapeamento_credito_recorrente to authenticated;
alter policy mapeamento_credito_recorrente_write_admin    on public.mapeamento_credito_recorrente     to authenticated;
alter policy mapeamento_select_operacional                on public.mapeamento_pessoa_categoria      to authenticated;
alter policy mapeamento_write_admin                       on public.mapeamento_pessoa_categoria      to authenticated;
alter policy planos_operacional_select                    on public.planos                           to authenticated;
alter policy planos_operacional_write                     on public.planos                           to authenticated;
alter policy regras_externos_select_operacional           on public.regras_externos                  to authenticated;
alter policy regras_externos_write_admin                  on public.regras_externos                  to authenticated;
alter policy transacao_competencia_select_operacional     on public.transacao_competencia            to authenticated;
alter policy transacao_competencia_write_admin            on public.transacao_competencia            to authenticated;

-- 4) Já estavam em authenticated (idempotente; reafirma)
alter policy alunos_operacional_select                    on public.alunos                           to authenticated;
alter policy alunos_operacional_write                     on public.alunos                           to authenticated;
alter policy fluxo_alunos_operacionais_select             on public.fluxo_alunos_operacionais        to authenticated;
alter policy fluxo_alunos_operacionais_write              on public.fluxo_alunos_operacionais        to authenticated;
alter policy fluxo_pagamentos_operacionais_select         on public.fluxo_pagamentos_operacionais    to authenticated;
alter policy fluxo_pagamentos_operacionais_write          on public.fluxo_pagamentos_operacionais    to authenticated;
alter policy mapeamento_aluno_pagador_select_operacional  on public.mapeamento_aluno_pagador         to authenticated;
alter policy mapeamento_aluno_pagador_write_admin         on public.mapeamento_aluno_pagador          to authenticated;
alter policy profiles_select_self_or_admin                on public.profiles                         to authenticated;
alter policy profiles_insert_admin                        on public.profiles                         to authenticated;
alter policy profiles_update_admin                        on public.profiles                         to authenticated;
alter policy transacoes_admin_only                        on public.transacoes                       to authenticated;
alter policy validacao_pagamentos_vinculos_admin_only     on public.validacao_pagamentos_vinculos    to authenticated;
alter policy validacao_extrato_antes_fluxo_admin_only     on public.validacao_extrato_antes_fluxo    to authenticated;

-- 5) Views: deixar só SELECT pro authenticated (frontend só lê)
--    Lista alinhada ao grant-views-anon.sql + views novas vistas ao vivo
revoke all on public.v_resumo_mensal_oficial            from anon, public;
revoke all on public.v_entradas_oficial                 from anon, public;
revoke all on public.v_reconciliacao_mensalidades       from anon, public;
revoke all on public.v_resumo_atividade                 from anon, public;
revoke all on public.v_alunos_por_atividade              from anon, public;
revoke all on public.v_mensalidades_por_atividade       from anon, public;
revoke all on public.v_mensalidades_aluno_e_pagador     from anon, public;
revoke all on public.v_mensalidades_sem_valor           from anon, public;
revoke all on public.v_precos_mensalidade_por_atividade from anon, public;
revoke all on public.v_comparativo_cadastro_vs_oficial  from anon, public;
revoke all on public.v_transacoes_export                from anon, public;
revoke all on public.v_pares_salario_samuel             from anon, public;

revoke all on public.v_resumo_mensal_oficial            from authenticated;
revoke all on public.v_entradas_oficial                 from authenticated;
revoke all on public.v_reconciliacao_mensalidades       from authenticated;
revoke all on public.v_resumo_atividade                 from authenticated;
revoke all on public.v_alunos_por_atividade              from authenticated;
revoke all on public.v_mensalidades_por_atividade       from authenticated;
revoke all on public.v_mensalidades_aluno_e_pagador     from authenticated;
revoke all on public.v_mensalidades_sem_valor           from authenticated;
revoke all on public.v_precos_mensalidade_por_atividade from authenticated;
revoke all on public.v_comparativo_cadastro_vs_oficial  from authenticated;
revoke all on public.v_transacoes_export                from authenticated;
revoke all on public.v_pares_salario_samuel             from authenticated;

grant select on public.v_resumo_mensal_oficial            to authenticated;
grant select on public.v_entradas_oficial                 to authenticated;
grant select on public.v_reconciliacao_mensalidades       to authenticated;
grant select on public.v_resumo_atividade                 to authenticated;
grant select on public.v_alunos_por_atividade              to authenticated;
grant select on public.v_mensalidades_por_atividade       to authenticated;
grant select on public.v_mensalidades_aluno_e_pagador     to authenticated;
grant select on public.v_mensalidades_sem_valor           to authenticated;
grant select on public.v_precos_mensalidade_por_atividade to authenticated;
grant select on public.v_comparativo_cadastro_vs_oficial  to authenticated;
grant select on public.v_transacoes_export                to authenticated;
grant select on public.v_pares_salario_samuel             to authenticated;

commit;

-- Fora do SQL (não dá pra fazer por migration aqui):
--   Default privileges do role supabase_admin ainda podem dar SELECT ao anon
--   em objetos NOVOS criados pela plataforma. Monitorar com get_advisors
--   depois de cada migration.
