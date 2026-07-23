# Política de segurança

## Escopo

Este repositório é publicado para **revisão de portfólio**. Não execute em produção com dados reais sem ambiente isolado e credenciais próprias.

## Reportar vulnerabilidades

Se encontrar um problema de segurança neste código:

1. **Não** abra issue pública com detalhes exploráveis.
2. Entre em contato pelo canal acordado com o mantenedor (e-mail ou mensagem privada).
3. Inclua: descrição, passos para reproduzir, impacto estimado e versão/commit.

Responderemos em até 7 dias úteis com confirmação de recebimento.

## Controles implementados

- Autenticação Supabase (JWT) com RBAC (`admin`, `secretaria`)
- Row Level Security (RLS) no Postgres
- Rate limiting em rotas de IA e sincronização
- Minimização de PII antes de envio a provedores de IA
- Comparação timing-safe de segredos internos (`BYLA_SYNC_SECRET`)
- Limite de payload JSON reduzido (1 MB padrão; rotas sync autenticadas podem usar limite maior)
- CORS restrito a origens configuradas (`CORS_ORIGIN`)
- Secret scanning no CI (Gitleaks + verificações customizadas)

## Boas práticas para quem clona

- Nunca commite `.env`, chaves de API ou JSON de service account
- Use `.env.example` apenas como referência de nomes de variáveis
- Rotacione credenciais se algo tiver sido exposto acidentalmente
- Mantenha `BYLA_AUTH_ENFORCE=true` em ambientes expostos à internet

## Dependências

Atualize dependências regularmente e execute `npm audit` antes de deploy. O workflow `.github/workflows/security-check.yml` valida configurações básicas em cada push/PR.
