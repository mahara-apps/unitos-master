#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP_ROOT="$(mktemp -d /tmp/unitos-deterministic-update.XXXXXX)"
PGDATA="$TMP_ROOT/data"; SOCKET_DIR="$TMP_ROOT/socket"; PORT="$((56000 + RANDOM % 1000))"; LOG="$TMP_ROOT/postgres.log"
cleanup() { if test -f "$PGDATA/postmaster.pid"; then setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; fi; rm -rf "$TMP_ROOT"; }
trap cleanup EXIT
mkdir -p "$PGDATA" "$SOCKET_DIR"; chown -R lovable:lovable "$TMP_ROOT"
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$PGDATA" --no-locale --encoding=UTF8 >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$PGDATA" -l "$LOG" -o "-F -k $SOCKET_DIR -p $PORT -c listen_addresses=''" start >/dev/null
PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PORT" -U lovable postgres)

"${PSQL[@]}" >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
CREATE TABLE public.installations (
 id uuid PRIMARY KEY, status text, health text, health_checks jsonb, health_checked_at timestamptz,
 active_operation_id uuid, last_error text, current_version text, pinned_release text,
 pinned_commit_sha text, pinned_at timestamptz, last_provisioned_at timestamptz,
 last_validated_at timestamptz, updated_at timestamptz
);
CREATE TABLE public.installation_operations (
 id uuid PRIMARY KEY, installation_id uuid NOT NULL, kind text, status text, lease_owner text,
 fencing_token bigint, lease_expires_at timestamptz, baseline_id text, baseline_hash text,
 detail jsonb, steps jsonb, summary text, error_kind text, current_step text, next_attempt_at timestamptz,
 next_command text, run_token_hash text, finished_at timestamptz, heartbeat_at timestamptz,
 last_report_at timestamptz, reconciled_at timestamptz, started_at timestamptz DEFAULT now(),
 created_at timestamptz DEFAULT now(), attempt_count integer DEFAULT 0, max_attempts integer DEFAULT 3,
 blocked_reason text, error_detail jsonb, metrics jsonb
);
CREATE TABLE public.installation_operation_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid, attempt_number integer, owner text,
 fencing_token bigint, status text, started_at timestamptz,
 error_kind text, error_message text, retryable boolean, finished_at timestamptz,
 heartbeat_at timestamptz, updated_at timestamptz, error_code text,
 UNIQUE(operation_id,attempt_number)
);
CREATE TABLE public.installation_operation_migrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid, migration_file text,
 fingerprint text, package_position integer, statement_index integer, total_statements integer,
 status text, confirmed_at timestamptz
);
CREATE TABLE public.installation_credentials (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.installation_operation_steps (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.installation_operation_outbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.installation_migration_reconciliation_evidence (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS 'SELECT false';
SQL
"${PSQL[@]}" --file "$ROOT/supabase/master/002_control_plane_global_freeze.sql" >/dev/null
"${PSQL[@]}" >/dev/null <<'SQL'
INSERT INTO public.installations(id,status,current_version)
VALUES ('00000000-0000-0000-0000-000000000010','updating','1.3.71'),
       ('00000000-0000-0000-0000-000000000011','error','1.3.70');
INSERT INTO public.installation_operations(id,installation_id,kind,status,lease_owner,fencing_token,lease_expires_at,detail,steps)
VALUES ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000010','update','pending',NULL,0,NULL,'{}','[]'),
       ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000011','update','failed',NULL,0,NULL,'{}','[]');
INSERT INTO public.installation_operation_attempts(operation_id,fencing_token,status,retryable,finished_at)
SELECT '00000000-0000-0000-0000-000000000013',0,
  CASE WHEN n <= 65 THEN 'retryable' WHEN n = 66 THEN 'deferred' ELSE 'interrupted' END,true,now()
FROM generate_series(1,67) n;
SELECT public.set_installation_operations_freeze(true,'ensaio executor','teste',0);
SQL
"${PSQL[@]}" --csv --tuples-only --file "$ROOT/supabase/master/deterministic-update-install-preflight.sql" | tee "$TMP_ROOT/preflight.out" >/dev/null
if grep -q ',FAIL$' "$TMP_ROOT/preflight.out" || [[ "$(grep -c ',PASS$' "$TMP_ROOT/preflight.out")" -ne 11 ]]; then
  echo "preflight do executor deveria preservar pending e histórico terminal" >&2; exit 1
fi
"${PSQL[@]}" --file "$ROOT/supabase/master/install-deterministic-update.sql" >/dev/null
"${PSQL[@]}" --tuples-only --no-align -c "SELECT concat_ws(',',status,lease_owner IS NULL,lease_expires_at IS NULL) FROM public.installation_operations WHERE id='00000000-0000-0000-0000-000000000012'" | grep -qx 'pending,t,t'
"${PSQL[@]}" --tuples-only --no-align -c "SELECT count(*) FROM public.installation_operation_attempts WHERE status IN ('retryable','deferred','interrupted')" | grep -qx 67

# Lease residual terminal expirado e fenced é histórico; lease ativo bloqueia.
"${PSQL[@]}" -c "SELECT public.set_installation_operations_freeze(false,'testa lease residual','teste',1); UPDATE public.installation_operations SET lease_owner='legacy',lease_expires_at=now()-interval '1 minute' WHERE id='00000000-0000-0000-0000-000000000013'; SELECT public.set_installation_operations_freeze(true,'testa lease residual','teste',2);" >/dev/null
"${PSQL[@]}" --csv --tuples-only --file "$ROOT/supabase/master/deterministic-update-install-preflight.sql" > "$TMP_ROOT/residual.out"
grep -q 'leases residuais apenas terminais.*PASS$' "$TMP_ROOT/residual.out"
"${PSQL[@]}" -c "SELECT public.set_installation_operations_freeze(false,'testa lease ativo','teste',3); UPDATE public.installation_operations SET lease_expires_at=now()+interval '1 minute' WHERE id='00000000-0000-0000-0000-000000000013'" >/dev/null
"${PSQL[@]}" --csv --tuples-only --file "$ROOT/supabase/master/deterministic-update-install-preflight.sql" > "$TMP_ROOT/active-lease.out"
grep -q 'leases residuais apenas terminais.*FAIL$' "$TMP_ROOT/active-lease.out"
"${PSQL[@]}" -c "UPDATE public.installation_operations SET lease_owner=NULL,lease_expires_at=NULL WHERE id='00000000-0000-0000-0000-000000000013'" >/dev/null
"${PSQL[@]}" --file "$ROOT/supabase/master/003_control_plane_deterministic_update.sql" >/dev/null

IDS=("00000000-0000-0000-0000-000000000001" "00000000-0000-0000-0000-000000000002")
"${PSQL[@]}" >/dev/null <<SQL
INSERT INTO public.installations(id,status,active_operation_id,current_version) VALUES ('${IDS[0]}','updating','${IDS[1]}','1.3.76');
INSERT INTO public.installation_operations(id,installation_id,kind,status,lease_owner,fencing_token,lease_expires_at,baseline_id,baseline_hash,detail,steps)
VALUES ('${IDS[1]}','${IDS[0]}','update','running','worker-a',7,now()+interval '5 minutes','1.4.17:abcdef1234567890:2',repeat('a',64),
 '{"stageProgress":{"updateRelease":"1.4.17","codeSourceSha":"abcdef1234567890","codeDone":true,"updateDatabaseReconciled":true,"updateValidationPassed":true}}',
 '[{"state":"done"},{"state":"done"}]');
INSERT INTO public.installation_operation_attempts(operation_id,fencing_token,status) VALUES ('${IDS[1]}',7,'running');
INSERT INTO public.installation_operation_migrations(operation_id,migration_file,fingerprint,package_position,statement_index,total_statements,status)
VALUES ('${IDS[1]}','20260920000001_first.sql','a-1-2',1,1,1,'completed'),('${IDS[1]}','20260920000002_second.sql','b-3-4',2,1,1,'completed');
SQL

# Executor concorrente/zumbi não finaliza e não promove versão.
"${PSQL[@]}" --tuples-only --no-align -c "SELECT public.finalize_installation_operation('${IDS[1]}','worker-z',6,'success','ok',NULL,'{}','[{\"state\":\"done\"}]','up_to_date','healthy','{}','1.4.17',true,false)" | grep -qx f
"${PSQL[@]}" --tuples-only --no-align -c "SELECT current_version FROM public.installations WHERE id='${IDS[0]}'" | grep -qx 1.3.76

# O owner vigente fecha operação, ledger, release e commit atomicamente.
"${PSQL[@]}" --tuples-only --no-align -c "SELECT public.finalize_installation_operation('${IDS[1]}','worker-a',7,'success','ok',NULL,'{\"stageProgress\":{\"updateRelease\":\"1.4.17\",\"codeSourceSha\":\"abcdef1234567890\",\"codeDone\":true,\"updateDatabaseReconciled\":true,\"updateValidationPassed\":true}}','[{\"state\":\"done\"},{\"state\":\"done\"}]','up_to_date','healthy','{}','1.4.17',true,false)" | grep -qx t
"${PSQL[@]}" --tuples-only --no-align -c "SELECT concat_ws(',',current_version,pinned_release,pinned_commit_sha,status,active_operation_id IS NULL) FROM public.installations WHERE id='${IDS[0]}'" | grep -qx '1.4.17,1.4.17,abcdef1234567890,up_to_date,t'
"${PSQL[@]}" --tuples-only --no-align -c "SELECT concat_ws(',',status,reconciled_at IS NOT NULL,detail->>'reconciliationState') FROM public.installation_operations WHERE id='${IDS[1]}'" | grep -qx 'success,t,reconciled'

# Reprodução fiel: predecessor encerrado pelo contrato antigo, sem
# reconciliação/pins, e sucessor bloqueado pelo gate sequencial.
BATCH_ID="00000000-0000-0000-0000-000000000020"
FIRST_INSTALLATION="00000000-0000-0000-0000-000000000021"
FIRST_OPERATION="00000000-0000-0000-0000-000000000022"
SECOND_INSTALLATION="00000000-0000-0000-0000-000000000023"
SECOND_OPERATION="00000000-0000-0000-0000-000000000024"
"${PSQL[@]}" >/dev/null <<SQL
INSERT INTO public.installations(id,status,current_version,pinned_release,pinned_commit_sha)
VALUES ('${FIRST_INSTALLATION}','up_to_date','1.4.44','1.4.43','old-commit'),
       ('${SECOND_INSTALLATION}','updating','1.4.43','1.4.43','old-commit');
INSERT INTO public.installation_operations(id,installation_id,kind,status,fencing_token,baseline_id,baseline_hash,detail,steps,reconciled_at)
VALUES ('${FIRST_OPERATION}','${FIRST_INSTALLATION}','update','success',1,'1.4.44:abcdef1234567890:2',repeat('b',64),
  jsonb_build_object('automated','true','batchId','${BATCH_ID}','batchPosition',1,'batchTotal',2,'stageProgress',jsonb_build_object('updateRelease','1.4.44','codeSourceSha','abcdef1234567890','codeDone',true,'updateDatabaseReconciled',true,'updateValidationPassed',true)),
  '[{"state":"done"},{"state":"done"},{"state":"done"},{"state":"done"},{"state":"done"}]',NULL),
 ('${SECOND_OPERATION}','${SECOND_INSTALLATION}','update','pending',0,'1.4.44:abcdef1234567890:2',repeat('b',64),
  jsonb_build_object('automated','true','batchId','${BATCH_ID}','batchPosition',2,'batchTotal',2),'[]',NULL);
UPDATE public.installations SET active_operation_id='${SECOND_OPERATION}' WHERE id='${SECOND_INSTALLATION}';
INSERT INTO public.installation_operation_migrations(operation_id,migration_file,fingerprint,package_position,statement_index,total_statements,status,confirmed_at)
VALUES ('${FIRST_OPERATION}','20260920000001_first.sql','a-1-2',1,1,1,'completed',now()),
       ('${FIRST_OPERATION}','20260920000002_second.sql','b-3-4',2,1,1,'completed',now());
SQL
"${PSQL[@]}" --tuples-only --no-align -c "SELECT count(*) FROM public.claim_stale_installation_operations('worker-b',3,180)" | grep -qx 0

# O reparo abre escrita somente dentro da transação e congela novamente antes
# do commit; não reaplica migrations nem reabre a operação encerrada.
"${PSQL[@]}" --tuples-only --no-align -c "SELECT (public.set_installation_operations_freeze(true,'ensaio de reparo','teste',4)->>'frozen')" | grep -qx true
EXPECTED_HASH="$(printf 'b%.0s' {1..64})"

# Controle divergente: autorização com hash diferente falha sem promover.
WRONG_HASH="$(printf 'c%.0s' {1..64})"
if "${PSQL[@]}" --set=operation_id="${FIRST_OPERATION}" --set=batch_id="${BATCH_ID}" \
  --set=expected_release="1.4.44" --set=expected_commit="abcdef1234567890" \
  --set=expected_hash="${WRONG_HASH}" --set=expected_total=2 \
  --set=operator="teste-local" --file "$ROOT/supabase/master/reconcile-completed-batch-predecessor.sql" >/dev/null 2>&1; then
  echo "reparo deveria rejeitar identidade divergente" >&2; exit 1
fi
"${PSQL[@]}" --tuples-only --no-align -c "SELECT concat_ws(',',reconciled_at IS NULL,pinned_release) FROM public.installation_operations op JOIN public.installations i ON i.id=op.installation_id WHERE op.id='${FIRST_OPERATION}'" | grep -qx 't,1.4.43'

# Controle de ausência real: ledger incompleto falha sem fabricar evidência.
EMPTY_INSTALLATION="00000000-0000-0000-0000-000000000025"
EMPTY_OPERATION="00000000-0000-0000-0000-000000000026"
EMPTY_BATCH="00000000-0000-0000-0000-000000000027"
"${PSQL[@]}" -c "SELECT public.set_installation_operations_freeze(false,'prepara controle vazio','teste',5); INSERT INTO public.installations(id,status,current_version,pinned_release,pinned_commit_sha) VALUES ('${EMPTY_INSTALLATION}','up_to_date','1.4.44','1.4.43','old-commit'); INSERT INTO public.installation_operations(id,installation_id,kind,status,fencing_token,baseline_id,baseline_hash,detail,steps,reconciled_at) VALUES ('${EMPTY_OPERATION}','${EMPTY_INSTALLATION}','update','success',1,'1.4.44:abcdef1234567890:2',repeat('b',64),jsonb_build_object('automated','true','batchId','${EMPTY_BATCH}','batchPosition',1,'batchTotal',1,'stageProgress',jsonb_build_object('updateRelease','1.4.44','codeSourceSha','abcdef1234567890','codeDone',true,'updateDatabaseReconciled',true,'updateValidationPassed',true)),'[{\"state\":\"done\"},{\"state\":\"done\"},{\"state\":\"done\"},{\"state\":\"done\"},{\"state\":\"done\"}]',NULL); SELECT public.set_installation_operations_freeze(true,'executa controle vazio','teste',6);" >/dev/null
if "${PSQL[@]}" --set=operation_id="${EMPTY_OPERATION}" --set=batch_id="${EMPTY_BATCH}" \
  --set=expected_release="1.4.44" --set=expected_commit="abcdef1234567890" \
  --set=expected_hash="${EXPECTED_HASH}" --set=expected_total=2 \
  --set=operator="teste-local" --file "$ROOT/supabase/master/reconcile-completed-batch-predecessor.sql" >/dev/null 2>&1; then
  echo "reparo deveria rejeitar ledger ausente" >&2; exit 1
fi
"${PSQL[@]}" --tuples-only --no-align -c "SELECT concat_ws(',',reconciled_at IS NULL,pinned_release) FROM public.installation_operations op JOIN public.installations i ON i.id=op.installation_id WHERE op.id='${EMPTY_OPERATION}'" | grep -qx 't,1.4.43'

# Controle válido derivado do incidente.
"${PSQL[@]}" --set=operation_id="${FIRST_OPERATION}" --set=batch_id="${BATCH_ID}" \
  --set=expected_release="1.4.44" --set=expected_commit="abcdef1234567890" \
  --set=expected_hash="${EXPECTED_HASH}" --set=expected_total=2 \
  --set=operator="teste-local" --file "$ROOT/supabase/master/reconcile-completed-batch-predecessor.sql" >/dev/null
"${PSQL[@]}" --tuples-only --no-align -c "SELECT concat_ws(',',reconciled_at IS NOT NULL,detail->>'reconciliationState') FROM public.installation_operations WHERE id='${FIRST_OPERATION}'" | grep -qx 't,reconciled'
"${PSQL[@]}" --tuples-only --no-align -c "SELECT concat_ws(',',pinned_release,pinned_commit_sha) FROM public.installations WHERE id='${FIRST_INSTALLATION}'" | grep -qx '1.4.44,abcdef1234567890'
"${PSQL[@]}" --tuples-only --no-align -c "SELECT frozen::text FROM public.installation_operations_freeze WHERE singleton" | grep -qx true
"${PSQL[@]}" --tuples-only --no-align -c "SELECT (public.set_installation_operations_freeze(false,'libera ensaio','teste',9)->>'frozen')" | grep -qx false
"${PSQL[@]}" --tuples-only --no-align -c "SELECT count(*) FROM public.claim_stale_installation_operations('worker-b',3,180) WHERE id='${SECOND_OPERATION}'" | grep -qx 1

echo "deterministic update PostgreSQL local: PASS"