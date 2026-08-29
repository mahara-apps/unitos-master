# Baseline snapshot (estrutural) — staging, NADA aplicado

Etapa: gerar `001_initial_schema.sql` a partir do **estado real atual** do banco
(`tkjbhttylouamqxnbfgv`), sem replay das 250 migrations históricas.

Nada nesta pasta é aplicado automaticamente. `supabase/migrations/` permanece
intacto (250 arquivos, preservados no Git). Produção não foi alterada nesta etapa:
todas as consultas ao banco foram `SELECT` em `pg_catalog`, `information_schema`,
`storage.buckets` e `cron.job`.

## Arquivos

Ordem de aplicação: **000 → 001 → 005 → 003 → 002** (004 apenas ponteiros).

| Arquivo | Conteúdo | Status |
|---|---|---|
| `000_extensions.sql` | extensões reais (`vector` em `public`, `pg_net`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `pg_cron`) | gerado a partir de `pg_extension` — necessário porque `pg_dump --schema=public` não emite `CREATE EXTENSION` |
| `001_initial_schema.sql` | enums, tabelas/colunas, PK/FK/UNIQUE/CHECK, 203 índices + 114 constraints, 133 funções/RPCs, 96 triggers, RLS + 200 policies, matview, GRANTs | **gerado** (2026-08-29, 530 KB, 15.780 linhas, `pg_dump --schema-only --schema=public`) |
| `005_auth_trigger.sql` | `on_auth_user_created` em `auth.users` → `public.handle_new_user()` | gerado a partir de `pg_get_triggerdef` — schema reservado, fora de `--schema=public` |
| `002_bootstrap_cron.sql` | os 14 cron jobs reais (9 via `net.http_post` + 5 SQL diretos) | gerado a partir de `cron.job` |
| `003_storage_buckets.sql` | os 5 buckets reais | gerado a partir de `storage.buckets` |
| `004_seeds.sql` | seeds/configurações dependentes de dados | gerado (apenas ponteiros, sem dados de produção) |
| `tools/dump_schema.sh` | comando exato de dump estrutural que produz `001_initial_schema.sql` | gerado |

## Limitações conhecidas (não contornadas silenciosamente)

1. **Sem conexão Postgres direta no ambiente de execução.** `PGHOST` não está
   definido e não existe `SUPABASE_DB_URL`/token de acesso; portanto `pg_dump`
   não pode ser executado daqui. O único canal disponível é SQL somente-leitura
   por consulta, insuficiente para emitir com fidelidade ~250 KB de DDL
   (133 funções ≈ 161 KB, 200 policies, 317 índices, 89 tabelas) sem risco de
   truncamento e de divergência silenciosa — exatamente o que o pedido proíbe.
2. **Não é possível provisionar um projeto Supabase descartável** a partir deste
   ambiente (não há tool de provisionamento nem access token de organização).
   Logo a etapa de reconstruir e comparar banco atual × banco reconstruído
   também precisa ser executada com credenciais suas.

Consequência: `001_initial_schema.sql` deve ser gerado por dump estrutural
(`tools/dump_schema.sh`), que é fiel por construção — inclusive quanto aos labels
`editor`/`designer` do enum `app_role`, que **não** devem ser removidos.

## Investigação `user_profiles` / `handle_new_user` (estado real hoje)

`public.user_profiles` — 16 colunas, criada fora do versionamento; as 250
migrations só a alteram. Estado atual:

- `id uuid PK` → FK `auth.users(id) ON DELETE CASCADE`
- `full_name text NOT NULL`
- `role text NOT NULL DEFAULT 'user'` + CHECK `('admin','manager','user','super_admin')`
  (o `DEFAULT 'editor'` histórico **não existe mais** — já corrigido)
- `avatar_url`, `phone`, `job_title`, `bio`, `whatsapp`
- `timezone NOT NULL DEFAULT 'America/Sao_Paulo'`, `locale NOT NULL DEFAULT 'pt-BR'`
- `requires_password_change`, `is_super_admin`, `notify_whatsapp` (boolean NOT NULL DEFAULT false)
- `notification_prefs jsonb NOT NULL DEFAULT '{"ai_jobs":true,"comments":true,"approvals":true,"deadlines":true,"assignments":true}'`
- `created_at`/`updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())`
- RLS ativo, 4 policies: `Users see own profile` (SELECT),
  `Users see profiles of shared brand members` (SELECT),
  `Usuários atualizam próprio perfil` (UPDATE), `super_admin_full_access` (ALL)
- 3 triggers: `update_user_profiles_modtime`, `trg_guard_super_admin_flag`,
  `trg_guard_super_admin_flag_insert`

`public.handle_new_user()` — `SECURITY DEFINER`, `SET search_path = public`,
normaliza papel desconhecido para `'user'` (sem `member`/`editor`), monta
`full_name` a partir de metadata/e-mail, faz `INSERT ... ON CONFLICT (id) DO NOTHING`
e nunca aborta o signup (captura exceção como `WARNING`). Trigger
`on_auth_user_created AFTER INSERT ON auth.users`.

Ambos são cobertos pelo dump estrutural, com a única exceção do trigger em
`auth.users` (schema reservado): `pg_dump --schema=public` não o inclui — ver
nota em `tools/dump_schema.sh`.

## Roteiro de validação (executar com suas credenciais)

1. Criar projeto Supabase descartável.
2. `bash supabase/baseline-snapshot/tools/dump_schema.sh "<DB_URL_PRODUCAO>"` →
   gera `001_initial_schema.sql` (somente estrutura, sem dados).
3. Em um clone separado do repo, aplicar **apenas** `001_initial_schema.sql` no
   descartável, depois `003_storage_buckets.sql` e, por último,
   `002_bootstrap_cron.sql` com URL/segredo do descartável.
4. Comparar estrutura (contagens esperadas hoje):

| Objeto | Produção |
|---|---|
| Tabelas `public` | 89 |
| Enums | 10 |
| Funções `public` (com extensões) | 251 · sem extensões: **133** |
| Policies | 200 |
| Triggers (não internos) | 103 |
| Índices | 317 |
| FKs | 194 |
| Matviews / Views | 1 / 0 |
| Buckets | 5 |
| Cron jobs | 14 |

5. Divergência encontrada → **relatar**, não corrigir em silêncio.
