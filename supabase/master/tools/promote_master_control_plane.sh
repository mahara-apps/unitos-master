#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MODE="${1:-}"

if [[ "$MODE" != "--converge-existing" && "$MODE" != "--bootstrap-clean" && "$MODE" != "--recover-missing-1.4.10" ]]; then
  echo "Uso: $0 --converge-existing|--bootstrap-clean|--recover-missing-1.4.10" >&2
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

if [[ "$MODE" == "--recover-missing-1.4.10" ]]; then
  if [[ "${UNITOS_MASTER_RECOVERY:-}" != "RECOVER_MISSING_1_4_10_ONLY" ]]; then
    echo "Bloqueado: recuperação exige confirmação específica" >&2
    exit 2
  fi
  if [[ "${MASTER_PROJECT_REF:-}" != "tkjbhttylouamqxnbfgv" ]]; then
    echo "Bloqueado: identidade do Master não coincide com o manifesto" >&2
    exit 2
  fi
  python3 - "$MASTER_DATABASE_URL" "$MASTER_PROJECT_REF" <<'PY'
import sys
from urllib.parse import urlparse
parsed = urlparse(sys.argv[1])
ref = sys.argv[2]
host = parsed.hostname or ""
user = parsed.username or ""
if host != f"db.{ref}.supabase.co" and not (host.endswith(".pooler.supabase.com") and user.endswith(f".{ref}")):
    raise SystemExit("Bloqueado: conexão não identifica exatamente o projeto Master")
PY
  python3 "$ROOT/supabase/master/tools/build_master_recovery.py" --check
  if ! command -v supabase >/dev/null 2>&1; then
    echo "Bloqueado: Supabase CLI oficial ausente" >&2
    exit 2
  fi
  PREFLIGHT="$(mktemp)"
  DRY_RUN="$(mktemp)"
  STAGE="$(mktemp -d)"
  trap 'rm -f "$PREFLIGHT" "$DRY_RUN"; rm -rf "$STAGE"' EXIT
  psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --csv \
    --file "$ROOT/supabase/master/recovery-control-plane-preflight.sql" > "$PREFLIGHT"
  if grep -q ',FAIL$' "$PREFLIGHT" || [[ "$(grep -c ',PASS$' "$PREFLIGHT")" -ne 16 ]]; then
    echo "Bloqueado: preflight da recuperação encontrou divergências" >&2
    exit 1
  fi
  mkdir -p "$STAGE/supabase/migrations"
  printf 'project_id = "%s"\n' "$MASTER_PROJECT_REF" > "$STAGE/supabase/config.toml"
  REMOTE_VERSIONS="$(psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align --command "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;")"
  while IFS= read -r version; do
    [[ -z "$version" ]] && continue
    if [[ "$version" == "20260917184500" || "$version" == "20260919143000" ]]; then
      echo "Bloqueado: ledger remoto contradiz a fila exclusiva de recuperação" >&2
      exit 1
    fi
    mapfile -t matches < <(find "$ROOT/supabase/migrations" -maxdepth 1 -type f -name "${version}_*.sql" | sort)
    if [[ "${#matches[@]}" -ne 1 ]]; then
      echo "Bloqueado: versão remota $version não possui exatamente um arquivo histórico local" >&2
      exit 1
    fi
    cp "${matches[0]}" "$STAGE/supabase/migrations/"
  done <<< "$REMOTE_VERSIONS"
  if [[ ! -f "$STAGE/supabase/migrations/20260917190721_f04a7c59-5fbb-4ef3-aa75-044844da8fa3.sql" ]]; then
    echo "Bloqueado: histórico temporário não contém a 1.4.11 já aplicada" >&2
    exit 1
  fi
  cp "$ROOT/supabase/master/recovery/20260919143000_recover_missing_legacy_reconciliation.sql" "$STAGE/supabase/migrations/"
  if find "$STAGE/supabase/migrations" -maxdepth 1 -type f \( -name '20260917184500_*.sql' -o -name '20260919143000_*.sql' ! -name '20260919143000_recover_missing_legacy_reconciliation.sql' \) | grep -q .; then
    echo "Bloqueado: fila temporária contém migration proibida" >&2
    exit 1
  fi
  supabase db push --db-url "$MASTER_DATABASE_URL" --workdir "$STAGE" --dry-run > "$DRY_RUN" 2>&1
  mapfile -t SELECTED < <(grep -Eo '[0-9]{14}[^[:space:]]*\.sql' "$DRY_RUN" | sort -u)
  if [[ "${#SELECTED[@]}" -ne 1 || "${SELECTED[0]}" != "20260919143000_recover_missing_legacy_reconciliation.sql" ]]; then
    echo "Bloqueado: executor oficial não selecionou exclusivamente 20260919143000" >&2
    cat "$DRY_RUN" >&2
    exit 1
  fi
  if grep -Eq '20260917184500|20260917190721' "$DRY_RUN"; then
    echo "Bloqueado: executor tentou selecionar 1.4.10 ou reaplicar 1.4.11" >&2
    exit 1
  fi
  supabase db push --db-url "$MASTER_DATABASE_URL" --workdir "$STAGE"
  LEDGER_STATE="$(psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align --command "SELECT concat_ws(',', count(*) FILTER (WHERE version='20260917184500'), count(*) FILTER (WHERE version='20260917190721'), count(*) FILTER (WHERE version='20260919143000')) FROM supabase_migrations.schema_migrations;")"
  if [[ "$LEDGER_STATE" != "0,1,1" ]]; then
    echo "Falha: executor oficial não preservou o ledger esperado (1.4.10=0, 1.4.11=1, recuperação=1)" >&2
    exit 1
  fi
  SQL=""
elif [[ "$MODE" == "--bootstrap-clean" ]]; then
  SQL="$ROOT/supabase/master/bootstrap-control-plane.sql"
else
  SQL="$ROOT/supabase/master/convergence-control-plane.sql"
fi

if [[ -n "$SQL" ]]; then
  psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --single-transaction --file "$SQL"
fi

REPORT="$(mktemp)"
trap 'rm -f "$REPORT" "${PREFLIGHT:-}"' EXIT
psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --csv \
  --file "$ROOT/supabase/install/verify-installation-master.sql" > "$REPORT"
if grep -q ',FAIL$' "$REPORT"; then
  echo "Falha: verificador Master encontrou divergências" >&2
  exit 1
fi
echo "Promoção Master concluída e verificada"