# Prompt mestre: Implementar backend e planilhas como complemento (Byla)

Este documento contém o **prompt estruturado** para orientar a implementação do backend que une Supabase e planilhas do Espaço Byla, seguindo `docs/ENGENHARIA_DE_PROMPT_E_SW_BYLA.md` (Role, Context, Instruction, Output constraint) e o plano em `docs/PLANO_BACKEND_E_PLANILHAS_COMPLEMENTO.md`.

---

## Uso

- **Quem executa:** desenvolvedor ou IA (Cursor/Agent).
- **Quando usar:** ao iniciar ou retomar a implementação do backend e da integração Supabase + planilhas.
- **Como usar:** copiar o bloco **Prompt para o agente** abaixo (ou referenciar este arquivo) e ajustar opcionalmente a **Context** com detalhes atuais (IDs das planilhas, nomes das rotas já existentes).

---

## Técnicas aplicadas (referência: eng. de prompt Byla)

| Técnica | Aplicação |
|--------|------------|
| **Role Prompting** | O agente atua como desenvolvedor full-stack do projeto Byla, que conhece o repo e as diretrizes em `docs/`. |
| **Contextual Embedding** | O prompt inclui referências exatas a arquivos e ao plano (`PLANO_BACKEND_E_PLANILHAS_COMPLEMENTO.md`), para não inventar arquitetura. |
| **Instruction Tuning** | Instruções únicas e ordenadas: primeiro backend mínimo, depois lógica de merge, depois integração front. |
| **Output Constraining** | Formato de entrega: código em pastas indicadas, envs documentados, decisões em `docs/`. |
| **Chain-of-Thought (implícito)** | A ordem das fases (1 → 2 → 3) induz raciocínio passo a passo: infra → regras → consumo. |

---

## Prompt para o agente

Use o texto abaixo como prompt único para implementar o backend e a integração com planilhas. Ajuste entre colchetes `[...]` conforme o estado atual do projeto.

