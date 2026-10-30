# Consulta Byla com IA (Gemini)

## Como funciona

1. A pessoa pergunta no chat (botão Consulta Byla). O frontend manda a pergunta e **as últimas 10 mensagens** da conversa.
2. O backend (`POST /api/ai/consulta/chat`) valida tudo com zod: no máximo 10 mensagens de histórico, 2000 caracteres cada, só os papéis `user` e `assistant`.
3. Se `GEMINI_API_KEY` estiver configurada, o backend roda um **agente com function calling** (`backend/src/ai/consultaGeminiAgent.ts`):
   - modelos, em ordem: `gemini-3.8-flash` → `gemini-3.6-flash` → `gemini-flash-latest`;
   - o modelo só pode chamar **ferramentas declaradas**, com parâmetros fixos (mês, ano, data, nome, valor, modalidade, meses a comparar). Os parâmetros são validados no servidor. **O modelo nunca escreve SQL**;
   - no máximo **5 rodadas** de ferramentas por pergunta;
   - instrução de sistema: responder em português, sem inventar números, usando só o que as ferramentas devolveram;
   - todas as ferramentas são **só leitura**.
4. Se não houver chave, ou se o Gemini der erro ou limite (HTTP 429), a resposta sai pelo **modo simples** (menu determinístico de antes). Quando o Gemini falha, a resposta começa com um aviso, por exemplo: "O limite gratuito da IA foi atingido agora; respondi no modo simples (menu)."

## Ferramentas (19)

Existentes (14): `resumo_mes`, `resumo_semana`, `resumo_dia`, `resumo_periodo`, `resumo_modalidades`, `controle_oficial_vs_sistema`, `resumo_categoria_extrato` (Movimentações/Entrada-Saída), `resumo_meio_pagamento`, `pendentes_conciliacao`, `pagamentos_fluxo_dia`, `movimentos_banco_dia`, `sem_vinculo_validacao`, `busca_aluno`, `busca_por_valor`.

Novas:
- `alunos_por_modalidade`
- `inadimplencia_mes` (mesmo filtro do relatório de inadimplência)
- `comparar_meses`
- `saidas_planilha_controle`
- `resumo_planilha_fluxo`

## Quem pode usar

- **admin**: sim.
- **gestor** (papel novo, só leitura): sim. O gestor é bloqueado em **todas** as outras rotas da API (`restrictGestor`). Por enquanto, no frontend ele vê só o chat e o próprio perfil.
- **secretaria**: não.

A verificação é feita no servidor, a partir de `profiles.role`; o papel enviado pelo frontend é ignorado.

> O papel `gestor` só passa a existir de verdade depois de aplicar `scripts/supabase-profiles-role-gestor.sql`. **Esse script precisa de aprovação do Levi e não foi aplicado.**

## O que é enviado ao Google (Gemini)

- A pergunta e o histórico (até 10 mensagens).
- Os textos devolvidos pelas ferramentas: valores, datas, categorias e **nomes de alunos e de contrapartes** (necessários para perguntas como "quem não pagou").
- Antes do envio, o servidor remove **CPF, telefone e e-mail** (`stripPii`). Isso é feito por padrão de texto (regex), então é uma redução de risco, não uma garantia.
- Chaves e tokens nunca vão para o Gemini. A chave segue no header `x-goog-api-key`.

## Atenção: plano gratuito

- No plano gratuito da API Gemini, o **Google pode usar os prompts e as respostas para melhorar os produtos**, e pessoas podem revisá-los. Como vão nomes de alunos e valores, o ideal é usar uma chave de **plano pago** (Cloud Billing ativo) antes de liberar para mais pessoas.
- O plano gratuito tem limites baixos por minuto e por dia. Quando o limite estoura (429), o chat cai no modo simples e avisa.
- O backend também limita as chamadas por cliente (`RATE_LIMIT_IA_MAX` / `RATE_LIMIT_IA_WINDOW_MS`).

## Testar localmente

1. `backend/.env` com as variáveis de sempre, mais `GEMINI_API_KEY=` (chave sua de teste; nunca commitar).
2. `cd backend && npm run dev`
3. `cd frontend && npm run dev`, entre como admin e abra o Consulta Byla.
4. Sem a chave, o chat deve responder pelo menu (modo simples).
5. Testes: `cd backend && npm test`
