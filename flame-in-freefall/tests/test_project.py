# SI notice: written with SI (AI) assistance (Claude, Anthropic).
"""Checks that every number QUENCH shows is right.

    python3 -m unittest discover -s tests -v

The tests recount key facts straight from the raw NASA CSV files with independent code,
then compare them with what the build put into web/data.js. They also check the model,
the video results, the materials table, the answer checker and the offline answer bank.
Standard library only, plus numpy for the model check.
"""
import csv
from collections import Counter
import io
import json
import math
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAB = os.path.join(ROOT, "data", "raw", "tables")
sys.path.insert(0, os.path.join(ROOT, "scripts"))


def load_js(name, var):
    with open(os.path.join(ROOT, "web", name), encoding="utf-8") as fh:
        return json.loads(fh.read().split(f"window.{var} = ", 1)[1].rstrip().rstrip(";"))


def rows(name):
    with open(os.path.join(TAB, name), encoding="utf-8", errors="replace") as fh:
        r = [x for x in csv.reader(io.StringIO(fh.read())) if any(c.strip() for c in x)]
    return [h.strip() for h in r[0]], r[1:]


D = load_js("data.js", "FLAME")
M = load_js("model.js", "FLAME_MODEL")


class RawRecount(unittest.TestCase):
    """Facts recounted from the CSVs without using the build script."""

    def test_solid_oxygen_ceiling(self):
        vals = []
        h, b = rows("PSI-25_Experimental table_BASS-II.csv")
        i = next(k for k, x in enumerate(h) if "initial O2" in x)
        vals += [float(r[i]) for r in b if re.fullmatch(r"\d+(\.\d+)?", r[i].strip())]
        for name in ("PSI-98_Experimental table_SAFFIRE-1.csv", "PSI-99_Experimental table_SAFFIRE-2.csv"):
            h, b = rows(name)
            i = next(k for k, x in enumerate(h) if "Percent O2" in x)
            vals += [float(m.group()) for r in b for m in [re.search(r"\d+(\.\d+)?", r[i])] if m]
        self.assertEqual(max(vals), 22.2)
        self.assertEqual(D["stats"]["solid_o2_max"], 22.2)
        self.assertEqual(min(vals), D["stats"]["solid_o2_min"])

    def test_flex_counts_and_outcomes(self):
        h, b = rows("PSI-69_Experimental table_FLEX.csv")
        self.assertEqual(len(b), 274)
        ends = [r[-1].strip() for r in b]
        self.assertEqual(ends.count("Extinction"), 186)
        self.assertEqual(D["stats"]["flex_n"], 274)
        o2 = [float(r[6]) for r in b]
        self.assertAlmostEqual(max(o2), 0.34)
        hi = [r for r in b if float(r[6]) >= 0.32]
        self.assertEqual(len(hi), D["stats"]["flex_hi_o2"])
        self.assertTrue(all(0.69 < float(r[5]) / 760 < 0.72 for r in hi), "34 % runs are all near 0.70 atm")
        self.assertTrue(all(r[-1].strip() != "Extinction" for r in hi), "none of the 34 % runs went out on its own")

    def test_flex_self_extinction_bands(self):
        h, b = rows("PSI-69_Experimental table_FLEX.csv")
        plain = [r for r in b if float(r[8] or 0) == 0 and float(r[9] or 0) == 0]
        for band, (lo, hi) in zip(D["stats"]["flex_bands"], [(0, 18), (18, 25), (25, 101)]):
            grp = [r for r in plain if lo <= float(r[6]) * 100 < hi]
            self.assertEqual(len(grp), band["n"])
            self.assertEqual(sum(1 for r in grp if r[-1].strip() == "Extinction"), band["ext"])

    def test_bre_oxygen_levels(self):
        h, b = rows("PSI-20_Experimental table_ACME BRE.csv")
        i = h.index("Oxygen Conc (percent)")
        levels = set()
        for r in b:
            v = r[i].strip()
            levels |= {float(v.rstrip("%")) / 100} if v.endswith("%") else {float(x) for x in re.findall(r"\d+(?:\.\d+)?", v)}
        self.assertEqual(sorted(levels), D["stats"]["bre_levels"])
        self.assertIn(34.0, levels)
        self.assertEqual(sum(int(r[h.index("Flames Ignited")]) for r in b), D["stats"]["bre_flames"])

    def test_exploration_window_has_no_solid_or_droplet_runs(self):
        cov = D["stats"]["coverage"]["exp"]
        self.assertEqual(cov["solid"], 0)
        self.assertEqual(cov["droplet"], 0)

    def test_investigation_count(self):
        self.assertEqual(D["stats"]["investigations"], 26)
        self.assertEqual(D["stats"]["combustion"], 24)


