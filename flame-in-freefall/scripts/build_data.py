#!/usr/bin/env python3
# SI notice: written with SI (AI) assistance (Claude, Anthropic) and reviewed by the team.
"""Build web/data.js from the raw NASA PSI tables in data/raw.

Every number the dashboard shows is computed here from the CSV files exactly as
NASA PSI serves them. Nothing is typed in by hand. Standard library only.

    python3 scripts/build_data.py
"""
import collections
import csv
import datetime
import io
import json
import math
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
TAB = os.path.join(RAW, "tables")
OUT = os.path.join(ROOT, "web", "data.js")

PSI_URL = "https://psi.nasa.gov/physci/repo/data/investigations/"
NOT_COMBUSTION = {"PSI-181", "PSI-108"}  # returned by the "combustion" search, but about solders / fluid physics

# Cabin atmospheres NASA names in the ACME BRE record (PSI-20 objective):
# "14.7 psia, 21 % oxygen: 10.2 psia, 26.5 %; and 8.2 psia, 34 % oxygen"
PSIA = 14.696
ATMOSPHERES = [
    {"id": "iss", "name": "ISS / sea level", "short": "ISS", "psia": 14.7, "o2": 21.0,
     "use": "International Space Station and Earth sea level"},
    {"id": "eva", "name": "10.2 psia cabin", "short": "10.2 psia", "psia": 10.2, "o2": 26.5,
     "use": "Reduced-pressure cabin that shortens spacewalk preparation"},
    {"id": "exp", "name": "Exploration atmosphere", "short": "Exploration", "psia": 8.2, "o2": 34.0,
     "use": "Proposed for lunar landers, rovers and surface habitats"},
]
for a in ATMOSPHERES:
    a["p"] = round(a["psia"] / PSIA, 3)

O2_WINDOW = 4.0      # percentage points either side of the target
P_WINDOW = 0.15      # pressure within +/-15 % of the target


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def read_table(name):
    with open(os.path.join(TAB, name), encoding="utf-8", errors="replace") as fh:
        rows = [r for r in csv.reader(io.StringIO(fh.read())) if any(c.strip() for c in r)]
    header = [norm(h) for h in rows[0]]
    return header, [[norm(c) for c in r] + [""] * (len(header) - len(r)) for r in rows[1:]]


def col(header, pattern):
    for i, h in enumerate(header):
        if re.search(pattern, h, re.I):
            return i
    raise KeyError(pattern)


def num(s):
    """A clean number or None. Never guesses at free text."""
    s = norm(s).replace(",", "")
    return float(s) if re.fullmatch(r"-?\d+(\.\d+)?", s) else None


def first_num(s):
    m = re.search(r"\d+(\.\d+)?", norm(s))
    return float(m.group()) if m else None


def r3(x):
    return None if x is None else round(x, 3)


tests = []          # one record per test run that PSI lists
conditions = []     # day-level oxygen settings (no per-run rows in PSI)
notes = []          # every cleaning decision, shown in the app
table_rows = collections.Counter()


def add(inv, acr, kind, tid, fuel, o2=None, p=None, p_src=None, outcome="na", raw="", **extra):
    rec = {"i": inv, "a": acr, "k": kind, "id": tid, "f": fuel, "o": r3(o2), "p": r3(p), "ps": p_src,
           "r": outcome, "rr": raw}
    rec.update({k: v for k, v in extra.items() if v not in (None, "")})
    tests.append(rec)


# ---------------------------------------------------------------- FLEX (PSI-69)
h, rows = read_table("PSI-69_Experimental table_FLEX.csv")
table_rows["PSI-69"] = len(rows)
c = {k: col(h, pat) for k, pat in {
    "id": r"^FLEX Identifier", "fuel": r"^Fuel$", "p": r"pressure", "o": r"^O initial", "n": r"^N initial",
    "co2": r"^CO initial", "he": r"^He initial", "d0": r"initial diameter", "dx": r"extinction diameter",
    "k": r"^Burning rate", "t": r"^Burn time", "end": r"^Test end"}.items()}
FLEX_END = {"Extinction": "ext", "Completion": "burn", "Disruption": "other"}
for r in rows:
    mm = num(r[c["p"]])
    p = mm / 760.0 if mm else None
    if mm == 0:
        notes.append(f"FLEX test {r[c['id']]}: ambient pressure is 0 mmHg in the source table, so the test has no pressure here.")
    o = num(r[c["o"]])
    add("PSI-69", "FLEX", "droplet", r[c["id"]], r[c["fuel"]], o * 100 if o is not None else None, p,
        "recorded" if p else None, FLEX_END.get(r[c["end"]], "na"), r[c["end"]],
        co2=num(r[c["co2"]]), he=num(r[c["he"]]), d0=num(r[c["d0"]]), dx=num(r[c["dx"]]),
        kb=num(r[c["k"]]), t=num(r[c["t"]]))
notes.append("FLEX: the column headed 'CO initial ambient composition' is read as CO2. The FLEX record names CO2, "
             "helium and SF6 as the suppressants, and subscripts are lost throughout the PSI header.")

# ----------------------------------------------------------------- CFI (PSI-39)
h, rows = read_table("PSI-39_Experimental table_CFI.csv")
table_rows["PSI-39"] = len(rows)
for r in rows:
    o = num(r[col(h, "^Oxygen")])
    add("PSI-39", "CFI", "droplet", r[col(h, "^Flex Number")], r[col(h, "^Fuel")],
        o * 100 if o is not None else None, first_num(r[col(h, "^Pressure")]), "recorded",
        he=num(r[col(h, "^Helium")]))

# ------------------------------------------------- ACME CFI-G inverse (PSI-159)
h, rows = read_table("PSI-159_Experimental table_CFI-G_Inverse Flames.csv")
table_rows["PSI-159"] = len(rows)
for r in rows:
    term = r[col(h, "Self")]
    hot = r[col(h, "Hot ignition")].lower()
    if term == "SE":
        outcome = "ext"
    elif term == "FT":
        outcome = "burn"
    elif hot == "no":
        outcome = "noign"
    else:
        outcome = "na"
    raw = {"SE": "Self-extinguished", "FT": "Burned until flow was stopped"}.get(term, "Did not ignite" if outcome == "noign" else "Not recorded")
    bar = num(r[col(h, r"approx p")])
    o = num(r[col(h, "^XO2")])
    add("PSI-159", "ACME CFI-G", "gas", r[col(h, "^Test$")], r[col(h, "^Fuel$")],
        o * 100 if o is not None else None, bar / 1.01325 if bar else None, "recorded", outcome, raw,
        t=num(r[col(h, "burn time")]))

# --------------------------------------------- ACME Flame Design normal (PSI-10)
h, rows = read_table("PSI-10_Experimental table_Flame Design_Normal Flame.csv")
table_rows["PSI-10"] = len(rows)
for r in rows:
    o = num(r[col(h, r"XO2 \(init\)")])
    add("PSI-10", "ACME Flame Design", "gas", r[col(h, "^Test$")], r[col(h, "^Fuel$")],
        o * 100 if o is not None else None, num(r[col(h, "pinit")]), "recorded")

# ------------------------------------------------------------ BASS-II (PSI-25)
h, rows = read_table("PSI-25_Experimental table_BASS-II.csv")
table_rows["PSI-25"] = len(rows)
for r in rows:
    add("PSI-25", "BASS-II", "solid", r[col(h, r"^Test #")], r[col(h, "Fuel Sample Material")],
        num(r[col(h, "initial O2")]), None, "assumed", pi=r[col(h, "^PI$")])
notes.append("BASS-II and Saffire: the tables give no pressure. Both ran at cabin pressure, so the map draws them at 1 atm "
             "with a hollow marker. They are never counted as pressure-matched evidence.")
notes.append("BASS-II: the table lists test conditions only. Flame spread and extinction results are in the raw video and the publications.")

# --------------------------------------------------------------- BASS (PSI-26)
h, rows = read_table("PSI-26_Experimental table_BASS.csv")
table_rows["PSI-26"] = len(rows)
for r in rows:
    add("PSI-26", "BASS", "solid", r[col(h, r"^As Run Test")], r[col(h, "Fuel Sample Material")])
notes.append("BASS: the table lists only the sample material for each of its tests. No oxygen, flow or result columns.")

# ------------------------------------------------------- Saffire I-III (98-100)
h, rows = read_table("PSI-98_Experimental table_SAFFIRE-1.csv")
table_rows["PSI-98"] = len(rows)
for r in rows:
    if not r[col(h, "Percent O2")]:
        continue  # pre-test flow visualisation rows
    add("PSI-98", "SAFFIRE-I", "solid", r[0], r[col(h, "^Material")], first_num(r[col(h, "Percent O2")]), None,
        "assumed", "burn", "Burned for " + r[col(h, "Burn Time")] + " s",
        flow=num(r[col(h, "Air Flow")]), dir=r[col(h, "Flow Direction")])

h, rows = read_table("PSI-99_Experimental table_SAFFIRE-2.csv")
table_rows["PSI-99"] = len(rows)
last_material = ""
saffire2 = []
for r in rows:
    if not r[6]:
        continue
    material = r[1] or last_material
    if not r[1]:
        notes.append(f"Saffire-II sample {r[0]}: the material cell is blank in the source and is read as the row above ({last_material}).")
    last_material = material
    ug_len, ug_rate, g_len, g_rate = r[11], r[12], r[13], r[14]
    spread = not re.fullmatch(r"~ ?0", ug_len)
    saffire2.append({"id": r[0], "material": material, "thick": r[2], "o2": first_num(r[6]), "dir": r[10],
                     "ug_len": ug_len, "ug_rate": ug_rate, "g_len": g_len, "g_rate": g_rate, "spread": spread,
                     "g_burned": not re.fullmatch(r"~ ?0.*", g_len)})
    add("PSI-99", "SAFFIRE-II", "solid", r[0], material + (", " + r[2] if r[2] else ""), first_num(r[6]), None,
        "assumed", "burn" if spread else "ext",
        ("Burned " + ug_len + " in microgravity") if spread else "Did not spread in microgravity",
        flow=first_num(r[5]), dir=r[10], g1=g_len)

