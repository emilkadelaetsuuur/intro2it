# SI notice: written with SI (AI) assistance (Claude, Anthropic).
"""Check citations and numerical tokens. These checks do not establish scientific entailment."""
import csv
import re
from pathlib import Path

NUM = re.compile(r"(?<![\w.])-?(?:\d{1,3}(?:,\d{3})+|\d+(?:[.,]\d+)?)(?!\w)")


def _numeric_value(raw):
    if re.fullmatch(r"-?\d{1,3}(,\d{3})+", raw):
        return float(raw.replace(",", ""))
    return float(raw.replace(",", "."))


def numbers(text):
    """Return the numerical tokens in their order of appearance."""
    return [_numeric_value(m.group()) for m in NUM.finditer(text or "")]


UNITS = [("%", r"%|percent\b|per cent\b"), ("atm", r"atm\b"), ("psi", r"psia\b|psi\b"), ("mm/s", r"mm/s\b"), ("cm/s", r"cm/s\b"),
         ("mm2/s", r"mm²/s|mm\^?2/s"), ("um", r"µm|μm|microns?\b|micrometres?\b"), ("mm", r"mm\b|millimet"), ("cm", r"cm\b|centimet"),
         ("s", r"s\b|seconds?\b"), ("min", r"minutes?\b"), ("lb", r"pounds?\b|lbs?\b"),
         ("kpa", r"kpa\b"), ("bar", r"bar\b"), ("gb", r"gb\b"), ("tb", r"tb\b"), ("deg", r"°|degrees?\b"), ("k", r"k\b|kelvin\b")]
_UNIT_RE = re.compile(r"\s*(" + "|".join(f"(?P<u{i}>{pat})" for i, (_, pat) in enumerate(UNITS)) + ")", re.I)
_JOIN = re.compile(r"\s*(?:(?:to|and|or|about|,|–|-)\s*)+", re.I)


def numbers_with_units(text):
    """[(value, unit or None)]. In '12 to 34 %' or '100, 200 and 300 µm' every number gets the unit."""
    text = text or ""
    found = list(NUM.finditer(text))
    out = []
    for idx, m in enumerate(found):
        val = _numeric_value(m.group())
        unit, j, end = None, idx, m.end()
        while True:
            um = _UNIT_RE.match(text, end)
            if um:
                unit = next(UNITS[k][0] for k in range(len(UNITS)) if um.group(f"u{k}"))
                break
            jm = _JOIN.match(text, end)
            if jm and j + 1 < len(found) and found[j + 1].start() == jm.end():
                j += 1
                end = found[j].end()
                continue
            break
        out.append((val, unit))
    return out


def _without_record_ids(text):
    return re.sub(r"\bPSI-\d+\b", "", text or "")


def check_claim(claim, corpus):
    """Return (ok, issues) for one claim {text, sources} against corpus {id: text}."""
    issues = []
    claim_text = claim.get("text", "")
    if not isinstance(claim_text, str) or not claim_text.strip():
        issues.append("claim is empty")
        claim_text = ""
    cited = [s for s in claim.get("sources", []) if isinstance(s, str)]
    unknown = [s for s in cited if s not in corpus]
    known = [s for s in cited if s in corpus]
    if not cited:
        issues.append("cites no record")
    if unknown:
        issues.append("cites records that do not exist: " + ", ".join(unknown))
    upool = {x for s in known for x in numbers_with_units(_without_record_ids(corpus[s]))}
    pool = {value for value, _ in upool}
    missing = []
    for v, u in numbers_with_units(_without_record_ids(claim_text)):
        ok = (v, u) in upool if u else v in pool
        if not ok:
            missing.append(f"{v:g}" + (f" {u}" if u else ""))
    if known and missing:
        issues.append("numbers not found in the cited records: " + ", ".join(missing))
    return (not issues), issues


def check_external_flights(curated, source_dir):
    """Compare complete condition/outcome tuples with transcriptions of the original flight papers."""
    def table(key):
        source = Path(source_dir, curated["sources"][key]["file"]).read_text(encoding="utf-8")
        _, block = source.strip().rsplit("\n\n", 1)
        return list(csv.DictReader(block.splitlines()))

    def conditions(row):
        pressure = row["pressure_kpa"]
        return (row["material_id"], float(row["oxygen_percent"]),
                float(pressure) if pressure not in (None, "") else None)

    flights = curated["external_saffire6"]["runs"]
    published_events = [(int(r["event"]), *conditions(r), r["outcome"]) for r in table("saffire6events")]
    actual_events = [(r["event"], *conditions(r), r["outcome"]) for r in flights]
    if sorted(actual_events) != sorted(published_events):
        raise ValueError("Saffire-VI events differ from the published flight-event table")

    measured = {r["sample"]: conditions(r) for r in table("saffire6tests") if r["sample"].startswith("VI-")}
    if {r["id"]: conditions(r) for r in flights if r["outcome"] == "burn"} != measured:
        raise ValueError("Saffire-VI sample identifiers or measured conditions differ from the published sample table")

    gel = curated["external_sofie"]
    for key, value in table(gel["source"])[0].items():
        expected = value if key == "material_id" else float(value)
        if gel[key] != expected:
            raise ValueError(f"SoFIE-GEL {key} differs from the published experiment range")


def verify(answer, corpus):
    """Attach a verdict to each claim and count how many passed."""
    claims = []
    for c in answer.get("claims", []):
        ok, issues = check_claim(c, corpus)
        claims.append({"text": c.get("text", ""), "sources": c.get("sources", []), "ok": ok, "issues": issues})
    n_ok = sum(1 for c in claims if c["ok"])
    return {"answer": answer.get("answer", ""), "claims": claims, "outside_archive": answer.get("outside_archive", ""),
            "verified": n_ok, "total": len(claims)}
