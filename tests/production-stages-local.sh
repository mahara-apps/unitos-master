#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_ROOT="$(mktemp -d /tmp/unitos-production-stages.XXXXXX)"
PGDATA="$TMP_ROOT/data"
SOCKET_DIR="$TMP_ROOT/socket"
PORT="$((58400 + RANDOM % 300))"
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
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
CREATE TABLE public.brands(id uuid PRIMARY KEY);
CREATE TABLE public.clients(id uuid PRIMARY KEY, brand_id uuid NOT NULL REFERENCES brands(id), name text);
CREATE TABLE public.content_pipelines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),brand_id uuid NOT NULL REFERENCES brands(id),client_id uuid NOT NULL REFERENCES clients(id),name text,slug text,is_default boolean DEFAULT false,position int DEFAULT 0,created_by uuid,deleted_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.content_pipeline_stages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pipeline_id uuid NOT NULL REFERENCES content_pipelines(id),key text,label text,color text,position int,is_terminal boolean DEFAULT false,hide_in_portal boolean DEFAULT false,enables_approval_link boolean DEFAULT false,sla_hours int,sla_days int,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),unique(pipeline_id,key));
CREATE TABLE public.posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pipeline_id uuid REFERENCES content_pipelines(id),stage_id uuid REFERENCES content_pipeline_stages(id),deleted_at timestamptz,stage_entered_at timestamptz DEFAULT now(),copy text,review_status text);
CREATE FUNCTION public.app_access_role(u uuid,b uuid) RETURNS text LANGUAGE sql AS $$ SELECT CASE WHEN u='00000000-0000-4000-8000-000000000001' AND b='00000000-0000-4000-8000-000000000010' THEN 'admin' WHEN u='00000000-0000-4000-8000-000000000002' THEN 'manager' ELSE 'user' END $$;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
SQL
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261015013546_e1d5b4e2-a352-464b-b42a-e11740773fd2.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261015013807_e63d8e36-33bc-4c92-a852-ade3ef2114fa.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/tests/production-stages.contract.sql"
echo "PASS: production stages SQL contracts"