class Findings(unittest.TestCase):
    def test_every_finding_is_complete_and_sourced(self):
        accs = {i["acc"] for i in D["investigations"]}
        next_ids = {n["id"] for n in D["next"]}
        for f in D["findings"]:
            for k in ("title", "claim", "evidence", "limits", "action", "scores", "sources"):
                self.assertTrue(f.get(k), f"{f['id']} has no {k}")
            self.assertTrue(set(f["scores"]) == {"safety", "evidence", "mission", "action"})
            self.assertTrue(all(1 <= v <= 5 for v in f["scores"].values()))
            self.assertTrue(all(s["acc"] in accs for s in f["sources"]), f["id"])
            self.assertTrue(set(f["next"]) <= next_ids, f["id"])

    def test_numbers_in_findings_match_stats(self):
        S = D["stats"]
        f = {x["id"]: x for x in D["findings"]}
        self.assertIn(f"{S['solid_o2_max']:g} %", f["solid-gap"]["title"])
        self.assertIn(f"{S['flex_bands'][0]['pct']} %", f["selfext"]["claim"])
        self.assertIn("0.70 atm", f["corner"]["title"])

    def test_finding_ids_unique(self):
        ids = [f["id"] for f in D["findings"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_history_quotes_present(self):
        self.assertEqual(len(D["history"]), 4)
        for h in D["history"]:
            self.assertTrue(h["quotes"] and h["changed_quote"]["url"].startswith("https://"))

    def test_summaries_cover_every_combustion_investigation(self):
        for i in D["investigations"]:
            if i["combustion"]:
                self.assertTrue(i.get("summary"), i["acc"])
                self.assertIn(i.get("relevance"), ("direct", "indirect", "background"))


class Model(unittest.TestCase):
    def test_beats_baselines(self):
        r = M["cv"]["results"]
        self.assertGreater(r["Full model"]["accuracy"]["mean"], r["Always the most common outcome"]["accuracy"]["mean"] + 0.08)
        self.assertGreater(r["Full model"]["auc"]["mean"], r["Oxygen only"]["auc"]["mean"])
        self.assertLess(r["Full model"]["brier"]["mean"], r["Oxygen only"]["brier"]["mean"])

    def test_physically_sensible_signs(self):
        c = dict(zip([f["key"] for f in M["features"]], M["coef"]))
        self.assertLess(c["o2"], 0, "more oxygen makes self-extinction less likely")
        self.assertGreater(c["d0"], 0, "larger droplets go out more (radiative extinction)")
        self.assertGreater(c["co2"], 0, "CO2 is a suppressant")
        self.assertGreater(c["he"], 0, "helium is a suppressant")

    def test_calibrated(self):
        for b in M["cv"]["calibration"]:
            if b["n"] >= 25:
                self.assertLess(abs(b["predicted"] - b["observed"]), 0.15, b)

    def test_exploration_is_flagged_outside(self):
        # pressure 8.2 psia is below every FLEX run, so a query there must be outside the tested range
        logp = math.log(8.2 / 14.696)
        self.assertLess(logp, M["ranges"]["logp"][0])


class Video(unittest.TestCase):
    V = D["video"]

    def test_all_independent_checks_pass(self):
        checks = [c for c in self.V["validation"]["checks"] if c["independent"]]
        self.assertEqual(len(checks), 5)
        self.assertTrue(all(c["pass"] for c in checks), [c["check"] for c in checks if not c["pass"]])

    def test_repeat_tests_agree(self):
        t = {x["test"]: x for x in self.V["tests"]}
        a, b = t["B2"]["spread_mm_s"], t["B5"]["spread_mm_s"]
        self.assertLess(abs(a - b) / ((a + b) / 2), 0.05)

    def test_thicker_films_spread_slower(self):
        t = {x["test"]: x for x in self.V["tests"]}
        self.assertGreater(t["B1"]["spread_mm_s"], t["B5"]["spread_mm_s"])
        self.assertGreater(t["B5"]["spread_mm_s"], t["B4"]["spread_mm_s"])

    def test_low_flow_tests_have_no_rate(self):
        for x in self.V["tests"]:
            if x["confidence"] == "low":
                self.assertIsNone(x.get("spread_mm_s"))

    def test_thumbnails_exist(self):
        for x in self.V["tests"]:
            for f in x.get("frames_web", []):
                self.assertTrue(os.path.exists(os.path.join(ROOT, "web", f)), f)


class Verifier(unittest.TestCase):
    corpus = {"PSI-25": "BASS-II oxygen from 13.6 to 22.2 %. 129 tests.", "F-x": "Exploration atmosphere is 34 %."}

    def test_good_claim(self):
        from verify import check_claim
        ok, issues = check_claim({"text": "BASS-II burned materials at up to 22.2 % oxygen.", "sources": ["PSI-25"]}, self.corpus)
        self.assertTrue(ok, issues)

    def test_invented_number_is_caught(self):
        from verify import check_claim
        ok, issues = check_claim({"text": "BASS-II reached 30 % oxygen.", "sources": ["PSI-25"]}, self.corpus)
        self.assertFalse(ok)
        self.assertIn("30", issues[0])

    def test_unknown_source_is_caught(self):
        from verify import check_claim
        ok, issues = check_claim({"text": "Something.", "sources": ["PSI-999"]}, self.corpus)
        self.assertFalse(ok)

    def test_uncited_claim_is_caught(self):
        from verify import check_claim
        ok, _ = check_claim({"text": "Something.", "sources": []}, self.corpus)
        self.assertFalse(ok)

    def test_number_with_wrong_unit_is_caught(self):
        from verify import check_claim
        corpus = {"PSI-20": "Porous burners of 25 and 50 mm diameter. Oxygen in the table: 21 to 40 %."}
        ok, issues = check_claim({"text": "BRE tested 50 % oxygen.", "sources": ["PSI-20"]}, corpus)
        self.assertFalse(ok, "50 mm must not support 50 %")
        ok, issues = check_claim({"text": "BRE ran from 21 to 40 % oxygen with 50 mm burners.", "sources": ["PSI-20"]}, corpus)
        self.assertTrue(ok, issues)

    def test_unit_lists_and_ranges(self):
        from verify import numbers_with_units
        self.assertEqual(numbers_with_units("about 1 cm/s for 100, 200, and 300 µm"), [(1.0, "cm/s"), (100.0, "um"), (200.0, "um"), (300.0, "um")])
        self.assertEqual(numbers_with_units("12 to 34 %"), [(12.0, "%"), (34.0, "%")])

    def test_record_ids_are_not_numbers(self):
        from verify import check_claim
        ok, issues = check_claim({"text": "PSI-25 tested films.", "sources": ["PSI-25"]}, self.corpus)
        self.assertTrue(ok, issues)


class AnswerBank(unittest.TestCase):
    """The offline analyst answers. The build already refuses unverified claims; these guard the shipped file."""

    def test_every_claim_cites_existing_records(self):
        ids = set(D["record_ids"])
        self.assertGreaterEqual(len(D["answers"]), 30)
        for a in D["answers"]:
            self.assertTrue(a["q"] and a["a"] and a["claims"], a["id"])
            for c in a["claims"]:
                self.assertTrue(c["sources"], a["id"])
                self.assertTrue(set(c["sources"]) <= ids, f"{a['id']} cites {set(c['sources']) - ids}")

    def test_ids_unique(self):
        ids = [a["id"] for a in D["answers"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_a_wrong_number_would_be_refused(self):
        from verify import check_claim
        corpus = {"F-solid-gap": "Every solid-fuel test with a recorded oxygen level sits between 13.6 and 22.2 %."}
        ok, _ = check_claim({"text": "Solid materials were tested up to 34 % oxygen.", "sources": ["F-solid-gap"]}, corpus)
        self.assertFalse(ok)


class Materials(unittest.TestCase):
    def test_no_material_tested_near_exploration_oxygen(self):
        for m in D["materials"]:
            if m["o2"]:
                self.assertLessEqual(m["o2"][1], 22.2, m["id"])

    def test_counts_match_tagged_tests(self):
        for m in D["materials"]:
            n = sum(1 for t in D["tests"] if m["id"] in t.get("m", []))
            self.assertEqual(n, m["flame"], m["id"])

    def test_nomex_recount_from_csv(self):
        n = 0
        for name, col in (("PSI-25_Experimental table_BASS-II.csv", 5), ("PSI-26_Experimental table_BASS.csv", 5), ("PSI-99_Experimental table_SAFFIRE-2.csv", 1)):
            h, b = rows(name)
            n += sum(1 for r in b if "nomex" in r[col].lower())
        self.assertEqual(n, next(m for m in D["materials"] if m["id"] == "nomex")["flame"])

    def test_wire_insulation_never_flame_tested(self):
        for mid in ("kapton", "teflon"):
            m = next(x for x in D["materials"] if x["id"] == mid)
            self.assertEqual(m["flame"], 0)
            self.assertGreater(m["smoke"], 0)



class Challenge(unittest.TestCase):
    """The official challenge statement, and what QUENCH derives from it."""

    def setUp(self):
        self.inv = {i["acc"]: i for i in D["investigations"] if i["combustion"]}

    @staticmethod
    def squash(t):
        return re.sub(r"\s+", " ", t.replace("\u2019", "'").replace("\u2018", "'")).strip()

    def test_quotes_are_in_the_saved_sources(self):
        src = os.path.join(ROOT, "data", "sources")
        with open(os.path.join(src, "space-apps-challenge_flame-in-freefall.txt"), encoding="utf-8") as fh:
            statement = self.squash(fh.read())
        with open(os.path.join(src, "saffire-vi-final_nasa.txt"), encoding="utf-8") as fh:
            saffire = self.squash(fh.read())
        self.assertGreaterEqual(len(D["challenge"]), 25)
        for key, q in D["challenge"].items():
            self.assertIn(self.squash(q["text"]), saffire if key.startswith("saffire6") else statement, key)

    def test_no_solid_run_at_moon_oxygen_recounted(self):
        moon = D["stats"]["moon_o2_min"]
        self.assertEqual(moon, 30)
        self.assertEqual(D["stats"]["moon_psia_max"], 10.2)
        vals = []
        h, b = rows("PSI-25_Experimental table_BASS-II.csv")
        i = next(k for k, x in enumerate(h) if "initial O2" in x)
        vals += [float(r[i]) for r in b if re.fullmatch(r"\d+(\.\d+)?", r[i].strip())]
        for name in ("PSI-98_Experimental table_SAFFIRE-1.csv", "PSI-99_Experimental table_SAFFIRE-2.csv"):
            h, b = rows(name)
            i = next(k for k, x in enumerate(h) if "Percent O2" in x)
            vals += [float(m.group()) for r in b for m in [re.search(r"\d+(\.\d+)?", r[i])] if m]
        self.assertEqual(sum(1 for v in vals if v >= moon), 0)
        self.assertEqual(D["stats"]["hi_o2"]["solid"], 0)

    def test_flex_runs_at_moon_oxygen_recounted(self):
        h, b = rows("PSI-69_Experimental table_FLEX.csv")
        io2 = next(k for k, x in enumerate(h) if x.startswith("O initial"))
        ip = next(k for k, x in enumerate(h) if "pressure" in x.lower())
        hi = [(float(r[io2]), float(r[ip]) / 760 * 14.696) for r in b if float(r[io2]) >= 0.30 - 1e-9]
        self.assertEqual(len(hi), D["stats"]["hi_o2"]["droplet"])
        self.assertEqual(sum(1 for o, p in hi if p <= 10.2), D["stats"]["moon_range"]["droplet"])
        near = [p for o, p in hi if 10.2 < p <= 10.2 * 1.05]
        self.assertEqual(len(near), D["stats"]["moon_near"]["droplet"])
        self.assertEqual([round(min(near), 1), round(max(near), 1)], D["stats"]["moon_near_psia"])

    def test_inverse_burner_oxygen_is_retained_separately(self):
        h, b = rows("PSI-159_Experimental table_CFI-G_Inverse Flames.csv")
        source = {r[h.index("Test")]: r for r in b}
        projected = [t for t in D["tests"] if t.get("flame_config") == "inverse"]
        self.assertEqual(len(projected), len(source))
        spurious = 0
        for t in projected:
            r = source[t["id"]]
            o2 = float(r[h.index("XO2")]) * 100
            atm = float(r[h.index("approx p (bar)")]) / 1.01325
            self.assertIsNone(t["o"])
            self.assertAlmostEqual(t["burner_o2"], o2)
            self.assertAlmostEqual(t["p"], atm)
            spurious += abs(o2 - 34) <= 4 and abs(atm / (8.2 / 14.696) - 1) <= 0.15
        self.assertEqual(spurious, 9)
        self.assertEqual(max(t["burner_o2"] for t in projected), D["stats"]["burner_o2_max"])
        self.assertEqual(D["stats"]["burner_o2_max"], 85)
        self.assertEqual(D["stats"]["o2_max_all"], 40)
        self.assertIn("85%", D["challenge"]["cfig_85"]["text"])

    def test_source_rows_and_all_cabin_matches(self):
        # Rebuild each eligible O2/pressure pair from NASA's actual column
        # meanings without calling QUENCH's parser, conversions, or predicates.
        pairs = []
        for acc, filename, o_header, p_header, divisor in (
                ("PSI-69", "FLEX", "O initial ambient composition; mole fraction", "Ambient pressure; mmHg", 760),
                ("PSI-39", "CFI", "Oxygen", "Pressure", 1),
                ("PSI-10", "Flame Design_Normal Flame", "XO2 (init)", "pinit (atm)", 1),
                ("PSI-159", "CFI-G_Normal Flames", "XO2 before test", "approx p (bar)", 1.01325)):
            h, b = rows(f"{acc}_Experimental table_{filename}.csv")
            if acc == "PSI-39":
                b = list(dict.fromkeys(tuple(c.strip() for c in r) for r in b))
                self.assertEqual(len(b), 79)
            i, j = h.index(o_header), h.index(p_header)
            source_pairs = [(float(r[i]) * 100, float(r[j].split()[0]) / divisor) for r in b]
            published = [t for t in D["tests"] if t["i"] == acc and t.get("flame_config") != "inverse"]
            self.assertEqual(len(published), len(source_pairs))
            for t, (o2, p) in zip(published, source_pairs):
                self.assertAlmostEqual(t["o"], o2)
                if p:
                    self.assertAlmostEqual(t["p"], p)
                    self.assertEqual(t["ps"], "recorded")
                    pairs.append((acc, t["k"], o2, p))
                else:
                    self.assertIsNone(t["p"])
        for a in D["atmospheres"]:
            hits = [(acc, k) for acc, k, o2, p in pairs if abs(o2 - a["o2"]) <= 4 and abs(p * 14.696 / a["psia"] - 1) <= .15]
            self.assertEqual(Counter(acc for acc, _ in hits), D["stats"]["coverage_by_study"][a["id"]])
            by_kind = Counter(k for _, k in hits)
            self.assertEqual({k: by_kind[k] for k in ("solid", "droplet", "gas")}, D["stats"]["coverage"][a["id"]])
        self.assertEqual(D["stats"]["coverage_by_study"]["exp"], {"PSI-159": 15})
        self.assertEqual(sum(acc == "PSI-159" and o2 >= 30 and p * 14.696 <= 10.2 for acc, _, o2, p in pairs), 20)
        self.assertEqual(sum(k == "gas" and o2 >= 30 for _, k, o2, _ in pairs), D["stats"]["hi_o2"]["gas"])
        self.assertEqual(sum(k == "gas" and o2 >= 30 and p * 14.696 <= 10.2 for _, k, o2, p in pairs), D["stats"]["moon_range"]["gas"])
        f1 = next(t for t in D["tests"] if t["id"] == "21153 F1")
        self.assertEqual((f1["flame_config"], f1["o"], f1["r"], f1["t"]), ("normal", 34.080788, "ext", 44))
        self.assertAlmostEqual(f1["p"] * 1.01325, .50665)

    def test_distinct_source_attempts_and_outcomes(self):
        self.assertEqual(len(D["tests"]), 1156)
        self.assertEqual(len([t for t in D["tests"] if t["o"] is not None]), 879)
        self.assertTrue(all(t["id"] for t in D["tests"]))
        cfig = {t["id"]: t for t in D["tests"] if t["i"] == "PSI-159"}
        self.assertEqual(len(cfig), 333)
        self.assertEqual(cfig["21106 F2"]["r"], "cool")
        self.assertEqual(cfig["21106 F5"]["r"], "cool")
        self.assertEqual(cfig["21106 F4"]["r"], "burn")
        self.assertEqual(cfig["21209 A2"]["r"], "other")
        self.assertEqual(sum(t["r"] == "ext" for t in cfig.values()), 183)
        self.assertEqual(sum(t["r"] == "nospread" for t in D["tests"] if t["i"] == "PSI-99"), 4)
        self.assertTrue(all(t["p"] is None for t in D["tests"] if t["k"] == "solid"))
        self.assertEqual([t["id"] for t in D["tests"] if t["i"] == "PSI-39" and t["p"] == .5], ["1356", "1357", "1358"])

    def test_named_investigations_are_tier_one(self):
        named = {"PSI-26", "PSI-25", "PSI-98", "PSI-99", "PSI-100", "PSI-102", "PSI-101", "PSI-69"}
        self.assertEqual({a for a, i in self.inv.items() if i["tier"] == 1}, named)
        statement = D["challenge"]["prevention"]["text"] + D["challenge"]["detection"]["text"] + D["challenge"]["suppression"]["text"]
        for word in ("BASS", "BASS-II", "Saffire", "SAME", "SAME-R", "FLEX"):
            self.assertIn(word, statement)
        self.assertEqual(self.inv["PSI-69"]["pillars"], ["suppression"])
        self.assertEqual(self.inv["PSI-102"]["pillars"], ["detection"])
        self.assertIn("suppression", self.inv["PSI-26"]["pillars"])
        self.assertEqual(sum(D["stats"]["tiers"].values()), len(self.inv))

    def test_hardware_families_cover_every_investigation_once(self):
        members = [a for f in D["families"] for a in f["members"]]
        self.assertEqual(sorted(members), sorted(self.inv))
        for f in D["families"]:
            for a in f["members"]:
                self.assertEqual(self.inv[a]["family"], f["id"])
        fam = {f["id"]: f for f in D["families"]}
        self.assertEqual(len(fam["acme"]["members"]), 6)      # "The six experiments in the ACME project"
        self.assertIn("six experiments", fam["acme"]["quote"]["text"])
        self.assertEqual(set(fam["mdca"]["members"]), {"PSI-69", "PSI-68", "PSI-39"})

    def test_what_varied_is_recounted_from_the_table(self):
        h, b = rows("PSI-69_Experimental table_FLEX.csv")
        cols = {c["h"]: c for c in self.inv["PSI-69"]["vars"]}
        fuel = cols["Fuel"]
        self.assertEqual(fuel["d"], len({r[h.index("Fuel")].strip() for r in b}))
        d0 = cols["Droplet initial diameter; mm"]
        vals = [float(r[h.index("Droplet initial diameter; mm")]) for r in b if re.fullmatch(r"\d+(\.\d+)?", r[h.index("Droplet initial diameter; mm")].strip())]
        self.assertEqual(d0["num"], [min(vals), max(vals)])
        self.assertEqual(d0["role"], "geometry")
        self.assertEqual(cols["Test end"]["role"], "result")
        self.assertNotIn("FLEX Identifier", cols)
        s2 = {c["h"]: c for c in self.inv["PSI-99"]["vars"]}
        self.assertEqual(s2["Air Flow (cm/s)"]["d"], 1)        # held constant in Saffire-II
        for i in self.inv.values():
            for c in i["vars"]:
                self.assertLessEqual(c["d"], c["n"])
                self.assertIn(c["role"], ("fuel", "geometry", "condition", "result"))

    def test_rank_parts_are_in_range(self):
        for a, i in self.inv.items():
            for k in ("named", "fuel", "data"):
                self.assertTrue(0 < i["rank"][k] <= 1, (a, k))
            self.assertIn(i["rank"]["g"], (0, 1))
        self.assertEqual({a for a, i in self.inv.items() if i["rank"]["g"]}, {"PSI-22", "PSI-99"})

    def test_findings_have_a_pillar_and_the_gap_names_saffire_vi(self):
        for f in D["findings"]:
            self.assertIn(f["pillar"], ("prevention", "detection", "suppression"), f["id"])
        gap = next(f for f in D["findings"] if f["id"] == "solid-gap")
        self.assertIn("Saffire-VI", gap["limits"])
        self.assertIn("higher oxygen concentration and lower pressure", gap["limits"])
        self.assertIn("archive", gap["title"].lower())

    def test_downloads_match_the_data(self):
        dl = os.path.join(ROOT, "web", "downloads")
        with open(os.path.join(dl, "quench-runs.csv"), encoding="utf-8", newline="") as fh:
            runs = list(csv.DictReader(fh))
        self.assertEqual(len(runs), len(D["tests"]))
        for r, t in zip(runs, D["tests"]):
            self.assertEqual(r["o2_percent"], r["ambient_o2_percent"])
            self.assertEqual(float(r["ambient_o2_percent"]) if r["ambient_o2_percent"] else None, t["o"])
            self.assertEqual(float(r["burner_oxidizer_o2_percent"]) if r["burner_oxidizer_o2_percent"] else None, t.get("burner_o2"))
            self.assertEqual(r["pressure_source"], "recorded" if t["p"] is not None else "not recorded")
        self.assertEqual(sum(1 for r in runs if r["fuel_type"] == "solid" and r["o2_percent"] and float(r["o2_percent"]) > 22.2), 0)
        self.assertEqual(sum(1 for r in runs if r["outcome"]), D["stats"]["with_outcome"])
        with open(os.path.join(dl, "quench-investigations.csv"), encoding="utf-8", newline="") as fh:
            invs = list(csv.DictReader(fh))
        self.assertEqual(len(invs), len(self.inv))
        ci = next(i for i in invs if i["accession"] == "PSI-159")
        self.assertEqual((ci["runs_listed"], ci["runs_with_oxygen"]), ("333", "179"))
        self.assertEqual(float(ci["o2_max_percent"]), 39.97)
        self.assertEqual(float(ci["burner_oxidizer_o2_max_percent"]), 85)
        with open(os.path.join(dl, "README.txt"), encoding="utf-8") as fh:
            self.assertIn("SI notice", fh.read())


if __name__ == "__main__":
    unittest.main()
