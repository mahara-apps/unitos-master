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
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MIGRATIONS = os.path.join(ROOT, "migrations")
OUT = os.path.join(ROOT, "baseline-snapshot", "007_delta_migrations.sql")
MANIFEST = os.path.join(ROOT, "baseline-snapshot", "tools", "delta_manifest.txt")

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

# Migrations exclusivas do MASTER: agendam cron apontando para a URL do projeto
# MASTER. Uma instalacao nova recebe suas proprias rotinas por
# supabase/install/020_cron.sql, com a URL e o CRON_SECRET dela.
MASTER_ONLY_MARKERS = (
    "project--3f33732a-cb8b-43ae-84fb-01d9e367fb0c",
)


def _is_master_only(path: str) -> bool:
    with open(path, encoding="utf-8") as fh:
        sql = fh.read()
    return any(marker in sql for marker in MASTER_ONLY_MARKERS)





def _created_tables(sql: str, *, unguarded_only: bool = False) -> set[str]:
    guard = "" if unguarded_only else r"(?:IF\s+NOT\s+EXISTS\s+)?"
    return {
        match.group(1).lower()
        for match in re.finditer(
            rf"\bCREATE\s+TABLE\s+{guard}public\.([a-z0-9_]+)", sql, re.I
        )
    }


def _validate_cutover(files: list[str], selected: list[str]) -> None:
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
            if not _is_master_only(os.path.join(MIGRATIONS, name))
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
    delta_sql = "\n".join(open(path, encoding="utf-8").read() for path in selected)
    overlap = sorted(_created_tables(snapshot) & _created_tables(delta_sql, unguarded_only=True))
    if overlap:
        raise SystemExit(f"objetos sobrepostos entre snapshot e delta: {', '.join(overlap)}")


def main() -> None:
    files = sorted(glob.glob(os.path.join(MIGRATIONS, "*.sql")))
    start = os.path.join(MIGRATIONS, START_MIGRATION)
    if start not in files:
        raise SystemExit(f"START_MIGRATION ausente: {START_MIGRATION}")
    selected = [
        p for p in files[files.index(start):] if not _is_master_only(p)
    ]
    _validate_cutover(files, selected)


    parts = [HEAD]
    for path in selected:
        name = os.path.basename(path)
        parts.append(
            "\n-- ---------------------------------------------------------------------------\n"
            f"-- {name}\n"
            "-- ---------------------------------------------------------------------------\n"
        )
        with open(path, encoding="utf-8") as fh:
            parts.append(fh.read().rstrip() + "\n")

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("".join(parts))
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        fh.write("\n".join(os.path.basename(p) for p in selected) + "\n")

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
