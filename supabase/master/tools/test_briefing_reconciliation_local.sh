#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP_ROOT="$(mktemp -d /tmp/unitos-briefing-reconciliation.XXXXXX)"
PGDATA="$TMP_ROOT/data"
SOCKET_DIR="$TMP_ROOT/socket"
PORT="$((57900 + RANDOM % 300))"
LOG="$TMP_ROOT/postgres.log"
trap 'setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP_ROOT"' EXIT

mkdir -p "$PGDATA" "$SOCKET_DIR"
chown -R 1000:1000 "$TMP_ROOT"
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$PGDATA" --no-locale --encoding=UTF8 >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$PGDATA" -o "-k $SOCKET_DIR -p $PORT" -l "$LOG" start >/dev/null
PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PORT" -U lovable postgres)

"${PSQL[@]}" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.posts (id uuid PRIMARY KEY, design_brief text);
CREATE OR REPLACE FUNCTION public.jsonb_object_length(value jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE STRICT
SET search_path = pg_catalog, public
AS $$ SELECT count(*)::integer FROM pg_catalog.jsonb_object_keys(value) $$;
REVOKE ALL ON FUNCTION public.jsonb_object_length(jsonb) FROM public, anon, authenticated;
SQL

"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260925005926_294912da-2c88-4927-9af7-98c2e524c156.sql" >/dev/null

"${PSQL[@]}" <<'SQL'
INSERT INTO public.posts (id, design_brief) VALUES
  ('00000000-0000-0000-0000-000000000001', '{"visual_direction":"Direção visual inequívoca com mais de vinte caracteres."}'),
  ('00000000-0000-0000-0000-000000000002', '{"visual_direction":"Direção principal longa e válida","caption":"preservar envelope ambíguo"}'),
  ('00000000-0000-0000-0000-000000000003', '{"visual_direction":"Cena com "aspas internas" e descrição suficientemente longa"}');
SQL

"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260925005926_294912da-2c88-4927-9af7-98c2e524c156.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260925005926_294912da-2c88-4927-9af7-98c2e524c156.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260925014000_c7f2e2d1-702d-4830-b298-513b6599fe88.sql" >/dev/null

RESULT="$(${PSQL[@]} -Atc "select concat_ws('|', (select design_brief from public.posts where id='00000000-0000-0000-0000-000000000001'), (select design_brief like '%caption%' from public.posts where id='00000000-0000-0000-0000-000000000002'), (select design_brief from public.posts where id='00000000-0000-0000-0000-000000000003'), to_regprocedure('public.jsonb_object_length(jsonb)') is null)")"
EXPECTED='Direção visual inequívoca com mais de vinte caracteres.|t|Cena com "aspas internas" e descrição suficientemente longa|t'
if [[ "$RESULT" != "$EXPECTED" ]]; then
  echo "FAIL: reconciliação do briefing divergiu: $RESULT" >&2
  exit 1
fi
echo "PASS: briefing reconciliado, ambíguo preservado, repetição idempotente e ponte removida"