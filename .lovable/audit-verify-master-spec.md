# Auditoria: especificação exata para `verify-master.sql` (read-only)

Escopo: as 28 migrations físicas classificadas `control-plane` em
`supabase/baseline-snapshot/tools/migration-destinations.json:1-581` (contador
`control-plane: 28` confirmado por script), mais os contratos TS que as
chamam. Nenhum arquivo foi criado/alterado; este documento é o produto da
auditoria.

## 1. Migrations control-plane auditadas (arquivo:posição)
```
20260903095115_98c1d1e2 (1)   20260903102213_d7c0c296 (2)
20260904115915_6e08f179 (3)   20260904142244_dba3410c (4)
20260906203602_51eb3c43 (5)   20260909151429_cdf78357 (6)
20260910103310_17e5519f (7)   20260910103639_a4cee597 (8)
20260913124118_9f453a5e (9)   20260913180605_027de2ce (10)
20260913180939_7da1388b (11)  20260913181040_a62ce524 (12)
20260913183337_3fa6a913 (13, arquivo vazio — 0 linhas, LACUNA)
20260913190948_17b909cb (14)  20260913205310_998a5893 (15)
20260913230055_f50b7d0b (16)  20260914003510_de477c51 (17)
20260914141212_3f236ac3 (18)  20260914193902_b2da0b29 (19)
20260914194505_2a76102f (20)  20260914231638_1706c00f (21)
20260914233610_c522441b (22)  20260915001724_34d26323 (23)
20260915001823_e6091ef3 (24, arquivo vazio — 4 linhas em branco, LACUNA)
20260915001853_33ffdf74 (25)  20260915002654_84f93ded (26)
20260915095958_eb639764 (27)  20260916140310_b0a7973f (28)
```
Todos em `supabase/migrations/`. Referência do mapa de classificação:
`supabase/baseline-snapshot/tools/migration-destinations.json:6-581`.

## 2. Tabelas control-plane (estado final observado)

### `public.installations`
- Criada em `supabase/migrations/20260903095115_98c1d1e2...sql:1-21`.
- Colunas críticas: `id uuid PK`, `slug text UNIQUE NOT NULL`, `status`,
  `health`, `active_operation_id uuid` (add em
  `20260903102213_d7c0c296...sql:4`), `pinned_commit_sha/pinned_release/
  pinned_at/pinned_by` (`20260904115915_6e08f179...sql:1-4`),
  `requires_own_supabase_token boolean NOT NULL DEFAULT false`
  (`20260909151429_cdf78357...sql:1-2`), `health_checks jsonb`,
  `health_checked_at` (`20260903102213...sql:2-3`).
- RLS: `ENABLE ROW LEVEL SECURITY` (`20260903095115...sql:25`); policy única
  `installations_super_admin_all` FOR ALL TO authenticated USING/WITH CHECK
  `public.is_super_admin(auth.uid())` (linhas 26-29).
- GRANTs: `SELECT, INSERT, UPDATE, DELETE` para `authenticated`; `ALL` para
  `service_role` (linhas 23-24).
- Trigger: `installations_touch_updated_at` BEFORE UPDATE →
  `public.update_updated_at_column()` (linhas 55-57).
- **Não tem FK para nenhuma outra tabela control-plane** (é a raiz).

### `public.installation_operations`
- Criada em `20260903095115_98c1d1e2...sql:31-42`. FK
  `installation_id → installations(id) ON DELETE CASCADE`.
- Índices: `installation_operations_installation_idx (installation_id,
  created_at DESC)` (linha 44-45); `installation_operations_one_active`
  UNIQUE `(installation_id) WHERE status IN ('pending','running')`, depois
  recriado incluindo `'retryable'` em
  `20260913180939_7da1388b...sql:2-5`; `installation_operations_run_token_
  hash_idx` (`20260903102213...sql:17-18`); `installation_operations_
  idempotency_uidx` UNIQUE `(idempotency_key) WHERE idempotency_key IS NOT
  NULL` (`20260913180605_027de2ce...sql:10-12`);
  `installation_operations_resume_idx`, recriado 3 vezes — última definição
  em `20260913190948_17b909cb...sql:5-9` sobre
  `(next_attempt_at, lease_expires_at, created_at) WHERE status IN
  ('pending','running','retryable')`; `installation_operations_retry_origin_idx`
  (`20260916140310_b0a7973f...sql:5-9`, colunas não confirmadas — LACUNA,
  ver §5).
