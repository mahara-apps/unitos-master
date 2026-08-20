# Relatório de Validação — Reconstrução Completa do Banco (ambiente descartável)

Data: 2026-08-20
Escopo: validar `baseline → 199 migrations históricas → correções finais` em banco vazio.
**Produção NÃO foi alterada.** Nenhum `db push`, nenhum `migration repair`, nenhuma migration histórica editada, nenhum arquivo promovido de `supabase/baseline/` para `supabase/migrations/`.

## Ambiente de teste

Não havia projeto Supabase descartável disponível, então o teste foi feito em um cluster
**PostgreSQL 17.9 local e isolado** dentro do sandbox, com as extensões da plataforma
compiladas e instaladas (`pgvector 0.8.2`, `pg_cron 1.6.7`, `pg_net 0.20.2`) e um bootstrap
que emula os papéis (`anon`, `authenticated`, `service_role`, `supabase_admin`) e os schemas
(`auth`, `storage`, `vault`, `extensions`) gerenciados pelo Supabase.
Isso valida schema, RLS, RPCs, triggers e grants; **não** valida GoTrue/PostgREST/Realtime.

## Ordem final dos arquivos SQL aplicados (202)

| # | Arquivo | Origem |
|---|---------|--------|
| 001 | `20260101000000_baseline_pre_versioning.sql` | `supabase/baseline/` |
| 002–200 | 199 migrations históricas, em ordem de timestamp, **sem qualquer alteração** | `supabase/migrations/` |
| 201 | `20260821090000_fix_user_profiles_role_and_signup.sql` | `supabase/baseline/` |
| 202 | `20260821090100_storage_buckets_baseline.sql` | `supabase/baseline/` |

Resultado da aplicação: **202 arquivos aplicados, 0 falhas.**

## PASSOU

**Estrutura**
- 106 tabelas em `public`, 439 índices, 237 funções — superconjunto exato de produção (nada falta).
- `public.user_profiles` criada pelo baseline com as 16 colunas esperadas.
- PK `user_profiles_pkey`, FK `id → auth.users(id) ON DELETE CASCADE` (cascade testado: perfil removido junto).
- `role DEFAULT 'user'`; `CHECK (role IN ('admin','manager','user','super_admin'))`.
- **RLS habilitado em 100% das tabelas de `public`** (nenhuma exceção).
- 255 policies criadas, todas válidas; nenhuma referência a tabela, coluna ou função inexistente.
- 0 funções `SECURITY DEFINER` sem `search_path` fixo.

**Signup**
- `handle_new_user()` existe, é `SECURITY DEFINER`, com `SET search_path = public`.
- Trigger `on_auth_user_created` presente em `auth.users`.
- Cria `user_profiles` automaticamente; role padrão = `user`.
- Metadata maliciosa `{"role":"editor"}` no signup resulta em `user` — `editor`/`member` nunca aparecem.

**update_updated_at_column**
- Função existe, definição idêntica à de produção; triggers dependentes funcionam (`updated_at > created_at` após update em `brands`).

**Migrations sob atenção especial**
- `20260720144007` (índice único com `COALESCE` em `ai_usage_limits`) e a correção posterior `20260720144133` (`list_ai_usage_overview`) aplicaram sem erro e sem conflito.

**Storage**
- Buckets criados e privados: `avatars`, `brand-assets`, `brand-documents`, `brand-media`.

