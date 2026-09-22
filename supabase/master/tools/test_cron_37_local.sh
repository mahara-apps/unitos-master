#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP_ROOT="$(mktemp -d /tmp/unitos-cron-37.XXXXXX)"; PGDATA="$TMP_ROOT/data"; SOCKET_DIR="$TMP_ROOT/socket"; PORT="$((57500 + RANDOM % 400))"; LOG="$TMP_ROOT/postgres.log"
cleanup(){ if test -f "$PGDATA/postmaster.pid"; then setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; fi; rm -rf "$TMP_ROOT"; }; trap cleanup EXIT
mkdir -p "$PGDATA" "$SOCKET_DIR"; chown -R lovable:lovable "$TMP_ROOT"
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$PGDATA" --no-locale --encoding=UTF8 >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$PGDATA" -l "$LOG" -o "-F -k $SOCKET_DIR -p $PORT -c listen_addresses=''" start >/dev/null
PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PORT" -U lovable postgres)
"${PSQL[@]}" >/dev/null <<'SQL'
CREATE SCHEMA cron;
CREATE TABLE cron.job(jobid bigint PRIMARY KEY,jobname text,active boolean,schedule text,command text);
INSERT INTO cron.job VALUES(37,'installation-provision-resume',false,'* * * * *','curl /api/public/cron/installation-resume -H x-cron-secret'),(38,'other',false,'0 0 * * *','noop');
CREATE FUNCTION cron.alter_job(job_id bigint,active boolean) RETURNS void LANGUAGE sql AS 'UPDATE cron.job SET active=$2 WHERE jobid=$1';
CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY); INSERT INTO supabase_migrations.schema_migrations VALUES('20260919143000');
CREATE TABLE public.installation_operations_freeze(singleton boolean PRIMARY KEY CHECK(singleton),frozen boolean); INSERT INTO public.installation_operations_freeze VALUES(true,true);
CREATE TABLE public.control_plane_release_state(singleton boolean PRIMARY KEY CHECK(singleton),current_version text,pinned_release text,pinned_commit_sha text,contract_sha256 text);
INSERT INTO public.control_plane_release_state VALUES(true,'1.4.23','1.4.23','commit',repeat('a',64));
CREATE TABLE public.installation_operations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text,lease_owner text,lease_expires_at timestamptz,fencing_token bigint);
CREATE TABLE public.installation_operation_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operation_id uuid,status text,finished_at timestamptz,fencing_token bigint);
CREATE FUNCTION public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean) RETURNS boolean LANGUAGE sql AS 'SELECT true';
INSERT INTO public.installation_operations(status) VALUES('pending');
SQL
run_sql(){ "${PSQL[@]}" --set expected_commit_sha=commit --set expected_contract_sha256="$(printf 'a%.0s' {1..64})" --file "$ROOT/supabase/master/005_activate_cron_37.sql" >/dev/null 2>&1; }
# Freeze ativo bloqueia e preserva jobs/operação pending.
if run_sql; then exit 1; fi
"${PSQL[@]}" -Atc "SELECT active FROM cron.job WHERE jobid=37" | grep -qx f
"${PSQL[@]}" -Atc "SELECT status FROM public.installation_operations" | grep -qx pending
# Contrato divergente bloqueia com freeze inativo.
"${PSQL[@]}" -c "UPDATE public.installation_operations_freeze SET frozen=false; UPDATE public.control_plane_release_state SET pinned_commit_sha='wrong'" >/dev/null
if run_sql; then exit 1; fi
# Concorrência bloqueia.
"${PSQL[@]}" -c "UPDATE public.control_plane_release_state SET pinned_commit_sha='commit'; INSERT INTO public.installation_operation_attempts(operation_id,status) SELECT id,'running' FROM public.installation_operations LIMIT 1" >/dev/null
if run_sql; then exit 1; fi
"${PSQL[@]}" -c "DELETE FROM public.installation_operation_attempts" >/dev/null
# Lease residual terminal, expirado e fenced é histórico seguro; não é limpo.
"${PSQL[@]}" -c "INSERT INTO public.installation_operations(status,lease_owner,lease_expires_at,fencing_token) VALUES('failed','old-worker',now()-interval '1 hour',4); INSERT INTO public.installation_operation_attempts(operation_id,status,finished_at,fencing_token) SELECT id,'interrupted',now()-interval '1 hour',4 FROM public.installation_operations WHERE status='failed'" >/dev/null
run_sql
"${PSQL[@]}" -Atc "SELECT concat_ws(',',(SELECT active FROM cron.job WHERE jobid=37),(SELECT active FROM cron.job WHERE jobid=38),(SELECT count(*) FROM public.installation_operations WHERE status='pending'),(SELECT count(*) FROM public.installation_operations WHERE status='failed' AND lease_owner='old-worker'))" | grep -qx 't,f,1,1'
echo 'cron 37 PostgreSQL local: PASS'
