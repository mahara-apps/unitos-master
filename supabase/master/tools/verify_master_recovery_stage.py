#!/usr/bin/env python3
"""Valida fail-closed as origens e o staging da recovery Master 1.4.14."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

RECOVERY_VERSION = "20260919143000"
REPAIRS_VERSION = "20260917184500"
REQUIRES_VERSION = "20260917190721"
MIGRATION_NAME = re.compile(r"^(\d{14})_.+\.sql$")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fail(message: str) -> None:
    raise SystemExit(f"Bloqueado: {message}")


def load_manifest(root: Path) -> dict[str, object]:
    path = root / "master" / "recovery-control-plane.json"
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"manifesto da recuperação inválido: {error}")
    if not isinstance(manifest, dict):
        fail("manifesto da recuperação não é um objeto")
    return manifest


def require_manifest_file(
    root: Path, manifest: dict[str, object], file_key: str, hash_key: str, directory: Path
) -> Path:
    filename = manifest.get(file_key)
    expected = manifest.get(hash_key)
    if not isinstance(filename, str) or not isinstance(expected, str):
        fail(f"manifesto não contém {file_key}/{hash_key}")
    path = directory / filename
    if not path.is_file() or digest(path) != expected:
        fail(f"manifesto diverge do arquivo-fonte {filename}")
    return path


def verify_sources(root: Path) -> tuple[dict[str, object], Path, Path]:
    manifest = load_manifest(root)
    if (
        manifest.get("schemaVersion") != 3
        or manifest.get("recoveryVersion") != RECOVERY_VERSION
        or manifest.get("repairsVersion") != REPAIRS_VERSION
        or manifest.get("requiresVersion") != REQUIRES_VERSION
        or manifest.get("supabaseCliVersion") != "2.117.0"
    ):
        fail("identidade ou versão da CLI no manifesto é divergente")
    recovery = require_manifest_file(
        root,
        manifest,
        "recoveryFile",
        "recoverySha256",
        root / "master" / "recovery",
    )
    required = require_manifest_file(
        root, manifest, "requiresFile", "requiresSha256", root / "migrations"
    )
    require_manifest_file(root, manifest, "repairsFile", "repairsSha256", root / "migrations")
    require_manifest_file(
        root, manifest, "preflightFile", "preflightSha256", root / "master"
    )
    return manifest, recovery, required


def read_ledger(path: Path) -> list[str]:
    versions = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if any(not re.fullmatch(r"\d{14}", version) for version in versions):
        fail("snapshot do ledger contém versão inválida")
    if versions != sorted(set(versions)):
        fail("snapshot do ledger contém versões duplicadas ou fora de ordem")
    if REPAIRS_VERSION in versions or RECOVERY_VERSION in versions:
        fail("ledger contradiz a fila exclusiva de recuperação")
    if REQUIRES_VERSION not in versions:
        fail("ledger não contém a 1.4.11 obrigatória")
    return versions


def verify_stage(root: Path, stage: Path, ledger_path: Path) -> None:
    manifest, recovery_source, required_source = verify_sources(root)
    versions = read_ledger(ledger_path)
    migrations = stage / "supabase" / "migrations"
    files = sorted(path for path in migrations.iterdir() if path.is_file())
    parsed: dict[str, Path] = {}
    for path in files:
        match = MIGRATION_NAME.fullmatch(path.name)
        if match is None:
            fail(f"staging contém arquivo inesperado: {path.name}")
        version = match.group(1)
        if version in parsed:
            fail(f"staging contém arquivos duplicados para a versão {version}")
        parsed[version] = path

    expected_versions = set(versions) | {RECOVERY_VERSION}
    if set(parsed) != expected_versions:
        fail("staging não corresponde exatamente ao snapshot do ledger mais a recovery")

    for version in versions:
        staged = parsed[version]
        sources = sorted((root / "migrations").glob(f"{version}_*.sql"))
        if len(sources) != 1 or staged.name != sources[0].name:
            fail(f"migration histórica {version} não possui origem local única e idêntica")
        if digest(staged) != digest(sources[0]):
            fail(f"hash da migration histórica {staged.name} diverge no staging")

    recovery_staged = parsed[RECOVERY_VERSION]
    if recovery_staged.name != recovery_source.name:
        fail("nome da recovery no staging diverge do manifesto")
    expected_recovery_hash = manifest.get("recoverySha256")
    if digest(recovery_staged) != expected_recovery_hash or digest(recovery_source) != expected_recovery_hash:
        fail("manifesto, arquivo-fonte e staging da recovery estão divergentes")
    if digest(parsed[REQUIRES_VERSION]) != digest(required_source):
        fail("hash da dependência 1.4.11 diverge do manifesto")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--stage", type=Path)
    parser.add_argument("--ledger", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    if (args.stage is None) != (args.ledger is None):
        fail("stage e ledger devem ser informados juntos")
    if args.stage is None:
        verify_sources(root)
    else:
        verify_stage(root, args.stage.resolve(), args.ledger.resolve())
    print("integridade da recovery conferida")


if __name__ == "__main__":
    main()