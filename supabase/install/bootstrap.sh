#!/usr/bin/env bash
# bootstrap.sh — delega NEW ao mesmo executor durável usado por UPDATE.
# Não executa SQL localmente e não possui caminho alternativo por psql.
set -uo pipefail

MASTER_URL="${UNITOS_MASTER_URL:-}"
RUN_TOKEN="${UNITOS_RUN_TOKEN:-}"
OPERATION_ID="${UNITOS_OPERATION_ID:-}"

blocked() { printf 'BLOCKED: %s\n' "$1" >&2; exit 2; }
failed() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

[ -n "$MASTER_URL" ] || blocked "UNITOS_MASTER_URL ausente"
[ -n "$RUN_TOKEN" ] || blocked "UNITOS_RUN_TOKEN ausente"
[ -n "$OPERATION_ID" ] || blocked "UNITOS_OPERATION_ID ausente"
command -v curl >/dev/null 2>&1 || blocked "curl não encontrado"
case "${MASTER_URL%/}" in https://*) ;; *) blocked "UNITOS_MASTER_URL deve usar https" ;; esac

printf 'Delegando a operação %s ao executor canônico do MASTER.\n' "$OPERATION_ID"
response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT
status="$(curl -sS -o "$response_file" -w '%{http_code}' -m 30 -X POST \
  -H 'content-type: application/json' \
  --data "{\"token\":\"$RUN_TOKEN\",\"operationId\":\"$OPERATION_ID\"}" \
  "${MASTER_URL%/}/api/public/installations/execute")" || blocked "executor canônico indisponível"

case "$status" in
  200|202) printf 'PASS: operação aceita; checkpoint, evidência, retry e validação seguem no MASTER.\n' ;;
  401) failed "token inválido ou expirado" ;;
  409) failed "operação não pertence ao fluxo automatizado" ;;
  *) failed "executor canônico recusou a operação (HTTP $status)" ;;
esac
