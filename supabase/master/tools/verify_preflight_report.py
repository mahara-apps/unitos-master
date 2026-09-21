#!/usr/bin/env python3
"""Valida estrutura, ordem, contadores e status de um relatório CSV de preflight."""
from __future__ import annotations
import argparse
import csv
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", required=True)
    parser.add_argument("--expected", required=True, type=int)
    args = parser.parse_args()
    parsed = list(csv.reader(Path(args.report).read_text().splitlines()))
    rows = [row for row in parsed if row and row[0].isdigit()]
    if len(rows) != args.expected:
        print(f"BLOCK: quantidade de checks inválida: {len(rows)}/{args.expected}", file=sys.stderr)
        return 2
    for index, row in enumerate(rows, 1):
        if len(row) != 4 or row[0] != str(index) or not row[1].strip() or not row[2].strip():
            print(f"BLOCK: check {index} ausente, inválido ou fora de ordem", file=sys.stderr)
            return 2
        if row[3] != "PASS":
            print(f"BLOCK: check {index} não passou", file=sys.stderr)
            return 2
        if row[2].lstrip("-").isdigit() and int(row[2]) < 0:
            print(f"BLOCK: contador negativo no check {index}", file=sys.stderr)
            return 2
    print(f"preflight íntegro: {args.expected}/{args.expected} PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
