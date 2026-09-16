import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import build_delta


class DestinationMapTest(unittest.TestCase):
    def write_map(self, directory: str, entries: list[dict[str, object]]) -> Path:
        destination = Path(directory) / "migration-destinations.json"
        destination.write_text(
            json.dumps({"schemaVersion": 1, "migrations": entries}),
            encoding="utf-8",
        )
        return destination

    def test_accepts_all_four_destinations_and_closes_physical_coverage(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files = [str(Path(directory) / f"00{position}.sql") for position in range(1, 5)]
            entries = [
                {"position": 1, "file": "001.sql", "destination": "client"},
                {"position": 2, "file": "002.sql", "destination": "control-plane"},
                {"position": 3, "file": "003.sql", "destination": "split"},
                {"position": 4, "file": "004.sql", "destination": "excluded"},
            ]
            destination = self.write_map(directory, entries)

            with patch.object(build_delta, "DESTINATIONS", str(destination)):
                self.assertEqual(
                    build_delta._load_destinations(files),
                    {entry["file"]: entry["destination"] for entry in entries},
                )

    def test_rejects_unknown_destination(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files = [str(Path(directory) / "001.sql")]
            destination = self.write_map(
                directory,
                [{"position": 1, "file": "001.sql", "destination": "unknown"}],
            )

            with patch.object(build_delta, "DESTINATIONS", str(destination)):
                with self.assertRaisesRegex(SystemExit, "destino/posicao invalido"):
                    build_delta._load_destinations(files)

    def test_requires_every_physical_migration_in_the_ordered_map(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files = [str(Path(directory) / "001.sql"), str(Path(directory) / "002.sql")]
            destination = self.write_map(
                directory,
                [{"position": 1, "file": "001.sql", "destination": "excluded"}],
            )

            with patch.object(build_delta, "DESTINATIONS", str(destination)):
                with self.assertRaisesRegex(SystemExit, r"ausentes=\['002.sql'\]"):
                    build_delta._load_destinations(files)

    def test_excluded_and_control_plane_stay_out_while_client_and_split_keep_sources(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            split_source = Path(directory) / "003.client.sql"
            split_source.write_text("SELECT 3;\n", encoding="utf-8")

            with patch.object(build_delta, "SPLITS", directory):
                self.assertEqual(build_delta._client_source("001.sql", "client"), "001.sql")
                self.assertIsNone(build_delta._client_source("002.sql", "control-plane"))
                self.assertEqual(build_delta._client_source("003.sql", "split"), str(split_source))
                self.assertIsNone(build_delta._client_source("004.sql", "excluded"))


if __name__ == "__main__":
    unittest.main()