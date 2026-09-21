#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ACTION="${1:-}"
EXPECTED_REF="tkjbhttylouamqxnbfgv"

if [[ "$#" -ne 1 || ( "$ACTION" != "status" && "$ACTION" != "freeze" && "$ACTION" != "unfreeze" ) ]]; then
  echo "Uso: $0 status|freeze|unfreeze" >&2
  exit 2
fi
if [[ -z "${MASTER_DATABASE_URL:-}" ]]; then
  echo "Bloqueado: MASTER_DATABASE_URL ausente" >&2
  exit 2
fi
if [[ "${MASTER_PROJECT_REF:-}" != "$EXPECTED_REF" ]]; then
  echo "Bloqueado: identidade do Master não coincide" >&2
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

PSQL=(psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align)
if [[ "$ACTION" == "status" ]]; then
  "${PSQL[@]}" --command "SELECT public.read_installation_operations_freeze();"
  exit 0
fi

if [[ "${UNITOS_MASTER_FREEZE:-}" != "I_UNDERSTAND_GLOBAL_CONTROL_PLANE_FREEZE" ]]; then
  echo "Bloqueado: alteração exige UNITOS_MASTER_FREEZE=I_UNDERSTAND_GLOBAL_CONTROL_PLANE_FREEZE" >&2
  exit 2
fi
if [[ -z "${UNITOS_FREEZE_REASON:-}" || -z "${UNITOS_FREEZE_ACTOR:-}" ]]; then
  echo "Bloqueado: motivo e responsável são obrigatórios" >&2
  exit 2
fi

# Freeze e unfreeze alteram o Control-plane compartilhado. O gate aceita
# somente uma decisão global auditável para o Master canônico.
python3 "$ROOT/supabase/master/tools/verify_master_backup_gate.py" --scope global

STATE="$("${PSQL[@]}" --command "SELECT frozen::text||','||generation::text FROM public.installation_operations_freeze WHERE singleton IS TRUE;")"
IFS=',' read -r FROZEN GENERATION <<< "$STATE"
TARGET=true
[[ "$ACTION" == "unfreeze" ]] && TARGET=false
if [[ "$FROZEN" == "$TARGET" ]]; then
  echo "Bloqueado: congelamento já está no estado solicitado" >&2
  exit 1
fi

"${PSQL[@]}" --set frozen="$TARGET" --set generation="$GENERATION" \
  --set reason="$UNITOS_FREEZE_REASON" --set actor="$UNITOS_FREEZE_ACTOR" <<'SQL'
SELECT public.set_installation_operations_freeze(
  :'frozen'::boolean,
  :'reason',
  :'actor',
  :'generation'::bigint
);
SQL

EXPECTED="$( [[ "$TARGET" == true ]] && echo true || echo false )"
VERIFIED="$("${PSQL[@]}" --command "SELECT frozen::text FROM public.installation_operations_freeze WHERE singleton IS TRUE;")"
if [[ "$VERIFIED" != "$EXPECTED" ]]; then
  echo "Falha: estado final do congelamento não foi confirmado" >&2
  exit 1
fi
echo "Congelamento global confirmado: $ACTION"