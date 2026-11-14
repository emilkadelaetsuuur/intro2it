# SI notice: written with SI (AI) assistance (Claude, Anthropic).
"""Checks for the gravity pairs, the published-results layer, the instant answers and the cache tags.

    python3 -m unittest discover -s tests -v
"""
import csv
import html
import io
import json
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))


def load_data():
    with open(os.path.join(ROOT, "web", "data.js"), encoding="utf-8") as fh:
        return json.loads(fh.read().split("window.FLAME = ", 1)[1].rstrip().rstrip(";"))


D = load_data()
with open(os.path.join(ROOT, "web", "index.html"), encoding="utf-8") as fh:
    PAGE = fh.read()


class GravityPairs(unittest.TestCase):
    """Saffire-II: microgravity beside normal gravity, recounted straight from the PSI table."""

    def recount(self):
        path = os.path.join(ROOT, "data", "raw", "tables", "PSI-99_Experimental table_SAFFIRE-2.csv")
        with open(path, encoding="utf-8", errors="replace") as fh:
            rows = [r for r in csv.reader(io.StringIO(fh.read())) if any(c.strip() for c in r)]
        out = []
        for r in rows[1:]:
            if not r[6].strip():
                continue                       # flow-visualisation and note rows carry no oxygen value
            def cm(cell):
                cell = " ".join(cell.split())
                if cell in ("~ 0", "~0"):
                    return 0.0
                if cell.lower() == "complete":
                    return float(r[3].replace("cm", "").strip())
                m = re.fullmatch(r"~? ?(\d+(?:\.\d+)?) cm(?: \(note \d\))?", cell)
                return float(m.group(1)) if m else None
            out.append((r[0].strip(), cm(r[11]), cm(r[13])))
        return out

    def test_pairs_match_the_table(self):
        mine = self.recount()
        self.assertEqual(len(mine), 9)
        self.assertEqual([(g["id"], g["ug_cm"], g["g1_cm"]) for g in D["gravity_pairs"]], mine)

    def test_summary_is_recounted(self):
        both = [(u, g) for _, u, g in self.recount() if u is not None and g is not None]
        s = D["gravity_summary"]
        self.assertEqual(s["samples"], 9)
        self.assertEqual(s["comparable"], len(both))
        self.assertEqual(s["less_in_ug"], sum(1 for u, g in both if u < g))
        self.assertEqual(s["same"], sum(1 for u, g in both if u == g))
        self.assertEqual(s["more_in_ug"], sum(1 for u, g in both if u > g))
        self.assertEqual(s["less_in_ug"] + s["same"] + s["more_in_ug"], s["comparable"])

    def test_bounding_quote_is_in_the_challenge_statement(self):
        with open(os.path.join(ROOT, "data", "sources", "space-apps-challenge_flame-in-freefall.txt"), encoding="utf-8") as fh:
            self.assertIn(D["challenge"]["bound"]["text"], " ".join(fh.read().split()))


class PublishedLayer(unittest.TestCase):
    """Saffire-VI events drawn on the map are published results, never PSI rows."""

    def test_two_published_solid_burns_sit_in_the_moon_range(self):
        runs = D["external_saffire6"]["runs"]
        psia = lambda kpa: kpa / 101.325 * 14.696
        inside = [r for r in runs if r["pressure_kpa"] is not None and r["oxygen_percent"] >= D["stats"]["moon_o2_min"]
                  and psia(r["pressure_kpa"]) <= D["stats"]["moon_psia_max"]]
        self.assertEqual(len(inside), 2)
        self.assertEqual(sorted(r["material_id"] for r in inside), ["pmma", "sibal"])

    def test_published_events_are_not_in_the_run_tables_or_the_csv(self):
        self.assertFalse(any(t["a"].upper().startswith("SAFFIRE-VI") for t in D["tests"]))
        self.assertEqual(D["stats"]["hi_o2"]["solid"], 0)
        with open(os.path.join(ROOT, "web", "downloads", "quench-runs.csv"), encoding="utf-8") as fh:
            self.assertNotIn("Saffire-VI", fh.read())


class InstantAnswers(unittest.TestCase):
    """The page's own example questions must be stored phrasings, so they are answered at once."""

    def test_example_questions_are_in_the_answer_bank(self):
        stored = {q for a in D["answers"] for q in a["q"]}
        chips = re.search(r'<div id="askchips">(.*?)</div>', PAGE, re.S).group(1)
        examples = [html.unescape(x).strip() for x in re.findall(r"<button[^>]*>(.*?)</button>", chips, re.S)]
        examples += [html.unescape(x) for x in re.findall(r'data-cosmo-question="([^"]+)"', PAGE)]
        self.assertGreaterEqual(len(examples), 5)
        for q in examples:
            self.assertTrue(q in stored, "not a stored phrasing: " + q)

    def test_every_answer_has_claims_with_known_records(self):
        known = set(D["record_ids"])
        for a in D["answers"]:
            self.assertTrue(a["claims"], a["id"])
            for c in a["claims"]:
                self.assertTrue(c["sources"] and set(c["sources"]) <= known, a["id"])