h, rows = read_table("PSI-100_Experimental table_SAFFIRE-3.csv")
table_rows["PSI-100"] = len(rows)
for r in rows:
    add("PSI-100", "SAFFIRE-III", "solid", r[0], r[1], flow=first_num(r[5]), dir=r[6])

# ----------------------------------------------- day-level tables: BRE, s-Flame
h, rows = read_table("PSI-20_Experimental table_ACME BRE.csv")
table_rows["PSI-20"] = len(rows)
for r in rows:
    raw = r[col(h, "Oxygen Conc")]
    if raw.endswith("%"):
        vals = [float(raw.rstrip("%")) / 100.0]
        notes.append(f"ACME BRE {r[1]} {r[2]} {r[0]}: oxygen is written '{raw}' in the source and is read as {vals[0]:g} %.")
    else:
        vals = [float(v) for v in re.findall(r"\d+(?:\.\d+)?", raw)]
    conditions.append({"i": "PSI-20", "a": "ACME BRE", "k": "gas", "day": f"{r[2]} {r[1]} {r[0]}",
                       "f": r[col(h, "Fuel Bottle")], "o": vals, "n": int(num(r[col(h, "Flames Ignited")]) or 0)})
notes.append("ACME BRE: PSI lists oxygen levels per test day, not per flame, and states that chamber pressures "
             "'are not identified in this summary table'. BRE therefore appears on the oxygen strip only.")

h, rows = read_table("PSI-23_Experimental table_ACME s-Flame.csv")
table_rows["PSI-23"] = len(rows)
for r in rows:
    vals = [float(v) for v in re.findall(r"~(\d+(?:\.\d+)?)%", r[col(h, "Atmosphere")])]
    conditions.append({"i": "PSI-23", "a": "ACME s-Flame", "k": "gas", "day": f"{r[4]} {r[3]} {r[2]}",
                       "f": r[col(h, "Fuel Bottle")], "o": vals, "n": int(num(r[col(h, "Flames Ignited")]) or 0), "p": 1.0})

# -------------------------------------------------- FLEX-2 design matrix (PSI-68)
h, rows = read_table("PSI-68_Experimental table_Flex2.csv")
table_rows["PSI-68"] = len(rows)
flex2 = {"fuels": [r[0] for r in rows],
         "o2": [round(float(v) * 100, 1) for v in re.findall(r"\d\.\d+", rows[0][col(h, "Oxygen")])],
         "p": [float(v) for v in re.findall(r"\d\.\d+", rows[0][col(h, "Pressure")])]}
notes.append("FLEX-2: PSI holds a design matrix (planned oxygen and pressure levels per fuel), not a list of runs. "
             "It is shown as planned conditions and never counted as tests.")

# remaining tables only contribute row counts to the catalogue
for name in sorted(os.listdir(TAB)):
    acc = name.split("_")[0]
    if acc not in table_rows:
        table_rows[acc] = len(read_table(name)[1])

# ------------------------------------------------------------ investigations
with open(os.path.join(RAW, "investigations.csv"), encoding="utf-8") as fh:
    inv_rows = list(csv.DictReader(fh))
with open(os.path.join(RAW, "investigations_text.json"), encoding="utf-8") as fh:
    texts = {t["accession"]: t for t in json.load(fh)}
pubs = collections.defaultdict(list)
with open(os.path.join(RAW, "publications.csv"), encoding="utf-8") as fh:
    for p in csv.DictReader(fh):
        pubs[p["accession"]].append({"t": p["title"], "au": p["authors"], "doi": p["doi"]})

HAS_OUTCOME = {"PSI-69": "end state, extinction diameter, burning rate", "PSI-159": "self-extinguished or flow stopped",
               "PSI-99": "burn length and spread rate, microgravity vs 1 g", "PSI-98": "burn time"}
investigations = []
for r in inv_rows:
    acc = r["accession"]
    t = texts[acc]
    mine = [x for x in tests if x["i"] == acc]
    o2 = [x["o"] for x in mine if x["o"] is not None] + [v for c2 in conditions if c2["i"] == acc for v in c2["o"]]
    pr = [x["p"] for x in mine if x["p"] is not None]
    kinds = collections.Counter(x["k"] for x in mine)
    investigations.append({
        "acc": acc, "acr": r["acronym"], "title": r["title"], "platform": r["platform"], "area": r["sub_area"],
        "type": r["project_type"], "start": r["start"], "end": r["end"], "doi": r["doi"], "lic": r["license"],
        "npub": int(r["publications"]), "files": int(r["files"]), "raw_gb": float(r["raw_data_gb"]),
        "rows": table_rows.get(acc, 0), "mapped": len([x for x in mine if x["o"] is not None]),
        "o2": [min(o2), max(o2)] if o2 else None, "p": [min(pr), max(pr)] if pr else None,
        "kind": kinds.most_common(1)[0][0] if kinds else ("gas" if any(c2["i"] == acc for c2 in conditions) else None),
        "outcome": HAS_OUTCOME.get(acc), "combustion": acc not in NOT_COMBUSTION,
        "objective": t["objective"], "hypothesis": t["hypothesis"], "approach": t["approach"],
        "impacts": t["research_impacts"], "keywords": t["keywords"], "hardware": t["hardware"],
        "pubs": pubs.get(acc, []), "url": PSI_URL + acc,
    })
inv_by = {i["acc"]: i for i in investigations}

# ------------------------------------------------------------------ materials
MATERIAL_DEFS = [
    ("pmma", "PMMA (acrylic)", "Clear plastic; NASA's reference solid fuel, burned as films, rods, slabs and spheres"),
    ("sibal", "Cotton-fiberglass fabric (SIBAL)", "Reference fabric, 75 % cotton and 25 % fiberglass"),
    ("nomex", "Nomex", "Flame-resistant aramid fabric"),
    ("silicone", "Silicone", "Silicone sheet and rubber"),
    ("ultem", "Ultem", "Polyetherimide sheet"),
    ("wax", "Wax", "Candle and paraffin wax"),
    ("kapton", "Kapton", "Polyimide film"),
    ("teflon", "Teflon", "PTFE"),
]


def mats_of(text):
    s, out = text.lower(), []
    if "sibal" in s or "cotton" in s:
        out.append("sibal")
    if "nomex" in s:
        out.append("nomex")
    if "silicone" in s:
        out.append("silicone")
    if "ultem" in s:
        out.append("ultem")
    if "wax" in s or "candle" in s:
        out.append("wax")
    if "pmma" in s or (not out and re.search(r"sphere|spherical|rod|film|micron|slab", s)):
        out.append("pmma")
    return out


for t in tests:
    if t["k"] == "solid":
        t["m"] = mats_of(t["f"])
notes.append("Materials: BASS-II rods, films and slabs are counted as PMMA, as the BASS-II ReadMe on PSI describes them. "
             "BASS rows that say only 'sphere' are counted as PMMA, like the sphere rows in the same table that name it.")
smoke = collections.Counter()
for name, col_i in (("PSI-101_Experimental table_SAME-R.csv", 0), ("PSI-102_Experimental table_SAME.csv", 1)):
    for r in read_table(name)[1]:
        w = r[col_i].lower()
        for key in ("kapton", "teflon", "silicone", "lampwick", "pyrell", "dibutyl"):
            if key in w:
                smoke[key] += 1
materials = []
for mid, name, what in MATERIAL_DEFS:
    mine = [t for t in tests if mid in t.get("m", [])]
    o2 = [t["o"] for t in mine if t["o"] is not None]
    invs = collections.Counter(t["a"] for t in mine)
    res = []
    for s2 in saffire2:
        if mid in mats_of(s2["material"]):
            if mid == "nomex":
                res.append(f"Saffire-II sample {s2['id']} (PMMA and Nomex): the Nomex part did not burn in microgravity.")
            elif s2["spread"]:
                res.append(f"Saffire-II sample {s2['id']} ({s2['thick']}): burned {s2['ug_len']}" + (f" at {s2['ug_rate']}" if "mm/s" in s2["ug_rate"] else "") + f" in microgravity; 1 g result: {s2['g_len']}.")
            else:
                res.append(f"Saffire-II sample {s2['id']} ({s2['thick']}): did not spread in microgravity; 1 g result: {s2['g_len']}.")
    materials.append({"id": mid, "name": name, "what": what, "flame": len(mine), "with_o2": len(o2),
                      "o2": [min(o2), max(o2)] if o2 else None, "invs": dict(invs), "smoke": smoke.get(mid, 0), "results": res})
smoke_only = {"lampwick": smoke["lampwick"], "pyrell": smoke["pyrell"], "dibutyl": smoke["dibutyl"]}

# -------------------------------------------------------------------- statistics
def in_window(t, atm):
    return (t["o"] is not None and t["p"] is not None and t["ps"] == "recorded"
            and abs(t["o"] - atm["o2"]) <= O2_WINDOW and abs(t["p"] / atm["p"] - 1) <= P_WINDOW)


def pct(a, b):
    return round(100.0 * a / b) if b else 0


