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

## Ferramentas (22)

Existentes (14): `resumo_mes`, `resumo_semana`, `resumo_dia`, `resumo_periodo`, `resumo_modalidades`, `controle_oficial_vs_sistema`, `resumo_categoria_extrato` (Movimentações/Entrada-Saída), `resumo_meio_pagamento`, `pendentes_conciliacao`, `pagamentos_fluxo_dia`, `movimentos_banco_dia`, `sem_vinculo_validacao`, `busca_aluno`, `busca_por_valor`.

Novas:
- `alunos_por_modalidade`
- `inadimplencia_mes` (mesmo filtro do relatório de inadimplência)
- `comparar_meses`
- `saidas_planilha_controle`
- `resumo_planilha_fluxo`
- `balanco_meses`: balanço mês a mês dos últimos N meses, com total. Fonte: `v_resumo_mensal_oficial` (ou as transações oficiais, se a view não tiver o mês).
- `entradas_modalidade_periodo`: quanto entrou de uma modalidade num mês ou período. Fonte: pagamentos do Fluxo operacional (`fluxo_pagamentos_operacionais`, aba/modalidade, por mês de pagamento). O extrato do banco está com `modalidade` vazia.
- `movimentos_por_pessoa`: movimentos de uma pessoa, professor, parceiro ou apelido, nos dois sentidos: **recebido de** (entrada) e **pago a** (saída). A busca é por nome e também por categoria, usando `mapeamento_pessoa_categoria` (só leitura), que leva do apelido ao pagador real no banco. Procura em 3 fontes, mostradas separadamente e **sem somar**: extrato bancário (entradas e saídas oficiais), Controle de caixa e planilha FLUXO DE CAIXA. Se não achar nada, responde "nenhum registro encontrado nas fontes …" e **nunca R$ 0**.

### Perguntas de aceitação (testadas com mock em `consultaAceitacao.test.ts`)
1. "qual o balanço do mês?" → `resumo_mes`
2. "qual o balanço dos últimos 4 meses?" → `balanco_meses` (meses=4)
3. "quanto entrou de Pilates?" → `entradas_modalidade_periodo`
4. "quanto foi o pagamento do Pholha?" → `movimentos_por_pessoa`. No extrato, "Pholha" é uma **entrada** de outro pagador, classificada pelo `mapeamento_pessoa_categoria` na categoria "Pholha (Funcional)". A tool chega a esse pagador pela categoria e responde "recebido de" (por volta de R$ 2.500/mês de jul a out, segundo o time de dados). O teste usa dados fictícios.

A instrução de sistema obriga a IA a citar a fonte de cada número e a dizer "não encontrei" em vez de responder zero.

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

## Provedor de IA: Groq (primário) e Gemini (opcional)

