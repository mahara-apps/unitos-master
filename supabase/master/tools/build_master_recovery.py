#!/usr/bin/env python3
"""Sela e valida o artefato local de recuperação do Control-plane."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RECOVERY = ROOT / "master" / "recovery" / "20260919143000_recover_missing_legacy_reconciliation.sql"
REPAIRED = ROOT / "migrations" / "20260917184500_legacy_migration_reconciliation.sql"
REQUIRED = ROOT / "migrations" / "20260917190721_f04a7c59-5fbb-4ef3-aa75-044844da8fa3.sql"
PREFLIGHT = ROOT / "master" / "recovery-control-plane-preflight.sql"
OUT = ROOT / "master" / "recovery-control-plane.json"

def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def build() -> str:
    recovery = RECOVERY.read_text(encoding="utf-8")
    forbidden_markers = [
        "CREATE OR REPLACE FUNCTION public.reconcile_installation_operation_migrations",
        "CREATE OR REPLACE FUNCTION public.normalize_legacy_installation_operations",
        "SET status = 'manual_review'",
        "SET status = 'orphaned'",
    ]
    present = [marker for marker in forbidden_markers if marker in recovery]
    if present:
        raise SystemExit(f"recuperação contém SQL exclusivo da 1.4.11: {present}")
    if "INSERT INTO supabase_migrations.schema_migrations" in recovery:
        raise SystemExit("recuperação não pode escrever diretamente no ledger da Supabase")
    if "BEGIN;" not in recovery or "COMMIT;" not in recovery:
        raise SystemExit("recuperação deve preservar uma transação explícita")
    document = {
        "schemaVersion": 2,
        "releaseVersion": "1.4.14",
        "targetProjectRef": "tkjbhttylouamqxnbfgv",
        "recoveryVersion": "20260919143000",
        "recoveryFile": RECOVERY.name,
        "recoverySha256": digest(RECOVERY),
        "repairsVersion": "20260917184500",
        "repairsFile": REPAIRED.name,
        "repairsSha256": digest(REPAIRED),
        "requiresVersion": "20260917190721",
        "requiresFile": REQUIRED.name,
        "requiresSha256": digest(REQUIRED),
        "preflightFile": PREFLIGHT.name,
        "preflightSha256": digest(PREFLIGHT),
        "forbiddenMigration": REQUIRED.name,
    }
    return json.dumps(document, indent=2, sort_keys=True) + "\n"

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    manifest = build()
    if args.check:
        if not OUT.is_file() or OUT.read_text(encoding="utf-8") != manifest:
            raise SystemExit("manifesto de recuperação ausente ou divergente")
        print("manifesto de recuperação e hashes conferem")
        return
    OUT.write_text(manifest, encoding="utf-8")
    print(f"manifesto de recuperação -> {OUT}")

if __name__ == "__main__":
    main()