- Colunas de workflow acumuladas ao longo de 8 migrations: `steps jsonb`,
  `error_kind`, `run_token_hash`, `run_token_expires_at`, `last_report_at`
  (`20260903102213...sql:7-11`); `lease_owner`, `lease_expires_at`,
  `attempt_count integer NOT NULL DEFAULT 0`
  (`20260913124118_9f453a5e...sql:2-4`); `current_step`, `next_attempt_at`,
  `max_attempts integer NOT NULL DEFAULT 8`, `fencing_token bigint NOT NULL
  DEFAULT 0`, `error_detail jsonb`, `metrics jsonb`, `idempotency_key`
  (`20260913180605...sql:2-8`); `heartbeat_at`, `blocked_reason`,
  `next_command` (introduzidas sem ALTER TABLE visível nas migrations lidas
  — usadas em `20260913230055_f50b7d0b...sql:7` — **LACUNA: origem exata da
  coluna não localizada nesta amostra, confirmar via `\d
  installation_operations` real antes de travar o verify-master**).
- RLS/GRANTs idênticos ao padrão acima (`20260903095115...sql:47-53`).

### `public.installation_credentials`
- Criada em `20260904142244_dba3410c...sql:1-10`. PK = FK
  `installation_id → installations(id) ON DELETE CASCADE` (1:1).
- Colunas sensíveis (todas `*_ciphertext`, nunca texto plano):
  `supabase_management_token_ciphertext`, `vercel_token_ciphertext`,
  `vercel_team_id`, `github_token_ciphertext`; `generated_secrets_ciphertext`
  (`20260906203602_51eb3c43...sql:1-2`, comentário de propósito nas linhas
  4-5); `supabase_publishable_key_ciphertext`,
  `supabase_service_role_key_ciphertext` (`20260910103310...sql:1-3`).
- RLS + policy `installation_credentials_super_admin_all` idêntica ao padrão
  (linhas 15-21). GRANTs iguais (12-13). Trigger
  `update_installation_credentials_updated_at` (23-25).

### `public.installation_operation_attempts`
- Criada em `20260914141212_3f236ac3...sql:1-19` (DDL completo não
  transcrito nesta passada — **LACUNA**, ver §5). Constraint observada por
  uso: `UNIQUE (operation_id, attempt_number)` (ON CONFLICT em
  `20260913230055...sql:23`, migration anterior à criação formal da tabela —
  **inconsistência cronológica aparente: a função referencia a tabela em
  20260913230055 antes de `CREATE TABLE` em 20260914141212. Ou a tabela já
  existia antes fora do lote control-plane, ou há erro de sequenciamento —
  GAP CRÍTICO a confirmar**).
- GRANT `SELECT` para `authenticated`, `ALL` para `service_role`
  (linhas 21-22); RLS habilitado (23); policy
  `installation_operation_attempts_super_admin_read` (25-27, somente leitura
  — confirmar se é `FOR SELECT`, texto completo não capturado, LACUNA);
  índice `installation_operation_attempts_active_idx` (28, colunas não
  capturadas — LACUNA).

### `public.installation_operation_migrations`
- Criada em `20260914231638_1706c00f...sql:1-19`. GRANT `SELECT` para
  `authenticated`, `ALL` para `service_role` (19-20), depois reafirmado
  explicitamente com REVOKE prévio em
  `20260915002654_84f93ded...sql:1-3`. RLS habilitado (21); policy
  `installation_operation_migrations_super_admin_read` (22-25, somente
  leitura); índice `installation_operation_migrations_operation_status_idx`
  (26-27).

