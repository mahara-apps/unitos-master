#!/usr/bin/env bash
# Ensaio local da liberação de clientes por pessoa (set_member_clients):
# hierarquia, "Todos os clientes" com clientes futuros, preservação fora do
# escopo, Portal intocado, idempotência e bloqueio de escrita direta.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP_ROOT="$(mktemp -d /tmp/unitos-member-clients.XXXXXX)"
PGDATA="$TMP_ROOT/data"; SOCKET_DIR="$TMP_ROOT/socket"; PORT="$((58500 + RANDOM % 400))"; LOG="$TMP_ROOT/postgres.log"
cleanup() { if test -f "$PGDATA/postmaster.pid"; then setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; fi; rm -rf "$TMP_ROOT"; }
trap cleanup EXIT
mkdir -p "$PGDATA" "$SOCKET_DIR"; chown -R lovable:lovable "$TMP_ROOT"
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$PGDATA" --no-locale --encoding=UTF8 >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$PGDATA" -l "$LOG" -o "-F -k $SOCKET_DIR -p $PORT -c listen_addresses=''" start >/dev/null
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PORT" -U lovable postgres)
"${PSQL[@]}" >/dev/null <<'SQL'
SET check_function_bodies = off;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated;
CREATE TABLE public.clients(id uuid PRIMARY KEY, brand_id uuid NOT NULL, owner_user_id uuid, name text);
CREATE TABLE public.brand_members(brand_id uuid, user_id uuid, role text, is_active boolean DEFAULT true, permissions jsonb DEFAULT '[]', PRIMARY KEY(brand_id,user_id));
CREATE TABLE public.client_members(id uuid DEFAULT gen_random_uuid(), brand_id uuid, client_id uuid, user_id uuid, role text, created_by uuid, UNIQUE(client_id,user_id));
CREATE TABLE public.critical_action_events(id uuid DEFAULT gen_random_uuid(), actor_id uuid, action_key text, target_type text, target_id text, target_label text, brand_id uuid, impact jsonb DEFAULT '{}', result text DEFAULT 'success', error_message text, created_at timestamptz DEFAULT now());
CREATE TABLE public.brand_invites(id uuid PRIMARY KEY, brand_id uuid, email text, role text, permissions jsonb, token text, invited_by uuid, accepted_at timestamptz, accepted_by uuid, expires_at timestamptz, revoked_at timestamptz);
CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.can_invite_brand_role(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.app_access_role(_u uuid, _b uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE role WHEN 'owner' THEN 'admin' WHEN 'admin' THEN 'admin' WHEN 'manager' THEN 'manager' ELSE 'user' END
    FROM public.brand_members WHERE user_id=_u AND brand_id=_b AND is_active $$;
CREATE FUNCTION public.is_client_assigned(_u uuid, _c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM public.clients WHERE id=_c AND owner_user_id=_u)
      OR EXISTS(SELECT 1 FROM public.client_members WHERE client_id=_c AND user_id=_u AND role<>'portal_client') $$;
CREATE FUNCTION public.can_access_client(_c uuid, _u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.can_access_client_row(c.id, c.brand_id, c.owner_user_id, _u) FROM public.clients c WHERE c.id=_c $$;
SQL
MIG="$(ls "$ROOT"/supabase/migrations/*.sql | xargs grep -l "FUNCTION public._apply_member_clients" | tail -1)"
"${PSQL[@]}" -f "$MIG" >/dev/null
"${PSQL[@]}" -f "$MIG" >/dev/null   # replay idempotente
"${PSQL[@]}" >/dev/null <<'SQL'
GRANT SELECT, UPDATE ON public.brand_members TO authenticated;
-- B workspace; A admin; M manager (só c1); M2 manager; U user; U2 user; P portal em c3
INSERT INTO public.brand_members(brand_id,user_id,role) VALUES
 ('b0000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000000','admin'),
 ('b0000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000000','manager'),
 ('b0000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000000','manager'),
 ('b0000000-0000-0000-0000-000000000000','30000000-0000-0000-0000-000000000000','user'),
 ('b0000000-0000-0000-0000-000000000000','40000000-0000-0000-0000-000000000000','user');
INSERT INTO public.clients(id,brand_id) VALUES
 ('c1000000-0000-0000-0000-000000000000','b0000000-0000-0000-0000-000000000000'),
 ('c2000000-0000-0000-0000-000000000000','b0000000-0000-0000-0000-000000000000'),
 ('c3000000-0000-0000-0000-000000000000','b0000000-0000-0000-0000-000000000000');
INSERT INTO public.client_members(brand_id,client_id,user_id,role) VALUES
 ('b0000000-0000-0000-0000-000000000000','c1000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000000','manager'),
 ('b0000000-0000-0000-0000-000000000000','c3000000-0000-0000-0000-000000000000','30000000-0000-0000-0000-000000000000','portal_client');
SQL
B=b0000000-0000-0000-0000-000000000000; A=a0000000-0000-0000-0000-000000000000; M=10000000-0000-0000-0000-000000000000
M2=20000000-0000-0000-0000-000000000000; U=30000000-0000-0000-0000-000000000000; U2=40000000-0000-0000-0000-000000000000
C1=c1000000-0000-0000-0000-000000000000; C2=c2000000-0000-0000-0000-000000000000; C3=c3000000-0000-0000-0000-000000000000
q() { "${PSQL[@]}" -Atc "$1"; }
as() { printf "SELECT set_config('test.uid','%s',false); %s" "$1" "$2"; }
expect_fail() { if "${PSQL[@]}" -Atc "$1" >/dev/null 2>&1; then echo "FAIL (deveria recusar): $2"; exit 1; fi; }
acc() { q "SELECT public.can_access_client('$1','$2')"; }

# 1) Admin seleciona c1,c2 para U
q "$(as $A "SELECT public.set_member_clients('$B','$U',false,ARRAY['$C1','$C2']::uuid[])")" >/dev/null
test "$(acc $C1 $U)" = t; test "$(acc $C2 $U)" = t; test "$(acc $C3 $U)" = f
# idempotente
test "$(q "$(as $A "SELECT public.set_member_clients('$B','$U',false,ARRAY['$C1','$C2']::uuid[])->>'added'")" | tail -1)" = 0
# Portal de c3 intocado
test "$(q "SELECT count(*) FROM public.client_members WHERE client_id='$C3' AND role='portal_client'")" = 1
# 2) Manager M (só c1) não libera c2, nem para outro Manager
expect_fail "$(as $M "SELECT public.set_member_clients('$B','$U2',false,ARRAY['$C2']::uuid[])")" "manager libera fora do escopo"
expect_fail "$(as $M "SELECT public.set_member_clients('$B','$M2',false,ARRAY['$C1']::uuid[])")" "manager libera para manager"
# 3) User não libera
expect_fail "$(as $U "SELECT public.set_member_clients('$B','$U2',false,ARRAY['$C1']::uuid[])")" "user libera"
# 4) Manager ajusta U para só c1: c2 (fora do escopo dele) é preservado
q "$(as $M "SELECT public.set_member_clients('$B','$U',false,ARRAY['$C1']::uuid[])")" >/dev/null
test "$(acc $C2 $U)" = t
# 5) Manager "todos" sem ter "todos": libera só o que ele acessa, sem ligar a marca
q "$(as $M "SELECT public.set_member_clients('$B','$U2',true,'{}'::uuid[])")" >/dev/null
test "$(acc $C1 $U2)" = t; test "$(acc $C2 $U2)" = f
test "$(q "SELECT all_clients FROM public.brand_members WHERE user_id='$U2'")" = f
# 6) Admin liga "Todos os clientes" para U2: vê todos, inclusive cliente novo
q "$(as $A "SELECT public.set_member_clients('$B','$U2',true,'{}'::uuid[])")" >/dev/null
q "INSERT INTO public.clients(id,brand_id) VALUES ('c4000000-0000-0000-0000-000000000000','$B')"
test "$(acc c4000000-0000-0000-0000-000000000000 $U2)" = t
# 7) Manager não desliga o "todos" ligado pelo Admin
expect_fail "$(as $M "SELECT public.set_member_clients('$B','$U2',false,ARRAY['$C1']::uuid[])")" "manager desliga todos"
# 8) Admin desliga: volta para a lista (c1)
q "$(as $A "SELECT public.set_member_clients('$B','$U2',false,ARRAY['$C1']::uuid[])")" >/dev/null
test "$(acc c4000000-0000-0000-0000-000000000000 $U2)" = f; test "$(acc $C1 $U2)" = t
# 9) Escrita direta de all_clients pela API é bloqueada
expect_fail "SET ROLE authenticated; UPDATE public.brand_members SET all_clients=true WHERE user_id='$U'" "update direto"
# 10) papel nunca muda; auditoria registrada
test "$(q "SELECT role FROM public.brand_members WHERE user_id='$U'")" = user
test "$(q "SELECT count(*) > 0 FROM public.critical_action_events WHERE action_key='member.clients'")" = t
# 11) authenticated não executa o núcleo interno
test "$(q "SELECT has_function_privilege('authenticated','public._apply_member_clients(uuid,uuid,uuid,boolean,uuid[])','EXECUTE')")" = f
printf 'member clients hierarchy, all-clients and replay: PASS\n'
