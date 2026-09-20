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
 last_report_at timestamptz, reconciled_at timestamptz
);
CREATE TABLE public.installation_operation_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid, fencing_token bigint, status text,
 error_kind text, error_message text, retryable boolean, finished_at timestamptz,
 heartbeat_at timestamptz, updated_at timestamptz
);
CREATE TABLE public.installation_operation_migrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid, migration_file text,
 fingerprint text, package_position integer, statement_index integer, total_statements integer,
 status text, confirmed_at timestamptz
);
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
INSERT INTO public.installation_operation_attempts(operation_id,fencing_token,status,retryable)
SELECT '00000000-0000-0000-0000-000000000013',0,'retryable',true FROM generate_series(1,67);
SELECT public.set_installation_operations_freeze(true,'ensaio executor','teste',0);
SQL
"${PSQL[@]}" --csv --tuples-only --file "$ROOT/supabase/master/deterministic-update-install-preflight.sql" | tee "$TMP_ROOT/preflight.out" >/dev/null
if grep -q ',FAIL$' "$TMP_ROOT/preflight.out" || [[ "$(grep -c ',PASS$' "$TMP_ROOT/preflight.out")" -ne 10 ]]; then
  echo "preflight do executor deveria preservar pending e histórico terminal" >&2; exit 1
fi
"${PSQL[@]}" --file "$ROOT/supabase/master/install-deterministic-update.sql" >/dev/null
"${PSQL[@]}" --tuples-only --no-align -c "SELECT concat_ws(',',status,lease_owner IS NULL,lease_expires_at IS NULL) FROM public.installation_operations WHERE id='00000000-0000-0000-0000-000000000012'" | grep -qx 'pending,t,t'
"${PSQL[@]}" --tuples-only --no-align -c "SELECT count(*) FROM public.installation_operation_attempts WHERE status='retryable'" | grep -qx 67
"${PSQL[@]}" -c "SELECT public.set_installation_operations_freeze(false,'continua ensaio','teste',1);" >/dev/null
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
VALUES ('${IDS[1]}','20260920000001_first.sql',repeat('1',64),1,1,1,'completed'),('${IDS[1]}','20260920000002_second.sql',repeat('2',64),2,1,1,'completed');
SQL

# Executor concorrente/zumbi não finaliza e não promove versão.
"${PSQL[@]}" --tuples-only --no-align -c "SELECT public.finalize_installation_operation('${IDS[1]}','worker-z',6,'success','ok',NULL,'{}','[{\"state\":\"done\"}]','up_to_date','healthy','{}','1.4.17',true,false)" | grep -qx f
"${PSQL[@]}" --tuples-only --no-align -c "SELECT current_version FROM public.installations WHERE id='${IDS[0]}'" | grep -qx 1.3.76

# O owner vigente fecha operação, ledger, release e commit atomicamente.
"${PSQL[@]}" --tuples-only --no-align -c "SELECT public.finalize_installation_operation('${IDS[1]}','worker-a',7,'success','ok',NULL,'{\"stageProgress\":{\"updateRelease\":\"1.4.17\",\"codeSourceSha\":\"abcdef1234567890\",\"codeDone\":true,\"updateDatabaseReconciled\":true,\"updateValidationPassed\":true}}','[{\"state\":\"done\"},{\"state\":\"done\"}]','up_to_date','healthy','{}','1.4.17',true,false)" | grep -qx t
"${PSQL[@]}" --tuples-only --no-align -c "SELECT concat_ws(',',current_version,pinned_release,pinned_commit_sha,status,active_operation_id IS NULL) FROM public.installations WHERE id='${IDS[0]}'" | grep -qx '1.4.17,1.4.17,abcdef1234567890,up_to_date,t'
"${PSQL[@]}" --tuples-only --no-align -c "SELECT concat_ws(',',status,reconciled_at IS NOT NULL,detail->>'reconciliationState') FROM public.installation_operations WHERE id='${IDS[1]}'" | grep -qx 'success,t,reconciled'

echo "deterministic update PostgreSQL local: PASS"