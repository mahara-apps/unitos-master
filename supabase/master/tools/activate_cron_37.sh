#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXPECTED_REF="tkjbhttylouamqxnbfgv"
if [[ "$#" -ne 0 ]]; then echo "Bloqueado: ativação do cron 37 não aceita argumentos" >&2; exit 2; fi
python3 "$ROOT/supabase/master/tools/verify_control_plane_compatibility.py"
if [[ "${UNITOS_MASTER_CRON_37_ACTIVATION:-}" != "ACTIVATE_VERIFIED_CRON_37_ONLY" ]]; then echo "Bloqueado: autorização específica do cron 37 ausente" >&2; exit 2; fi
if [[ -z "${MASTER_DATABASE_URL:-}" || "${MASTER_PROJECT_REF:-}" != "$EXPECTED_REF" ]]; then echo "Bloqueado: conexão ou identidade do Master ausente/divergente" >&2; exit 2; fi
if [[ -z "${UNITOS_CRON_ACTOR:-}" || -z "${UNITOS_CRON_REASON:-}" ]]; then echo "Bloqueado: operador e justificativa do cron são obrigatórios" >&2; exit 2; fi
if [[ -z "${UNITOS_CRON_AUDIT_FILE:-}" || "${UNITOS_CRON_AUDIT_FILE}" != /* || "${UNITOS_CRON_AUDIT_FILE}" != *.jsonl ]]; then echo "Bloqueado: destino JSONL absoluto da auditoria do cron é obrigatório" >&2; exit 2; fi
if [[ -z "${UNITOS_CONTROL_PLANE_COMMIT_SHA:-}" || -z "${UNITOS_CONTROL_PLANE_CONTRACT_SHA256:-}" ]]; then echo "Bloqueado: commit e hash do contrato validados são obrigatórios" >&2; exit 2; fi
if [[ ! "$UNITOS_CONTROL_PLANE_CONTRACT_SHA256" =~ ^[0-9a-f]{64}$ ]]; then echo "Bloqueado: hash do contrato inválido" >&2; exit 2; fi
LOCAL_CONTRACT_SHA256="$(sha256sum "$ROOT/supabase/master/control-plane-contract.json" | awk '{print $1}')"
if [[ "$UNITOS_CONTROL_PLANE_CONTRACT_SHA256" != "$LOCAL_CONTRACT_SHA256" ]]; then echo "Bloqueado: hash informado diverge do contrato local selado" >&2; exit 2; fi
python3 - "$MASTER_DATABASE_URL" "$MASTER_PROJECT_REF" <<'PY'
import sys
from urllib.parse import urlparse
p=urlparse(sys.argv[1]); ref=sys.argv[2]; host=p.hostname or ''; user=p.username or ''
if host != f'db.{ref}.supabase.co' and not (host.endswith('.pooler.supabase.com') and user.endswith(f'.{ref}')):
 raise SystemExit('Bloqueado: conexão não identifica exatamente o projeto Master')
PY
python3 "$ROOT/supabase/master/tools/verify_master_backup_gate.py" --scope global
REPORT="$(mktemp)"; trap 'rm -f "$REPORT"' EXIT
psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --csv --file "$ROOT/supabase/install/verify-installation-master.sql" > "$REPORT"
if grep -q ',FAIL$' "$REPORT"; then echo "Bloqueado: contrato Master não passou na validação completa" >&2; exit 1; fi
python3 - "$UNITOS_CRON_AUDIT_FILE" "$MASTER_PROJECT_REF" "$UNITOS_CRON_ACTOR" "$UNITOS_CRON_REASON" "$UNITOS_CONTROL_PLANE_COMMIT_SHA" "$UNITOS_CONTROL_PLANE_CONTRACT_SHA256" <<'PY'
import datetime, json, os, pathlib, sys
path=pathlib.Path(sys.argv[1]); path.parent.mkdir(parents=True,exist_ok=True)
record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'action':'authorize_cron_37_activation','projectRef':sys.argv[2],'operator':sys.argv[3],'reason':sys.argv[4],'commitSha':sys.argv[5],'contractSha256':sys.argv[6]}
fd=os.open(path,os.O_APPEND|os.O_CREAT|os.O_WRONLY,0o600)
with os.fdopen(fd,'a',encoding='utf-8') as stream: stream.write(json.dumps(record,separators=(',',':'))+'\n')
PY
psql "$MASTER_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 \
  --set expected_commit_sha="$UNITOS_CONTROL_PLANE_COMMIT_SHA" \
  --set expected_contract_sha256="$UNITOS_CONTROL_PLANE_CONTRACT_SHA256" \
  --file "$ROOT/supabase/master/005_activate_cron_37.sql"
echo "Cron 37 ativado exclusivamente após validação integral"