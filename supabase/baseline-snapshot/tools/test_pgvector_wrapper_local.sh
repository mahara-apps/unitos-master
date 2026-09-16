#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP_ROOT="$(mktemp -d /tmp/unitos-pgvector-wrapper.XXXXXX)"
PGDATA="$TMP_ROOT/data"
SOCKET_DIR="$TMP_ROOT/socket"
PORT="$((54000 + RANDOM % 1000))"
LOG="$TMP_ROOT/postgres.log"

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
  -o "-F -k $SOCKET_DIR -p $PORT" start >/dev/null

PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PORT" -U lovable postgres)
WRAPPER="$TMP_ROOT/vector-wrapper.sql"
awk '/^DO \$unitos_vector_schema\$/{capture=1} capture{print} /^\$unitos_vector_schema\$;/{exit}' \
  "$ROOT/supabase/baseline-snapshot/000_extensions.sql" > "$WRAPPER"

assert_ready="
DO \$verify_vector\$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'vector' AND n.nspname = 'public'
  ) OR to_regtype('public.vector') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_opclass oc
    JOIN pg_namespace n ON n.oid = oc.opcnamespace
    WHERE n.nspname = 'public' AND oc.opcname = 'vector_cosine_ops'
  ) THEN
    RAISE EXCEPTION 'pgvector pós-condição ausente';
  END IF;
END
\$verify_vector\$;"

# Ausente: o wrapper cria todos os objetos e o ROLLBACK não deixa resíduos.
{
  echo "BEGIN;"
  cat "$WRAPPER"
  printf '%s\n' "$assert_ready"
  echo "ROLLBACK;"
  echo "DO \$verify_absent\$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN RAISE EXCEPTION 'vector persistiu após rollback'; END IF; END \$verify_absent\$;"
} | "${PSQL[@]}" >/dev/null

# Em extensions: o wrapper reloca para public dentro da transação e o rollback
# preserva exatamente o estado inicial em extensions.
"${PSQL[@]}" -c "CREATE SCHEMA extensions; CREATE EXTENSION vector WITH SCHEMA extensions;" >/dev/null
{
  echo "BEGIN;"
  cat "$WRAPPER"
  printf '%s\n' "$assert_ready"
  echo "ROLLBACK;"
  echo "DO \$verify_rollback\$ BEGIN IF (SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector') IS DISTINCT FROM 'extensions' THEN RAISE EXCEPTION 'rollback não restaurou extensions'; END IF; END \$verify_rollback\$;"
} | "${PSQL[@]}" >/dev/null

# Já em public: duas execuções mantêm o mesmo OID e todas as pós-condições.
"${PSQL[@]}" -c "ALTER EXTENSION vector SET SCHEMA public;" >/dev/null
{
  echo "BEGIN;"
  echo "CREATE TEMP TABLE vector_oid_before AS SELECT oid FROM pg_extension WHERE extname='vector';"
  cat "$WRAPPER"
  cat "$WRAPPER"
  printf '%s\n' "$assert_ready"
  echo "DO \$verify_oid\$ BEGIN IF (SELECT oid FROM pg_extension WHERE extname='vector') IS DISTINCT FROM (SELECT oid FROM vector_oid_before) THEN RAISE EXCEPTION 'wrapper recriou vector'; END IF; END \$verify_oid\$;"
  echo "ROLLBACK;"
} | "${PSQL[@]}" >/dev/null

echo "pgvector wrapper local: PASS"