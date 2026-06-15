# O que mudou no workflow PagBank EDI e como testar/implementar

---

## Parte 1: O que mudou (antes x depois)

### ANTES (como era)

| Onde | Como era |
|------|----------|
| **Agendador** | Só ligava em **um** nó: "Últimos 7 dias". |
| **Id_unicos no Supabase** | Não era acionado pelo agendador. Quem ligava nele era o "Mapear" (e de forma que não garantia rodar na mesma execução). |
| **Mapear → depois** | O "Mapear" ligava em dois nós: "Id_unicos no Supabase" e "Só novos". O fluxo ficava confuso (várias saídas). |
| **Só novos** | Não tinha certeza de receber **todas** as transações dos 7 dias nem a lista do Supabase na mesma execução. A deduplicação podia falhar. |

**Problema em uma frase:** O Supabase não era lido na hora certa e "Só novos" não enxergava tudo junto, então duplicatas ou falhas na comparação.

---

### DEPOIS (como ficou)

| Onde | Como ficou |
|------|------------|
| **Agendador** | Liga em **dois** nós ao mesmo tempo: "Últimos 7 dias" **e** "Id_unicos no Supabase". |
| **Id_unicos no Supabase** | É acionado **só** pelo agendador. Roda sempre que o workflow roda e enche a "lista do que já está no Supabase". |
| **Mapear → depois** | O "Mapear" liga **só** em "Só novos". Um caminho só. |
| **Só novos** | Usa no código: (1) **todos** os itens que vieram do Mapear (`$input.all()`), (2) **todos** os itens do nó "Id_unicos no Supabase". Compara, filtra só os novos, manda para Inserir. |

**Solução em uma frase:** Na mesma execução, o Supabase é lido no início e "Só novos" recebe todas as transações dos 7 dias e compara com essa lista, evitando duplicata.

---

### Desenho do fluxo

**Antes:**
```
Agendar → Últimos 7 dias → PagBank → Mapear → Id_unicos no Supabase
                                    ↘      → Só novos → Inserir
```
(Id_unicos não era disparado pelo Agendar; o fluxo até "Só novos" era ambíguo.)

**Depois:**
```
Agendar → Últimos 7 dias → PagBank → Mapear → Só novos → Inserir
        → Id_unicos no Supabase (roda em paralelo; "Só novos" lê esse nó no código)
```

---

## Parte 2: O que você precisa fazer para testar e implementar

### Pré-requisitos

1. **Conta PagBank Empresas** (conta de vendedor/estabelecimento).
2. **Token da API EDI** – você pede uma vez no portal do PagBank (ver abaixo).
3. **n8n** instalado (local ou cloud) e **Supabase** com a tabela **transacoes** (data, pessoa, valor, descricao, tipo, id_unico).

---

### Passo 1: Pedir o token EDI (uma vez)

1. Acesse: [Token API EDI – PagBank](https://developer.pagbank.com.br/devpagbank/docs/edi#token-api-edi).
2. Abra o portal de solicitação (link do Pipefy na página).
3. Escolha **Cliente PagBank**, peça **1 token para 1 estabelecimento** e informe o **número do estabelecimento** (USER).
4. O **TOKEN** será enviado por e-mail (pode levar alguns dias úteis).  
   Você vai usar: **USER** (estabelecimento) + **TOKEN** (e-mail).

---

### Passo 2: Importar o workflow no n8n

1. Abra o n8n.
2. Menu: **Workflows** → **Import from File** (ou arraste o arquivo).
3. Selecione o arquivo: **`n8n-workflows/workflow-pagbank-edi-para-supabase.json`** (do seu projeto Byla-Financeiro).
4. O workflow "BYLA - PagBank EDI para Supabase" aparecerá no editor.

---

### Passo 3: Configurar credenciais no n8n

Você precisa de **duas** credenciais:

**A) PagBank EDI (Basic Auth)**  
- Tipo: **HTTP Basic Auth** (ou Generic Credential Type → Basic Auth).  
- **User:** número do estabelecimento (USER).  
- **Password:** o TOKEN que você recebeu por e-mail.  
- Nome sugerido: **PagBank EDI USER:TOKEN**.

No workflow, o nó **"PagBank EDI (transactional)"** usa essa credencial. Se o ID no JSON for `PAGBANK_EDI`, crie a credencial e associe ao nó (ou edite o nó e escolha essa credencial).

**B) Supabase**  
- Tipo: **Supabase API**.  
- **Host (URL)** e **Service Role Key** (ou anon key, conforme sua tabela/RLS).  
- Os nós **"Id_unicos no Supabase"** e **"Inserir Supabase"** usam essa credencial.

---

### Passo 4: Testar manualmente (sem agendar)

1. **Desative** o trigger agendado (no nó "Agendar (ex.: 1x/dia)" você pode desligar o schedule ou deixar inativo).
2. Clique em **Execute Workflow** (teste manual).
3. Confira cada nó:
   - **Últimos 7 dias:** deve sair 7 itens (7 datas).
   - **PagBank EDI:** 7 requisições (uma por data). Se der 401, revise USER/TOKEN. Se a API retornar estrutura diferente, pode ser preciso ajustar o nó "Mapear para transacoes".
   - **Mapear para transacoes:** vários itens (uma linha por movimento).
   - **Id_unicos no Supabase:** deve listar as transações já na tabela (ou vazio se ainda não tiver nada).
   - **Só novos:** só itens cujo `id_unico` não está no Supabase.
   - **Inserir Supabase:** insere só esses novos.

4. No **Supabase**, abra a tabela **transacoes** e confira se as novas linhas apareceram e se não há duplicatas.

**Se der erro no "Mapear para transacoes":** a API EDI pode devolver campos com outros nomes. Abra a saída do nó **"PagBank EDI (transactional)"** e veja o JSON. Ajuste no código do "Mapear" os nomes (ex.: `detalhes`, `dataLancamento`, `valor`, etc.) conforme a documentação ou a resposta real.

---

### Passo 5: Ativar e agendar

1. No nó **"Agendar (ex.: 1x/dia)"**, configure o intervalo (ex.: todo dia às 8h).
2. Salve o workflow e ative-o (**Active** = On).
3. A partir daí o n8n vai rodar no horário definido: buscar os últimos 7 dias no PagBank, comparar com o Supabase e inserir só as transações novas.

---

## Resumo do que você precisa fazer

| # | O que fazer |
|---|-------------|
| 1 | Pedir token EDI no portal PagBank (USER + TOKEN por e-mail). |
| 2 | Importar **workflow-pagbank-edi-para-supabase.json** no n8n. |
| 3 | Criar credencial **Basic Auth** (USER + TOKEN) e associar ao nó "PagBank EDI (transactional)". |
| 4 | Configurar credencial **Supabase** nos nós "Id_unicos no Supabase" e "Inserir Supabase". |
| 5 | Rodar **teste manual** (Execute Workflow) e conferir tabela **transacoes** no Supabase. |
| 6 | Ajustar "Mapear para transacoes" se a API retornar campos com nomes diferentes. |
| 7 | Definir horário no "Agendar" e **ativar** o workflow. |

---

## Se ainda não tiver o token PagBank

Enquanto o token não chega, você pode usar a **Opção 1 (Planilha)** descrita em **docs/SOLUCAO_GRATUITA_BANCO.md**: planilha Google com colunas Data, Pessoa, Valor, Descrição, Tipo + Apps Script ou workflow **workflow-planilha-para-supabase.json** para enviar as linhas novas ao Supabase. A tabela **transacoes** e as views de conciliação são as mesmas.
