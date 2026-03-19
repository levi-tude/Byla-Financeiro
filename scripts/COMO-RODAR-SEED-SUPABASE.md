# Como rodar o seed no Supabase (modalidades e alunos)

Você já criou as tabelas. Só falta executar o script de seed **uma vez**.

## Passo único

1. Abra **[app.supabase.com](https://app.supabase.com)** e entre no seu projeto Byla.
2. No menu lateral: **SQL Editor** → **New query**.
3. Abra o arquivo **`seed-modalidades-alunos-byla.sql`** (pasta `scripts` deste projeto), copie **todo** o conteúdo (Ctrl+A, Ctrl+C).
4. Cole na query do Supabase e clique em **Run** (ou Ctrl+Enter).

Pronto. O script insere as 8 modalidades, os planos, os 22 alunos e os vínculos em `aluno_planos`. Se algo já existir, o script ignora (usa `ON CONFLICT DO NOTHING`).

---

## Sobre o plugin/MCP do Supabase no Cursor

O plugin do Supabase no Cursor deixa **você** ver tabelas e executar SQL pelo editor. O assistente de IA **não** recebe acesso ao seu projeto por isso — não consigo rodar o script daqui. Por isso o passo acima é feito por você no SQL Editor (site ou pelo plugin, se ele tiver “Run query”).
