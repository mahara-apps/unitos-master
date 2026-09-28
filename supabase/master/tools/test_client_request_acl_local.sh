#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP_ROOT="$(mktemp -d /tmp/unitos-request-acl.XXXXXX)"
PGDATA="$TMP_ROOT/data"; SOCKET_DIR="$TMP_ROOT/socket"; PORT="$((58000 + RANDOM % 500))"; LOG="$TMP_ROOT/postgres.log"
cleanup() { if test -f "$PGDATA/postmaster.pid"; then setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; fi; rm -rf "$TMP_ROOT"; }
trap cleanup EXIT
mkdir -p "$PGDATA" "$SOCKET_DIR"; chown -R lovable:lovable "$TMP_ROOT"
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$PGDATA" --no-locale --encoding=UTF8 >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$PGDATA" -l "$LOG" -o "-F -k $SOCKET_DIR -p $PORT -c listen_addresses=''" start >/dev/null
PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PORT" -U lovable postgres)
"${PSQL[@]}" >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
-- Simulates target default grants that survive the Management API sanitizer.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT REFERENCES, TRIGGER, TRUNCATE ON TABLES TO anon;
CREATE TABLE public.project_duplication_requests(id uuid PRIMARY KEY);
CREATE TABLE public.project_template_requests(id uuid PRIMARY KEY);
GRANT SELECT, INSERT ON public.project_duplication_requests TO authenticated;
GRANT SELECT, INSERT ON public.project_template_requests TO authenticated;
GRANT ALL ON public.project_duplication_requests, public.project_template_requests TO service_role;
SQL
COUNT_SQL="SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name IN ('project_duplication_requests','project_template_requests') AND privilege_type IN ('REFERENCES','TRIGGER','TRUNCATE','MAINTAIN')"
"${PSQL[@]}" -Atc "$COUNT_SQL" | grep -qx 6
MIGRATION="$ROOT/supabase/migrations/20260928020655_d1e488d6-5fae-4b14-a247-721b6047a57b.sql"
for pass in 1 2; do
  "${PSQL[@]}" -f "$MIGRATION" >/dev/null
  "${PSQL[@]}" -Atc "$COUNT_SQL" | grep -qx 0
  "${PSQL[@]}" -Atc "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='authenticated' AND table_schema='public' AND table_name IN ('project_duplication_requests','project_template_requests') AND privilege_type IN ('SELECT','INSERT')" | grep -qx 4
  "${PSQL[@]}" -Atc "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='service_role' AND table_schema='public' AND table_name IN ('project_duplication_requests','project_template_requests') AND privilege_type='SELECT'" | grep -qx 2
done
printf 'request ACL inheritance and replay: PASS\n'
