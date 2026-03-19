# Scripts Supabase – Cadastros Byla

Scripts para criar/atualizar as tabelas de **atividades**, **planos**, **alunos** e **aluno_planos** no Supabase e inserir as modalidades e alunos. Inclui **views** para deixar explícito: preço da mensalidade por atividade e alunos divididos por atividade.

## Ordem de execução

1. **Schema (só se as tabelas ainda não existirem)**  
   Abra no Supabase: **SQL Editor** → New query → cole o conteúdo de **`supabase-schema-cadastros.sql`** → Run.

2. **Seed (modalidades e alunos)**  
   - Para o projeto atual (DB com colunas `data_referencia`, `nome_pagador_pix`, `valor` em `aluno_planos`): use **`seed-modalidades-alunos-byla-2026.sql`** (fev/2026, 8 modalidades, 22 alunos da lista atual).
   - Para referência histórica (schema com `data`, `nome_pagador`): **`seed-modalidades-alunos-byla.sql`** (fev/2025).

3. **Views (mensalidades e alunos por atividade)**  
   Nova query → cole o conteúdo de **`views-mensalidades-e-alunos-por-atividade.sql`** → Run.

4. **Views (transações oficiais e conciliação)**  
   Nova query → cole o conteúdo de **`views-transacoes-oficial-e-reconciliacao.sql`** → Run.  
   Entradas e totais **oficiais** vêm da tabela **transacoes** (banco); a conciliação compara com o cadastro (aluno_planos). Ver **`docs/CADASTRO_VS_TRANSACOES_OFICIAL.md`**.

## Schema do banco em produção

O projeto Byla no Supabase usa em **aluno_planos**:
- `valor` (numeric) – valor pago naquela mensalidade
- `data_referencia` (date) – data de referência do pagamento
- `forma_pagamento` (text) – ex.: pix, débito, crédito
- `nome_pagador_pix` (text) – nome do pagador (PIX ou outro)

A coluna **`valor`** foi adicionada por migração se não existia. O script **seed-modalidades-alunos-byla-2026.sql** está alinhado a esse schema e usa `WHERE NOT EXISTS` para evitar duplicatas ao reexecutar.

## Se as tabelas já existirem (ex.: Pilates feito antes)

- Se a estrutura for **diferente** (outros nomes de coluna ou sem `UNIQUE`), não rode o schema completo para não alterar as tabelas à força.
- No seed 2026:
  - **atividades:** `WHERE NOT EXISTS` por nome.
  - **aluno_planos:** cada insert verifica se já existe vínculo (aluno + atividade + data_referencia) antes de inserir.

## Mensalidades e alunos por atividade

Para ficar **claro** o preço da mensalidade de cada atividade e a **divisão dos alunos por modalidade**:

- **Tabela `alunos`** = cadastro geral de alunos (uma vez só por pessoa).
- **Por atividade:** use as views abaixo; cada aluno aparece em cada atividade em que está vinculado (pode estar em mais de uma).

| View | O que mostra |
|------|----------------|
| **v_precos_mensalidade_por_atividade** | Por atividade: nome do plano (produto), valor de referência da mensalidade e faixa de valores pagos (mín/médio/máx). Fica explícito a qual atividade cada preço pertence. |
| **v_alunos_por_atividade** | Lista **alunos divididos por atividade**: uma linha por (atividade, aluno). Para ver “alunos de Pilates” ou “alunos de Dança”, filtre por `atividade_nome`. |
| **v_mensalidades_por_atividade** | Cada pagamento de mensalidade com: atividade, aluno, valor, data, forma de pagamento e nome do pagador. Produto e preço vinculados à atividade. |
| **v_resumo_atividade** | Resumo por atividade: total de alunos, quantidade de mensalidades e soma dos valores (fonte: **cadastro**; para valor oficial use as views de transacoes). Soma usa COALESCE(valor, 0) para linhas com valor NULL. |
| **v_mensalidades_aluno_e_pagador** | Sempre exibe **aluno** (quem faz a atividade) e **pagador** (quem efetuou o pagamento) com nomes de coluna explícitos; evita confusão quando outra pessoa paga pelo aluno. |
| **v_mensalidades_sem_valor** | Lista mensalidades com **valor NULL**; use para preencher depois (UPDATE aluno_planos SET valor = ... WHERE id = ...). |
| **views-transacoes-oficial-e-reconciliacao.sql** | **Oficial (banco):** v_entradas_oficial, v_resumo_mensal_oficial. **Conciliação:** v_reconciliacao_mensalidades (aluno_nome, nome_pagador_cadastro, valor_preenchido, confirmado_banco), v_comparativo_cadastro_vs_oficial. |

Requisito: tabela **planos** com coluna `valor_mensal` e **aluno_planos** com `data_referencia` e `nome_pagador_pix`. Se o seu schema tiver `data` e `nome_pagador`, edite o script das views e troque os nomes das colunas.

## O que cada script faz

| Arquivo | Conteúdo |
|---------|----------|
| `supabase-schema-cadastros.sql` | Cria `atividades`, `planos`, `alunos`, `aluno_planos` e índices (com `IF NOT EXISTS`). |
| `seed-modalidades-alunos-byla.sql` | Seed fev/2025: 8 modalidades, plano “Mensalidade” por atividade, 22 alunos e vínculos (schema com `data`, `nome_pagador`). |
| `seed-modalidades-alunos-byla-2026.sql` | Seed fev/2026: mesmo conteúdo alinhado ao DB atual (`data_referencia`, `nome_pagador_pix`, `valor`); pode ser reexecutado sem duplicar. |
| `views-mensalidades-e-alunos-por-atividade.sql` | Cria as 4 views acima: preços por atividade, alunos por atividade, mensalidades detalhadas e resumo por atividade. |

## Datas

- **seed 2025:** datas em **2025-02-DD** (fevereiro de 2025).
- **seed 2026:** datas em **2026-02-DD** (fevereiro de 2026).