comb = [i for i in investigations if i["combustion"]]
solid_o2 = [t["o"] for t in tests if t["k"] == "solid" and t["o"] is not None]
flex = [t for t in tests if t["i"] == "PSI-69"]
flex_plain = [t for t in flex if not t.get("co2") and not t.get("he")]
bands = [("below 18 %", lambda o: o < 18), ("18 to 25 %", lambda o: 18 <= o < 25), ("25 % and above", lambda o: o >= 25)]
flex_bands = []
for label, test in bands:
    grp = [t for t in flex_plain if test(t["o"])]
    ext = sum(1 for t in grp if t["r"] == "ext")
    flex_bands.append({"label": label, "n": len(grp), "ext": ext, "pct": pct(ext, len(grp))})
flex_hi = [t for t in flex if t["o"] >= 32]
droplet_low_p = [t for t in tests if t["k"] == "droplet" and t["p"] and t["p"] < 0.65]

exp = ATMOSPHERES[2]
coverage = {}
for a in ATMOSPHERES:
    cnt = collections.Counter(t["k"] for t in tests if in_window(t, a))
    coverage[a["id"]] = {k: cnt.get(k, 0) for k in ("solid", "droplet", "gas")}

flex_co2 = [t for t in flex if t.get("co2")]
flex_he = [t for t in flex if t.get("he")]
silicone = [s for s in saffire2 if "silicone" in s["material"].lower()]
sibal2 = [s for s in saffire2 if "sibal" in s["material"].lower()]
bre = [c2 for c2 in conditions if c2["i"] == "PSI-20"]
no_cond_solids = [t for t in tests if t["k"] == "solid" and t["o"] is None]
with_outcome = [t for t in tests if t["r"] != "na"]

stats = {
    "investigations": len(investigations), "combustion": len(comb),
    "table_rows": sum(i["rows"] for i in comb), "tables": len([n for n in os.listdir(TAB)]),
    "tests": len(tests), "mapped": len([t for t in tests if t["o"] is not None]),
    "with_outcome": len(with_outcome),
    "pubs": sum(i["npub"] for i in comb), "raw_tb": round(sum(i["raw_gb"] for i in comb) / 1000.0, 1),
    "solid_o2_min": min(solid_o2), "solid_o2_max": max(solid_o2), "solid_with_o2": len(solid_o2),
    "solid_no_conditions": len(no_cond_solids),
    "flex_n": len(flex), "flex_o2_max": max(t["o"] for t in flex),
    "flex_hi_o2": len(flex_hi), "flex_hi_ext": len([t for t in flex_hi if t["r"] == "ext"]),
    "flex_hi_p": [min(t["p"] for t in flex_hi), max(t["p"] for t in flex_hi)],
    "flex_near_07": len([t for t in flex if t["p"] and 0.6 <= t["p"] < 0.8]),
    "flex_near_10": len([t for t in flex if t["p"] and 0.9 <= t["p"] < 1.1]),
    "droplet_low_p": len(droplet_low_p), "droplet_low_p_o2_max": max(t["o"] for t in droplet_low_p),
    "flex_bands": flex_bands,
    "flex_co2": len(flex_co2), "flex_he": len(flex_he),
    "flex_co2_o2_max": max(t["o"] for t in flex_co2), "flex_co2_hi": len([t for t in flex_co2 if t["o"] >= 30]),
    "flex_co2_min": min(t["co2"] for t in flex_co2), "flex_co2_max": max(t["co2"] for t in flex_co2), "flex_he_max": max(t["he"] for t in flex_he),
    "flex_he_o2_max": max(t["o"] for t in flex_he),
    "coverage": coverage, "o2_window": O2_WINDOW, "p_window": P_WINDOW,
    "silicone_n": len(silicone), "silicone_no_spread": len([s for s in silicone if not s["spread"]]),
    "silicone_burned_1g": len([s for s in silicone if s["g_burned"]]),
    "sibal_rates": [s["ug_rate"] for s in sibal2],
    "bre_days": len(bre), "bre_flames": sum(c2["n"] for c2 in bre),
    "bre_days_34": len([c2 for c2 in bre if 34.0 in c2["o"]]), "bre_levels": sorted({v for c2 in bre for v in c2["o"]}),
    "cfi_n": len([t for t in tests if t["i"] == "PSI-39"]),
    "cfig_n": len([t for t in tests if t["i"] == "PSI-159"]),
    "cfig_se": len([t for t in tests if t["i"] == "PSI-159" and t["r"] == "ext"]),
    "bass_n": table_rows["PSI-26"], "bass2_n": table_rows["PSI-25"],
    "bass2_raw": [inv_by["PSI-25"]["raw_gb"], inv_by["PSI-26"]["raw_gb"]],
    "same_rows": table_rows["PSI-101"] + table_rows["PSI-102"],
    "platforms": sorted({i["platform"] for i in comb if i["platform"] and i["platform"] != "Not Applicable"}),
}
S = stats
gap = exp["o2"] - S["solid_o2_max"]

# ------------------------------------------------------------- curated content
with open(os.path.join(ROOT, "data", "curated", "content.json"), encoding="utf-8") as fh:
    CUR = json.load(fh)
SRC_DIR = os.path.join(ROOT, "data", "sources")
_src_text = {}


def squash(t):
    return re.sub(r"\s+", " ", t.replace("\u2019", "'").replace("\u2018", "'")).strip()


def check_quote(src_key, text):
    """Fail the build if a quote is not word for word in its saved source."""
    meta = CUR["sources"][src_key]
    if src_key not in _src_text:
        with open(os.path.join(SRC_DIR, meta["file"]), encoding="utf-8") as fh:
            _src_text[src_key] = squash(fh.read())
    assert squash(text) in _src_text[src_key], f"quote not found in {meta['file']}: {text[:80]}"
    return {"text": text, "src": meta["title"], "url": meta["url"]}


GQ = {k: check_quote(v["src"], v["text"]) for k, v in CUR["guide_quotes"].items()}
history = []
for h in CUR["history"]:
    h = dict(h)
    h["quotes"] = [check_quote(q["src"], q["text"]) for q in h["quotes"]]
    h["changed_quote"] = check_quote(h["changed_quote"]["src"], h["changed_quote"]["text"])
    history.append(h)
spinoffs = []
for sp in CUR["spinoffs"]:
    q = check_quote(sp["src"], sp["quote"])
    spinoffs.append({**sp, "src_title": q["src"], "url": q["url"]})
sources_list = [{"key": k, "title": v["title"], "url": v["url"]} for k, v in CUR["sources"].items()]


def table_numbers(acc):
    vals = []
    for name in os.listdir(TAB):
        if name.startswith(acc + "_"):
            with open(os.path.join(TAB, name), encoding="utf-8", errors="replace") as fh:
                vals += [float(x) for x in re.findall(r"(?<![\w.])\d+(?:\.\d+)?", fh.read())]
    return vals


for inv in investigations:
    sm = CUR["summaries"].get(inv["acc"])
    if not sm:
        continue
    inv["summary"], inv["relevance"] = sm["text"], sm["rel"]
    pool = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", " ".join(str(inv[k]) for k in ("title", "objective", "hypothesis", "approach", "impacts", "keywords")))]
    hi30 = {a: sum(1 for t in tests if t["i"] == a and t["o"] is not None and t["o"] >= 30) for a in {t["i"] for t in tests}}
    pool += table_numbers(inv["acc"]) + [inv["rows"], hi30.get(inv["acc"], 0)]
    if "the most of any investigation" in sm["text"]:
        assert hi30[inv["acc"]] == max(hi30.values()), f"{inv['acc']} is not the investigation with the most runs at 30 % oxygen"
    for rng in (inv["o2"], inv["p"]):
        if rng:
            pool += [round(rng[0]), round(rng[1]), rng[0], rng[1]]
    if inv["acc"] == "PSI-68":
        pool += flex2["o2"] + flex2["p"]
    for n in re.findall(r"\d+(?:\.\d+)?", sm["text"]):
        v = float(n)
        assert any(abs(v - q) < 0.051 or abs(v - q * 100) < 0.051 for q in pool), f"{inv['acc']} summary number {n} not in its record or table"
notes += CUR["data_notes"]

# ------------------------------------- challenge statement and investigation profiles
# The official challenge statement is saved in data/sources and quoted word for word. It names which
# investigations serve prevention, detection and suppression, which hardware they share, and what air
# NASA expects on the Moon. Those statements, not our opinion, drive the labels below.
CQ = {k: check_quote(v["src"], v["text"]) for k, v in CUR["challenge_quotes"].items()}
PROF = CUR["profiles"]
family_of = {acc: fam for fam in PROF["families"] for acc in fam["members"]}
BASS_AGENT = "Assess the effectiveness of an inert, gaseous extinguishing agent"
assert BASS_AGENT in inv_by["PSI-26"]["objective"], "BASS objective no longer names an extinguishing agent"

ADMIN_COL = re.compile(r"^(pi|cir|year|month|date|day|gmt|notes|comments|test|description)$|test ?#|test day|test date|test gmt|"
                       r"gmt (date|ignition|flame off)|local time|camera \d|session name|actual day|data id|data description|"
                       r"publication link|figure id|sample ?#|sample number|sample id|flex identifier|flex number|run#", re.I)
RESULT_COL = re.compile(r"extinction diameter|^burning rate|^burn time|^test end$|after test|self ?-?ext|hot ignition|peak burner|"
                        r"^color$|hc burnrate|pfinal|pmean|burn length|spread (rate|length)|total frames|\bfinal\b|flames ignited|weight loss", re.I)
