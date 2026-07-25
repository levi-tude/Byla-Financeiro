# Validação diária — regras N→1 e exclusividade de banco

**Data:** 24 de julho de 2026  
**Status:** implementado  
**Tela:** Validação — dia a dia (`ValidacaoPagamentosDiariaPage`)

## 1. Objetivo

Corrigir candidatos de banco que continuavam aparecendo após vínculo manual e formalizar quando **várias linhas do fluxo** podem compartilhar **um lançamento no banco** (N→1), sem abrir 1→N genérico para pessoas diferentes com o mesmo valor.

## 2. Regra padrão (1:1)

- Um lançamento no banco ↔ uma linha do fluxo.
- Quando `banco_id` já está em `validacao_pagamentos_vinculos` naquele dia, **não** oferecer esse banco como candidato para **outras** linhas do fluxo.

## 3. Exceções N→1 (revisão manual)

| Cenário | Detecção | UI |
|---------|----------|-----|
| Mesmo aluno, modalidades/abas diferentes no mesmo dia | Agrupar por `aluno_norm`; soma dos valores ≈ um banco (PIX ±0,01; Vendas com taxa %) | Chip “Pagamento único · várias modalidades”; confirmar 1 banco → N `planilha_ids` |
| Mesmo pagador para 2+ alunos | `pagador_pix`, `responsaveis` (≥5 chars), sticky, ou catálogo casal | Chip “Mesmo pagador” / “casal”; seletor N→1 só lista banco ≈ **soma** (não o valor individual) |
| Grupo familiar sticky (mãe/filha, casal, etc.) | Catálogo `grupo_familia_pagamento` no Supabase **ou** mesmo `pagador_pix`/`responsaveis` no dia | Chip “Pagamento único · mãe e filha/casal” ou “Mesmo pagador”; soma → 1 banco |
| Crédito/Vendas 1→N | Fluxo sticky existente (fora deste escopo) | Sugestões de crédito recorrente |

**Não permitido:** 1→N genérico (dois alunos diferentes só com o mesmo valor) — ambos mantêm o candidato até um confirmar; depois o banco fica exclusivo.

## 4. Backend

- `listVinculosDia` aplicado após o match automático.
- `filtrarCandidatosPorVinculosExclusivos` remove bancos já vinculados, exceto irmãos do mesmo grupo N→1.
- `detectarGruposRateioMesmoAluno` sugere soma aluno → um banco.
- Catálogo família/casal: tabela Supabase `grupo_familia_pagamento` (sem PII no Git); carregado em `carregarGruposFamiliaNoMatch`.
- POST `/validacao-vinculos` já aceita `planilha_ids[]` — reutilizado na UI de grupo.

## 5. Frontend

- Rótulo discreto em cada card: `aba · modalidade` (ex.: `PILATES · Reformer`).
- Banner/chip quando rateio mesmo aluno ou mesmo pagador multi-aluno.
- Agrupamento visual prioriza `grupo_rateio_ids` vindo da API.

## 6. Reteste manual (com dados de operação / demo local)

1. Vincular uma linha → recarregar dia → banco não aparece para outros alunos.
2. Mesmo aluno, duas modalidades no mesmo dia (ex.: 80+260) → card agrupado pela soma; confirmar uma vez.
3. Família/casal do catálogo no mesmo dia → chip e candidato pela soma; confirmar uma vez vincula as duas.
4. Fluxo DÉBITO: candidato = Disponivel DÉBITO (com taxa); crédito/Vendas **não** aparece como possível.
5. Labels: cada card mostra aba/modalidade em cinza abaixo do nome.

**Reiniciar backend** após deploy local para carregar a rota atualizada.
