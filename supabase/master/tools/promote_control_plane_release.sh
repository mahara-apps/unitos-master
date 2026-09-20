#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXPECTED_REF="tkjbhttylouamqxnbfgv"
if [[ "$#" -ne 0 ]]; then echo "Bloqueado: promoção do Control-plane não aceita argumentos" >&2; exit 2; fi
if [[ "${UNITOS_CONTROL_PLANE_PROMOTION:-}" != "PROMOTE_VALIDATED_CONTROL_PLANE_1_4_18_ONLY" ]]; then echo "Bloqueado: autorização específica da promoção ausente" >&2; exit 2; fi
for name in MASTER_DATABASE_URL UNITOS_CONTROL_PLANE_EXPECTED_GENERATION UNITOS_CONTROL_PLANE_TARGET_COMMIT_SHA UNITOS_CONTROL_PLANE_CONTRACT_SHA256 UNITOS_CONTROL_PLANE_PROMOTED_BY; do
  if [[ -z "${!name:-}" ]]; then echo "Bloqueado: $name ausente" >&2; exit 2; fi
done
if [[ "${MASTER_PROJECT_REF:-}" != "$EXPECTED_REF" || ! "${UNITOS_CONTROL_PLANE_EXPECTED_GENERATION}" =~ ^[0-9]+$ || ! "${UNITOS_CONTROL_PLANE_CONTRACT_SHA256}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Bloqueado: identidade, geração ou hash do contrato inválido" >&2; exit 2
fi
python3 - "$MASTER_DATABASE_URL" "$MASTER_PROJECT_REF" <<'PY'
import sys
from urllib.parse import urlparse
p=urlparse(sys.argv[1]); ref=sys.argv[2]; host=p.hostname or ''; user=p.username or ''
if host != f'db.{ref}.supabase.co' and not (host.endswith('.pooler.supabase.com') and user.endswith(f'.{ref}')):
 raise SystemExit('Bloqueado: conexão não identifica exatamente o projeto Master')
PY
python3 "$ROOT/supabase/master/tools/verify_master_backup_gate.py" --scope global
python3 "$ROOT/supabase/master/tools/build_control_plane_contract.py" --check
REPORT="$(mktemp)"; trap 'rm -f "$REPORT"' EXIT
psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --csv --file "$ROOT/supabase/install/verify-installation-master.sql" > "$REPORT"
if grep -q ',FAIL$' "$REPORT"; then echo "Bloqueado: contrato Master não passou na validação completa" >&2; exit 1; fi

STATE="$(psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align --command "SELECT generation::text||E'\\t'||coalesce(current_version,'')||E'\\t'||coalesce(pinned_release,'')||E'\\t'||coalesce(pinned_commit_sha,'') FROM public.control_plane_release_state WHERE singleton IS TRUE;")"
IFS=$'\t' read -r GENERATION CURRENT PINNED COMMIT <<< "$STATE"
if [[ "$GENERATION" != "$UNITOS_CONTROL_PLANE_EXPECTED_GENERATION" ]]; then echo "Bloqueado: geração do Control-plane divergiu" >&2; exit 1; fi

psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --set generation="$GENERATION" \
  --set current="$CURRENT" --set pinned="$PINNED" --set commit="$COMMIT" \
  --set target_commit="$UNITOS_CONTROL_PLANE_TARGET_COMMIT_SHA" \
  --set contract_sha="$UNITOS_CONTROL_PLANE_CONTRACT_SHA256" --set actor="$UNITOS_CONTROL_PLANE_PROMOTED_BY" <<'SQL'
BEGIN;
SELECT public.promote_control_plane_release(
  :'generation'::bigint, nullif(:'current',''), nullif(:'pinned',''), nullif(:'commit',''),
  '1.4.18', :'target_commit', :'contract_sha',
  '{"contractValidated":true,"freezeValidated":true,"executorValidated":true,"recoveryValidated":true,"ledgerValidated":true}'::jsonb,
  :'actor'
);
COMMIT;
SQL

FINAL="$(psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align --command "SELECT concat_ws(',',current_version,pinned_release,pinned_commit_sha,contract_sha256,generation) FROM public.control_plane_release_state WHERE singleton IS TRUE;")"
EXPECTED="1.4.18,1.4.18,$UNITOS_CONTROL_PLANE_TARGET_COMMIT_SHA,$UNITOS_CONTROL_PLANE_CONTRACT_SHA256,$((GENERATION + 1))"
if [[ "$FINAL" != "$EXPECTED" ]]; then echo "Falha: promoção atômica do Control-plane não foi confirmada" >&2; exit 1; fi
echo "Control-plane 1.4.18 promovido atomicamente e validado"