GEOM_COL = re.compile(r"diameter|thickness|length|width|nozzle|burner size|fiber", re.I)
FUEL_COL = re.compile(r"^fuel$|^fuel type$|fuel sample material|^material$|sample material|^sample type$|^sample \(fuel type\)$|^fuel bottle$", re.I)
HEADER_FIX = {"O initial ambient composition; mole fraction": "O2 in the atmosphere; mole fraction",
              "N initial ambient composition; mole fraction": "N2 in the atmosphere; mole fraction",
              "CO initial ambient composition; mole fraction": "CO2 in the atmosphere; mole fraction",
              "He initial ambient composition; mole fraction": "He in the atmosphere; mole fraction",
              "Samle Thickness": "Sample Thickness", "?-g Burn Length": "µg Burn Length", "?-g Spread Length": "µg Spread Length"}
BLANK = {"", "n/a", "na", "-", "--", "tbd", "none", "?", "\u2014", "\u2013", "\ufffd"}   # PSI writes a lost symbol (U+FFFD) where FLEX has no value


def table_columns(acc):
    """What varied, what stayed the same and what was recorded, straight from the PSI run table."""
    cols = []
    for name in sorted(os.listdir(TAB)):
        if not name.startswith(acc + "_"):
            continue
        header, rows = read_table(name)
        for j, hname in enumerate(header):
            if not hname or (ADMIN_COL.search(hname) and not RESULT_COL.search(hname)):
                continue
            vals = [r[j] for r in rows if r[j].lower() not in BLANK]
            if not vals:
                continue
            role = ("result" if RESULT_COL.search(hname) else "fuel" if FUEL_COL.search(hname)
                    else "geometry" if GEOM_COL.search(hname) else "condition")
            nums = [num(v) for v in vals]
            numeric = sum(1 for v in nums if v is not None) >= 0.9 * len(vals)
            good = [v for v in nums if v is not None]
            cnt = collections.Counter(vals)
            cols.append({"h": HEADER_FIX.get(hname, hname), "role": role, "n": len(vals), "d": len(cnt),
                         "num": [min(good), max(good)] if numeric and good else None,
                         "top": [[v[:60], c] for v, c in cnt.most_common(4)]})
    return cols


MEASURE_RULES = [
    ("Flame video and still images", r"video|camera|imag(?:e|es|ing)\b|photograph"),
    ("Radiant emission (radiometers)", r"radiomet|heat radiation|flame radiation|radiative flux"),
    ("Temperature (thermocouples, pyrometry)", r"thermocouple|pyromet|thin[- ]filament|(?:flame|burner|plume|surface) temperatures?|temperature (?:profile|field|data)"),
    ("Surface heat flux", r"heat flux sensor"),
    ("Gas composition (O2, CO2, CO)", r"gas analy|gas sensor|co2 sensor|oxygen sensor|carbon monoxide|\bco \(ppm\)|final co2|acid gas"),
    ("Soot and smoke point", r"soot volume|soot temperature|smoke point|soot levels|soot distribution|soot measurement|soot formation|sooting"),
    ("Smoke particle size", r"particle size|particle diameter|aerosol|particulate"),
    ("Droplet diameter and burning rate", r"burning rate|burn rate|droplet size measure|initial droplet diameter|droplet initial diameter"),
    ("Flame spread rate and burn length", r"spread rate|burn length|flame spread"),
    ("Ion current and electric field", r"ion current|electric field"),
    ("Chemiluminescence (OH*, CH*)", r"chemiluminesc|oh\*|ch\*"),
]
SIMULATION = r"simulation|cfd\b|numerical model|modeling"   # counted for ground studies only: flight records use the words loosely
FUEL_CLASS = {"solid": ("Solid materials", 1.0), "smoke": ("Smoke from overheated materials", 0.9),
              "emulated": ("Gas burner emulating solids", 0.8), "droplet": ("Liquid droplets", 0.6),
              "instrument": ("Aerosol instrument check", 0.5), "gas": ("Gas flames", 0.3)}
TIER = {1: ("Named in the challenge statement as a fire-safety study", 1.0),
        2: ("Named there as related, filed by PSI under fire safety, or built on a named study", 0.7),
        3: ("Other combustion investigation", 0.4)}
headers_of = collections.defaultdict(str)
for name in os.listdir(TAB):
    headers_of[name.split("_")[0]] += " " + " ".join(read_table(name)[0])
by_area = {r["accession"]: r["sub_area"] for r in inv_rows}
is_ground = {r["accession"]: r["project_type"] == "Ground Investigation" for r in inv_rows}
day_level = {c2["i"] for c2 in conditions}

for inv in investigations:
    acc = inv["acc"]
    if not inv["combustion"]:
        continue
    parent = PROF["based_on"].get(acc)
    pillars = list(PROF["named"].get(acc, [])) + list(PROF["related"].get(acc, []))
    if acc == "PSI-26":
        pillars.append("suppression")       # BASS objective 2, asserted above
    if parent:
        pillars += [p for p in PROF["named"].get(parent, []) if p not in pillars]
    tier = 1 if acc in PROF["named"] else 2 if (acc in PROF["related"] or re.search(r"fire", by_area[acc], re.I)
                                                 or parent in PROF["named"]) else 3
    fclass = PROF["fuel_class"].get(acc) or PROF["fuel_class"][parent]
    fuel_score = FUEL_CLASS[fclass][1] * (0.9 if parent else 1.0)
    if inv["outcome"]:
        data_score, data_why = 1.0, "Results in the run table"
    elif inv["mapped"]:
        data_score, data_why = 0.7, "Run table with conditions, results in video or papers"
    elif acc in day_level:
        data_score, data_why = 0.6, "Table of test days with conditions"
    elif inv["rows"]:
        data_score, data_why = 0.5, "Run table without oxygen or pressure"
    elif inv["raw_gb"] > 0:
        data_score, data_why = 0.3, "Raw data only"
    else:
        data_score, data_why = 0.15, "Papers and report only"
    text = " ".join([inv["objective"], inv["approach"], inv["hardware"], headers_of[acc]])
    fam = family_of.get(acc)
    inv.update({
        "pillars": pillars, "tier": tier, "tier_why": TIER[tier][0], "family": fam["id"] if fam else None,
        "based_on": parent, "ground": is_ground[acc], "fuel_class": fclass,
        "fuel_label": ("Model or ground study of " + (inv_by[parent]["acr"] or parent) + " (" + FUEL_CLASS[fclass][0].lower() + ")") if parent else FUEL_CLASS[fclass][0],
        "rank": {"named": TIER[tier][1], "fuel": round(fuel_score, 2), "data": data_score,
                 "g": 1 if (acc in PROF["partial_gravity"] or re.search(r"1-g ", headers_of[acc])) else 0},
        "data_why": data_why,
        "measures": [name for name, rule in MEASURE_RULES if re.search(rule, text, re.I)]
                    + (["Numerical simulation"] if is_ground[acc] and re.search(SIMULATION, text, re.I) else []),
        "vars": table_columns(acc),
    })
families = [{"id": f["id"], "name": f["name"], "members": f["members"], "quote": CQ[f["quote"]] if f.get("quote") else None}
            for f in PROF["families"]]
notes.append("Saffire-II: the column headers '?-g Burn Length' and '?-g Spread Length' lost their first character in PSI. "
             "They are read as microgravity (µg), which the neighbouring '1-g' columns confirm.")
notes.append("What varied and what stayed the same in each investigation is computed from its PSI run table: a column with one "
             "distinct value counts as held constant. Identifier, date and note columns are left out.")
notes.append("Measurement types are found by keyword in each PSI record (objective, approach, hardware) and table header. "
             "A type that the record does not name is not listed, even if the experiment recorded it.")

# What the challenge statement says about Moon-base air, read from the quote itself.
MOON_O2 = float(re.search(r"(\d+)%", CQ["moon_air"]["text"]).group(1))
MOON_PSI = float(re.search(r"([\d.]+) psi", CQ["moon_air"]["text"]).group(1))
SUIT_PSI = float(re.search(r"only ([\d.]+) psi", CQ["suit"]["text"]).group(1))
CFIG_MAX = float(re.search(r"up to (\d+)% oxygen", CQ["cfig_85"]["text"]).group(1))
hi = [t for t in tests if t["o"] is not None and t["o"] >= MOON_O2]
hi_p = [t for t in hi if t["p"] is not None and t["ps"] == "recorded" and t["p"] <= MOON_PSI / PSIA + 1e-9]
NEAR = 1.05   # runs set to the 10.2 psia cabin were logged at 10.3 to 10.5 psia; 5 % above the bound counts as "close to it"
hi_near = [t for t in hi if t["p"] is not None and t["ps"] == "recorded" and MOON_PSI / PSIA < t["p"] <= MOON_PSI / PSIA * NEAR]
stats.update({
    "moon_o2_min": MOON_O2, "moon_psia_max": MOON_PSI, "suit_psia": SUIT_PSI,
    "hi_o2": {k: sum(1 for t in hi if t["k"] == k) for k in ("solid", "droplet", "gas")},
    "moon_range": {k: sum(1 for t in hi_p if t["k"] == k) for k in ("solid", "droplet", "gas")},
    "moon_range_by": dict(collections.Counter(t["a"] for t in hi_p)),
    "moon_near": {k: sum(1 for t in hi_near if t["k"] == k) for k in ("solid", "droplet", "gas")},
    "moon_near_psia": [round(min(t["p"] for t in hi_near) * PSIA, 1), round(max(t["p"] for t in hi_near) * PSIA, 1)] if hi_near else None,
    "moon_low_psia": [round(min(t["p"] for t in hi_p) * PSIA, 1), round(max(t["p"] for t in hi_p) * PSIA, 1)] if hi_p else None,
    "o2_max_all": max(t["o"] for t in tests if t["o"] is not None),
    "o2_max_by": max((t for t in tests if t["o"] is not None), key=lambda t: t["o"])["a"],
    "tiers": {str(k): sum(1 for i in comb if i.get("tier") == k) for k in (1, 2, 3)},
})
assert stats["o2_max_all"] == CFIG_MAX and stats["o2_max_by"] == "ACME CFI-G", "highest-oxygen runs no longer match the challenge statement"
assert stats["hi_o2"]["solid"] == 0, "a solid-fuel run at Moon-base oxygen has appeared; rewrite the headline finding"

