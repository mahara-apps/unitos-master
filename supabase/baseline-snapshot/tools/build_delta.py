#!/usr/bin/env python3
"""Gera supabase/baseline-snapshot/007_delta_migrations.sql.

O dump 001_initial_schema.sql congela o schema em uma migration especifica.
Toda migration posterior precisa entrar no baseline para que
uma instalacao nova nasca identica ao MASTER — este script concatena essas
migrations na ordem cronologica original.

Uso:
    python3 supabase/baseline-snapshot/tools/build_delta.py
"""

from __future__ import annotations

import glob
import hashlib
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MIGRATIONS = os.path.join(ROOT, "migrations")
OUT = os.path.join(ROOT, "baseline-snapshot", "007_delta_migrations.sql")
MANIFEST = os.path.join(ROOT, "baseline-snapshot", "tools", "delta_manifest.txt")
DESTINATIONS = os.path.join(ROOT, "baseline-snapshot", "tools", "migration-destinations.json")
SPLITS = os.path.join(ROOT, "baseline-snapshot", "tools", "splits")

# Ultima migration incorporada ao dump e primeira que deve entrar no delta.
#
# ATENCAO: o dump 001 foi tirado depois das migrations 20260829121019 e
# 20260829122439 (desparticionamento de public.brain_events). O estado final
# das duas ja esta congelado no dump (tabela normal com PK simples, indices,
# brain_events_prune, funcoes de particionamento removidas). Reaplicar aquele
# DO $$ ... $$ derrubava public.brain_events com CASCADE e deixava statements
# pendentes na fila de dependencias ("statements com dependencia nao
# resolvida"), por isso o corte comeca DEPOIS delas.
DUMPED_AT_MIGRATION = "20260829130645_6465717a-f869-49b9-b603-bc7434389391.sql"
START_MIGRATION = "20260829192349_ff418028-7401-404c-92d9-be9b0e29e2bd.sql"

HEAD = """-- =============================================================================
-- 007_delta_migrations.sql — DELTA do baseline.
--
-- O dump `001_initial_schema.sql` foi tirado em 2026-08-29 (migration
-- 20260829130645). Tudo que entrou depois vive aqui, na ordem cronologica
-- original das migrations, para que uma instalacao nova nasca identica ao
-- MASTER (briefing import por IA, workspace singleton, Installation Manager,
-- leases de ai_jobs, autoridade de integracao, /setup, etc).
--
-- Gerado por: supabase/baseline-snapshot/tools/build_delta.py
-- Aplicar DEPOIS de 005_auth_trigger.sql e ANTES de 003_storage_buckets.sql.
-- Nao editar a mao: regenerar quando novas migrations forem criadas.
-- =============================================================================

"""

VALID_DESTINATIONS = {"control-plane", "client", "split", "unknown"}


def _load_destinations(files: list[str]) -> dict[str, str]:
    with open(DESTINATIONS, encoding="utf-8") as fh:
        document = json.load(fh)
    if document.get("schemaVersion") != 1:
        raise SystemExit("versao do mapa de destinos nao suportada")
    entries = document.get("migrations")
    if not isinstance(entries, list):
        raise SystemExit("mapa de destinos sem migrations")
    mapped: dict[str, str] = {}
    for expected_position, entry in enumerate(entries, 1):
        if not isinstance(entry, dict):
            raise SystemExit("entrada invalida no mapa de destinos")
        name = entry.get("file")
        destination = entry.get("destination")
        if entry.get("position") != expected_position or destination not in VALID_DESTINATIONS:
            raise SystemExit(f"destino/posicao invalido para {name}")
        if not isinstance(name, str) or name in mapped:
            raise SystemExit(f"migration duplicada ou invalida no mapa: {name}")
        mapped[name] = destination
    names = [os.path.basename(path) for path in files]
    explicitly_excluded = document.get("excludedBeforeManifest", [])
    excluded = {
        entry.get("file")
        for entry in explicitly_excluded
        if isinstance(entry, dict) and entry.get("destination") == "control-plane"
    }
    if set(mapped) | excluded != set(names) or set(mapped) & excluded:
        missing = sorted(set(names) - set(mapped) - excluded)
        stale = sorted(set(mapped) - set(names))
        raise SystemExit(f"mapa de destinos divergente; ausentes={missing}; obsoletas={stale}")
    return mapped


