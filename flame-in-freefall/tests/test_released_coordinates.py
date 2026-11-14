"""Audit every exported atmosphere against its source column, independently of the builder."""
import csv
import re
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def value(s):
    match = re.search(r"\d+(?:\.\d+)?", s)
    return float(match[0]) if match else None


def coord(x):
    return round(x, 8) if x is not None else None


def record(study, test_id, chamber_o2, pressure, inlet_o2=None):
    return (study, " ".join(test_id.split()), coord(chamber_o2), coord(pressure), coord(inlet_o2))


def source_records():
    out = Counter()
    for path in (ROOT / "data/raw/tables").glob("*.csv"):
        study = path.name.split("_", 1)[0]
        if study not in {"PSI-69", "PSI-39", "PSI-159", "PSI-10", "PSI-25", "PSI-26", "PSI-98", "PSI-99", "PSI-100"}:
            continue
        with path.open(encoding="utf-8-sig", errors="replace", newline="") as f:
            reader = csv.reader(f)
            next(reader)
            rows = [tuple(c.strip() for c in r) for r in reader if any(c.strip() for c in r)]
        for r in (dict.fromkeys(rows) if study == "PSI-39" else rows):
            o = p = nozzle = None
            if study == "PSI-159":
                tid = r[3]
                normal = r[0] == "Normal"
                p = float(r[7 if normal else 6]) / 1.01325
                if normal:
                    o = 100 * float(r[5])
                else:
                    nozzle = 100 * float(r[7])
            elif study == "PSI-69":
                tid, o, p = r[1], 100 * float(r[6]), (float(r[5]) / 760 or None)
            elif study == "PSI-39":
                tid, o, p = r[0], 100 * float(r[5]), value(r[4])
            elif study == "PSI-10":
                tid, o, p = r[3], 100 * float(r[8]), float(r[10])
            elif study == "PSI-25":
                tid, o = r[1], value(r[11])
            elif study == "PSI-26":
                tid = r[2]
                if not tid:
                    continue
            elif study in ("PSI-98", "PSI-99"):
                if not r[6]:
                    continue
                tid, o = r[0], value(r[6])
            else:
                tid = r[0]
            out[record(study, tid, o, p, nozzle)] += 1
    return out


class ReleasedCoordinates(unittest.TestCase):
    def test_every_csv_coordinate_matches_its_raw_source(self):
        expected = source_records()
        with (ROOT / "web/downloads/quench-runs.csv").open(encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
        self.assertTrue(all(r["ambient_o2_percent"] == r["o2_percent"] for r in rows))
        actual = Counter(record(r["accession"], r["test_id"], value(r["ambient_o2_percent"]),
                                value(r["pressure_atm"]), value(r["burner_oxidizer_o2_percent"])) for r in rows)
        self.assertEqual(actual, expected)

    def test_known_cabins_and_broad_region(self):
        coords = list(source_records().elements())
        for oxygen, psia, expected in [(21, 14.7, 245), (26.5, 10.2, 43), (34, 8.2, 15)]:
            hits = [(study, tid) for study, tid, o, p, _ in coords if o is not None and p is not None
                    and abs(o - oxygen) <= 4 and abs(p * 14.696 - psia) <= psia * .15]
            self.assertEqual(len(hits), expected)
            if oxygen == 34:
                self.assertEqual({study for study, _ in hits}, {"PSI-159"})
        region = [(study, tid) for study, tid, o, p, _ in coords
                  if o is not None and p is not None and o >= 30 and p * 14.696 <= 10.2]
        self.assertEqual(Counter(study for study, _ in region), {"PSI-159": 20})