**Teste funcional / RBAC / multi-tenant**
| Cenário | Resultado |
|---|---|
| Criação de usuário + perfil automático + role `user` | OK |
| Leitura do próprio perfil | OK (1 linha) |
| Atualização do próprio perfil (campos comuns) | OK |
| ADMIN cria brand (`created_by = auth.uid()`) + trigger `add_brand_owner` gera membership `owner` | OK |
| USER membro vê a brand e os membros | OK (1 brand, 2 membros) |
| USER **sem vínculo** com o cliente não vê o cliente | OK (0 linhas) |
| USER **responsável** pelo cliente passa a ver | OK (1 linha) |
| ADMIN (owner) vê brand + clientes | OK |
| SUPER ADMIN vê tudo | OK |
| Outsider (sem membership) vê 0 brands, 0 clientes, 0 perfis alheios | OK |
| `anon` — `permission denied` em `user_profiles` e `brands` | OK |
| `app_access_role` → `admin` / `user` / `super_admin` | OK (nenhum `editor`/`designer`) |
| `can_access_client` respeita responsável/vínculo | OK |

**Aplicação**
- `bun run build` → exit 0, sem erros. Tipos gerados compatíveis com o schema final.

## FALHOU

1. **Bucket `chat-attachments` ausente no baseline** — produção tem 5 buckets; o baseline versionava 4.
   Arquivo: `supabase/baseline/20260821090100_storage_buckets_baseline.sql`.
   Efeito em instalação limpa: anexos de chat quebram (bucket inexistente).

2. **Escalação de privilégio em `public.user_profiles` (também presente em produção)** — reproduzido no clone:
   ```sql
   -- como USER comum, authenticated:
   update public.user_profiles set role='super_admin' where id = auth.uid();  -- SUCESSO
   ```
   Causa raiz combinada:
   - policy de UPDATE é apenas `auth.uid() = id`, sem restrição de coluna;
   - `public.is_super_admin(uuid)` retorna true para `is_super_admin = true OR role = 'super_admin'`;
   - `guard_super_admin_flag()` protege somente a coluna `is_super_admin`, nunca `role`.
   Efeito: qualquer usuário autenticado se torna super admin global.

## BLOQUEADORES

- Nenhum bloqueador de **reconstrução**: a sequência aplica 202 arquivos com 0 falhas em banco vazio, de forma repetível.
- Bloqueador de **promoção para produção**: o item 2 acima (segurança) deve ir junto, porque a promoção do baseline consolida o estado atual como fonte da verdade.

## Divergências de schema (esperadas, não são falha)

Local é superconjunto de produção; nada falta. Só existem no clone:
- `brain_events_202508 … brain_events_202604` — partições geradas dinamicamente por `brain_ensure_event_partitions()` conforme a data de execução.
- `crm_deals`, `crm_pipelines`, `crm_pipeline_stages` — criadas por migration histórica, removidas manualmente em produção e sem nenhuma referência em `src/`. Schema morto; decidir depois se cria migration de `DROP` (não incluída aqui de propósito).
- `user_profiles.role` em produção ainda tem `DEFAULT 'editor'` (viola o CHECK atual). O arquivo 201 já normaliza isso.

## AJUSTES NECESSÁRIOS (forward-only, criados em staging e já validados no clone)

- `supabase/baseline/20260821090200_storage_bucket_chat_attachments.sql` — adiciona o 5º bucket. Idempotente, no-op em produção.
- `supabase/baseline/20260821090300_fix_user_profiles_role_escalation.sql` — estende `guard_super_admin_flag()` para bloquear troca de `role` por quem não é super admin.

Reteste no clone após aplicar os dois:
- 5 buckets presentes;
- USER comum: update de campo comum OK; `set role='super_admin'` → `ERROR: Forbidden: apenas super admin altera role do perfil`;
- SUPER ADMIN continua alterando role de terceiros;
- `service_role` / SQL interno (`auth.uid()` nulo) continua livre.

Nenhuma migration histórica foi editada. Nada foi promovido para `supabase/migrations/`.

## VEREDITO FINAL

**NÃO APROVADO — CORRIGIR ANTES DE PRODUÇÃO**

A reconstrução em si está comprovada (202/202, 0 falhas, RBAC e RLS funcionais, build OK), mas a
promoção só deve ocorrer com os dois ajustes forward-only acima incluídos no conjunto — em especial
a correção da escalação de privilégio, que já afeta produção hoje.
