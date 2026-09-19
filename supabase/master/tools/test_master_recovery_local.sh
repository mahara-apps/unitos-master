#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP_ROOT="$(mktemp -d /tmp/unitos-master-recovery.XXXXXX)"
PGDATA="$TMP_ROOT/data"
SOCKET_DIR="$TMP_ROOT/socket"
PORT="$((55000 + RANDOM % 1000))"
LOG="$TMP_ROOT/postgres.log"
PREFLIGHT="$ROOT/supabase/master/recovery-control-plane-preflight.sql"
RECOVERY="$ROOT/supabase/master/recovery/20260919143000_recover_missing_legacy_reconciliation.sql"
MIGRATION_1411="$ROOT/supabase/migrations/20260917190721_f04a7c59-5fbb-4ef3-aa75-044844da8fa3.sql"
GLOBAL_FREEZE="$ROOT/supabase/master/002_control_plane_global_freeze.sql"

cleanup() {
  if test -f "$PGDATA/postmaster.pid"; then
    setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$PGDATA" "$SOCKET_DIR"
chown -R lovable:lovable "$TMP_ROOT"
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$PGDATA" --no-locale --encoding=UTF8 >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$PGDATA" -l "$LOG" \
  -o "-F -k $SOCKET_DIR -p $PORT -c listen_addresses=''" start >/dev/null

PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PORT" -U lovable postgres)

"${PSQL[@]}" >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE postgres NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, statements text[], name text);
INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20260917190721', 'f04a7c59-5fbb-4ef3-aa75-044844da8fa3');

CREATE TABLE public.installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text, health text,
  active_operation_id uuid, last_error text, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.installation_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), installation_id uuid NOT NULL REFERENCES public.installations(id),
  status text, lease_owner text, fencing_token bigint DEFAULT 0, lease_expires_at timestamptz,
  next_attempt_at timestamptz, next_command text, finished_at timestamptz, error_kind text,
  blocked_reason text, summary text, error_detail jsonb DEFAULT '{}'::jsonb,
  last_report_at timestamptz, heartbeat_at timestamptz, metrics jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.installations ADD CONSTRAINT installations_active_operation_fk
  FOREIGN KEY (active_operation_id) REFERENCES public.installation_operations(id);
CREATE TABLE public.installation_operation_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES public.installation_operations(id),
  migration_file text NOT NULL, fingerprint text NOT NULL, package_position integer NOT NULL,
  statement_index integer NOT NULL, total_statements integer NOT NULL, status text NOT NULL,
  confirmed_at timestamptz, updated_at timestamptz DEFAULT now(),
  UNIQUE(operation_id, migration_file, fingerprint)
);
CREATE TABLE public.installation_operation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES public.installation_operations(id),
  status text, error_kind text, error_message text, retryable boolean, fencing_token bigint,
  heartbeat_at timestamptz DEFAULT now(), finished_at timestamptz, updated_at timestamptz DEFAULT now()
);
CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS 'SELECT false';
CREATE TABLE public.installation_credentials (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.installation_operation_steps (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.installation_operation_outbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
SQL

"${PSQL[@]}" --file "$MIGRATION_1411" >/dev/null
"${PSQL[@]}" --file "$GLOBAL_FREEZE" >/dev/null
"${PSQL[@]}" >/dev/null <<'SQL'
ALTER FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb) OWNER TO postgres;
ALTER FUNCTION public.normalize_legacy_installation_operations(integer) OWNER TO postgres;
SELECT public.set_installation_operations_freeze(true,'ensaio local da recovery','teste isolado',0);
SQL

run_preflight() {
  "${PSQL[@]}" --csv --tuples-only --file "$PREFLIGHT"
}

assert_check_status() {
  local ord="$1" fragment="$2" expected="$3" output="$4"
  awk -v prefix="$ord," -v fragment="$fragment" -v expected=",$expected" '
    index($0, prefix) == 1 && index($0, fragment) && substr($0, length($0) - length(expected) + 1) == expected { found=1 }
    END { exit(found ? 0 : 1) }
  ' <<< "$output" || { printf 'check %s (%s) não retornou %s\n%s\n' "$ord" "$fragment" "$expected" "$output" >&2; exit 1; }
}

canonical="$(run_preflight)"
if grep -q ',FAIL$' <<< "$canonical"; then
  printf 'assinatura canônica deveria passar\n%s\n' "$canonical" >&2
  exit 1
fi

# A representação textual canônica contém nomes, enquanto os tipos sem nomes
# vêm do catálogo. O controle 7 deve aceitar ambos sem comparar essas strings.
"${PSQL[@]}" --tuples-only --no-align -c "
SELECT CASE
  WHEN pg_get_function_identity_arguments('public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb)'::regprocedure)
       = '_operation_id uuid, _owner text, _fencing_token bigint, _migrations jsonb'
   AND (SELECT string_agg(format_type(p.proargtypes[i], NULL), ', ' ORDER BY i)
        FROM pg_proc p, generate_series(0, p.pronargs::integer - 1) i
        WHERE p.oid='public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb)'::regprocedure)
       = 'uuid, text, bigint, jsonb'
  THEN 'PASS' ELSE 'FAIL' END" | grep -qx PASS

exercise_mismatch() {
  local mutation="$1" expected_fragment="$2"
  "${PSQL[@]}" >/dev/null <<SQL
BEGIN;
$mutation
\o $TMP_ROOT/mismatch.out
\pset format csv
\t on
\i $PREFLIGHT
\o
ROLLBACK;
SQL
  assert_check_status 7 reconcile FAIL "$(cat "$TMP_ROOT/mismatch.out")" || {
    printf '%s\n' "$expected_fragment" >&2
    exit 1
  }
}

exercise_mismatch "
DROP FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb);
CREATE FUNCTION public.reconcile_installation_operation_migrations(operation_id uuid, _owner text, _fencing_token bigint, _migrations jsonb)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS \$\$BEGIN RETURN 0; END\$\$;
REVOKE ALL ON FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb) TO service_role;" "argument name mismatch"

