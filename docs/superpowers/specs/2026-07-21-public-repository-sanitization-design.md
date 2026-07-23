# Sanitização do repositório público Byla Financeiro

**Data:** 21 de julho de 2026  
**Status:** desenho aprovado; implementação ainda não iniciada  
**Responsável pela aprovação:** Levi

## 1. Objetivo

Preservar o Byla Financeiro como projeto público de portfólio sem publicar dados pessoais, credenciais, documentos empresariais, regras financeiras internas ou configurações de produção.

O site continuará disponível durante a limpeza. O repositório GitHub será privado temporariamente e voltará a público somente depois de uma nova auditoria.

## 2. Decisões aprovadas

- Manter o mesmo repositório e a mesma URL pública.
- Tornar somente o repositório privado durante a limpeza; o site permanecerá publicado.
- Manter código funcional sanitizado e uma demonstração separada com dados fictícios.
- Tratar a criação do ambiente demonstrativo em outra frente de trabalho; esta limpeza apenas validará o isolamento.
- Criar um arquivo privado fora do Git, com backup.
- Manter documentação pública pequena e curada.
- Remover Pluggy, PagBank, EDI e workflows inativos.
- Publicar somente os três workflows n8n atualmente ativos, como modelos desativados e sanitizados.
- Reescrever o histórico Git em clone separado.
- Não executar force push sem aprovação específica.
- Publicar o código para visualização de portfólio, com direitos reservados e sem autorização geral de reutilização.

## 3. O que não faz parte desta implementação

- Migrar ou alterar os workflows de produção dentro do n8n.
- Executar credenciais para verificar se ainda funcionam.
- Publicar dados reais no ambiente demonstrativo.
- Apagar documentos privados antes de confirmar cópia, integridade e backup.
- Emitir parecer jurídico ou substituir avaliação de LGPD.
- Fazer force push ou reabrir o repositório sem aprovação explícita.

## 4. Estrutura dos materiais

### 4.1 Conteúdo público

O repositório público conterá:

- código necessário para build, testes e deploy;
- migrations e seeds apenas com dados fictícios;
- arquivos `.env.example` somente com nomes de variáveis e placeholders;
- testes de segurança e autorização;
- documentação curada;
- três modelos didáticos de workflows n8n.

Documentação pública planejada:

- `README.md`;
- `SECURITY.md`;
- `LICENSE` ou aviso equivalente de direitos reservados;
- `docs/ARQUITETURA_PUBLICA.md`;
- `docs/SEGURANCA_E_PRIVACIDADE.md`;
- `docs/DEPLOY_PUBLICO.md`;
- `docs/DECISOES_TECNICAS.md`;
- `docs/DEMONSTRACAO.md`;
- `n8n-workflows/README.md`;
- um README e um JSON sanitizado para cada workflow publicado.

### 4.2 Arquivo privado

Será criada fora do diretório Git uma estrutura equivalente a:

```text
Byla-Privado/
  guardar/
  revisar-para-exclusao/
  inventario/
```

`guardar/` receberá contrato, relatório de estágio, documentos operacionais, UAT, evidências, PDFs, DOCX e materiais empresariais ainda úteis.

`revisar-para-exclusao/` receberá materiais Pluggy, PagBank, EDI, respostas financeiras, workflows inativos, duplicados e experimentos obsoletos.

`inventario/` conterá uma relação de origem, destino, hash e decisão para cada arquivo, sem copiar segredos para o inventário.

Os arquivos serão removidos do repositório somente depois de:

1. cópia concluída;
2. verificação de abertura;
3. conferência de hash;
4. confirmação do backup privado.

Nenhum item em `revisar-para-exclusao/` será apagado definitivamente sem aprovação de Levi.

## 5. Workflows n8n públicos

Serão publicados somente:

1. Supabase para Google Sheets;
2. Google Sheets para Supabase;
3. resumo de aluguel de salas para WhatsApp.

Estrutura planejada:

```text
n8n-workflows/
  README.md
  supabase-to-google-sheets/
    README.md
    workflow.template.json
  google-sheets-to-supabase/
    README.md
    workflow.template.json
  room-rental-to-whatsapp/
    README.md
    workflow.template.json
```

Cada `workflow.template.json` deverá:

- estar com `active: false`;
- não conter ID real de workflow, webhook, nó, planilha ou projeto;
- não conter objeto de credencial nem nome de credencial de produção;
- não conter domínio, URL, telefone ou caminho ativo;
- não conter token, secret, API key ou header real;
- não conter pessoa, categoria ou regra financeira específica da empresa;
- usar placeholders e variáveis de ambiente genéricas;
- usar somente dados de exemplo fictícios.

Cada README explicará:

- objetivo;
- gatilho;
- fluxo de dados;
- validações;
- idempotência;
- tratamento de erros;
- credenciais exigidas por tipo;
- medidas de segurança;
- como importar e configurar em ambiente próprio.

Os modelos públicos não serão a fonte operacional dos workflows reais.

## 6. Correções de segurança anteriores à reabertura

### 6.1 Obrigatórias