- **Groq é o provedor principal** quando `GROQ_API_KEY` está definida (API compatível com OpenAI: `POST https://api.groq.com/openai/v1/chat/completions`, com `tools`).
- Modelos (fonte: https://console.groq.com/docs/tool-use, tabela "Supported Models", consultada em 30/10/2026):
  - primário: `openai/gpt-oss-120b` (tool use local, bom em português);
  - reservas: `openai/gpt-oss-20b` e `qwen/qwen3.8-27b` (cota grátis por modelo; `llama-3.3-70b-versatile` foi desligado em 16/08/2026).
  - 429 com `retry-after` ≤ 6 s: espera e repete 1 vez; falhas são logadas como `ai_consulta_llm_falha` (modelo, status, tipo de limite — sem segredos).
  - Para caber em ~8K tokens/min: histórico = últimas 4 mensagens (600 chars cada); resultado de função ≤ 3500 chars; resposta ≤ 700 tokens.
- **Gemini** só entra como reserva, se `GEMINI_API_KEY` existir.
- A ordem é configurável em `CONSULTA_AI_PROVIDER` (padrão `groq,gemini`; ex.: `gemini` usa só Gemini). Só entra na lista o provedor que tem chave.
- **Erro 429 (limite)**: tenta o próximo modelo/provedor. Se todos falharem, responde no modo simples (menu determinístico) com o aviso "O limite gratuito da IA foi atingido agora…". O mesmo vale para outros erros.
- **Retenção de dados**: por padrão, o Groq não guarda entradas nem saídas de inferência. Ativar **Zero Data Retention** em Data Controls no console Groq desliga também os logs temporários de confiabilidade/abuso (fonte: https://console.groq.com/docs/your-data). É uma configuração da conta Groq, feita pelo Levi; não fica no código.
- Código: `backend/src/ai/llmProviders.ts` (Groq/Gemini + `llmGenerateText`, também usado pelo painel de criações).

## Pseudonimização (nome → código)

- Antes de qualquer envio ao LLM (pergunta, histórico e resultado das tools), os nomes conhecidos viram códigos estáveis dentro da mesma requisição: "Aluno 1", "Pessoa 3"…
- Os nomes vêm, somente leitura e com cache de 10 min, de `fluxo_pagamentos_operacionais.aluno_nome` (alunos), `mapeamento_pessoa_categoria.pessoa_normalizada` e `transacoes.pessoa` (pessoas).
- Os argumentos de tool que o modelo devolve com código (ex.: `{"nome":"Aluno 1"}`) são trocados pelo nome real **no servidor** antes de executar a tool.
- A resposta final é revelada (código → nome) antes de chegar ao usuário.
- CPF, telefone e e-mail continuam sendo removidos (`stripPii`).
- Limites: nomes com menos de 4 letras e apelidos que não estão em nenhuma dessas tabelas (ex.: "Pholha" como texto livre ou dentro de uma categoria) não são trocados.
- Testes: `backend/src/ai/consultaGroqPseudo.test.ts` (nenhum nome real das fixtures vai no payload; round-trip de "quanto a Aluno Demo Um pagou?").

## Qualidade dos dados (fix/consulta-dados-qualidade)

- **Cobertura do extrato:** toda tool baseada em `transacoes` anexa "Dados do extrato até DD/MM/AAAA" (último lançamento no período) e, se o último lançamento importado (geral) for anterior ao fim do período, "ATENÇÃO: período incompleto". A IA é instruída a repetir isso; se esquecer, `garantirCoberturaExtrato` anexa a linha.
- **Sem dados ≠ zero:** período sem nenhum lançamento no extrato → "Sem dados do extrato para esse período" (a tool nem soma). Vale para IA e fallback. Balanço/comparação marcam o mês vazio como "sem dados".
- **Documentos no campo `pessoa`:** `limparDocumentoPessoa` remove CPF/CNPJ completos, parciais, mascarados (`***.456.789-**`) ou colados ao nome; `stripPii` também cobre CNPJ, mascarados e dígitos colados a nome.
- **Tolerância do par EA/Blead × repasse Samuel:** padrão do código alinhado à view `v_resumo_mensal_oficial` (R$ 300; antes R$ 800). Divergências que continuam (só documentadas, view não alterada):
  - o código também exclui saídas Samuel entre R$ 4.800 e R$ 6.500 mesmo sem par (a view não);
  - o código identifica externos por `pessoa` começando com "EA "/"BLEAD AD TECH" **ou `descricao` contendo** esses termos; a view usa `descricao LIKE 'ea %'` (começa com) e `'%blead ad tech%'`;
  - `v_transacoes_export` classifica qualquer saída `samuel%` como repasse, sem checar valor.
- **Alunos ativos:** `alunos_por_modalidade` ignora a modalidade literal "(modalidade)" (cabeçalho importado) e mostra o total. Linhas como "BOLSA PROVISORIA" continuam contando.

## Roteador determinístico, subconjunto de ferramentas e fallback

**Ordem de resposta** (`gerarConsultaReply`):

1. **Roteador determinístico** (`backend/src/ai/consultaRouter.ts`) roda **antes da IA**. Perguntas comuns com alta confiança são respondidas direto pelas ferramentas, sem chamar o LLM:
   - balanço/resultado/“quanto entrou” do mês (da tela, do mês citado ou do mês passado) → `resumo_mes`;
   - “últimos N meses” e meses contíguos (“maio e junho”) → `balanco_meses`;
   - “compara setembro com outubro”, “agosto vs setembro” → `comparar_meses`;
   - “quanto entrou de <modalidade>” no mês ou período (“de jul a out”, “jul-set”), “o Pilates trouxe…” → `entradas_modalidade_periodo`; “entradas por modalidade” → `resumo_modalidades`;
   - “pagamento do X”, “o X pagou…”, “recebemos da X”, “pagamos ao X” (nome com maiúscula) → `movimentos_por_pessoa`;
   - “essa semana” → `resumo_semana`; “hoje/ontem” → `resumo_dia`;
   - recusas fixas: pedidos de escrita (apagar/alterar/lançar) e dados pessoais (CPF, telefone…).
   Ambíguo (perguntas encadeadas “e de yoga?”, várias modalidades, “deve”, professores, valores, alunos…) → `null` → IA.
2. **IA** recebe só **3–6 ferramentas relevantes** (`selecionarToolsRelevantes`, por palavras‑chave da pergunta e das 2 últimas do usuário), não as 22.
3. **Fallback**: se todos os modelos falharem (429/erro/exceção), responde no modo determinístico com o aviso “…respondi no modo simples (menu).” A rota `/api/ai/consulta/chat` usa rate limit *soft*: acima do limite não devolve 429, responde no modo simples. O front não mostra mais “Não consegui consultar os dados agora”; só mostra aviso de sem conexão quando a requisição nem chega ao servidor.

Testes: `backend/src/ai/consultaRouter.test.ts` (nomes fictícios). Na lista de 30 perguntas dos gestores, o roteador responde ~17 sem IA (incluindo as 2 recusas).