class SiMarksAndCacheTags(unittest.TestCase):
    def test_generated_artwork_is_marked_where_it_appears(self):
        self.assertIn('<span class="cosmo-si">SI-generated</span>', PAGE)   # under the Cosmo figure
        self.assertIn("SI-generated character", PAGE)      # in the chat header
        with open(os.path.join(ROOT, "web", "tools.js"), encoding="utf-8") as fh:
            self.assertIn("are SI-generated images", fh.read())   # footer, covers the logo

    def test_cache_tags_match_the_files(self):
        import stamp_assets
        _, stale = stamp_assets.stamp(PAGE)
        self.assertEqual(stale, [], "run python3 scripts/stamp_assets.py")


class DataVolume(unittest.TestCase):
    """The archive's size comes from the total PSI declares per record, not from a partial file list."""

    def setUp(self):
        with open(os.path.join(ROOT, "data", "raw", "investigations.csv"), encoding="utf-8", newline="") as fh:
            self.rows = {r["accession"]: r for r in csv.DictReader(fh)}

    def test_total_is_the_sum_of_psi_totals_for_combustion_records(self):
        combustion = {i["acc"] for i in D["investigations"] if i["combustion"]}
        total = sum(float(self.rows[a]["psi_total_gb"]) for a in combustion)
        self.assertEqual(D["stats"]["raw_tb"], round(total / 1000, 1))
        self.assertEqual(D["stats"]["raw_tb"], 13.5)

    def test_no_record_is_smaller_than_its_listed_files(self):
        for acc, r in self.rows.items():
            self.assertGreaterEqual(float(r["psi_total_gb"]) + 0.01, float(r["all_files_gb"]), acc)

    def test_flex_archive_is_not_reported_as_empty(self):
        flex = next(i for i in D["investigations"] if i["acc"] == "PSI-69")
        self.assertGreater(flex["raw_gb"], 900)      # PSI shows 860.39 GiB of data files for FLEX
        self.assertEqual(float(self.rows["PSI-69"]["all_files_gb"]), 0.0)   # the partial list that misled the first build


class Notebook(unittest.TestCase):
    """The modelling notebook is generated from a script; its cells must run and agree with the site."""

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, os.path.join(ROOT, "notebooks"))
        try:
            import pandas  # noqa: F401
        except ImportError:
            raise unittest.SkipTest("pandas is not installed")
        import build_notebook
        cls.nb = build_notebook
        cls.text, cls.env = build_notebook.run()

    def test_cells_reproduce_the_cabin_coverage(self):
        cov = self.env["coverage"]
        self.assertEqual(list(cov["all"]), [sum(D["stats"]["coverage"][k].values()) for k in ("iss", "eva", "exp")])
        self.assertEqual(int(cov.loc["Exploration", "solid"]), 0)
        self.assertEqual(len(self.env["moon"]), sum(D["stats"]["moon_range"].values()))

    def test_model_beats_guessing_on_unseen_runs(self):
        self.assertEqual(len(self.env["flex"]), D["model_card"]["n"])
        import numpy as np
        self.assertGreater(float(np.mean(self.env["scores"])), self.env["baseline"] + 0.08)
        self.assertEqual(int(self.env["inside"]), 0)          # no FLEX run near the exploration atmosphere

    def test_saved_notebook_matches_the_script(self):
        with open(os.path.join(ROOT, "notebooks", "quench_runs_model.ipynb"), encoding="utf-8") as fh:
            saved = json.load(fh)
        cells = ["".join(c["source"]) for c in saved["cells"]]
        self.assertEqual(cells, [src for _, src in self.nb.CELLS], "run python3 notebooks/build_notebook.py")
        self.assertIn("SI", saved["metadata"]["si_notice"])


class Tour(unittest.TestCase):
    def test_every_stop_points_at_something_on_the_page(self):
        with open(os.path.join(ROOT, "web", "tour.js"), encoding="utf-8") as fh:
            stops = re.findall(r'\["(\w+)", "([#.][\w-]+)", "', fh.read())
        self.assertEqual(len(stops), 7)
        for view, selector in stops:
            self.assertIn(f'id="v-{view}"', PAGE, view)
            needle = f'id="{selector[1:]}"' if selector[0] == "#" else f'class="{selector[1:]}"'
            self.assertIn(needle, PAGE, selector)
        self.assertGreaterEqual(PAGE.count("data-tour-start"), 2)


if __name__ == "__main__":
    unittest.main()
