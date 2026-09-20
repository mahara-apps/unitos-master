#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MODE="${1:-}"
SUPABASE_CLI_VERSION="2.117.0"
SUPABASE_CLI="${UNITOS_SUPABASE_CLI:-$ROOT/node_modules/.bin/supabase}"

if [[ "$#" -ne 1 ]]; then
  echo "Bloqueado: informe exatamente um modo, sem parâmetros adicionais" >&2
  exit 2
fi
if [[ "$MODE" != "--converge-existing" && "$MODE" != "--bootstrap-clean" && "$MODE" != "--install-global-freeze" && "$MODE" != "--install-deterministic-update" && "$MODE" != "--recover-missing-1.4.10" ]]; then
  echo "Uso: $0 --converge-existing|--bootstrap-clean|--install-global-freeze|--install-deterministic-update|--recover-missing-1.4.10" >&2
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

# Toda promoção neste executor altera o Control-plane compartilhado. Portanto,
# a exceção por instalação nunca é aceita aqui, inclusive para recovery.
python3 "$ROOT/supabase/master/tools/verify_master_backup_gate.py" --scope global

python3 "$ROOT/supabase/master/tools/build_master_bootstrap.py" --check
python3 "$ROOT/supabase/master/tools/build_control_plane_contract.py" --check

if [[ "$MODE" == "--recover-missing-1.4.10" || "$MODE" == "--install-global-freeze" || "$MODE" == "--install-deterministic-update" ]]; then
  if [[ "${MASTER_PROJECT_REF:-}" != "tkjbhttylouamqxnbfgv" ]]; then
    echo "Bloqueado: identidade do Master não coincide com o manifesto" >&2
    exit 2
  fi
  python3 - "$MASTER_DATABASE_URL" "$MASTER_PROJECT_REF" <<'PY'
import sys
from urllib.parse import urlparse
parsed = urlparse(sys.argv[1]); ref = sys.argv[2]
host = parsed.hostname or ""; user = parsed.username or ""
if host != f"db.{ref}.supabase.co" and not (host.endswith(".pooler.supabase.com") and user.endswith(f".{ref}")):
    raise SystemExit("Bloqueado: conexão não identifica exatamente o projeto Master")
PY
fi

if [[ "$MODE" == "--recover-missing-1.4.10" ]]; then
  if [[ "${UNITOS_MASTER_RECOVERY:-}" != "RECOVER_MISSING_1_4_10_ONLY" ]]; then
    echo "Bloqueado: recuperação exige confirmação específica" >&2
    exit 2
  fi
  python3 "$ROOT/supabase/master/tools/build_master_recovery.py" --check
  python3 "$ROOT/supabase/master/tools/verify_master_recovery_stage.py" --root "$ROOT/supabase"
  if [[ ! -x "$SUPABASE_CLI" ]]; then
    echo "Bloqueado: Supabase CLI oficial fixada ausente" >&2
    exit 2
  fi
  if [[ "$($SUPABASE_CLI --version)" != "$SUPABASE_CLI_VERSION" ]]; then
    echo "Bloqueado: Supabase CLI deve ser exatamente $SUPABASE_CLI_VERSION" >&2
    exit 2
  fi
  PREFLIGHT="$(mktemp)"
  DRY_RUN="$(mktemp)"
  LEDGER_SNAPSHOT="$(mktemp)"
  LEDGER_CURRENT="$(mktemp)"
  STAGE="$(mktemp -d)"
  trap 'rm -f "$PREFLIGHT" "$DRY_RUN" "$LEDGER_SNAPSHOT" "$LEDGER_CURRENT"; rm -rf "$STAGE"' EXIT
  psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --csv \
    --file "$ROOT/supabase/master/recovery-control-plane-preflight.sql" > "$PREFLIGHT"
  if grep -q ',FAIL$' "$PREFLIGHT" || [[ "$(grep -c ',PASS$' "$PREFLIGHT")" -ne 17 ]]; then
    echo "Bloqueado: preflight da recuperação encontrou divergências" >&2
    exit 1
  fi
  mkdir -p "$STAGE/supabase/migrations"
  printf 'project_id = "%s"\n' "$MASTER_PROJECT_REF" > "$STAGE/supabase/config.toml"
  read_ledger() {
    psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align \
      --command "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;"
  }
  read_ledger > "$LEDGER_SNAPSHOT"
  REMOTE_VERSIONS="$(cat "$LEDGER_SNAPSHOT")"
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
  python3 "$ROOT/supabase/master/tools/verify_master_recovery_stage.py" \
    --root "$ROOT/supabase" --stage "$STAGE" --ledger "$LEDGER_SNAPSHOT"
  stage_sha256() {
    python3 - "$STAGE" <<'PY'
import hashlib
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
digest = hashlib.sha256()
for path in sorted(item for item in root.rglob("*") if item.is_file()):
    relative = path.relative_to(root).as_posix().encode("utf-8")
    content = path.read_bytes()
    digest.update(len(relative).to_bytes(8, "big"))
    digest.update(relative)
    digest.update(len(content).to_bytes(8, "big"))
    digest.update(content)
print(digest.hexdigest())
PY
  }
  STAGE_SHA256="$(stage_sha256)"
  "$SUPABASE_CLI" db push --db-url "$MASTER_DATABASE_URL" --workdir "$STAGE" --dry-run > "$DRY_RUN" 2>&1
  if [[ "$(grep -Fxc 'DRY RUN: migrations will *not* be pushed to the database.' "$DRY_RUN")" -ne 1 ]] \
    || [[ "$(grep -Fxc 'Finished supabase db push.' "$DRY_RUN")" -ne 1 ]]; then
    echo "Bloqueado: formato do dry-run diverge da Supabase CLI $SUPABASE_CLI_VERSION" >&2
    cat "$DRY_RUN" >&2
    exit 1
  fi
  mapfile -t SELECTED < <(sed -n 's/^Would push migration \([0-9]\{14\}[^[:space:]]*\.sql\)\.\.\.$/\1/p' "$DRY_RUN")
  if [[ "${#SELECTED[@]}" -ne 1 || "${SELECTED[0]}" != "20260919143000_recover_missing_legacy_reconciliation.sql" ]]; then
    echo "Bloqueado: executor oficial não selecionou exclusivamente 20260919143000" >&2
    cat "$DRY_RUN" >&2
    exit 1
  fi
  if grep -Eq '20260917184500|20260917190721' "$DRY_RUN"; then
    echo "Bloqueado: executor tentou selecionar 1.4.10 ou reaplicar 1.4.11" >&2
    exit 1
  fi
  read_ledger > "$LEDGER_CURRENT"
  if ! cmp -s "$LEDGER_SNAPSHOT" "$LEDGER_CURRENT"; then
    echo "Bloqueado: ledger foi alterado concorrentemente após o dry-run" >&2
    exit 1
  fi
  python3 "$ROOT/supabase/master/tools/verify_master_recovery_stage.py" \
    --root "$ROOT/supabase" --stage "$STAGE" --ledger "$LEDGER_SNAPSHOT"
  if [[ "$(stage_sha256)" != "$STAGE_SHA256" ]]; then
    echo "Bloqueado: staging foi alterado entre o selo e a execução" >&2
    exit 1
  fi
  read_ledger > "$LEDGER_CURRENT"
  if ! cmp -s "$LEDGER_SNAPSHOT" "$LEDGER_CURRENT"; then
    echo "Bloqueado: ledger foi alterado concorrentemente antes da execução" >&2
    exit 1
  fi
  "$SUPABASE_CLI" db push --db-url "$MASTER_DATABASE_URL" --workdir "$STAGE"
  LEDGER_STATE="$(psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align --command "SELECT concat_ws(',', count(*) FILTER (WHERE version='20260917184500'), count(*) FILTER (WHERE version='20260917190721'), count(*) FILTER (WHERE version='20260919143000')) FROM supabase_migrations.schema_migrations;")"
  if [[ "$LEDGER_STATE" != "0,1,1" ]]; then
    echo "Falha: executor oficial não preservou o ledger esperado (1.4.10=0, 1.4.11=1, recuperação=1)" >&2
    exit 1
  fi
  SQL=""