- Proteger todas as rotas `/api/entradas/*` com autenticação e autorização administrativa.
- Criar testes 401/403 para operações de leitura e escrita dessas rotas.
- Remover dados reais dos seeds e substituí-los por dados sintéticos.
- Remover credenciais e integrações Pluggy/PagBank do estado atual.
- Revogar ou excluir as integrações Pluggy/PagBank nos provedores.
- Rotacionar credenciais privilegiadas locais ainda utilizadas.
- Proteger o webhook n8n ativo com autenticação ou assinatura e rate limit.
- Aplicar minimização de PII antes do envio a provedores de IA.
- Aplicar rate limit às rotas de IA e sincronização.
- Usar comparação segura para segredos internos.

### 6.2 Hardening adicional

- Reduzir o limite global de payload e aplicar limites maiores somente após autenticação nas rotas necessárias.
- Restringir CORS a origens explicitamente aprovadas.
- Padronizar mensagens de erro sem detalhes internos.
- Adicionar headers de segurança no frontend e backend.
- Atualizar dependências vulneráveis por lotes, com testes.
- Adicionar timeout e limite de concorrência aos provedores de IA.
- Habilitar proteção contra senhas vazadas no Supabase.
- Proteger o branch principal e fixar GitHub Actions por SHA.
- Manter secret scanning e push protection habilitados.
- Adicionar padrões customizados para credenciais UUID e tokens hexadecimais.

## 7. Credenciais e segredos

Nenhum segredo será copiado para documentação, issue, commit ou relatório.

As integrações Pluggy e PagBank não são mais usadas. Seus arquivos serão retirados, e as credenciais/aplicações correspondentes deverão ser revogadas ou excluídas nos provedores sem teste prévio.

Credenciais locais utilizadas por Google, IA, n8n, Supabase, Render ou sincronização serão inventariadas apenas pelo nome da variável e estado de rotação, nunca pelo valor.

Produção continuará usando variáveis configuradas nos painéis dos serviços ou em gerenciador de segredos. O GitHub conterá somente exemplos vazios.

## 8. Limpeza do histórico Git

A reescrita ocorrerá em clone separado, nunca diretamente no diretório de trabalho atual.

O procedimento deverá:

1. preservar um backup privado e offline das refs antigas;
2. remover caminhos confidenciais com `git filter-repo`;
3. substituir padrões sensíveis que permanecerem em arquivos necessários;
4. excluir refs antigas geradas por reescritas anteriores;
5. revisar branches remotos, refs de pull requests, tags e objetos alcançáveis;
6. executar scanners no histórico novo;
7. comparar a árvore final com a versão sanitizada aprovada;
8. solicitar aprovação específica para o force push;
9. exigir novo clone dos ambientes de desenvolvimento depois da publicação.

A reescrita não substitui rotação. Clones, caches e cópias anteriores podem continuar contendo os dados antigos.

## 9. Deploy e disponibilidade

Antes da limpeza serão registrados, sem valores secretos:

- serviços e domínios usados;
- comandos de build;
- nomes das variáveis necessárias;
- branch de deploy;
- URLs atuais de produção e preview.

O repositório privado não deve derrubar deployments já publicados. Antes de reabrir:

1. frontend e backend serão compilados localmente;
2. testes automatizados serão executados;
3. um preview sanitizado será publicado;
4. autenticação e autorização serão testadas;
5. o ambiente demo será verificado quanto ao isolamento;
6. Vercel e Render serão monitorados após o push coordenado.

O rollback usará uma cópia sanitizada ou deployment anterior. O histórico sensível não poderá ser republicado como rollback.

## 10. Validação

Critérios obrigatórios para voltar a público:

- nenhum achado crítico ou alto aberto relacionado a segredo, PII ou autorização;
- nenhum arquivo privado na árvore ou no histórico público;
- Gitleaks, TruffleHog e padrões customizados sem achados não justificados;
- nenhum segredo ou dado real no bundle frontend;
- três workflows-modelo importáveis, desativados e sanitizados;
- `/api/entradas/*` retornando 401 sem sessão e 403 sem função adequada;
- testes e builds de frontend e backend aprovados;
- ambiente demonstrativo usando apenas dados fictícios e recursos isolados;
- branch principal protegido;
- documentação pública revisada;
- autorização empresarial preservada;
- aviso de direitos reservados publicado;
- aprovação final de Levi.

## 11. Sequência de execução

1. Tornar o repositório privado.
2. Registrar estado atual e criar backups.
3. Criar e verificar o arquivo privado.
4. Produzir lista de exclusão definitiva para aprovação.
5. Revogar integrações obsoletas e rotacionar credenciais necessárias.
6. Sanitizar estado atual e documentação.
7. Criar os três workflows-modelo.
8. Corrigir vulnerabilidades e controles de acesso.
9. Executar testes e scanners.
10. Reescrever o histórico em clone separado.
11. Repetir testes, scanners e revisão manual.
12. Solicitar autorização para force push.
13. Publicar e verificar previews e produção.
14. Executar auditoria final.
15. Solicitar autorização para tornar o repositório público.

## 12. Aprovações obrigatórias durante a implementação

Levi deverá aprovar separadamente:

- lista de arquivos para exclusão definitiva;
- revogação/rotação que exija ação em provedor;
- conteúdo público final;
- force push do histórico reescrito;
- reabertura do repositório.

Alterações que afetem dados, workflows ou operação do Espaço Byla exigem também autorização empresarial conforme a autorização escrita existente.
