"""Check a model answer against the archive before anyone sees it.

Two rules, applied to every claim the model makes:
1. Every source it cites must be a real record in the corpus.
2. Every number in the claim must appear in at least one of the records it cites, with the same unit
   when the claim gives one ('50 %' does not match '50 mm').

A claim that breaks a rule is still shown, but marked as unverified with the reason.
Pure functions, no network; covered by tests/test_project.py.
"""
import re

NUM = re.compile(r"(?<![\w.])-?\d+(?:[.,]\d+)?(?![\w])")


def numbers(text):
    """Numbers in a text as floats. '1,600' and '1600' are the same; years and IDs count too."""
    out = []
    for m in NUM.finditer(text or ""):
        s = m.group().replace(",", "") if re.fullmatch(r"-?\d{1,3}(,\d{3})+", m.group()) else m.group().replace(",", ".")
        try:
            out.append(float(s))
        except ValueError:
            pass
    return out


UNITS = [("%", r"%|percent\b|per cent\b"), ("atm", r"atm\b"), ("psi", r"psia\b|psi\b"), ("mm/s", r"mm/s\b"), ("cm/s", r"cm/s\b"),
         ("mm2/s", r"mm²/s|mm\^?2/s"), ("um", r"µm|μm|microns?\b|micrometres?\b"), ("mm", r"mm\b|millimet"), ("cm", r"cm\b|centimet"),
         ("s", r"s\b|seconds?\b"), ("kpa", r"kpa\b"), ("gb", r"gb\b"), ("tb", r"tb\b"), ("deg", r"°|degrees?\b"), ("k", r"k\b|kelvin\b")]
_UNIT_RE = re.compile(r"\s*(" + "|".join(f"(?P<u{i}>{pat})" for i, (_, pat) in enumerate(UNITS)) + ")", re.I)
_JOIN = re.compile(r"\s*(?:(?:to|and|or|about|,|–|-)\s*)+", re.I)


def numbers_with_units(text):
    """[(value, unit or None)]. In '12 to 34 %' or '100, 200 and 300 µm' every number gets the unit."""
    text = text or ""
    found = [(m, v) for m, v in ((m, None) for m in NUM.finditer(text))]
    out = []
    for idx, (m, _) in enumerate(found):
        raw = m.group()
        val = float(raw.replace(",", "") if re.fullmatch(r"-?\d{1,3}(,\d{3})+", raw) else raw.replace(",", "."))
        unit, j, end = None, idx, m.end()
        while True:
            um = _UNIT_RE.match(text, end)
            if um:
                unit = next(UNITS[k][0] for k in range(len(UNITS)) if um.group(f"u{k}"))
                break
            jm = _JOIN.match(text, end)
            if jm and j + 1 < len(found) and found[j + 1][0].start() == jm.end():
                j += 1
                end = found[j][0].end()
                continue
            break
        out.append((val, unit))
    return out


def _present(value, pool):
    return any(abs(value - p) <= max(0.051, abs(p) * 0.005) for p in pool)


def _present_unit(value, unit, pool):
    return any((u == unit) and abs(value - v) <= max(0.051, abs(v) * 0.005) for v, u in pool)


def check_claim(claim, corpus):
    """Return (ok, issues) for one claim {text, sources} against corpus {id: text}."""
    issues = []
    cited = [s for s in claim.get("sources", []) if isinstance(s, str)]
    unknown = [s for s in cited if s not in corpus]
    known = [s for s in cited if s in corpus]
    if not cited:
        issues.append("cites no record")
    if unknown:
        issues.append("cites records that do not exist: " + ", ".join(unknown))
    pool = [n for s in known for n in numbers(corpus[s])]
    upool = [x for s in known for x in numbers_with_units(corpus[s])]
    # numbers that are part of a record ID (PSI-25) are not data
    text = re.sub(r"PSI-\d+", "", claim.get("text", ""))
    missing = []
    for v, u in numbers_with_units(text):
        ok = _present_unit(v, u, upool) if u else _present(v, pool)
        if not ok:
            missing.append(f"{v:g}" + (f" {u}" if u else ""))
    if known and missing:
        issues.append("numbers not found in the cited records: " + ", ".join(missing))
    return (not issues), issues


def verify(answer, corpus):
    """Attach a verdict to each claim and count how many passed."""
    claims = []
    for c in answer.get("claims", []):
        ok, issues = check_claim(c, corpus)
        claims.append({"text": c.get("text", ""), "sources": c.get("sources", []), "ok": ok, "issues": issues})
    n_ok = sum(1 for c in claims if c["ok"])
    return {"answer": answer.get("answer", ""), "claims": claims, "outside_archive": answer.get("outside_archive", ""),
            "verified": n_ok, "total": len(claims)}
