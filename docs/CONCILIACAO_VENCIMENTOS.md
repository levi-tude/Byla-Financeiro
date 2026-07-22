# Conciliação por vencimento

> **Atualização (2026-07-22):** A tela do painel é **Operação → Conciliação** (`/conciliacao`), API `GET /api/conciliacao-pagamentos`.  
> Regra de “em dia” **sem folga** (crédito ≤ dia do vencimento).  
> `GET /api/conciliacao-vencimentos` permanece como legado admin (tolerância `graceDias`).

## Objetivo

Comparar, para cada aluno ativo na planilha **FLUXO DE CAIXA BYLA**:

1. O **dia de vencimento** cadastrado na primeira parte da aba (colunas flexíveis: `VENC`, `VENC.`, `VEN`, `DATA VENC`, `DATA VEN`, etc.; em **TEATRO** a coluna `DATA` no bloco de cadastro pode representar só o dia).
2. Se existe **pagamento lançado** na parte do calendário para a **competência** (mês/ano) selecionada no painel.
3. Classificar: em dia (dentro da tolerância), pago com atraso, em aberto após o vencimento, a vencer, ou sem coluna de vencimento identificada.

## API

- `GET /api/conciliacao-vencimentos?mes=1-12&ano=YYYY`

## Tolerância

Pagamentos até **N dias** após a data de vencimento do mês são considerados “em dia” (padrão no backend: 5 dias).

## Frontend

- Rota: **Conciliação** (`/conciliacao`) — lista, filtros por nome e situação, link para **Validação de pagamentos** com `?data=` (data do pagamento na planilha ou, se não houver, vencimento).

## Banco (confirmação)

A rota de conciliação **também** cruza cada pagamento da competência com o extrato (`transacoes`), usando a **mesma regra** da **Validação de pagamentos**:

- Valor dentro da tolerância (±0,01);
- Nome compatível (aluno, responsáveis, PIX; em Pilates também `v_mensalidades_por_atividade`);
- Janela de **±7 dias** em torno da **data do pagamento na planilha**;
- Cada transação do banco só pode ser “consumida” **uma vez** por requisição (como na validação).

Se houver **vários** lançamentos na planilha para a mesma competência, **todos** precisam ter match **confirmado** para `banco_confirmado: true`.

### Campos extras no JSON (`itens[]`)

| Campo | Significado |
|--------|-------------|
| `banco_confirmado` | `true`/`false` quando há pagamento na planilha; `null` quando não há pagamento para a competência |
| `banco_status` | `ok` \| `possivel` \| `nao` \| `nao_aplicavel` |
| `data_banco`, `pessoa_banco`, `transacao_banco_id` | Última transação confirmada (vários IDs separados por vírgula se aplicável) |
| `banco_mensagem` | Texto explicativo |

### KPIs (`kpis`)

- `banco_ok`, `banco_pendente`, `banco_ambiguo` — contagens auxiliares.

### Erros

- **503** se o Supabase não estiver configurado (a rota precisa do extrato).

A **Validação de pagamentos** por dia continua disponível para conferência detalhada.
