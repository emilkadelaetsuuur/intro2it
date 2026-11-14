#!/usr/bin/env python3
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
     "title": f"No solid material has been flight-tested above {S['solid_o2_max']:g} % oxygen",
     "claim": f"Every solid-fuel test with a recorded oxygen level sits between {S['solid_o2_min']:g} and {S['solid_o2_max']:g} %. "
              f"The exploration atmosphere is {exp['o2']:g} %, which is {gap:.1f} points beyond the last data point.",
     "evidence": f"{S['solid_with_o2']} solid-fuel tests carry an oxygen value (BASS-II and Saffire I and II). "
                 f"A further {S['solid_no_conditions']} (BASS and Saffire-III) list no oxygen level at all.",
     "limits": "This describes the PSI archive. Tests run after these investigations, or not yet released, are not counted.",
     "action": "Do not extrapolate material flammability limits from this archive to 34 % oxygen. Flag every material cleared only at 21 %.",
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
     "title": "The ground test used to approve materials may not be the worst case",
     "claim": "NASA screens materials with an upward-burning test in normal gravity. BASS and BASS-II test the hypothesis that the "
              "same material, given enough airflow, burns as well or better in microgravity.",
     "evidence": f"BASS-II: {S['bass2_n']} tests with oxygen from {S['solid_o2_min']:g} to {S['solid_o2_max']:g} %. BASS: {S['bass_n']} tests. "
                 "The Glenn combustion page says of the NASA-STD-6001 flame test that some researchers believe it is not conservative in low gravity.",
     "quote": "BASS-II tests the hypothesis that " + BASS_QUOTE + ".", "quote_src": "PSI-25, Hypothesis",
     "limits": "This is the hypothesis under test, not a tabulated result. The outcome of each BASS-II test is not in the PSI table.",
     "action": "Add a microgravity margin to materials approved on the 1 g test alone.",
     "scores": {"safety": 5, "evidence": 2, "mission": 4, "action": 4}, "next": ["flare", "sofie"],
     "sources": src("PSI-25", "PSI-26")},
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
     "claim": "All flight investigations in the archive flew on the space station, a Cygnus cargo ship or the Space Shuttle. "
              "A Moon base sits at one sixth of Earth gravity, where there is no flight data at all.",
     "evidence": f"Platforms across {S['combustion']} combustion investigations: {', '.join(S['platforms'])}.",
     "quote": SAFFIRE_QUOTE, "quote_src": "PSI-99, Hypothesis",
     "limits": "Ground facilities such as drop towers and centrifuges can simulate partial gravity for a few seconds. Those tests are not in this archive.",
     "action": "Carry partial gravity as an open risk in Moon base fire-safety requirements.",
     "scores": {"safety": 4, "evidence": 5, "mission": 5, "action": 3}, "next": ["fm2"], "sources": src("PSI-99", "PSI-25")},
    {"id": "suppress", "kind": "Computed from run tables", "tags": ["suppression", "oxygen", "liquids"],
     "title": "Suppressant data stops well short of exploration oxygen levels",
     "claim": f"FLEX burned droplets in atmospheres diluted with carbon dioxide ({S['flex_co2']} runs) and helium ({S['flex_he']} runs). "
              f"None of the carbon dioxide runs went above {S['flex_co2_o2_max']:g} % oxygen and none of the helium runs above {S['flex_he_o2_max']:g} %.",
     "evidence": f"FLEX: {S['flex_co2_hi']} carbon dioxide runs at 30 % oxygen or more.",
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
     "action": "Extract spread rate and extinction from the BASS videos into a public table. This is a tractable computer-vision task.",
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
]

data = {
    "meta": {"built": datetime.date.today().isoformat(),
             "source": "NASA Physical Sciences Informatics (PSI), search term 'combustion'",
             "source_url": "https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation",
             "glenn_url": "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/",
             "license": "CC0-1.0"},
    "atmospheres": ATMOSPHERES, "stats": stats, "flex2": flex2, "next": NEXT, "findings": findings,
    "investigations": investigations, "tests": tests, "conditions": conditions, "notes": notes,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("// Generated by scripts/build_data.py from NASA PSI tables. Do not edit by hand.\n")
    fh.write("window.FLAME = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")

print(f"wrote {os.path.relpath(OUT, ROOT)}  ({os.path.getsize(OUT) / 1024:.0f} KB)")
print(f"investigations {S['investigations']} ({S['combustion']} combustion) | tests {S['tests']} | mapped {S['mapped']} "
      f"| with outcome {S['with_outcome']} | findings {len(findings)}")
print("solid O2", S["solid_o2_min"], "-", S["solid_o2_max"], "| FLEX bands", [(x["ext"], x["n"], x["pct"]) for x in b])
print("coverage", coverage)
print("flex 34%:", S["flex_hi_o2"], "ext", S["flex_hi_ext"], "p", S["flex_hi_p"], "| near 0.7:", S["flex_near_07"], "near 1.0:", S["flex_near_10"], "| droplets p<0.65:", S["droplet_low_p"], "max O2", S["droplet_low_p_o2_max"])
print("silicone", S["silicone_no_spread"], "/", S["silicone_n"], "burned 1g", S["silicone_burned_1g"], "| sibal", S["sibal_rates"])
print("BRE", S["bre_days"], "days", S["bre_flames"], "flames", S["bre_levels"], "| CO2 max O2", S["flex_co2_o2_max"], "He", S["flex_he_o2_max"])
