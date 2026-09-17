#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MODE="${1:-}"

if [[ "$MODE" != "--converge-existing" && "$MODE" != "--bootstrap-clean" ]]; then
  echo "Uso: $0 --converge-existing|--bootstrap-clean" >&2
  exit 2
fi
if [[ "${UNITOS_MASTER_PROMOTION:-}" != "I_UNDERSTAND_MASTER_ONLY" ]]; then
  echo "Bloqueado: defina UNITOS_MASTER_PROMOTION=I_UNDERSTAND_MASTER_ONLY" >&2
  exit 2
fi
if [[ -z "${MASTER_DATABASE_URL:-}" ]]; then
  echo "Bloqueado: MASTER_DATABASE_URL ausente" >&2
  exit 2
fi

python3 "$ROOT/supabase/master/tools/build_master_bootstrap.py" --check

if [[ "$MODE" == "--bootstrap-clean" ]]; then
  SQL="$ROOT/supabase/master/bootstrap-control-plane.sql"
else
  SQL="$ROOT/supabase/master/convergence-control-plane.sql"
fi

psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --single-transaction --file "$SQL"

REPORT="$(mktemp)"
trap 'rm -f "$REPORT"' EXIT
psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --csv \
  --file "$ROOT/supabase/install/verify-installation-master.sql" > "$REPORT"
if grep -q ',FAIL$' "$REPORT"; then
  echo "Falha: verificador Master encontrou divergências" >&2
  exit 1
fi
echo "Promoção Master concluída e verificada"