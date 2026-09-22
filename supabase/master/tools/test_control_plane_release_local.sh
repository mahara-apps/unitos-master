#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP_ROOT="$(mktemp -d /tmp/unitos-control-plane-release.XXXXXX)"
PGDATA="$TMP_ROOT/data"; SOCKET_DIR="$TMP_ROOT/socket"; PORT="$((57000 + RANDOM % 500))"; LOG="$TMP_ROOT/postgres.log"
cleanup(){ if test -f "$PGDATA/postmaster.pid"; then setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; fi; rm -rf "$TMP_ROOT"; }
trap cleanup EXIT
mkdir -p "$PGDATA" "$SOCKET_DIR"; chown -R lovable:lovable "$TMP_ROOT"
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$PGDATA" --no-locale --encoding=UTF8 >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$PGDATA" -l "$LOG" -o "-F -k $SOCKET_DIR -p $PORT -c listen_addresses=''" start >/dev/null
PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PORT" -U lovable postgres)
"${PSQL[@]}" >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
INSERT INTO supabase_migrations.schema_migrations VALUES ('20260919143000');
CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS 'SELECT false';
CREATE TABLE public.installation_operations_freeze(singleton boolean PRIMARY KEY CHECK(singleton),frozen boolean,generation bigint);
INSERT INTO public.installation_operations_freeze VALUES(true,true,1);
CREATE TABLE public.installation_migration_reconciliation_evidence(id uuid);
CREATE FUNCTION public.finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean) RETURNS boolean LANGUAGE sql AS 'SELECT true';
SQL
"${PSQL[@]}" --file "$ROOT/supabase/master/004_control_plane_release_promotion.sql" >/dev/null
"${PSQL[@]}" -c "INSERT INTO public.control_plane_release_state(singleton,current_version,pinned_release,pinned_commit_sha,generation) VALUES(true,'1.3.71','1.3.72','old',0)" >/dev/null
EVIDENCE='{"contractValidated":true,"freezeValidated":true,"executorValidated":true,"recoveryValidated":true,"ledgerValidated":true}'
# Evidência incompleta falha e não grava evento.
if "${PSQL[@]}" -c "SELECT public.promote_control_plane_release(0,'1.3.71','1.3.72','old','1.4.27','new',repeat('a',64),'{\"contractValidated\":true}'::jsonb,'test')" >/dev/null 2>&1; then exit 1; fi
"${PSQL[@]}" -Atc "SELECT count(*) FROM public.control_plane_release_events" | grep -qx 0
# Promoção válida é atômica e preserva os valores anteriores no evento.
"${PSQL[@]}" -c "SELECT public.promote_control_plane_release(0,'1.3.71','1.3.72','old','1.4.27','new',repeat('a',64),'$EVIDENCE'::jsonb,'test')" >/dev/null
"${PSQL[@]}" -Atc "SELECT concat_ws(',',current_version,pinned_release,pinned_commit_sha,generation) FROM public.control_plane_release_state" | grep -qx '1.4.27,1.4.27,new,1'
"${PSQL[@]}" -Atc "SELECT concat_ws(',',previous_current_version,previous_pinned_release,previous_pinned_commit_sha) FROM public.control_plane_release_events" | grep -qx '1.3.71,1.3.72,old'
# Geração divergente/concorrrente é recusada sem novo evento.
if "${PSQL[@]}" -c "SELECT public.promote_control_plane_release(0,'1.4.27','1.4.27','new','1.4.27','newer',repeat('b',64),'$EVIDENCE'::jsonb,'test')" >/dev/null 2>&1; then exit 1; fi
"${PSQL[@]}" -Atc "SELECT count(*) FROM public.control_plane_release_events" | grep -qx 1
# A advisory lock serializa concorrentes: timeout local não altera geração.
("${PSQL[@]}" -c "BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('unitos:master:control-plane-promotion',0)); SELECT pg_sleep(2); COMMIT;" >/dev/null) & holder=$!
for _ in $(seq 1 20); do "${PSQL[@]}" -Atc "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted" | grep -qv '^0$' && break; sleep 0.05; done
if PGOPTIONS='-c statement_timeout=200' "${PSQL[@]}" -c "SELECT public.promote_control_plane_release(1,'1.4.27','1.4.27','new','1.4.27','newer',repeat('b',64),'$EVIDENCE'::jsonb,'test')" >/dev/null 2>&1; then kill "$holder" 2>/dev/null || true; exit 1; fi
wait "$holder"
"${PSQL[@]}" -Atc "SELECT generation FROM public.control_plane_release_state" | grep -qx 1
echo 'control-plane release PostgreSQL local: PASS'
