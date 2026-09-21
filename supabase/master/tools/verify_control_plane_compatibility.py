#!/usr/bin/env python3
"""Valida versões e hashes locais sem inferir, promover ou reescrever artefatos."""
from __future__ import annotations
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANAGER = ROOT.parent / "src" / "lib" / "installation" / "manager-contract.ts"
DELTA_VERSION = ROOT / "baseline-snapshot" / "tools" / "delta_version.txt"
DELTA = ROOT / "baseline-snapshot" / "007_delta_migrations.sql"
BOOTSTRAP = ROOT / "master" / "bootstrap-control-plane.json"
CONTRACT = ROOT / "master" / "control-plane-contract.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    issues: list[dict[str, str]] = []
    match = re.search(r'MASTER_RELEASE_VERSION\s*=\s*"([^"]+)"', MANAGER.read_text())
    master_version = match.group(1) if match else ""
    delta_values = dict(
        line.split("=", 1) for line in DELTA_VERSION.read_text().splitlines() if "=" in line
    )
    delta_version = delta_values.get("version", "").strip()
    delta_sha = delta_values.get("sha256", "").strip()
    bootstrap = json.loads(BOOTSTRAP.read_text())
    contract = json.loads(CONTRACT.read_text())
    versions = {
        "MASTER_RELEASE_VERSION": master_version,
        "delta_version.txt": delta_version,
        "bootstrap-control-plane.json": str(bootstrap.get("releaseVersion", "")),
        "control-plane-contract.json": str(contract.get("releaseVersion", "")),
    }
    master_client = {master_version, delta_version, versions["bootstrap-control-plane.json"]}
    if "" in master_client or len(master_client) != 1:
        issues.append({"kind": "master_client_version", "detail": json.dumps(versions, sort_keys=True)})
    if versions["control-plane-contract.json"] != master_version:
        issues.append({
            "kind": "control_plane_version",
            "detail": f"Master/Client={master_version or 'ausente'}; Control-plane={versions['control-plane-contract.json'] or 'ausente'}",
        })
    actual_delta_sha = sha256(DELTA)
    if not re.fullmatch(r"[0-9a-f]{64}", delta_sha) or delta_sha != actual_delta_sha:
        issues.append({"kind": "delta_sha256", "detail": f"declarado={delta_sha}; calculado={actual_delta_sha}"})
    for manifest_name, manifest in ((BOOTSTRAP.name, bootstrap), (CONTRACT.name, contract)):
        for file_name, expected in (manifest.get("files") or {}).items():
            path = ROOT / "master" / file_name
            observed = sha256(path) if path.is_file() else "ausente"
            if not re.fullmatch(r"[0-9a-f]{64}", str(expected)) or expected != observed:
                issues.append({"kind": "artifact_sha256", "detail": f"{manifest_name}:{file_name}: esperado={expected}; calculado={observed}"})
    bootstrap_file = ROOT / "master" / str(bootstrap.get("bootstrapFile", ""))
    expected_bootstrap_sha = str(bootstrap.get("bootstrapSha256", ""))
    observed_bootstrap_sha = sha256(bootstrap_file) if bootstrap_file.is_file() else "ausente"
    if expected_bootstrap_sha != observed_bootstrap_sha:
        issues.append({"kind": "bootstrap_sha256", "detail": f"esperado={expected_bootstrap_sha}; calculado={observed_bootstrap_sha}"})
    result = {"status": "PASS" if not issues else "BLOCK", "versions": versions, "issues": issues}
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0 if not issues else 2


if __name__ == "__main__":
    raise SystemExit(main())
