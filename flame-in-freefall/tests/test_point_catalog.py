"""The point-chat catalog must follow the released map and keep row-level provenance."""
import csv
import json
import shutil
import subprocess
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PointCatalog(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.points = json.loads((ROOT / "server/points.json").read_text("utf-8"))["points"]

    @unittest.skipUnless(shutil.which("node"), "Node is needed to execute the released map")
    def test_catalog_equals_a_fresh_export_from_the_map(self):
        subprocess.run(["node", "scripts/build_point_catalog.cjs", "--check"], cwd=ROOT, check=True)

    def test_each_mapped_psi_run_is_present_once_with_its_source(self):
        expected = Counter()
        with (ROOT / "web/downloads/quench-runs.csv").open(encoding="utf-8-sig", newline="") as stream:
            for record in csv.DictReader(stream):
                if not record["ambient_o2_percent"]:
                    continue
                run_id = record["test_id"]
                if record["source_test_number"]:
                    run_id += f" (test {record['source_test_number']})"
                expected[record["psi_url"], run_id] += 1
        actual = Counter()
        for point in self.points:
            for study in point["groups"]:
                if study["columns"][0] != "Run ID":
                    continue
                self.assertEqual(len(study["sources"]), 1)
                source = study["sources"][0]["url"]
                self.assertTrue(source.endswith("/" + study["accession"]))
                for row in study["rows"]:
                    actual[source, row[0]] += 1
        self.assertEqual(actual, expected)

    def test_mixed_group_keeps_measurements_in_their_own_source_units(self):
        point = next(p for p in self.points if p["title"] == "59 liquid-fuel runs")
        flex, cfi = point["groups"]
        self.assertEqual([(s["accession"], len(s["rows"])) for s in (flex, cfi)],
                         [("PSI-69", 34), ("PSI-39", 25)])
        row = next(r for r in flex["rows"] if r[0] == "20CAL10 (test 2)")
        fields = dict(zip(flex["columns"], row, strict=True))
        self.assertEqual((fields["Pressure (mmHg)"], fields["Burn time (s)"],
                          fields["Initial droplet diameter (mm)"]), ("762", "5", "1.86"))
        self.assertIn("Pressure (atm)", cfi["columns"])
        self.assertTrue(all(r[4] == "Unreported" for r in cfi["rows"]))

    def test_summary_marks_preserve_the_limits_of_their_sources(self):
        bre = [p for p in self.points if p["groups"][0]["accession"] == "PSI-20"]
        self.assertTrue(bre)
        self.assertTrue(all("whole day" in p["summary"] for p in bre))
        sofie = next(p for p in self.points if "SoFIE-GEL" in p["title"])
        self.assertIn("separate ranges", sofie["summary"])
        self.assertEqual([s["url"] for s in sofie["groups"][0]["sources"]],
                         ["https://ntrs.nasa.gov/citations/26234896351764"])
        nomex = next(p for p in self.points if "Saffire-VI · event 4 " in p["title"])
        self.assertEqual(nomex["groups"][0]["rows"][0][-2:], ["Unreported", "did not ignite"])
