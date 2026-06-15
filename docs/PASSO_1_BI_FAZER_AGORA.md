# Passo 1 – BI: subir Metabase e conectar ao Supabase

Siga na ordem. Quando terminar, você terá o Metabase rodando e conectado ao banco da Byla.

**Verificação e planejamento completo:** ver **`docs/VERIFICACAO_E_PLANEJAMENTO_CONCLUIDO.md`**.

---

## Pré-requisito: Java 17 ou superior

O Metabase JAR incluído (v0.47.8) roda com **Java 17, 18, 19 ou 20**. Verifique com `java -version`. Não é necessário Java 21.

---

## Metabase já instalado (via JAR) neste projeto

Na pasta do projeto já existe **`metabase\metabase.jar`** (Metabase v0.47.8). Para subir sem Docker:

- **Recomendado:** Duplo clique em **`metabase\iniciar-metabase.bat`**
- Ou no PowerShell:
```powershell
cd c:\Users\55719\Byla-Financeiro\metabase
java -Xmx1g -jar metabase.jar
```

Aguarde 1–2 minutos e acesse **http://localhost:3000**. Para parar: feche a janela do terminal ou Ctrl+C.

---

## Se você instalou o Docker Desktop agora

1. **Conclua a instalação:** Se apareceu uma janela pedindo permissão de administrador, clique em **Sim** e espere o instalador terminar.
2. **Abra o Docker Desktop:** No menu Iniciar, procure por **Docker Desktop** e abra. Na primeira vez pode pedir reinicialização; se pedir, reinicie o PC.
3. **Espere o Docker ficar pronto:** No canto inferior esquerdo deve aparecer “Docker Desktop is running” (verde).
4. **Rode o Metabase:** Abra um **novo** PowerShell ou CMD e execute:
   ```bash
   docker run -d -p 3000:3000 --name metabase metabase/metabase
   ```
   Depois acesse: **http://localhost:3000**

---

## A. Subir o Metabase

### Se você tem Docker instalado

No terminal (PowerShell ou CMD):

```bash
docker run -d -p 3000:3000 --name metabase metabase/metabase
```

Depois acesse: **http://localhost:3000**

### Se você NÃO tem Docker

1. Baixe o JAR do Metabase:  
   **https://github.com/metabase/metabase/releases/latest**  
   Arquivo: `metabase.jar` (na seção Assets).
2. Salve em uma pasta (ex.: `C:\metabase`).
3. No PowerShell, na mesma pasta:

```powershell
java -jar metabase.jar
```

4. Acesse: **http://localhost:3000**

---

## B. Primeiro acesso ao Metabase

1. Abra **http://localhost:3000** no navegador.
2. Crie a conta de administrador (e-mail e senha). Clique em **Let's get started**.
3. Na tela “Add your data”, você vai adicionar o Supabase no próximo passo.

---

## C. Conectar ao Supabase (copie e cole)

1. No Metabase: **Settings** (ícone de engrenagem) → **Admin settings** → **Databases** → **Add database**.
2. Preencha assim (pode copiar os valores):

| Campo | Valor |
|-------|--------|
| **Database type** | PostgreSQL |
| **Display name** | Byla Supabase |
| **Host** | `db.flbimmwxxsvixhghmmfu.supabase.co` |
| **Port** | `5432` |
| **Database name** | `postgres` |
| **Username** | `postgres` |
| **Password** | *(sua senha do projeto Supabase)* |

3. A senha está em: **Supabase** → seu projeto → **Project Settings** → **Database** → em **Connection string** use a senha que você definiu para o projeto (ou **Reset database password** se não lembrar).
4. Clique em **Save**. O Metabase vai testar a conexão e listar tabelas e views.

---

## D. Conferir as views

Depois de salvar, em **Databases** → **Byla Supabase** → **Tables**, você deve ver, entre outras:

- `v_resumo_mensal_oficial`
- `v_entradas_oficial`
- `v_reconciliacao_mensalidades`
- `transacoes`

Se aparecerem, a conexão está ok.

---

## E. Próximo passo – Criar os 3 dashboards

Siga o guia **`docs/BI_METABASE_SETUP_BYLA.md`** (seções 4, 5 e 6). Em resumo:

| Dashboard | O que tem |
|-----------|-----------|
| **1. Visão Geral Financeira** | KPIs do mês (entradas, saídas, saldo) + gráfico de evolução (últimos 6 meses) |
| **2. Conciliação e Inadimplência** | Tabela de pendentes, quantidade de inadimplentes, taxa de adimplência |
| **3. Entradas (detalhe)** | Tabela das últimas entradas + gráfico por forma de pagamento |

No Metabase: **New → Question** (Native query, Database: Byla Supabase), cole o SQL do guia, escolha a visualização (Number, Line, Table, etc.), salve a questão e depois **New → Dashboard** para criar cada painel e adicionar as questões.

---

## Resumo

| Etapa | O que fazer |
|-------|----------------|
| A | Subir Metabase (Docker ou JAR) |
| B | Abrir http://localhost:3000 e criar conta admin |
| C | Add database → PostgreSQL com host, port, db, user e senha acima |
| D | Ver se as views aparecem; em seguida montar os dashboards pelo guia completo |

Se algo falhar (erro de conexão, views não aparecem), confira a senha do Supabase e o firewall/rede (porta 5432 liberada se estiver em rede restrita).