# ---------------------------------------------------------------------- findings
# Scores are judgements (1-5) and are editable in the app. Numbers in the text are computed above.
def src(*accs):
    return [{"acc": a, "label": inv_by[a]["acr"] or a, "url": PSI_URL + a} for a in accs]


BRE_QUOTE = ("Quasi-steady burning corresponding to various condensed-phase materials (such as PMMA and Nylon) was observed in "
             "microgravity despite the absence of air flow, where the cessation of ventilation is an established step in putting "
             "out spacecraft fires. The ongoing combustion without air flow was notably seen in elevated-oxygen atmospheres which "
             "are being considered for use in future spacecraft, whereas such flames in a normal atmosphere of 21% oxygen "
             "self-extinguished in a short time.")
assert BRE_QUOTE in inv_by["PSI-20"]["impacts"], "BRE quote no longer matches the PSI record"
BASS_QUOTE = ("materials in microgravity, with adequate ventilation, burn as well if not better than the same material in "
              "normal gravity with other conditions being identical")
assert BASS_QUOTE in inv_by["PSI-25"]["hypothesis"], "BASS-II quote no longer matches the PSI record"
SAFFIRE_QUOTE = "There is a significant lack of microgravity data available for spacecraft designers on which to base their fire safety designs and procedures."
assert SAFFIRE_QUOTE in inv_by["PSI-99"]["hypothesis"], "Saffire quote no longer matches the PSI record"
SAME_QUOTE = "liquid aerosol smokes produced in microgravity will exhibit substantially larger droplet sizes"
assert SAME_QUOTE in inv_by["PSI-102"]["hypothesis"], "SAME quote no longer matches the PSI record"