exercise_mismatch "
DROP FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb);
CREATE FUNCTION public.reconcile_installation_operation_migrations(_operation_id uuid, _owner bigint, _fencing_token text, _migrations jsonb)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS \$\$BEGIN RETURN 0; END\$\$;
REVOKE ALL ON FUNCTION public.reconcile_installation_operation_migrations(uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_installation_operation_migrations(uuid,bigint,text,jsonb) TO service_role;" "argument type mismatch"

exercise_mismatch "
DROP FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb);
CREATE FUNCTION public.reconcile_installation_operation_migrations(_owner uuid, _operation_id text, _fencing_token bigint, _migrations jsonb)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS \$\$BEGIN RETURN 0; END\$\$;
REVOKE ALL ON FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb) TO service_role;" "argument order mismatch"

exercise_mismatch "
DROP FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint,jsonb);
CREATE FUNCTION public.reconcile_installation_operation_migrations(_operation_id uuid, _owner text, _fencing_token bigint)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS \$\$BEGIN RETURN 0; END\$\$;
REVOKE ALL ON FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_installation_operation_migrations(uuid,text,bigint) TO service_role;" "argument count mismatch"

"${PSQL[@]}" >/dev/null <<SQL
BEGIN;
CREATE FUNCTION public.reconcile_installation_operation_migrations(_operation_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS \$\$BEGIN RETURN 0; END\$\$;
\o $TMP_ROOT/overload.out
\pset format csv
\t on
\i $PREFLIGHT
\o
ROLLBACK;
SQL
assert_check_status 5 "assinaturas exatas sem overload" FAIL "$(cat "$TMP_ROOT/overload.out")" || {
  printf 'unexpected overload não foi bloqueado\n' >&2
  exit 1
}

# O freeze bloqueia mutações operacionais diretas, inclusive service_role.
if "${PSQL[@]}" -c "INSERT INTO public.installation_operations(installation_id,status) VALUES (gen_random_uuid(),'pending')" >/dev/null 2>&1; then
  echo "trigger fail-closed deveria bloquear escrita operacional" >&2
  exit 1
fi

# Falha após DDL dentro da transação deve remover integralmente os objetos.
{
  sed '$d' "$RECOVERY"
  printf '%s\n' "DO \$\$BEGIN RAISE EXCEPTION 'forced rollback'; END\$\$;" "COMMIT;"
} > "$TMP_ROOT/forced-rollback.sql"
if "${PSQL[@]}" --file "$TMP_ROOT/forced-rollback.sql" >/dev/null 2>&1; then
  echo "falha induzida deveria abortar a recovery" >&2
  exit 1
fi
"${PSQL[@]}" --tuples-only --no-align -c "SELECT to_regclass('public.installation_migration_reconciliation_evidence') IS NULL" | grep -qx t

"${PSQL[@]}" --file "$RECOVERY" >/dev/null
"${PSQL[@]}" --tuples-only --no-align -c "
SELECT CASE WHEN
  to_regclass('public.installation_migration_reconciliation_evidence') IS NOT NULL
  AND to_regprocedure('public.record_installation_migration_reconciliation_evidence(uuid,text,bigint,text,jsonb)') IS NOT NULL
  AND to_regprocedure('public.read_installation_migration_reconciliation_evidence(uuid,text)') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260917184500')
  AND NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260919143000')
THEN 'PASS' ELSE 'FAIL' END" | grep -qx PASS

# Simula exclusivamente o registro que a CLI oficial faria após o COMMIT.
"${PSQL[@]}" -c "INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260919143000','recover_missing_legacy_reconciliation');" >/dev/null
"${PSQL[@]}" --tuples-only --no-align -c "
SELECT concat_ws(',',
  count(*) FILTER (WHERE version='20260917184500'),
  count(*) FILTER (WHERE version='20260917190721'),
  count(*) FILTER (WHERE version='20260919143000'))
FROM supabase_migrations.schema_migrations" | grep -qx '0,1,1'

echo "master recovery PostgreSQL local: PASS"