def _client_source(path: str, destination: str) -> str | None:
    if destination == "client":
        return path
    if destination == "split":
        fragment = os.path.join(SPLITS, os.path.basename(path).replace(".sql", ".client.sql"))
        if not os.path.isfile(fragment):
            raise SystemExit(f"fragmento Client ausente para migration split: {os.path.basename(path)}")
        return fragment
    return None





def _created_tables(sql: str, *, unguarded_only: bool = False) -> set[str]:
    guard = "" if unguarded_only else r"(?:IF\s+NOT\s+EXISTS\s+)?"
    return {
        match.group(1).lower()
        for match in re.finditer(
            rf"\bCREATE\s+TABLE\s+{guard}public\.([a-z0-9_]+)", sql, re.I
        )
    }


def _validate_cutover(files: list[str], selected: list[tuple[str, str]], destinations: dict[str, str]) -> None:
    names = [os.path.basename(path) for path in files]
    if names != sorted(names) or len(names) != len(set(names)):
        raise SystemExit("nomes de migrations duplicados ou fora de ordem")
    if DUMPED_AT_MIGRATION not in names:
        raise SystemExit(f"migration do corte ausente: {DUMPED_AT_MIGRATION}")
    cutover_index = names.index(DUMPED_AT_MIGRATION)
    expected_start = next(
        (
            name
            for name in names[cutover_index + 1 :]
            if destinations.get(name) in {"client", "split"}
        ),
        None,
    )
    if expected_start != START_MIGRATION:
        raise SystemExit(
            f"corte inconsistente: START_MIGRATION={START_MIGRATION}; esperado={expected_start}"
        )

    snapshot_path = os.path.join(ROOT, "baseline-snapshot", "001_initial_schema.sql")
    with open(snapshot_path, encoding="utf-8") as fh:
        snapshot = fh.read()
    delta_parts = []
    for _, source in selected:
        with open(source, encoding="utf-8") as fh:
            delta_parts.append(fh.read())
    delta_sql = "\n".join(delta_parts)
    overlap = sorted(_created_tables(snapshot) & _created_tables(delta_sql, unguarded_only=True))
    if overlap:
        raise SystemExit(f"objetos sobrepostos entre snapshot e delta: {', '.join(overlap)}")


def main() -> None:
    files = sorted(glob.glob(os.path.join(MIGRATIONS, "*.sql")))
    start = os.path.join(MIGRATIONS, START_MIGRATION)
    if start not in files:
        raise SystemExit(f"START_MIGRATION ausente: {START_MIGRATION}")
    package_files = files[files.index(start):]
    destinations = _load_destinations(package_files)
    selected: list[tuple[str, str]] = []
    for path in package_files:
        destination = destinations.get(os.path.basename(path), "control-plane")
        source = _client_source(path, destination)
        if source is not None:
            selected.append((path, source))
    _validate_cutover(files, selected, destinations)


    parts = [HEAD]
    for path, source in selected:
        name = os.path.basename(path)
        parts.append(
            "\n-- ---------------------------------------------------------------------------\n"
            f"-- {name}\n"
            "-- ---------------------------------------------------------------------------\n"
        )
        with open(source, encoding="utf-8") as fh:
            parts.append(fh.read().rstrip() + "\n")

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("".join(parts))
    manifest_entries = []
    for path, source in selected:
        with open(source, encoding="utf-8") as migration:
            body = migration.read().strip()
        fingerprint = hashlib.sha256((body + "\n").encode()).hexdigest()
        manifest_entries.append(f"{os.path.basename(path)}\t{fingerprint}")
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        fh.write("\n".join(manifest_entries) + "\n")

    sha = hashlib.sha256(open(OUT, "rb").read()).hexdigest()
    print(f"{len(selected)} migrations -> {OUT}")
    print(f"sha256={sha}")
    print(
        "MASTER-first: atualize supabase/baseline-snapshot/tools/delta_version.txt\n"
        "  (sha256 acima + nova version) e o MASTER_RELEASE_VERSION em\n"
        "  src/lib/installation/manager-contract.ts com o MESMO valor."
    )


if __name__ == "__main__":
    main()