b = S["flex_bands"]
findings = [
    {"id": "vent", "kind": "NASA record", "tags": ["suppression", "oxygen", "exploration"],
     "title": "Cutting the airflow may not put a fire out in an oxygen-rich cabin",
     "claim": "Stopping ventilation is the first step of the fire response on the space station. In the Burning Rate Emulator "
              "tests, flames at 21 % oxygen went out soon after the flow stopped, but flames in elevated oxygen kept burning with no airflow at all.",
     "evidence": f"ACME BRE: {S['bre_flames']} flames ignited over {S['bre_days']} test days, at oxygen levels of "
                 f"{', '.join(f'{v:g}' for v in S['bre_levels'])} %. {S['bre_days_34']} of those days included 34 %.",
     "quote": BRE_QUOTE, "quote_src": "PSI-20, Research Impacts",
     "limits": "NASA calls these results preliminary. BRE is a gas burner that emulates solid fuels, not a test of the materials themselves, and PSI does not list the chamber pressure of each flame.",
     "action": "Treat ventilation shutdown as unproven for the exploration atmosphere until solid materials are tested at 34 % oxygen.",
     "scores": {"safety": 5, "evidence": 3, "mission": 5, "action": 5}, "next": ["sofie", "fm2"], "sources": src("PSI-20")},
    {"id": "solid-gap", "kind": "Computed from run tables", "tags": ["materials", "oxygen", "exploration", "gap"],
     "title": f"The archive holds no solid-fuel flight test above {S['solid_o2_max']:g} % oxygen",
     "claim": f"Every solid-fuel test with a recorded oxygen level sits between {S['solid_o2_min']:g} and {S['solid_o2_max']:g} %. "
              f"NASA expects Moon-base air of {S['moon_o2_min']:g} % oxygen or more. The exploration atmosphere of {exp['o2']:g} % is "
              f"{gap:.1f} points beyond the last data point.",
     "evidence": f"{S['solid_with_o2']} solid-fuel tests carry an oxygen value (BASS-II and Saffire I and II). "
                 f"A further {S['solid_no_conditions']} (BASS and Saffire-III) list no oxygen level at all.",
     "quote": CQ["moon_air"]["text"], "quote_src": "Flame in Freefall challenge statement, NASA Space Apps 2026", "quote_url": CQ["moon_air"]["url"],
     "limits": "This describes what is published in PSI, not everything NASA has flown. NASA reports that Saffire-VI, flown in 2023 and 2024, "
               "burned solid samples at \"higher oxygen concentration and lower pressure\". Saffire-IV, -V and -VI are not in PSI, so their runs are not counted here.",
     "action": "Do not extrapolate material flammability limits from this archive to 34 % oxygen. Flag every material cleared only at 21 %, "
               "and ask for the Saffire-IV to -VI data to be added to PSI.",
     "scores": {"safety": 5, "evidence": 5, "mission": 5, "action": 4}, "next": ["sofie", "fm2", "flare"],
     "sources": src("PSI-25", "PSI-98", "PSI-99")},
    {"id": "selfext", "kind": "Computed from run tables", "tags": ["oxygen", "extinction", "liquids"],
     "title": "Burning droplets stop putting themselves out as oxygen rises",
     "claim": f"In FLEX runs with no suppressant, {b[0]['pct']} % of those below 18 % oxygen ended in extinction. "
              f"Between 18 and 25 % it was {b[1]['pct']} %. At 25 % and above it was {b[2]['pct']} %, and none of the "
              f"{S['flex_hi_o2']} runs at 34 % went out on their own.",
     "evidence": f"FLEX: {b[0]['ext']} of {b[0]['n']}, {b[1]['ext']} of {b[1]['n']} and {b[2]['ext']} of {b[2]['n']} runs "
                 "whose recorded end state is Extinction. No CO2 or helium in the atmosphere; pressures of about 0.7 and 1 atm.",
     "limits": "Descriptive counts, not a controlled comparison: fuel and droplet size vary between runs. The other end states are Disruption and Completion.",
     "action": "Expect less help from self-extinction in oxygen-rich cabins and size suppression for that.",
     "scores": {"safety": 4, "evidence": 4, "mission": 4, "action": 3}, "next": [], "sources": src("PSI-69")},
    {"id": "corner", "kind": "Computed from run tables", "tags": ["oxygen", "pressure", "exploration", "gap", "liquids"],
     "title": "Liquid fuels were tested at 34 % oxygen, but at 0.70 atm and not 0.56",
     "claim": f"FLEX burned {S['flex_hi_o2']} droplets at 34 % oxygen, all at about {S['flex_hi_p'][0]:.2f} atm, the pressure of the "
              f"10.2 psia cabin. The exploration atmosphere is {exp['p']:.2f} atm. Below 0.65 atm the archive holds "
              f"{S['droplet_low_p']} droplet runs, none above {S['droplet_low_p_o2_max']:g} % oxygen.",
     "evidence": f"FLEX ran {S['flex_near_07']} tests near 0.70 atm and {S['flex_near_10']} near 1 atm. Inside the exploration window "
                 f"(oxygen within {O2_WINDOW:g} points, pressure within {P_WINDOW * 100:.0f} %) there are {S['coverage']['exp']['droplet']} droplet runs "
                 f"and {S['coverage']['exp']['gas']} gas-flame runs (ACME CFI-G at 30 % oxygen and about 0.5 atm).",
     "limits": f"FLEX-2 planned droplet tests down to {min(flex2['p']):g} atm and up to {max(flex2['o2']):g} % oxygen, but PSI holds no run table for it.",
     "action": "Use the 0.70 atm runs as the nearest liquid-fuel evidence and state the pressure difference. Ask for the FLEX-2 run data.",
     "scores": {"safety": 3, "evidence": 5, "mission": 5, "action": 3}, "next": [], "sources": src("PSI-69", "PSI-68", "PSI-159")},
    {"id": "one-g", "kind": "NASA record", "tags": ["materials", "standards", "gravity"],
     "title": "NASA's own results say the material approval test is not the worst case",
     "claim": "NASA screens spacecraft materials with an upward-burning test in normal gravity (NASA-STD-6001 Test 1). NASA's own "
              "Researcher's Guide reports that BASS results show materials can burn at lower oxygen levels in microgravity than on Earth.",
     "evidence": f"BASS-II: {S['bass2_n']} tests with oxygen from {S['solid_o2_min']:g} to {S['solid_o2_max']:g} %. BASS: {S['bass_n']} tests. "
                 "The Glenn combustion page says of the same test that some researchers believe it is not conservative in low gravity.",
     "quote": GQ["not_conservative"]["text"], "quote_src": "NASA Researcher's Guide to ISS Combustion Science (2015)", "quote_url": GQ["not_conservative"]["url"],
     "limits": "The guide states the result in one sentence; the per-test numbers behind it are in the BASS papers and video, not in the PSI table.",
     "action": "Add a microgravity margin to materials approved on the 1 g test alone.",
     "scores": {"safety": 5, "evidence": 4, "mission": 4, "action": 4}, "next": ["flare", "sofie"],
     "sources": src("PSI-25", "PSI-26")},
    {"id": "local-jet", "kind": "NASA record", "tags": ["suppression"],
     "title": "A local extinguisher jet can feed a fire in weightlessness",
     "claim": "In the same summary of BASS results, NASA reports that spraying suppressant locally was not enough: the jet pulled in "
              "surrounding air and kept the flame alive even after the cabin airflow was switched off.",
     "evidence": "BASS (PSI-26) tested nitrogen as an extinguishing agent on fabric, PMMA and other samples in opposed and concurrent airflow.",
     "quote": GQ["local_jet"]["text"], "quote_src": "NASA Researcher's Guide to ISS Combustion Science (2015)", "quote_url": GQ["local_jet"]["url"],
     "limits": "Reported qualitatively. The flow rates and agent quantities behind it are not in the PSI table.",
     "action": "Design extinguishers and procedures for flooding a volume, not for a directed jet, and test them at exploration oxygen levels.",
     "scores": {"safety": 5, "evidence": 3, "mission": 4, "action": 5}, "next": [], "sources": src("PSI-26")},
    {"id": "vent-speed", "kind": "NASA record", "tags": ["materials", "ventilation"],
     "title": "Flames spread fastest at ordinary cabin ventilation speeds",
     "claim": "In microgravity there is no rising hot air, so the cabin fan sets the airflow over a burning surface. NASA's guide puts "
              "the most flammable condition at about 10 cm/s, the speed typical of spacecraft ventilation. Flames can also spread upstream, against the flow.",
     "evidence": "BASS-II thin films went out when the opposing flow fell to about 1 cm/s at 21 % oxygen, and already at about 2.6 to 4 cm/s at 16 % "
                 "(BASS-II Summary Report). Saffire burned its samples at 20 and 30 cm/s.",
     "quote": GQ["ventilation_speed"]["text"], "quote_src": "NASA Researcher's Guide to ISS Combustion Science (2015)", "quote_url": GQ["ventilation_speed"]["url"],
     "limits": "A general result for flame spread over solids, not a single number for every material.",
     "action": "Test materials across the 0 to 30 cm/s range of spacecraft ventilation, with the worst case near 10 cm/s, not only in still air.",
     "scores": {"safety": 4, "evidence": 4, "mission": 4, "action": 4}, "next": ["sofie"], "sources": src("PSI-25", "PSI-98")},
    {"id": "depends", "kind": "Computed from run tables", "tags": ["materials", "gravity"],
     "title": "Microgravity is not always worse: it depends on the material",
     "claim": f"In Saffire-II, {S['silicone_no_spread']} of {S['silicone_n']} silicone samples did not spread flame in microgravity, "
              f"although {S['silicone_burned_1g']} of them burned in the 1 g test. Cotton-fiberglass fabric spread steadily at "
              f"{' and '.join(S['sibal_rates'])}.",
     "evidence": "Saffire-II table: burn length and spread rate in microgravity beside the 1 g result for each sample, at 20 cm/s airflow and about 22 % oxygen.",
     "limits": "Nine samples at a single airflow speed and oxygen level.",
     "action": "Rank materials by measured low-gravity behaviour, not by a single correction factor applied to ground results.",
     "scores": {"safety": 3, "evidence": 2, "mission": 3, "action": 3}, "next": ["flare"], "sources": src("PSI-99")},
    {"id": "gravity", "kind": "Archive audit", "tags": ["gravity", "exploration", "gap"],
     "title": "Every flight test here was in microgravity. None was at lunar or Martian gravity",
     "claim": "Every combustion flight experiment in the archive flew on the space station or on a Cygnus cargo ship in orbit. "
              "A Moon base sits at one sixth of Earth gravity and a Mars base at three eighths, where the archive has no data at all. "
              "NASA's challenge statement says the same and names the experiments expected to fill the gap: LUCI and FM2.",
     "evidence": f"Platforms across {S['combustion']} combustion investigations: {', '.join(S['platforms'])}.",
     "quote": "Although NASA is heavily focused on the return of astronauts to the Moon’s surface and the establishment of a Moon Base in preparation for the future human exploration of Mars, " + CQ["no_partial_g"]["text"],
     "quote_src": "Flame in Freefall challenge statement, NASA Space Apps 2026", "quote_url": CQ["no_partial_g"]["url"],
     "limits": "Two partial substitutes exist. ACME E-FIELD Flames used an electric field to mimic partial gravity, and Saffire-II lists a "
               "normal-gravity result beside each microgravity one. The challenge statement notes that microgravity and normal-gravity results could bound what happens in between.",
     "action": "Carry partial gravity as an open risk in Moon and Mars base fire-safety requirements. Until LUCI and FM2 report, "
               "bound each case with its microgravity and its normal-gravity result.",
     "scores": {"safety": 4, "evidence": 5, "mission": 5, "action": 3}, "next": ["fm2", "luci"], "sources": src("PSI-99", "PSI-22", "PSI-25")},
    {"id": "suppress", "kind": "Computed from run tables", "tags": ["suppression", "oxygen", "liquids"],
     "title": "Suppressant data stops well short of exploration oxygen levels",
     "claim": f"FLEX burned droplets in atmospheres diluted with carbon dioxide ({S['flex_co2']} runs) and helium ({S['flex_he']} runs). "
              f"None of the carbon dioxide runs went above {S['flex_co2_o2_max']:g} % oxygen and none of the helium runs above {S['flex_he_o2_max']:g} %.",
     "evidence": f"FLEX table: carbon dioxide made up {S['flex_co2_min'] * 100:g} to {S['flex_co2_max'] * 100:g} % of the atmosphere and helium up to {S['flex_he_max'] * 100:g} %, always with 25 % oxygen or less.",
     "limits": "Suppressant effectiveness also depends on pressure and fuel, which vary across these runs.",
     "action": "Re-qualify extinguisher agent quantities for 34 % oxygen instead of scaling from station values.",
     "scores": {"safety": 4, "evidence": 4, "mission": 4, "action": 4}, "next": [], "sources": src("PSI-69")},
    {"id": "video", "kind": "Archive audit", "tags": ["data", "materials"],
     "title": "The results for solid materials are still locked in video",
     "claim": f"Only {S['with_outcome']} of {S['tests']} listed test runs have a result in a table. For BASS and BASS-II, "
              f"{S['bass_n'] + S['bass2_n']} tests of real materials, the outcome exists only as "
              f"{S['bass2_raw'][0] + S['bass2_raw'][1]:.0f} GB of raw video.",
     "evidence": "Result columns exist for FLEX, ACME CFI-G and Saffire I and II. The BASS table lists the sample material only; BASS-II adds conditions but no outcome.",
     "limits": "Many results are reported in the linked publications, but not in a form that can be queried across tests.",
     "action": "Extract spread rate and extinction from the BASS videos into a public table. The Video lab below shows it can be done automatically.",
     "scores": {"safety": 3, "evidence": 5, "mission": 3, "action": 5}, "next": [], "sources": src("PSI-25", "PSI-26")},
    {"id": "smoke", "kind": "NASA record", "tags": ["detection", "smoke"],
     "title": "Smoke behaves differently without gravity, so detectors need their own baseline",
     "claim": "SAME tested the hypothesis that smoke from overheated materials forms larger particles in microgravity, because "
              "nothing carries it away from the source. Detectors tuned on Earth smoke may respond differently.",
     "evidence": f"SAME and SAME-R: {S['same_rows']} table rows covering Teflon, Kapton, silicone rubber, lamp wick and dibutyl phthalate.",
     "quote": "It is hypothesized that " + SAME_QUOTE + " than under normal gravity.", "quote_src": "PSI-102, Hypothesis",
     "limits": "The tables give test conditions. Particle sizes are in the analysed data files and publications. All tests were at station atmosphere.",
     "action": "Calibrate exploration smoke detectors against low-gravity smoke data, then repeat at exploration pressure.",
     "scores": {"safety": 4, "evidence": 3, "mission": 3, "action": 3}, "next": [], "sources": src("PSI-102", "PSI-101")},
    {"id": "cool", "kind": "NASA record", "tags": ["extinction", "liquids", "detection"],
     "title": "A flame that looks out may still be burning",
     "claim": "FLEX found that some droplets keep burning as low-temperature cool flames after the visible flame disappears. "
              "The table records visible flame extinction, which is not the same as the end of burning.",
     "evidence": f"Follow-on investigations were built around this: CFI with {S['cfi_n']} droplet tests from 0.5 to 5 atm, and ACME CFI-G "
                 f"with {S['cfig_n']} gas-flame tests, {S['cfig_se']} of which self-extinguished.",
     "limits": "Cool flames were studied for fuels and engines as much as for fire safety. Their role in a real cabin fire is not established here.",
     "action": "Do not treat loss of visible flame as confirmation that a fire is out. Verify with temperature and combustion-product sensors.",
     "scores": {"safety": 3, "evidence": 3, "mission": 3, "action": 4}, "next": [], "sources": src("PSI-69", "PSI-39", "PSI-159")},
]
assert "cool flame" in (inv_by["PSI-69"]["impacts"] + inv_by["PSI-69"]["approach"]).lower()
check_quote("challenge", "Although NASA is heavily focused on the return of astronauts to the Moon’s surface and the establishment of a Moon Base in preparation for the future human exploration of Mars, " + CQ["no_partial_g"]["text"])
check_quote("saffire6", "higher oxygen concentration and lower pressure")