### `public.installation_operation_outbox`
- Nome usado em `INSERT INTO public.installation_operation_outbox(...)` a
  partir de `20260913230055_f50b7d0b...sql:37`, com
  `UNIQUE(deduplication_key)` (ON CONFLICT) e trigger de desativação
  `installation_operation_outbox_disable_legacy`
  (`20260915001853_33ffdf74...sql:17-21`) chamando
  `public.cancel_legacy_installation_outbox()`.
  **GAP CRÍTICO: nenhuma das 28 migrations control-plane contém o `CREATE
  TABLE public.installation_operation_outbox`.** A tabela é necessariamente
  criada em uma migration classificada `client` ou em posição não coberta
  por esta amostra — a especificação do verify-master não pode assumir a
  DDL completa (colunas, PK, RLS, grants) sem localizar essa migration.
  Teste `tests/installation-baseline-completeness.unit.test.ts:36-44`
  confirma apenas que a tabela **não** deve depender de fila órfã sem
  consumidor — não localiza a criação.

### Tabelas explicitamente fora do escopo replicado ao Client
`tests/installation-master-sync.unit.test.ts:40-44` define
`NAO_VERIFICADAS = {"installations", "installation_operations",
"installation_credentials"}` — usado pelo guardião que compara tabelas do
delta client-side com `verify-installation.sql`. Isso é evidência
independente (fora do lote de 28 migrations) de que essas 3 tabelas são
exclusivas do controle MASTER; as demais 3 tabelas (`installation_operation_
attempts`, `installation_operation_migrations`, `installation_operation_
outbox`) **não estão nessa exclusão**, sugerindo (mas não confirmando) que
podem ser esperadas também no Client — **AMBIGUIDADE a resolver antes de
travar o verify-master**: se essas 3 forem control-plane puro, a lista
`NAO_VERIFICADAS` está desatualizada (só cobre 3 das ~6 tabelas exclusivas);
se não forem, a classificação `control-plane` das migrations que as criam
está incorreta.

## 3. RPCs SECURITY DEFINER com `search_path` fixo (contagem real: 17, não 12)

Todas com `SECURITY DEFINER` + `SET search_path = public` (uma exceção usa
`public, pg_temp`) e `REVOKE ALL ... FROM PUBLIC, anon, authenticated` +
`GRANT EXECUTE ... TO service_role` — padrão de isolamento consistente,
exceto `start_installation_operation`, que também concede a
`authenticated` nas duas primeiras versões e só remove esse grant na
versão final.

| # | Função (assinatura final) | Definição final | search_path |
|---|---|---|---|
| 1 | `start_installation_operation(uuid,uuid,text,text,jsonb,text,timestamptz)` | `20260913180939_7da1388b...sql:7-56` (define `_actor_id` como parâmetro em vez de `auth.uid()` — corrige escalonamento de privilégio da 1ª versão em `20260910103310...sql:5-75`, que usava `auth.uid()` e concedia EXECUTE a `authenticated`) | `public` |
| 2 | `claim_installation_operation(uuid,text,integer)` | `20260913230055_f50b7d0b...sql:2-10` | `public` |
| 3 | `claim_stale_installation_operations(text,integer,integer)` | `20260913230055_f50b7d0b...sql:12-25` | `public` |
| 4 | `heartbeat_installation_operation(uuid,text,bigint,integer)` | `20260914141212_3f236ac3...sql:88-124` (assinatura muda de `(uuid,text,integer)` para incluir `fencing_token`; a antiga é **DROPada explicitamente** em `20260913230055`? — confirmar DROP FUNCTION explícito, não capturado nesta amostra — LACUNA) | `public` |
| 5 | `checkpoint_installation_operation(uuid,text,bigint,jsonb,jsonb,text,text,jsonb)` | `20260914231638_1706c00f...sql:76-121` | `public` |
| 6 | `retry_installation_operation(uuid,text,bigint,integer,text,text,jsonb)` | `20260915001724_34d26323...sql:47-101` | `public` |
| 7 | `defer_installation_operation(uuid,text,bigint,integer,text,text,jsonb)` | `20260915001724_34d26323...sql:102-151` (substitui `20260914003510_de477c51...sql:2-76`) | `public` |
| 8 | `finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)` | `20260914141212_3f236ac3...sql:172-247` | `public` |
| 9 | `yield_installation_operation(uuid,text,bigint,integer)` | `20260915001724_34d26323...sql:2-46` | `public` |
| 10 | `compare_and_set_installation_generated_secrets(uuid,timestamptz,text,uuid)` | `20260913205310_998a5893...sql:1-46` | `public, pg_temp` (única função com `pg_temp` explícito — inconsistência de padrão frente às demais 16, sinalizar) |
| 11 | `reconcile_orphan_installation_attempts(integer)` | `20260914141212_3f236ac3...sql:50-84` | `public` |
| 12 | `seal_installation_operation_baseline(uuid,text,bigint,text,text)` | `20260914194505_2a76102f...sql:1-38` (recriada idêntica em duas migrations consecutivas — `20260914193902` e `20260914194505` — possível migration redundante/no-op, sinalizar) | `public` |
| 13 | `merge_installation_operation_steps(jsonb,jsonb)` | `20260914231638_1706c00f...sql:29-72` | `public` |
| 14 | `checkpoint_installation_migration(uuid,text,bigint,text,text,integer,integer,integer,boolean)` | `20260915001724_34d26323...sql:152-254` (substitui versão de `20260914231638...sql:125-215`) | `public` |
| 15 | `reconcile_installation_operation_migrations(uuid,text,bigint,jsonb)` | `20260914233610_c522441b...sql:1-88` | `public` |
| 16 | `cancel_legacy_installation_outbox()` | `20260915001853_33ffdf74...sql:1-16` | `public` |
| 17 | `start_durable_installation_operation(uuid,uuid,text,text,jsonb,jsonb,integer,text,text,text,timestamptz,uuid)` | `20260916140310_b0a7973f...sql:11-146` (substitui versão de 11 parâmetros em `20260915095958_eb639764...sql:1-97`, adicionando `_retry_of_operation_id uuid DEFAULT NULL` — confirmado também em `tests/installation-master-sync.unit.test.ts:182-184`) | `public` |

