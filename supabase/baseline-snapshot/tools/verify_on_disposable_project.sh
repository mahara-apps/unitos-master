#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DISPOSABLE_DB_URL:?Defina SUPABASE_DISPOSABLE_DB_URL para um projeto Supabase vazio e descartável.}"

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PSQL=(psql "$SUPABASE_DISPOSABLE_DB_URL" -v ON_ERROR_STOP=1 -X)

for file in \
  000_extensions.sql \
  001_initial_schema.sql \
  005_auth_trigger.sql \
  007_delta_migrations.sql \
  003_storage_policies.sql \
  006_storage_seed.sql \
  004_seeds.sql
do
  "${PSQL[@]}" -f "$ROOT/supabase/baseline-snapshot/$file"
done

"${PSQL[@]}" -f "$ROOT/supabase/install/020_cron.sql"
"${PSQL[@]}" -f "$ROOT/supabase/install/verify-installation.sql"