elif [[ "$MODE" == "--install-global-freeze" ]]; then
  if [[ "${UNITOS_MASTER_FREEZE_INSTALL:-}" != "INSTALL_GLOBAL_FREEZE_ONLY" ]]; then
    echo "Bloqueado: instalação do freeze exige confirmação específica" >&2
    exit 2
  fi
  SQL="$ROOT/supabase/master/002_control_plane_global_freeze.sql"
elif [[ "$MODE" == "--install-deterministic-update" ]]; then
  if [[ "${UNITOS_MASTER_DETERMINISTIC_UPDATE_INSTALL:-}" != "INSTALL_DETERMINISTIC_UPDATE_ONLY" ]]; then
    echo "Bloqueado: instalação do executor determinístico exige confirmação específica" >&2
    exit 2
  fi
  PREFLIGHT="$(mktemp)"
  trap 'rm -f "$PREFLIGHT"' EXIT
  psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --csv \
    --file "$ROOT/supabase/master/deterministic-update-install-preflight.sql" > "$PREFLIGHT"
  if grep -q ',FAIL$' "$PREFLIGHT" || [[ "$(grep -c ',PASS$' "$PREFLIGHT")" -ne 5 ]]; then
    echo "Bloqueado: preflight do executor determinístico encontrou divergências" >&2
    exit 1
  fi
  SQL="$ROOT/supabase/master/install-deterministic-update.sql"
elif [[ "$MODE" == "--bootstrap-clean" ]]; then
  SQL="$ROOT/supabase/master/bootstrap-control-plane.sql"
else
  SQL="$ROOT/supabase/master/convergence-control-plane.sql"
fi

if [[ -n "$SQL" ]]; then
  psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --single-transaction --file "$SQL"
fi

REPORT="$(mktemp)"
trap 'rm -f "$REPORT" "${PREFLIGHT:-}" "${DRY_RUN:-}" "${LEDGER_SNAPSHOT:-}" "${LEDGER_CURRENT:-}"; [[ -z "${STAGE:-}" ]] || rm -rf "$STAGE"' EXIT
psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --csv \
  --file "$ROOT/supabase/install/verify-installation-master.sql" > "$REPORT"
if grep -q ',FAIL$' "$REPORT"; then
  echo "Falha: verificador Master encontrou divergências" >&2
  exit 1
fi
echo "Promoção Master concluída e verificada"