VIDEO_PATH = os.path.join(ROOT, "data", "derived", "video_results.json")
video = None
if os.path.exists(VIDEO_PATH):
    with open(VIDEO_PATH, encoding="utf-8") as fh:
        video = json.load(fh)
    import shutil
    img_dir = os.path.join(ROOT, "web", "img", "video")
    os.makedirs(img_dir, exist_ok=True)
    for t in video["tests"]:
        t["frames_web"] = []
        for fpath in t.get("frames", []):
            name = os.path.basename(fpath)
            shutil.copyfile(os.path.join(ROOT, fpath), os.path.join(img_dir, name))
            t["frames_web"].append("img/video/" + name)
        t.pop("series_px", None)
    vt = {t["test"]: t for t in video["tests"]}
    vv = video["validation"]
    findings.append({"id": "video-lab", "kind": "Measured from NASA video", "tags": ["data", "materials"],
        "title": "Flame spread can be read from NASA's raw video automatically",
        "claim": f"We measured flame spread in {sum(1 for t in video['tests'] if t.get('spread_mm_s'))} BASS-II videos with a simple tracker. "
                 f"A 200 µm film spread at {vt['B2']['spread_mm_s']:g} and {vt['B5']['spread_mm_s']:g} mm/s in two identical tests, and "
                 f"the flame went out {vt['B1']['flame_out_after_fan_s']:g} s after the fan was cut, matching the NASA report.",
        "evidence": f"{vv['passed']} of {vv['independent']} independent checks pass, including the thin-fuel law "
                    f"(exponent {vv['thin_fuel_exponent']:g}, theory -1) and the camera field of view. The scale comes from one reported value.",
        "limits": "Seven videos from one day; dim flames at low airflow are not measured. A demonstration of the method, not a replacement for the PIs' analysis.",
        "action": "Run the tracker over all 244 BASS-II videos to build the public results table the archive lacks.",
        "scores": {"safety": 3, "evidence": 4, "mission": 3, "action": 5}, "next": [], "sources": src("PSI-25")})
MODEL_PATH = os.path.join(ROOT, "web", "model.js")
model_card = None
if os.path.exists(MODEL_PATH):
    with open(MODEL_PATH, encoding="utf-8") as fh:
        mdl = json.loads(fh.read().split("window.FLAME_MODEL = ", 1)[1].rstrip().rstrip(";"))
    full, base = mdl["cv"]["results"]["Full model"], mdl["cv"]["results"]["Always the most common outcome"]
    model_card = {"n": mdl["n"], "acc": round(full["accuracy"]["mean"], 3), "auc": round(full["auc"]["mean"], 3),
                  "base_acc": round(base["accuracy"]["mean"], 3), "brier": round(full["brier"]["mean"], 3)}
    findings.append({"id": "model", "kind": "Model on run tables", "tags": ["liquids", "extinction", "oxygen", "exploration"],
        "title": "Droplet fire outcomes are predictable inside the tested range, and not outside it",
        "claim": f"A simple model of {mdl['n']} FLEX runs predicts whether a droplet flame goes out on its own with "
                 f"{model_card['acc'] * 100:.0f} % accuracy on test days it never saw, against {model_card['base_acc'] * 100:.0f} % for always guessing "
                 "the most common outcome. Oxygen has the strongest effect. For the exploration atmosphere the model has to extrapolate.",
        "evidence": f"{mdl['cv']['method']}. Area under the ROC curve {model_card['auc']:g}. The predictor shows the nearest real runs for every query.",
        "limits": "Two fuels and droplets only. Run-to-run conditions are not a designed experiment. Outside the tested pressures the prediction is flagged.",
        "action": "Use the predictor to choose the next droplet test points where the model is least certain and the mission need is highest.",
        "scores": {"safety": 3, "evidence": 4, "mission": 4, "action": 4}, "next": [], "sources": src("PSI-69")})

NEXT = [
    {"id": "fm2", "name": "FM2", "full": "Flammability of Materials on the Moon",
     "what": "The first combustion experiment on another planetary body. It burns materials on the Moon at one sixth gravity.",
     "url": "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/flammability-of-materials-on-the-moon-fm2/"},
    {"id": "sofie", "name": "SoFIE", "full": "Solid Fuel Ignition and Extinction",
     "what": "Studies how solid materials ignite and go out on the space station, to check whether the 1 g approval test is conservative in low gravity.",
     "url": "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/solid-fuel-ignition-and-extinction-sofie/"},
    {"id": "flare", "name": "FLARE", "full": "Flammability Limits at Reduced-g Experiment",
     "what": "An international project to predict a material's flammability limit in microgravity from tests done on the ground.",
     "url": "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/flammability-limits-at-reduced-g-experiment-flare/"},
    {"id": "luci", "name": "LUCI", "full": "Lunar-g Combustion Investigation",
     "what": "Named in the challenge statement, with FM2, as an expected future source of partial-gravity combustion data for PSI.",
     "url": CQ["future_g"]["url"]},
]

# Each finding serves one of the three parts of NASA's fire-safety work named in the challenge statement.
PILLAR_OF = {"vent": "suppression", "solid-gap": "prevention", "selfext": "suppression", "corner": "prevention", "one-g": "prevention",
             "local-jet": "suppression", "vent-speed": "prevention", "depends": "prevention", "gravity": "prevention",
             "suppress": "suppression", "video": "prevention", "smoke": "detection", "cool": "detection",
             "video-lab": "prevention", "model": "suppression"}
for f in findings:
    f["pillar"] = PILLAR_OF[f["id"]]

# ---------------------------------------------- record corpus and answer bank
# The corpus is every record an answer may cite. The answer bank (data/curated/answers.json) was written
# ahead of time with an AI model; each claim is checked here against the records it cites, and the build
# stops if a cited record does not exist or a number is not in it with the same unit.
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from verify import check_claim  # noqa: E402

corpus = collections.OrderedDict()
for i in investigations:
    if not i["combustion"]:
        continue
    corpus[i["acc"]] = "\n".join(x for x in [
        f"{i['acr'] or i['acc']}: {i['title']}", f"Platform: {i['platform']}. Dates: {i['start']} to {i['end']}.",
        f"Runs listed in the PSI table: {i['rows']}." + (f" Oxygen in the table: {i['o2'][0]:g} to {i['o2'][1]:g} %." if i["o2"] else "")
        + (f" Pressure in the table: {i['p'][0]:g} to {i['p'][1]:g} atm." if i["p"] else ""),
        f"Summary: {i.get('summary', '')}", f"Objective: {i['objective']}", f"Hypothesis: {i['hypothesis']}",
        f"Approach: {i['approach']}", f"Research impacts: {i['impacts']}", f"Publications listed: {i['npub']}."] if x.strip())
for f in findings:
    corpus["F-" + f["id"]] = "\n".join([f["title"], f["claim"], "Evidence: " + f["evidence"], "Limits: " + f["limits"], "What to do: " + f["action"]]
                                        + ([f"Quote ({f['quote_src']}): {f['quote']}"] if f.get("quote") else []))
for h in history:
    corpus["H-" + h["id"]] = "\n".join([f"{h['name']} ({h['date']})", h["what"], "Afterwards: " + h["changed"], "Today: " + h["today"]]
                                        + [q["text"] for q in h["quotes"]] + [h["changed_quote"]["text"]])
for sp in spinoffs:
    corpus["S-" + sp["src"]] = f"{sp['name']} ({sp['year']}). {sp['what']} {sp['quote']}"
for m in materials:
    corpus["M-" + m["id"]] = (f"{m['name']}: {m['what']}. Flaming tests in the archive: {m['flame']}, of which {m['with_o2']} record an oxygen level"
                              + (f", from {m['o2'][0]:g} to {m['o2'][1]:g} %" if m["o2"] else "") + f". Smoke tests: {m['smoke']}. " + " ".join(m["results"]))
for n in NEXT:
    corpus["N-" + n["id"]] = f"{n['name']}: {n['full']}. {n['what']}"
corpus["ATM"] = "Cabin atmospheres NASA names in the ACME BRE record: " + "; ".join(f"{a['name']}: {a['psia']:g} psia ({a['p']:.2f} atm), {a['o2']:g} % oxygen" for a in ATMOSPHERES) + "."
corpus["STATS"] = (f"The archive search returns {S['investigations']} records, {S['combustion']} about combustion. Their tables list {S['tests']} test runs that could be placed "
                   f"or counted, {S['with_outcome']} with a result in a table, {S['pubs']} publications and {S['raw_tb']:g} TB of raw data.")
corpus["CHALLENGE"] = ("Flame in Freefall challenge statement, NASA Space Apps Challenge 2026. "
                       + " ".join(q["text"] for k, q in CQ.items() if not k.startswith("saffire6")))
corpus["SAFFIRE6"] = ("NASA article on the end of the Saffire series (2024): " + CQ["saffire6"]["text"] + " " + CQ["saffire6_materials"]["text"]
                      + " Saffire-IV, Saffire-V and Saffire-VI are not in the PSI archive.")
for fam in families:
    corpus["HW-" + fam["id"]] = (fam["name"] + ": " + ", ".join(inv_by[a]["acr"] or a for a in fam["members"]) + "."
                                 + (" " + fam["quote"]["text"] if fam["quote"] else ""))
corpus["MOON"] = (f"Runs at Moon-base oxygen. The challenge statement expects {S['moon_o2_min']:g} % oxygen or more at {S['moon_psia_max']:g} psi or less. "
                  f"At {S['moon_o2_min']:g} % oxygen or more the run tables list {S['hi_o2']['solid']} solid-fuel runs, {S['hi_o2']['droplet']} droplet runs and "
                  f"{S['hi_o2']['gas']} gas-flame runs. Of these, {S['moon_range']['gas']} gas-flame runs are also at {S['moon_psia_max']:g} psi or less, all from "
                  f"{', '.join(S['moon_range_by'])}, and {S['moon_near']['droplet']} droplet runs sit just above it, at {S['moon_near_psia'][0]:g} to {S['moon_near_psia'][1]:g} psia.")
corpus["SI"] = ("Use of SI (Super Intelligence, the term NASA Space Apps 2026 uses for AI) in QUENCH. Claude (Anthropic) was used to write code, normalise tables "
                "and draft the investigation summaries, the wording of the findings and the analyst answers; the team reviewed them. Code checks the drafts: "
                "every number in a claim must appear in a cited NASA record with the same unit, and every quote must match its saved source word for word. "
                "The predictor is a machine-learning model and the video lab is computer vision. No model is called while the site is used.")