**AMBIGUIDADE PRINCIPAL**: a demanda pede "12 RPCs" mas a auditoria das 28
migrations control-plane identifica **17 nomes distintos** de função
`SECURITY DEFINER` criados/alterados nesse lote (sem contar as
DROP/CREATE OR REPLACE intermediárias da mesma função, que não contam
duas vezes). Duas leituras possíveis:
  a) o número 12 refere-se a um subconjunto específico (ex.: só as
     RPCs "de workflow" chamadas pelo executor/worker: `start_*`,
     `claim_*` (2), `heartbeat_*`, `checkpoint_*` (2), `retry_*`,
     `defer_*`, `finalize_*`, `yield_*`, `start_durable_*` = 11-12
     dependendo de contar `checkpoint_installation_migration`);
  b) o número 12 está desatualizado frente ao estado real do
     repositório (mais funções foram adicionadas depois do requisito ser
     escrito).
Sem uma lista nominal de referência, o verify-master não deve travar em
"exatamente 12" sem essa definição — **recomendo tratar como piso mínimo
(>= 12) e listar nominalmente as 17**, replicando o padrão de
`supabase/install/verify-installation.sql` (que usa `>=` para contagens
agregadas, ex. linhas 46-50, 133-139).

## 4. Cron `installation-provision-resume`

- Job criado/recriado por `DO $$ ... cron.schedule(...) $$` em **4 pontos**
  do lote control-plane: `20260913180939_7da1388b...sql:61-79`,
  `20260913230055_f50b7d0b...sql:66-72`, `20260914003510_de477c51...sql:81-104`
  (versão final, com `pg_sleep(7)` de stagger e `timeout_milliseconds :=
  60000`) — a versão de `20260913190948` não recria o cron.
- Nome do job: `installation-provision-resume`; schedule `* * * * *`
  (a cada minuto); comando `net.http_post` para
  `{installation.app_url}/api/public/cron/installation-resume`, header
  `x-cron-secret: public.cron_secret()`, corpo
  `jsonb_build_object('job','installation-provision-resume','scheduledAt',
  now())`.
- Pré-condição validada em SQL antes de agendar:
  `app_url ~ '^https://[a-zA-Z0-9._-]+(:[0-9]+)?$'`, senão `RAISE
  EXCEPTION`.
