# Passo a passo: deixar o sistema funcionando

Siga na ordem. No final, as transações do PagBank entram automaticamente na tabela **transacoes** do Supabase.

---

## Você já tem o e-mail com Usuário e Token?

Se você já recebeu o e-mail da PagBank com **Usuário** e **Token** (ativação do fluxo EDI concluída):

- **Pule o passo 1** e vá do **passo 2** em diante.
- No **passo 4**, use no n8n: **User** = o número "Usuário" do e-mail, **Password** = o "Token" do e-mail.
- **Importante:** o e-mail diz para aguardar **1 dia** para os dados EDI ficarem disponíveis. Você pode configurar tudo agora e testar; se a API ainda não retornar dados, rode de novo após 24h.

---

## 1. Pedir o token do PagBank (uma vez)

1. Abra: https://developer.pagbank.com.br/devpagbank/docs/edi#token-api-edi  
2. Clique no link do **portal de solicitação** (Pipefy).  
3. Marque **Cliente PagBank**.  
4. Peça **1 token para 1 estabelecimento** e informe o **número do estabelecimento** (você vê no painel PagBank).  
5. Informe seu e-mail e envie.  
6. Guarde o **TOKEN** que vier por e-mail (pode levar alguns dias). Guarde também o **número do estabelecimento** (USER).

---

## 2. Abrir o n8n

- Abra o n8n (o que você já usa: local ou n8n cloud).

---

## 3. Importar o workflow no n8n

1. No n8n: **Workflows** → **Import from File** (ou **Add workflow** → **Import from File**).  
2. Escolha o arquivo: **`n8n-workflows/workflow-pagbank-edi-para-supabase.json`** (pasta do projeto Byla-Financeiro).  
3. O workflow **"BYLA - PagBank EDI para Supabase"** vai aparecer.

---

## 4. Configurar a credencial do PagBank no n8n

1. No n8n: **Settings** (engrenagem) → **Credentials** → **Add Credential**.  
2. Procure **HTTP Basic Auth** (ou **Basic Auth**).  
3. Preencha:
   - **Name:** `PagBank EDI` (ou outro nome).  
   - **User:** número do estabelecimento (USER).  
   - **Password:** o TOKEN que você recebeu por e-mail.  
4. Salve.

---

## 5. Configurar a credencial do Supabase no n8n

1. Ainda em **Credentials** → **Add Credential** → **Supabase**.  
2. Preencha:
   - **Host:** `https://flbimmwxxsvixhghmmfu.supabase.co` (sem barra no final).  
   - **Service Role Key** ou **anon key:** abra o arquivo **`supabase-keys.local`** na raiz do projeto Byla-Financeiro e copie o valor de **SUPABASE_ANON_KEY**. Cole aqui.  
3. Salve.

*(Se não tiver o arquivo `supabase-keys.local`, pegue em: Supabase → seu projeto → **Project Settings** → **API** → **anon public** → Copy.)*

---

## 6. Ligar as credenciais ao workflow

1. Volte ao workflow **"BYLA - PagBank EDI para Supabase"**.  
2. Clique no nó **"PagBank EDI (transactional)"** → em **Credentials**, escolha a credencial **PagBank EDI** que você criou.  
3. Clique no nó **"Id_unicos no Supabase"** → em **Credentials**, escolha a credencial **Supabase** que você criou.  
4. Clique no nó **"Inserir Supabase"** → em **Credentials**, escolha a mesma credencial **Supabase**.  
5. Salve o workflow (Ctrl+S ou botão Save).

---

## 7. Testar

1. No workflow, clique em **Execute Workflow** (botão de play).  
2. Espere terminar. Se der erro em algum nó, anote qual e a mensagem (ex.: 401 = USER ou TOKEN do PagBank errado).  
3. Abra o **Supabase** → seu projeto → tabela **transacoes**.  
4. Veja se apareceram linhas novas. Se sim, o fluxo está funcionando.

---

## 8. Agendar e ativar

1. No workflow, clique no nó **"Agendar (ex.: 1x/dia)"**.  
2. Defina o horário (ex.: todo dia às 8h).  
3. Salve o workflow.  
4. Ative o workflow (interruptor **Active** = ligado no canto superior).

Pronto. A partir daí o n8n vai rodar no horário que você definiu, buscar as transações dos últimos 7 dias no PagBank e gravar só as novas na tabela **transacoes** do Supabase.

---

## Resumo em lista

1. Pedir token EDI no portal PagBank (guardar USER e TOKEN).  
2. Abrir o n8n.  
3. Importar **workflow-pagbank-edi-para-supabase.json**.  
4. Criar credencial **PagBank EDI** (HTTP Basic Auth: User = USER, Password = TOKEN).  
5. Criar credencial **Supabase** (Host = URL do projeto, Key = SUPABASE_ANON_KEY do `supabase-keys.local`).  
6. No workflow, ligar PagBank EDI ao nó "PagBank EDI (transactional)" e Supabase aos nós "Id_unicos no Supabase" e "Inserir Supabase".  
7. Rodar **Execute Workflow** e conferir a tabela **transacoes** no Supabase.  
8. Definir horário no "Agendar" e ativar o workflow.

Se travar em algum passo, diga qual número e o que apareceu na tela que eu te guio.