corpus["RANK"] = ("How QUENCH ranks investigations. Tier 1, named in the challenge statement as a fire-safety study: "
                  + ", ".join(i["acr"] or i["acc"] for i in comb if i["tier"] == 1) + ". Tier 2, named as related, filed by PSI under fire safety, or built on a named study: "
                  + ", ".join(i["acr"] or i["acc"] for i in comb if i["tier"] == 2) + ". Tier 3, other combustion investigations: "
                  + ", ".join(i["acr"] or i["acc"] for i in comb if i["tier"] == 3) + ".")
corpus["GUIDE"] = "NASA Researcher's Guide to ISS Combustion Science (2015). " + " ".join(q["text"] for q in GQ.values())
if video:
    corpus["VIDEO"] = ("Flame spread measured from BASS-II videos. " + video["method"] + " " + " ".join(
        f"Test {t['test']}: {t.get('material')}, {t.get('thickness_um')} µm, oxygen {t.get('o2')} %, air {t.get('air_cm_s')} cm/s, spread {t.get('spread_mm_s')} mm/s, confidence {t['confidence']}."
        for t in video["tests"]) + " " + " ".join(f"Check {c['check']}: expected {c['expected']}; measured {c['measured']}." for c in video["validation"]["checks"]))
if model_card:
    corpus["MODEL"] = (f"Outcome model trained on {model_card['n']} FLEX droplet runs. {mdl['question']} {mdl['cv']['method']}. "
                       f"Accuracy {model_card['acc'] * 100:.0f} %, against {model_card['base_acc'] * 100:.0f} % for always guessing the most common outcome. "
                       f"Area under the ROC curve {model_card['auc']:.2f}. FLEX pressures ran from {math.exp(mdl['ranges']['logp'][0]) * PSIA:.1f} to {math.exp(mdl['ranges']['logp'][1]) * PSIA:.1f} psia.")

with open(os.path.join(ROOT, "data", "curated", "answers.json"), encoding="utf-8") as fh:
    bank = json.load(fh)["answers"]
bad = []
for a in bank:
    for c in a["claims"]:
        ok, issues = check_claim(c, corpus)
        if not ok:
            bad.append(f"{a['id']}: {c['text'][:70]} -> {'; '.join(issues)}")
assert not bad, "answer bank claims failed verification:\n" + "\n".join(bad)
answers = [{"id": a["id"], "q": a["q"], "a": a["a"], "claims": a["claims"]} for a in bank]

data = {
    "meta": {"built": datetime.date.today().isoformat(),
             "source": "NASA Physical Sciences Informatics (PSI), search term 'combustion'",
             "source_url": "https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation",
             "glenn_url": "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/",
             "license": "CC0-1.0",
             "challenge_url": CQ["task"]["url"],
             "si": "Code, data normalisation and draft text were produced with SI (Super Intelligence / AI) assistance: Claude, Anthropic. "
                   "Every number is recomputed from NASA PSI tables and every quote is matched to its saved source at build time."},
    "atmospheres": ATMOSPHERES, "stats": stats, "flex2": flex2, "next": NEXT, "findings": findings,
    "history": history, "spinoffs": spinoffs, "sources": sources_list, "video": video, "model_card": model_card,
    "apollo_atm": [{"name": "Apollo 1 test (pad)", "o2": 100.0, "psia": 16.2}, {"name": "Apollo flight", "o2": 100.0, "psia": 6.2}, {"name": "Apollo prelaunch, after the fire", "o2": 60.0, "psia": 16.2}],
    "materials": materials, "smoke_only": smoke_only, "quotes": GQ, "challenge": CQ, "families": families,
    "answers": answers, "record_ids": list(corpus.keys()),
    "investigations": investigations, "tests": tests, "conditions": conditions, "notes": notes,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("// Generated by scripts/build_data.py from NASA PSI tables. Do not edit by hand.\n")
    fh.write("// SI notice: the build script and the draft text in this file were produced with SI (AI) assistance and checked by code against NASA records.\n")
    fh.write("window.FLAME = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")

# ------------------------------------------------------------------ downloads
# The same runs as plain CSV, for anyone who wants to build their own model.
DL = os.path.join(ROOT, "web", "downloads")
os.makedirs(DL, exist_ok=True)
OUTCOME = {"ext": "self-extinguished", "burn": "burned", "noign": "did not ignite", "other": "other", "na": ""}
RUN_COLS = ["accession", "investigation", "fuel_type", "test_id", "fuel_or_material", "o2_percent", "pressure_atm", "pressure_source",
            "outcome", "outcome_in_source", "co2_mole_fraction", "he_mole_fraction", "droplet_diameter_mm", "extinction_diameter_mm",
            "burning_rate", "burn_time_s", "airflow_cm_s", "flow_direction", "normal_gravity_result", "materials", "psi_url"]
with open(os.path.join(DL, "quench-runs.csv"), "w", encoding="utf-8", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(RUN_COLS)
    for t in tests:
        w.writerow([t["i"], t["a"], t["k"], t["id"], t["f"], "" if t["o"] is None else t["o"], "" if t["p"] is None else t["p"],
                    {"recorded": "recorded", "assumed": "not recorded (cabin pressure)"}.get(t["ps"], ""), OUTCOME[t["r"]], t["rr"],
                    t.get("co2", ""), t.get("he", ""), t.get("d0", ""), t.get("dx", ""), t.get("kb", ""), t.get("t", ""),
                    t.get("flow", ""), t.get("dir", ""), t.get("g1", ""), " ".join(t.get("m", [])), PSI_URL + t["i"]])
INV_COLS = ["accession", "acronym", "title", "platform", "hardware_family", "fuel", "fire_safety_role", "tier", "runs_listed",
            "runs_with_oxygen", "o2_min_percent", "o2_max_percent", "pressure_min_atm", "pressure_max_atm", "results_in_table",
            "raw_data_gb", "publications", "doi", "psi_url"]
fam_name = {f["id"]: f["name"] for f in families}
with open(os.path.join(DL, "quench-investigations.csv"), "w", encoding="utf-8", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(INV_COLS)
    for i in comb:
        w.writerow([i["acc"], i["acr"], i["title"], i["platform"], fam_name.get(i["family"], ""), i["fuel_label"],
                    " ".join(i["pillars"]) or "fundamentals", i["tier"], i["rows"], i["mapped"],
                    i["o2"][0] if i["o2"] else "", i["o2"][1] if i["o2"] else "", i["p"][0] if i["p"] else "", i["p"][1] if i["p"] else "",
                    i["outcome"] or "", i["raw_gb"], i["npub"], i["doi"], i["url"]])
with open(os.path.join(DL, "README.txt"), "w", encoding="utf-8") as fh:
    fh.write("QUENCH data downloads\n=====================\n\n"
             f"quench-runs.csv            {len(tests)} flight test runs from the run tables of NASA PSI combustion investigations, one row per run.\n"
             f"quench-investigations.csv  {len(comb)} combustion investigations with their coverage and role in fire safety.\n\n"
             "Source: NASA Physical Sciences Informatics (PSI), https://psi.nasa.gov, public domain (CC0-1.0).\n"
             "Blank cells mean PSI does not record the value. Pressure of solid-fuel runs is not in PSI; they ran at cabin pressure.\n"
             "outcome: self-extinguished, burned, did not ignite, other, or blank when the table has no result column.\n"
             "burning_rate is the FLEX column 'Burning rate; mm' as given (the unit superscript is lost in PSI).\n"
             "tier: 1 named in the Space Apps challenge statement as a fire-safety study, 2 related, 3 other combustion investigation.\n\n"
             "SI notice: these files were produced by scripts/build_data.py, written with SI (AI) assistance (Claude, Anthropic).\n"
             "The values are NASA's; the script only renames columns and converts units (mmHg and bar to atm, mole fraction to percent).\n"
             f"Built {datetime.date.today().isoformat()}.\n")

print(f"wrote {os.path.relpath(OUT, ROOT)}  ({os.path.getsize(OUT) / 1024:.0f} KB)")
print("downloads:", sorted(os.listdir(DL)))
print("tiers", S["tiers"], "| O2 >= Moon minimum", S["hi_o2"], "| also at Moon pressure", S["moon_range"], S["moon_range_by"], S["moon_low_psia"],
      "| just above it", S["moon_near"], S["moon_near_psia"])
print("materials:", [(m["id"], m["flame"], m["with_o2"], m["o2"], m["smoke"]) for m in materials])
print(f"answer bank: {len(answers)} answers, {sum(len(a['claims']) for a in answers)} claims verified against {len(corpus)} records")
print(f"investigations {S['investigations']} ({S['combustion']} combustion) | tests {S['tests']} | mapped {S['mapped']} "
      f"| with outcome {S['with_outcome']} | findings {len(findings)}")
print("solid O2", S["solid_o2_min"], "-", S["solid_o2_max"], "| FLEX bands", [(x["ext"], x["n"], x["pct"]) for x in b])
print("coverage", coverage)
print("flex 34%:", S["flex_hi_o2"], "ext", S["flex_hi_ext"], "p", S["flex_hi_p"], "| near 0.7:", S["flex_near_07"], "near 1.0:", S["flex_near_10"], "| droplets p<0.65:", S["droplet_low_p"], "max O2", S["droplet_low_p_o2_max"])
print("silicone", S["silicone_no_spread"], "/", S["silicone_n"], "burned 1g", S["silicone_burned_1g"], "| sibal", S["sibal_rates"])
print("BRE", S["bre_days"], "days", S["bre_flames"], "flames", S["bre_levels"], "| CO2 max O2", S["flex_co2_o2_max"], "He", S["flex_he_o2_max"])