- Endpoint correspondente: `src/routes/api/public/cron/installation-
  resume.ts:11-36`, autenticado via `assertCronRequest` (`x-cron-secret`),
  delega para `resumeStaleAutomatedProvisions()` em
  `src/lib/installation/resume-worker.server.ts:33-165`, que chama a RPC
  `claim_stale_installation_operations` (linha 39-43) via
  `supabaseAdmin.rpc`.
- Cobertura de teste: `tests/installation-baseline-completeness.unit.test.ts:
  211-217` exige que `verify-installation.sql` contenha os textos
  `"cron: retomada do gerenciador usa a URL registrada"`,
  `"installation-provision-resume"` e
  `"/api/public/cron/installation-resume"` — mas **esse teste valida o
  verify-installation.sql do Client, não um verify-master** — o cron em si
  só existe no MASTER (comentário em
  `tests/installation-baseline-completeness.unit.test.ts:90-96`: migrations
  com a URL do projeto MASTER hardcoded ficam de fora do pacote Client).
  **GAP: não existe hoje nenhum `verify-master.sql` nem teste equivalente
  que assegure a existência do job `installation-provision-resume` em
  `cron.job` no ambiente MASTER** — é exatamente a lacuna que este pedido
  de especificação busca fechar.

## 5. Lacunas e ambiguidades a resolver antes de escrever o SQL

1. **Duas migrations do lote estão vazias** (`20260913183337_3fa6a913...sql`
   com 0 linhas; `20260915001823_e6091ef3...sql` com 4 linhas em branco) mas
   seguem classificadas `control-plane` no mapa
   (`migration-destinations.json` posições 96/103, ambas listadas nos "96
   Client" ou fixas 96-104 mencionados em
   `tests/installation-baseline-completeness.unit.test.ts:140-189`, que
   descreve migrations 96-104 "fixadas" incluindo um
   `DROP FUNCTION public.heartbeat_installation_operation(uuid, text,
   integer)` — **essa é provavelmente a origem real da mudança de
   assinatura da RPC #4 acima, mas o arquivo físico correspondente não foi
   localizado com esse conteúdo nas 28 migrations lidas — reconciliar
   com o teste antes de finalizar o verify-master**).
2. **`installation_operation_outbox`**: DDL de criação não localizada
   (ver §2) — bloqueia especificar colunas/constraints/RLS/grants com
   certeza.
3. **Colunas `heartbeat_at`, `blocked_reason`, `next_command`** em
   `installation_operations`: usadas em UPDATE antes de um `ALTER TABLE
   ADD COLUMN` visível no lote — origem não confirmada.
4. **Índice `installation_operations_retry_origin_idx`** e a DDL completa de
   `installation_operation_attempts`/`installation_operation_migrations`
   (colunas, PK, constraints) precisam de leitura literal integral dos
   arquivos (`20260914141212`, `20260914231638`, `20260916140310`) —
   nesta auditoria foram inspecionados por grep de cabeçalhos, não byte a
   byte; qualquer verify-master deve re-confirmar via `\d+` real ou leitura
   integral antes de travar nomes de constraint.
5. **Contagem "12 RPCs"** não bate com as 17 funções identificadas —
   necessidade de lista nominal de referência (ver §3).
6. **Consistência de `search_path`**: 16 das 17 funções fixam apenas
   `public`; `compare_and_set_installation_generated_secrets` fixa
   `public, pg_temp` — validar se isso é intencional (uso de tabela
   temporária) ou desvio de padrão a reportar como achado de segurança.
7. **`start_installation_operation`**: a primeira versão (`20260910103310`)
   usava `auth.uid()` internamente e concedia `EXECUTE` a `authenticated`;
   isso foi uma falha de escalonamento de privilégio corrigida só duas
   migrations depois. Um verify-master deve testar explicitamente que a
   versão **atual** não concede `EXECUTE` a `authenticated`/`anon` — não
   apenas que a função existe.
