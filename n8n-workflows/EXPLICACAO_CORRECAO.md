# Explicação da correção – erro de datas no "Buscar Extrato"

Sempre que algo for alterado, este tipo de documento deve responder:
1. **O que foi feito**
2. **Como foi feito**
3. **O que você precisa fazer**
4. **Como testar**

---

## 1. O que foi feito

- **Problema:** O node **"Buscar Extrato"** dava erro: *"from must be a valid ISO 8601 date string, to must be a valid ISO 8601 date string"*. Isso acontecia porque às vezes o node **"Code in JavaScript1"** (que fica logo antes do Buscar Extrato) mandava `fromDate` e `toDate` vazios ou indefinidos.

- **Correção:** Foi adicionado um **fallback** dentro do **"Code in JavaScript1"**: depois de tentar pegar as datas do input ou do node "Pegar última data", o código **sempre verifica** se `fromDate` e `toDate` ainda estão vazios. Se estiverem, ele mesmo calcula “30 dias atrás” e “hoje” e usa isso. Assim o Buscar Extrato **sempre** recebe datas válidas.

- **Arquivos criados/alterados:**
  - **`n8n-workflows/My-workflow.json`** – cópia do seu workflow **já com** o Code corrigido (para ter o fluxo no projeto).
  - **`n8n-workflows/README.md`** – resumo do fluxo.
  - **`n8n-workflows/EXPLICACAO_CORRECAO.md`** – este arquivo (explicação passo a passo).
  - O arquivo **"My workflow.json"** na sua pasta **Downloads** também foi **editado** e já contém a mesma correção (caso você importe de lá).

---

## 2. Como foi feito (no código)

Dentro do node **"Code in JavaScript1"** do n8n, o fluxo era mais ou menos assim:

1. Pegar `fromDate` e `toDate` do objeto que veio do node anterior (Merge).
2. Se estiverem vazios, tentar pegar do node **"Pegar última data"** (em um `try/catch`).
3. Retornar um objeto com `apiKey`, `itemId`, `accountId`, `fromDate`, `toDate`.

O problema: quando o Merge não tinha a terceira entrada (porque "Pegar última data" está desabilitado ou não rodou), ou quando "Pegar última data" não devolvia `fromDate`/`toDate`, o código às vezes retornava com `fromDate` e `toDate` ainda vazios. Aí o Buscar Extrato montava uma URL com `undefined` e a API da Pluggy devolvia erro.

**O que foi adicionado:** logo **antes** do `return { json: { ... } };`, foi colado este bloco:

```javascript
  if (!fromDate || !toDate) {
    const hoje = new Date();
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(hoje.getDate() - 30);
    fromDate = fromDate || trintaDiasAtras.toISOString().split('T')[0];
    toDate = toDate || hoje.toISOString().split('T')[0];
  }
```

Ou seja: **só se** `fromDate` ou `toDate` ainda estiverem vazios, o código preenche com “30 dias atrás” e “hoje” no formato que a API espera (só a data, ex: `2026-01-12`). Assim o retorno desse node **sempre** tem datas válidas para o Buscar Extrato.

---

## 3. O que você precisa fazer

Você tem **duas opções** (escolha uma):

### Opção A – Importar o workflow já corrigido (mais rápido)

1. Abra o **n8n**.
2. No menu do workflow (três pontinhos ou "Workflow" no topo), clique em **Import from File** (ou equivalente).
3. Escolha **um** destes arquivos (os dois já têm a correção):
   - **`c:\Users\55719\Downloads\My workflow.json`**, ou  
   - **`c:\Users\55719\Byla-Financeiro\n8n-workflows\My-workflow.json`**
4. Confirme a importação. Isso pode **substituir** o workflow atual; se quiser manter o atual, antes duplique o workflow no n8n e importe na cópia.

Pronto. O node "Code in JavaScript1" já estará com o fallback. Siga para a seção **4. Como testar**.

---

### Opção B – Só colar o trecho no node que já existe (sem importar)

Se você **não** quiser importar o JSON e preferir editar o workflow que já está aberto no n8n:

1. Abra o n8n e o workflow que dá o erro.
2. Clique no node **"Code in JavaScript1"** (o que fica entre o Merge e o "Buscar Extrato").
3. No editor de código desse node, localize a parte que termina assim (antes do `return`):

   ```javascript
     } catch (e) {
       ...
       toDate = toDate || hoje.toISOString().split('T')[0];
     }
   }

   return {
     json: {
       apiKey: cleanApiKey,
   ```

4. **Entre** a linha do `}` que fecha o `if (!fromDate || !toDate)` (e o try/catch) **e** a linha `return {`, adicione exatamente isto:

   ```javascript
   if (!fromDate || !toDate) {
     const hoje = new Date();
     const trintaDiasAtras = new Date();
     trintaDiasAtras.setDate(hoje.getDate() - 30);
     fromDate = fromDate || trintaDiasAtras.toISOString().split('T')[0];
     toDate = toDate || hoje.toISOString().split('T')[0];
   }

   ```

5. Salve o node e o workflow.

Depois vá para **4. Como testar**.

---

## 4. Como testar