```
Você é o desenvolvedor do projeto Byla (espaço cultural). Sua tarefa é implementar o backend e a integração Supabase + planilhas seguindo rigorosamente o plano e as diretrizes do repositório.

---

CONTEXT

- Repositório: Byla-Financeiro. Frontend do painel em `frontend/` (React + TypeScript + Vite + Supabase client). Hoje não existe backend; o front chama o Supabase direto do navegador.
- Plano a seguir: `docs/PLANO_BACKEND_E_PLANILHAS_COMPLEMENTO.md`. Arquitetura: backend Node.js lê Supabase + Google Sheets (2–3 planilhas do Espaço Byla); aplica lógica de merge/prioridade; expõe API REST; o front, nas telas que precisarem de “dados completos”, chama o backend em vez de só o Supabase.
- Diretrizes de software (obrigatórias): `docs/ENGENHARIA_DE_PROMPT_E_SW_BYLA.md` – modularidade, single source of truth por domínio, documentação, configuração externa (credenciais em env), evolução incremental.
- Referência de prompt versionado: `docs/PROMPT_RELATORIO_IA_BYLA.md` (estrutura Role / Context / Instruction / Output).

Estado atual (ajuste se já houver parte implementada):
- [ ] Backend ainda não existe.
- [ ] Planilhas: 2–3 do Espaço Byla, usadas por financeiro e secretária; IDs/nomes a configurar em env.
- [ ] Regras de “o que funciona e o que não funciona” já definidas em docs/REGRAS_FONTES_SUPABASE_PLANILHAS.md: extrato/saldo/entradas = só Supabase; alunos, matriculados, modalidades, pendências = planilhas complementam; backend expõe rotas combinadas só para esses domínios.

---

INSTRUCTION

Execute em ordem, sem pular etapas:

1) Fase 1 – Backend mínimo
   - Criar pasta `backend/` (ou `api/`) na raiz do repo com projeto Node.js (Express ou Fastify).
   - Configurar variáveis de ambiente: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ou anon conforme decisão de segurança), e variáveis para Google Sheets (credenciais Service Account ou OAuth; IDs das planilhas). Nenhuma credencial no código; tudo em env.
   - Implementar rota GET /health e uma rota GET /api/dados-completos (ou nome definido no plano) que: (a) lê uma view ou tabela do Supabase usada hoje pelo front; (b) lê uma planilha via Google Sheets API; (c) retorna JSON com estrutura definida (ex.: { supabase: [...], planilha: [...], regra_usada: "..." }).
   - Adicionar README em backend/ explicando como rodar (npm install, npm run dev), quais envs são obrigatórios e onde obtê-los (Supabase dashboard, Google Cloud Console).
   - Garantir CORS configurado para a origem do front (ex.: http://localhost:5173 em dev).

2) Fase 2 – Lógica de merge (o que funciona e o que não funciona)
   - Seguir as regras em docs/REGRAS_FONTES_SUPABASE_PLANILHAS.md: extrato/saldo/entradas = só Supabase; alunos, matriculados, modalidades, pendências = planilhas complementam ou prevalecem.
   - Criar módulo de lógica (ex.: backend/src/logic/merge.js ou merge.ts) que recebe dados do Supabase e da(s) planilha(s) e aplica essas regras (priorizar planilhas para alunos, modalidades, pendências).
   - Expor rotas que usem esse módulo apenas para os domínios que usam planilhas: ex. GET /api/alunos-completo, GET /api/modalidades-completo, GET /api/pendencias-completo (ou nomes alinhados ao front). Não criar rotas combinadas para extrato/saldo – esses continuam só no Supabase.

3) Fase 3 – Integração com o frontend
   - Criar no frontend um cliente de API (ex.: frontend/src/services/backendApi.ts) que chama o backend usando uma URL base em variável de ambiente (ex.: VITE_BACKEND_URL).
   - Alterar apenas as telas que precisam de “dados completos” para consumir esse cliente (e, se aplicável, manter fallback para Supabase direto se o backend estiver indisponível).
   - Atualizar .env.example (ou documentação) do front com VITE_BACKEND_URL.

4) Documentação e entrega
   - Garantir que todas as decisões de “prioridade” entre Supabase e planilhas estejam em docs/.
   - Não versionar arquivos de credenciais (.json de Service Account, .env com segredos); manter .gitignore atualizado.
   - Ao final, listar em um comentário ou em docs/ o que foi implementado (rotas, envs, regras) e o que ficou para uma próxima iteração (ex.: mais planilhas, cache, mais rotas).

---

OUTPUT CONSTRAINT

- Código em TypeScript ou JavaScript (Node.js), com tipagem quando TypeScript.
- Backend deve rodar com `npm run dev` (e build com `npm run build` se aplicável).
- Respostas da API em JSON; uso de status HTTP adequados (200, 4xx, 5xx).
- Nenhuma credencial hardcoded; uso estrito de process.env (ou similar) para secrets.
- Documentação em Markdown em docs/ e README do backend; formato livre mas com seções: Objetivo, Variáveis de ambiente, Como rodar, Rotas expostas, Regras de merge (ou link para REGRAS_FONTES_SUPABASE_PLANILHAS.md).
```

---

## Manutenção deste prompt

- Ao alterar o plano (`PLANO_BACKEND_E_PLANILHAS_COMPLEMENTO.md`), revisar a **Context** e a **Instruction** deste prompt para manter consistência.
- Ao adicionar novas fases ou rotas, incluir na **Instruction** e atualizar a seção **Output constraint** se necessário.
- Referências: `docs/ENGENHARIA_DE_PROMPT_E_SW_BYLA.md`, `docs/PROMPT_RELATORIO_IA_BYLA.md`, `docs/PLANO_BACKEND_E_PLANILHAS_COMPLEMENTO.md`.