8. **Migrations "fixadas 96–104"** referenciadas no teste unitário
   (`installation-baseline-completeness.unit.test.ts:140-189`) descrevem
   objetos (`installation_operation_attempts` com
   `UNIQUE(operation_id, fencing_token)`, `GRANT EXECUTE ON FUNCTION
   public.finalize_installation_operation`) que **não coincidem
   exatamente** com o que foi lido nas migrations físicas do mapa
   `control-plane` (que usam `UNIQUE(operation_id, attempt_number)`) —
   confirmar se o teste está desatualizado ou se há uma tabela renomeada/
   substituída fora da amostra de 28 arquivos.

## 6. Especificação do `verify-master.sql` (read-only, modelo)

Seguir o padrão de `supabase/install/verify-installation.sql` (CTE
`checks` com `ord, check_name, observed, status`, `\pset pager off`,
somente `SELECT`). Cada verificação abaixo é **um bloco `UNION ALL`**
autocontido, nunca DDL/DML.

**Tabelas (existência, RLS, colunas críticas, FKs, índices)**
- `installations`: existe; RLS habilitado; `slug` UNIQUE; coluna
  `active_operation_id`; >= 1 policy (`is_super_admin`).
- `installation_operations`: existe; FK `installation_id →
  installations.id ON DELETE CASCADE` via `pg_constraint.confdeltype = 'c'`;
  índice único parcial `installation_operations_one_active` cobrindo
  `('pending','running','retryable')`; índice único parcial
  `installation_operations_idempotency_uidx`; colunas `fencing_token`,
  `attempt_count`, `max_attempts`, `lease_owner`, `lease_expires_at`,
  `next_attempt_at`.
- `installation_credentials`: existe; PK = FK 1:1; nenhuma coluna termina
  sem sufixo `_ciphertext` para os 6 segredos conhecidos (checar via
  `information_schema.columns` que não existam colunas `*_token`/`*_key`
  sem `_ciphertext`).
- `installation_operation_attempts`, `installation_operation_migrations`:
  existem; RLS habilitado; policy somente leitura para `authenticated`.
- `installation_operation_outbox`: existência (sem assumir DDL — **ver
  gap §5.2**, verificar apenas via `to_regclass`).

**Grants/Revokes**
- Nenhuma das 6 tabelas concede privilégio direto a `anon`
  (replicar o padrão de `verify-installation.sql:121-124`, adaptado ao
  schema control-plane).
- Nenhuma das 17 funções concede `EXECUTE` a `anon`/`authenticated`
  (exceção documentada: `installations`/`installation_operations`/
  `installation_credentials` concedem CRUD de tabela a `authenticated`,
  mas isso é coberto por RLS restrita a `is_super_admin`, não pelas
  funções).

**RPCs (17, ver §3), cada uma verificando 3 fatos via `pg_proc`**
- existe com a assinatura esperada;
- `prosecdef = true` (SECURITY DEFINER);
- `proconfig` contém `search_path=public` (ou `public, pg_temp` só para
  `compare_and_set_installation_generated_secrets`);
- `has_function_privilege('anon', oid, 'EXECUTE') = false` e idem para
  `authenticated`; `has_function_privilege('service_role', oid,
  'EXECUTE') = true`.

**Cron**
- `EXISTS (SELECT 1 FROM cron.job WHERE jobname =
  'installation-provision-resume')`.
- `cron.job.schedule = '* * * * *'`.
- `cron.job.command` contém `/api/public/cron/installation-resume` e
  `x-cron-secret`.

**Triggers**
- `installations_touch_updated_at`, `update_installation_credentials_
  updated_at`, `installation_operation_outbox_disable_legacy` presentes e
  não internos (`NOT tgisinternal`).

## 7. Contratos TS relacionados (referência)
- `src/routes/api/public/cron/installation-resume.ts:1-36`
- `src/lib/installation/resume-worker.server.ts:1-165`
- `tests/installation-master-sync.unit.test.ts:38-44,177-185`
- `tests/installation-baseline-completeness.unit.test.ts:45-63,140-189,211-217`
- `.lovable/plan/separação-definitiva-master-client-2026-09-16.md:6-15`
  (planejamento ainda não executado de uma migration MASTER-only
  consolidada — o verify-master pedido aqui cobre a lacuna de verificação,
  não a de materialização)
- `.lovable/plan/reconciliar-pacote-client-e-contrato-master-1-4-3-2026-09-16.md:8-21`
