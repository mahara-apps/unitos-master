#!/usr/bin/env python3
"""Valida, sem rede, a decisão de risco antes de escritas no Control-plane."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


BACKUP_CONFIRMATION = "BACKUP_RESTORABLE_VERIFIED"
NO_BACKUP_CONFIRMATION = "ACCEPT_EXISTING_CONTROL_PLANE_WITHOUT_RESTORABLE_BACKUP"
EXPECTED_PROJECT_REF = "tkjbhttylouamqxnbfgv"
PROJECT_REF = re.compile(r"^[a-z]{20}$")


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Bloqueado: {name} ausente")
    return value


def record(event: dict[str, str]) -> None:
    audit_file = Path(required("UNITOS_MASTER_BACKUP_AUDIT_FILE"))
    if not audit_file.is_absolute() or audit_file.suffix != ".jsonl":
        raise ValueError("Bloqueado: UNITOS_MASTER_BACKUP_AUDIT_FILE deve ser um caminho absoluto .jsonl")
    if audit_file.exists() and audit_file.is_symlink():
        raise ValueError("Bloqueado: destino de auditoria não pode ser link simbólico")
    audit_file.parent.mkdir(parents=True, exist_ok=True)
    event["recorded_at"] = datetime.now(timezone.utc).isoformat()
    with audit_file.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scope", choices=("global", "installation"), required=True)
    args = parser.parse_args()

    backup_confirmation = os.environ.get("UNITOS_MASTER_BACKUP_CONFIRMATION", "").strip()
    no_backup_confirmation = os.environ.get("UNITOS_MASTER_NO_BACKUP_CONFIRMATION", "").strip()

    try:
        if args.scope != "global":
            raise ValueError("Bloqueado: o gate do Control-plane aceita somente escopo global")

        project_ref = required("MASTER_PROJECT_REF")
        if not PROJECT_REF.fullmatch(project_ref) or project_ref != EXPECTED_PROJECT_REF:
            raise ValueError("Bloqueado: identidade do Control-plane não coincide com o Master canônico")

        if backup_confirmation == BACKUP_CONFIRMATION:
            evidence = required("UNITOS_MASTER_BACKUP_EVIDENCE")
            operator = required("UNITOS_MASTER_BACKUP_OPERATOR")
            record(
                {
                    "decision": "backup_verified",
                    "evidence": evidence,
                    "operator": operator,
                    "project_ref": project_ref,
                    "scope": args.scope,
                }
            )
            print(f"BACKUP_GATE=backup_verified evidence={evidence} operator={operator}")
            return 0

        if no_backup_confirmation != NO_BACKUP_CONFIRMATION:
            raise ValueError(
                "Bloqueado: informe backup restaurável ou aceite explicitamente o risco global sem backup"
            )

        declared_ref = required("UNITOS_MASTER_NO_BACKUP_PROJECT_REF")
        if declared_ref != project_ref:
            raise ValueError("Bloqueado: aceitação sem backup não identifica exatamente o Control-plane")

        operator = required("UNITOS_MASTER_NO_BACKUP_OPERATOR")
        risk = required("UNITOS_MASTER_NO_BACKUP_RISK_ACCEPTED")
        if len(risk) < 20:
            raise ValueError("Bloqueado: risco aceito deve ser documentado de forma específica")

        record(
            {
                "decision": "global_no_backup_accepted",
                "operator": operator,
                "project_ref": project_ref,
                "risk_accepted": risk,
                "scope": args.scope,
            }
        )
        print(
            "BACKUP_GATE=global_no_backup_accepted "
            f"project_ref={project_ref} operator={operator}"
        )
        return 0
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())