1. No n8n, com o workflow aberto (e já com a correção aplicada por Opção A ou B):
2. Clique em **"Execute Workflow"** (ou no botão de rodar/play).
3. Deixe a execução terminar.
4. Clique no node **"Buscar Extrato"** e veja o resultado:
   - **Sucesso:** aparece **OUTPUT** com dados (lista de transações ou estrutura da API), sem mensagem de erro.
   - **Erro:** se ainda aparecer *"from must be a valid ISO 8601 date string..."*, a correção não está no "Code in JavaScript1" que alimenta esse "Buscar Extrato" — confira se você editou o node certo (o que está **antes** do Buscar Extrato) ou se importou o JSON correto.

Se quiser, você pode também abrir o node **"Code in JavaScript1"**, rodar de novo o workflow e olhar o **OUTPUT** desse node: deve aparecer um objeto com `fromDate` e `toDate` preenchidos (ex: `"fromDate": "2026-01-12"`, `"toDate": "2026-02-11"`).

---

## Resumo rápido

| Pergunta | Resposta |
|----------|----------|
| **O que foi feito?** | Foi garantido que o node "Code in JavaScript1" sempre envia `fromDate` e `toDate` válidos para o "Buscar Extrato", usando um fallback de "30 dias atrás" e "hoje" quando estiverem vazios. |
| **Como foi feito?** | Foi adicionado um `if (!fromDate \|\| !toDate) { ... }` nesse Code node, antes do `return`, que preenche as duas variáveis quando necessário. |
| **O que eu preciso fazer?** | Ou importar o workflow corrigido (Opção A) ou colar esse bloco no "Code in JavaScript1" (Opção B). |
| **Como testar?** | Rodar o workflow e verificar se o "Buscar Extrato" mostra OUTPUT sem o erro de datas; opcionalmente conferir o OUTPUT do "Code in JavaScript1" e ver `fromDate`/`toDate` preenchidos. |

Se algo ainda falhar, diga em qual opção você seguiu (A ou B) e qual mensagem de erro aparece (e em qual node), que aí dá para afinar o próximo passo.

---

# Correção 2 – Erro da coluna "categoria" e campos salvos no banco

## 1. O que foi feito

- **Problema:** Ao rodar o workflow dava *"Could not find the 'categoria' column of 'transacoes' in the schema cache"*. O workflow enviava um campo `categoria` (tipo de pagamento do Pluggy), mas a tabela no Supabase não tem essa coluna.

- **Objetivo do fluxo:** Buscar transações no banco (Pluggy), ver quais são novas e adicionar **só as novas** na tabela `transacoes` do Supabase, com: nome da pessoa, id_unico, valor, descrição (incluindo tipo de pagamento), tipo (entrada/saida).

- **Correção:**
  - No node **"Code in JavaScript"** (logo após Buscar Extrato): parou de enviar `categoria`. Passou a enviar só: **data**, **pessoa**, **descricao** (texto da transação **e** tipo de pagamento, ex.: "PIX RECEBIDO | PIX"), **valor**, **tipo** (entrada/saida), **id_unico**.
  - O **id_unico** é calculado de forma estável (data + descrição original + valor) para evitar duplicatas; o **Edit Fields** só repassa esse valor.
  - **pessoa** é extraída da descrição (ex.: se tiver "JOSE" ou "MARIA" no texto).

- **Arquivo alterado:** `n8n-workflows/My-workflow.json` (Code in JavaScript e Edit Fields).

## 2. Como foi feito (no código)

- **Code in JavaScript:** Para cada transação do Pluggy, o código agora monta um objeto com `data`, `descricao` (descrição + " | " + método de pagamento, quando existir), `valor` (sempre positivo), `tipo` (entrada/saida pelo sinal do valor), `pessoa` (José/Maria conforme a descrição), `id_unico` (data + descrição original + valor). **Não** inclui `categoria`.
- **Edit Fields:** Continua repassando todos os campos e só garante `id_unico` (usa o valor vindo do Code: `{{ $json.id_unico }}`).

## 3. O que você precisa fazer

1. **Supabase:** A tabela `transacoes` deve ter **apenas** as colunas que o workflow envia: **id** (UUID, gerado pelo Supabase), **data**, **pessoa**, **descricao**, **valor**, **tipo**, **id_unico** (UNIQUE). Se tiver coluna `categoria`, pode deixar; o workflow não a preenche mais. Veja o SQL em **SUPABASE_TABELA_TRANSACOES.md** para criar ou ajustar a tabela.
2. **n8n:** Importe de novo o **My-workflow.json** (pasta `n8n-workflows` do projeto) para usar o workflow já corrigido.

## 4. Como testar

1. Conferir no Supabase se a tabela `transacoes` está com as colunas certas (sem depender de `categoria`).
2. No n8n, executar o workflow (Execute Workflow).
3. Ver se **Buscar Extrato** e **Code in JavaScript** rodam sem erro e se **Create a row** não devolve erro de coluna.
4. No Supabase, abrir a tabela `transacoes` e ver se as novas transações aparecem (e se transações repetidas não duplicam linha, por causa do `id_unico`).

**Nota:** Não é possível rodar o workflow daqui (não tenho acesso ao seu n8n nem ao Supabase). O que foi feito foi ajustar o JSON do workflow e a documentação; você precisa importar e rodar no seu ambiente e seguir os passos acima para garantir que está tudo certo.
