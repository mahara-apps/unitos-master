#!/usr/bin/env python3
"""Valida, sem rede, a evidência de backup antes de escritas no Control-plane."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


BACKUP_CONFIRMATION = "BACKUP_RESTORABLE_VERIFIED"
EXCEPTION_CONFIRMATION = "ACCEPT_DISPOSABLE_INSTALLATION_BACKUP_RISK"
DISPOSABLE_CONFIRMATION = "INSTALLATION_NOT_DELIVERED_AND_DISPOSABLE"
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Bloqueado: {name} ausente")
    return value


def record(event: dict[str, str]) -> None:
    audit_file = Path(required("UNITOS_MASTER_BACKUP_AUDIT_FILE"))
    audit_file.parent.mkdir(parents=True, exist_ok=True)
    event["recorded_at"] = datetime.now(timezone.utc).isoformat()
    with audit_file.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scope", choices=("global", "installation"), required=True)
    parser.add_argument("--installation-id", default="")
    args = parser.parse_args()

    backup_confirmation = os.environ.get("UNITOS_MASTER_BACKUP_CONFIRMATION", "").strip()
    exception_confirmation = os.environ.get("UNITOS_MASTER_BACKUP_EXCEPTION", "").strip()

    try:
        if backup_confirmation == BACKUP_CONFIRMATION:
            evidence = required("UNITOS_MASTER_BACKUP_EVIDENCE")
            operator = required("UNITOS_MASTER_BACKUP_OPERATOR")
            record(
                {
                    "decision": "backup_verified",
                    "evidence": evidence,
                    "operator": operator,
                    "scope": args.scope,
                }
            )
            print(f"BACKUP_GATE=backup_verified evidence={evidence} operator={operator}")
            return 0

        if exception_confirmation != EXCEPTION_CONFIRMATION:
            raise ValueError("Bloqueado: backup restaurável obrigatório e sem evidência confirmada")
        if args.scope != "installation":
            raise ValueError("Bloqueado: exceção de backup nunca pode ter escopo global")

        installation_id = args.installation_id.strip()
        declared_id = required("UNITOS_MASTER_BACKUP_EXCEPTION_INSTALLATION_ID")
        if not UUID.fullmatch(installation_id) or declared_id != installation_id:
            raise ValueError("Bloqueado: exceção não identifica exatamente a instalação afetada")
        if os.environ.get("UNITOS_MASTER_BACKUP_EXCEPTION_DISPOSABLE", "").strip() != DISPOSABLE_CONFIRMATION:
            raise ValueError("Bloqueado: condição descartável e não entregue não foi confirmada")

        operator = required("UNITOS_MASTER_BACKUP_EXCEPTION_OPERATOR")
        risk = required("UNITOS_MASTER_BACKUP_EXCEPTION_RISK_ACCEPTED")
        if len(risk) < 20:
            raise ValueError("Bloqueado: risco aceito deve ser documentado de forma específica")

        record(
            {
                "decision": "disposable_exception",
                "installation_id": installation_id,
                "operator": operator,
                "risk_accepted": risk,
                "scope": args.scope,
            }
        )
        print(
            "BACKUP_GATE=disposable_exception "
            f"installation_id={installation_id} operator={operator} risk_accepted={risk}"
        )
        return 0
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())