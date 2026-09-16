#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DISPOSABLE_DB_URL:?Defina SUPABASE_DISPOSABLE_DB_URL para um projeto Supabase vazio e descartável.}"

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PSQL=(psql "$SUPABASE_DISPOSABLE_DB_URL" -v ON_ERROR_STOP=1 -X)

# Exercita os três estados reais de entrada antes do baseline: ausente,
# previamente instalada em `extensions` e já canônica em `public`.
"${PSQL[@]}" -c "DROP EXTENSION IF EXISTS vector;"
"${PSQL[@]}" -f "$ROOT/supabase/baseline-snapshot/000_extensions.sql"
"${PSQL[@]}" -c "DO \$verify_vector\$ BEGIN IF to_regtype('public.vector') IS NULL OR NOT EXISTS (SELECT 1 FROM pg_opclass oc JOIN pg_namespace n ON n.oid = oc.opcnamespace WHERE n.nspname = 'public' AND oc.opcname = 'vector_cosine_ops') THEN RAISE EXCEPTION 'public.vector pós-condição ausente'; END IF; END \$verify_vector\$;"
"${PSQL[@]}" -c "ALTER EXTENSION vector SET SCHEMA extensions;"
"${PSQL[@]}" -f "$ROOT/supabase/baseline-snapshot/000_extensions.sql"
"${PSQL[@]}" -c "DO \$verify_vector\$ BEGIN IF to_regtype('public.vector') IS NULL OR NOT EXISTS (SELECT 1 FROM pg_opclass oc JOIN pg_namespace n ON n.oid = oc.opcnamespace WHERE n.nspname = 'public' AND oc.opcname = 'vector_cosine_ops') THEN RAISE EXCEPTION 'public.vector pós-condição ausente'; END IF; END \$verify_vector\$;"
"${PSQL[@]}" -f "$ROOT/supabase/baseline-snapshot/000_extensions.sql"

for file in \
  001_initial_schema.sql \
  005_auth_trigger.sql \
  007_delta_migrations.sql \
  003_storage_buckets.sql \
  006_storage_policies.sql \
  004_seeds.sql
do
  "${PSQL[@]}" -f "$ROOT/supabase/baseline-snapshot/$file"
done

"${PSQL[@]}" -f "$ROOT/supabase/install/020_cron.sql"
"${PSQL[@]}" -f "$ROOT/supabase/install/verify-installation.sql"