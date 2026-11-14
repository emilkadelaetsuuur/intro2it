"""Build both Ask indexes offline from organizer-linked primary source snapshots.

Run python scripts/build_ask_corpus.py to regenerate, or add --check to compare.
The search snapshot and PSI CSV tables are in data/raw. No dashboard synthesis,
publication lists, or external resources are imported.
"""

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
SOURCES = ROOT / "data" / "sources"
OUTPUTS = (ROOT / "server/corpus.json", ROOT / "web/downloads/ask-sources.json")

PSI_URL = "https://psi.nasa.gov/physci/repo/data/investigations/"
SEARCH = "https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation"
GLENN = "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/"
GUIDE = "https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/"
VIDEO = "https://www.youtube.com/watch?v=W1oXykoz9zg"
MIR = "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/"
APOLLO = "https://sma.nasa.gov/sma-disciplines/accllp/apollo-"
SPINOFF = "https://spinoff.nasa.gov/node/"
# Accessions returned by the organizer's PSI query on 2026-11-14.
HITS = (10, 20, 21, 22, 23, 25, 26, 39, 47, 60, 62, 68, 69, 98, 99, 100,
        101, 102, 106, 107, 108, 115, 117, 142, 159, 181)
SOURCE_URLS = {SEARCH, GLENN, GUIDE, VIDEO, MIR, APOLLO+"1", APOLLO+"13",
               SPINOFF+"9582", SPINOFF+"9407", SPINOFF+"9918"}
MAX_TEXT = 1350
LINK = re.compile(r"https?://|www\.|\bdoi\.org/|\b10\.\d{4,9}/", re.I)


def compact(text):
    return " ".join(text.replace("\x07", "").split())


def item(key, title, url, text):
    return dict(id=key, title=title, url=url, text=compact(text))


def snapshot(name):
    return (SOURCES / name).read_text(encoding="utf-8")


def span(text, start, end):
    """Select an auditable, complete passage by unique boundaries in the source."""
    text = compact(text)
    begin = text.index(start)
    finish = text.index(end, begin) + len(end)
    return text[begin:finish]


def article_chunks():
    # Keep each evidence fragment with its own citation. A PDF locator refers to
    # the document linked from the organizer's Guide landing page.
    guide = re.sub(r"(?<=\w)-\s*\n\s*(?=\w)", "-",
                   snapshot("researchers-guide-combustion_2015.txt")).split("\f")
    fragments = [
        (8, "buoyancy", "Gravity, buoyancy and flame shape",
         "In these bench-scale experiments", "flicker typical of flames on Earth."),
        (11, "droplets", "Spherical droplet flames",
         "The availability of a long-duration", "topics of applied combustion research."),
        (20, "acrylic", "Oxygen and soot in a burning acrylic sphere",
         "Figure 11.", "the solid regression rate."),
        (20, "fabric", "Airflow and flame spread over cotton-fiberglass fabric",
         "Figure 12.", "Total burn time is 90 seconds."),
        (21, "bass", "What the BASS material tests set out to measure",
         "The BASS investigation", "microgravity (Figures 11-13)."),
        (22, "nitrogen", "BASS nitrogen suppression and oxygen entrainment",
         "For a fire burning in microgravity", "because of this effect."),
        (30, "candles", "Candle flame duration, brightness and oxygen in microgravity",
         "The first involved the behavior of a simple candle flame", "would have on Earth."),
        (30, "flameballs", "SOFBALL stationary flames",
         "The second example involves", "Ronney, et al., 1998)."),
        (31, "spread", "Ventilation velocity and material flammability",
         "For flame spread across solid materials, the ordinate", "implications for spacecraft fire safety."),
        (31, "lowflow", "Direction of flame spread at low airflow",
         "Another related phenomenon", "absence of forced flow."),
        (31, "limits", "BASS oxygen limits and fire suppression when ventilation is turned off",
         "Recent results from the BASS experiment", "ambient airflow is turned off."),
        (33, "cool", "FLEX cool flames after visible extinction",
         "Recent spaceflight experiments (FLEX)", "forms after visible flame extinction."),
        (34, "cool-engines", "FLEX cool flame duration and engine research",
         "The FLEX tests showed", "higher efficiency and lower emissions."),
        (35, "detection", "Detecting fire by particles and chemical species",
         "Fundamental research in microgravity", "associated with fires in microgravity."),
    ]
    for page, key, title, start, end in fragments:
        text = span(guide[page - 1], start, end)
        yield item("guide-" + key, f"{title} · Researcher’s Guide, p. {page}", GUIDE, text)
    # Preserve the preceding label and following refutation in one excerpt.
    safety = span(guide[34], "This resulted in several critical misconceptions",
                  "material flammability and screening.")
    yield item("guide-ventilation", "Can shutting off ventilation always extinguish a "
               "spacecraft fire? · Researcher’s Guide, p. 35", GUIDE, safety)

    guide_intro = snapshot("researchers-guide-combustion_nasa.txt")
    yield item("guide-overview", "A Researcher’s Guide to Combustion Science", GUIDE,
               span(guide_intro, "Combustion occurs", "conditions of the space environment."))
    glenn_topics = (
        ("smoke", "SAME smoke detectors and particles"),
        ("daft", "DAFT particle measurement"),
        ("bass", "BASS burning and extinction"),
        ("flex", "FLEX inert-gas suppression"),
        ("acme", "ACME energy and emissions"),
        ("cir", "Combustion Integrated Rack on the ISS"),
        ("flare", "FLARE flammability limits"),
        ("materials", "Testing spacecraft materials in Earth gravity"),
        ("fm2", "FM2 lunar gravity research objective"),
        ("slice", "SLICE gaseous flame modeling"),
    )
    glenn_text = snapshot("combustion-science-glenn_excerpts.txt").strip().split("\n\n")
    for (key, title), text in zip(glenn_topics, glenn_text, strict=True):
        yield item("glenn-" + key, title + " · NASA Glenn", GLENN, text)

    video_title, channel, date, length, description = snapshot(
        "sciencecasts-iss-combustion_metadata.txt").strip().splitlines()
    yield item("sciencecasts", video_title, VIDEO,
               f"{channel}, {date}, {length}. Publisher's description: {description}")

    # A single incident can have distinct evidence about the event, the
    # uncertainty of the investigation and the changes that followed.
    history = [
        ("apollo-1_sma.txt", APOLLO+"1", [
            ("a1-event", "Apollo 1 launch-pad fire and crew", "On Jan. 27, Grissom", "resulting from the fire."),
            ("a1-cause", "Apollo 1 investigation and source of ignition", "On April 9, 1967", "deaths of the astronauts."),
            ("a1-hatch", "Apollo 1 hatch and rescue", "The design of the three-piece hatch", "crew members for injuries."),
            ("a1-changes", "Apollo 1 lessons and material controls", "Following the fire, NASA decided", "using fire-resistant materials."),
        ]),
        ("apollo-13_sma.txt", APOLLO+"13", [
            ("a13-event", "Apollo 13 oxygen tank explosion", "About one to two seconds", "electrical power and water."),
            ("a13-escape", "Apollo 13 lunar module Aquarius", "It was now clear", "returning them to Earth."),
            ("a13-return", "Apollo 13 crew's return", "On April 17, four hours", "world to a close."),
            ("a13-cause", "Apollo 13 oxygen tank heater and damaged insulation", "In 1965, the Command Module", "filled with oxygen."),
            ("a13-changes", "Apollo 13 investigation and oxygen system redesign", "On June 16, 1970", "in stainless steel."),
        ]),
        ("mir-fire-1997_nasa.txt", MIR, [
            ("mir-event", "1997 fire aboard Mir", "On Feb. 24, 1997", "no lasting harm to the crew members."),
            ("mir-generator", "1997 Mir fire: oxygen generator ignition and escape route", "Shortly after dinner on Feb. 24", "in an emergency evacuation."),
            ("mir-response", "1997 Mir fire: crew response, masks and extinguishers", "The crew quickly donned oxygen masks", "some of Kvant-1’s panels were charred."),
            ("mir-cause", "1997 Mir fire: probable cause of the oxygen generator failure", "Although used without incident", "inadvertently introduced into the canister."),
            ("mir-lessons", "1997 Mir fire: lessons for crew training and oxygen generators", "Following the fire, based on lessons learned", "ground preparation of the SFOG canisters."),
        ]),
    ]
    for filename, url, entries in history:
        source = snapshot(filename)
        for key, title, start, end in entries:
            yield item(key, title + " · NASA", url, span(source, start, end))

    for node, key, filename in (
        ("9582", "air-tanks", "spinoff-firemans-air-tanks.txt"),
        ("9407", "detector", "spinoff-fire-detector.txt"),
        ("9918", "attire", "spinoff-fire-attire.txt"),
    ):
        source = snapshot(filename)
        title, year = source.splitlines()[:2]
        article = source.partition("\n\n")[2].partition("\n\nFull article:")[0]
        yield item("spinoff-" + key, title + " · NASA Spinoff", SPINOFF+node,
                   year + ". " + article)


def metadata_chunks(number, study, citation):
    fields = (("objective", "Research objective"), ("approach", "Research approach"),
              ("hypothesis", "Research hypothesis"))
    for field, label in fields:
        content = compact(study[field])
        title = f"{citation} · {label}"
        if number == 102 and field in ("objective", "approach"):
            title = f"SAME spacecraft smoke particle size measurements (PSI-102) · {label}"
        # Two PSI fields are bibliographies, not standalone evidence.
        if not content or LINK.search(content):
            continue
        sections = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", content)
        chunk = ""
        index = 0
        for section in sections:
            if len(section) + len(label) + 2 > MAX_TEXT:
                # Do not emit an incomplete condition or strip its qualifiers.
                raise ValueError(f"Unsegmented PSI field: PSI-{number} {field}")
            if chunk and len(chunk) + len(section) + len(label) + 3 > MAX_TEXT:
                index += 1
                yield item(f"psi{number}-{field}-{index}", title,
                           PSI_URL + study["accession"], f"{label}: {chunk}")
                chunk = ""
            chunk = (chunk + " " + section).strip()
        if chunk:
            yield item(f"psi{number}-{field}-{index+1}", title,
                       PSI_URL + study["accession"], f"{label}: {chunk}")


# Each tuple selects a checked-in, primary PSI table. The row coordinate in each
# citation counts data rows after the header in that file (first row is 1).
# Numeric values, ranges, and free-text outcomes retain the table's units.
TABLES = {
    10: ("Flame Design_Normal Flame",), 20: ("ACME BRE",), 21: ("CLD Flame",),
    22: ("ACME E-FIELD Flames",), 23: ("ACME s-Flame",), 25: ("BASS-II",),
    26: ("BASS",), 39: ("CFI",), 47: ("DAFT",), 68: ("Flex2",), 69: ("FLEX",),
    98: ("SAFFIRE-1",), 99: ("SAFFIRE-2",), 100: ("SAFFIRE-3",),
    101: ("SAME-R",), 102: ("SAME",), 106: ("Slice",), 107: ("Spice",),
    159: ("CFI-G_Normal Flames", "CFI-G_Inverse Flames"),
}


def table_chunks(number, table, acronym):
    path = RAW / "tables" / f"PSI-{number}_Experimental table_{table}.csv"
    # The bundled E-FIELD table splits a quoted cell; DAFT also has changed
    # punctuation. These two snapshots are the original version 1 NASA CSVs.
    if number in (22, 47):
        path = SOURCES / f"ask-PSI-{number}-v1.csv"
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.reader(stream)
        header = [compact(k) for k in next(reader)]
        rows = [[compact(v) for v in row] for row in reader]

    tag = str(number)
    if number == 159:
        tag += "-normal" if "Normal" in table else "-inverse"
    url = PSI_URL + f"PSI-{number}"
    prefix = f"{acronym} (PSI-{number})"
    notes = {row[0][:6]: row[0] for row in rows if row and row[0].startswith("Note ")}
    seen = set()
    for index, row in enumerate(rows, 1):
        if not any(row) or tuple(row) in seen:
            continue
        seen.add(tuple(row))
        if (number == 26 and not row[2]) or (number in (98, 99) and row[0].startswith(("F", "Note "))):
            continue
        if len(row) != len(header):
            raise ValueError(f"{path.name}: wrong column count at row {index}")
        omit = {"Camera 1", "Camera 2"}
        context = []
        if number == 68:
            context.append("Fuel summary with ranges and multiple settings; individual pairings and outcomes are not specified.")
        if number in (25, 26, 100):
            context.append("This table has no ignition-outcome column.")
        if number == 69 and row[5] == "0":
            omit.add(header[5])
            context.append("The pressure cell is 0 mmHg in the source; it cannot be used as a physical test pressure.")
        if number == 20 and any(float(x) > 100 for x in re.findall(r"([\d.]+)%", row[5])):
            omit.add(header[5])
            context.append("The oxygen field contains a percentage greater than 100 and provides no usable concentration.")
        if number == 99:
            # The material is genuinely blank on rows 2-6 and 2-9. No carry-forward.
            context.append(notes["Note 1"])
            for note in (2, 3, 4):
                if any(f"note {note}" in cell.lower() for cell in row):
                    context.append(notes[f"Note {note}"])
        cells = []
        for name, value in zip(header, row, strict=True):
            if name in omit:
                continue
            if value == "�":
                value = "[unreadable in source]"
            elif not value:
                value = "[blank in source]"
            # The table includes placeholder values (such as a dash or "none").
            # Retain these literally. Never convert them to zero or an outcome.
            cells.append(f"{name}: {value}")
        detail = " | ".join(cells)
        text = f"{prefix}, {table} experimental table, row {index}. {detail.rstrip('.')}. " + " ".join(context)
        locator = f"row {index}"
        for key in ("Test", "Test #", "FLEX Test #", "Sample Number", "Sample #", "SAME Test #"):
            if key in header and row[header.index(key)]:
                locator += f", {key} {row[header.index(key)]}"
                break
        yield item(f"psi{tag}-r{index}", f"{prefix} · {table}, {locator}", url, text)

    if number == 25:
        column = header.index("Calibrated initial O2 % by vol")
        oxygen = [float(row[column]) for row in rows if any(row)]
        yield item("psi25-oxygen", "BASS-II · measured initial oxygen range", url,
                   f"The {len(oxygen)} BASS-II table rows have calibrated initial oxygen values "
                   f"from {min(oxygen):g}% to {max(oxygen):g}% by volume. These are initial gas "
                   "measurements. The table does not record an ignition or extinction outcome per row.")
    if number == 69:
        counts = Counter(row[-1] for row in rows if any(row))
        summary = ", ".join(f"{n} {label}" for label, n in sorted(counts.items()))
        yield item("psi69-test-ends", "FLEX · test counts for extinction, completion and disruption", url,
                   f"FLEX (PSI-69) experimental table. Across {sum(counts.values())} data rows, "
                   f"the values in the Test end column are {summary}.")
        for fuel in sorted({row[4] for row in rows if any(row)}):
            fuel_ends = Counter(row[-1] for row in rows if any(row) and row[4] == fuel)
            ends = ", ".join(f"{n} {label}" for label, n in sorted(fuel_ends.items()))
            yield item(f"psi69-ends-{fuel.lower()}", f"FLEX · {fuel} droplet tests ending in extinction, completion and disruption",
                       url, f"The FLEX (PSI-69) table lists {sum(fuel_ends.values())} rows for "
                       f"{fuel}. Recorded values in the Test end column: {ends}.")
    if number == 98:
        samples = [row for row in rows if row[0] in ("S1", "S2")]
        times = ". ".join(f"Sample {row[0]}, {row[1]}, {row[10].lower()} flow of "
                          f"{row[5]} cm/s: burn time {row[9]} s at {row[6]}% O2" for row in samples)
        yield item("psi98-burn-times", "Saffire-I · concurrent and opposed flow, SIBAL burn times",
                   url, f"Saffire-I (PSI-98) experimental table. {times}.")
    if number == 159:
        for field in ("Hot ignition", "Cool flame?"):
            if field in header:
                counts = Counter((row[header.index(field)] or "[blank in source]").lower()
                                 for row in rows if any(row))
                values = ", ".join(f"{k}: {v}" for k, v in sorted(counts.items()))
                tag_field = "hot" if field == "Hot ignition" else "cool"
                yield item(f"psi{tag}-{tag_field}", f"{prefix} · {table}, {field} counts", url,
                           f"{table}, {sum(counts.values())} data rows. {field} column values "
                           f"(case-insensitive counts): {values}. Blank cells do not establish an outcome.")


def build():
    result = list(article_chunks())
    with (RAW / "investigations.csv").open(encoding="utf-8-sig", newline="") as stream:
        records = {r["accession"]: r for r in csv.DictReader(stream)}
    studies = {r["accession"]: r for r in json.loads(
        (RAW / "investigations_text.json").read_text(encoding="utf-8"))}
    admitted = {f"PSI-{n}" for n in HITS}
    if set(records) != admitted or set(studies) != admitted:
        raise ValueError("The PSI search snapshot no longer matches the verified search hits.")
    result.append(item("psi-search", "PSI combustion investigation search", SEARCH,
                       f"The NASA Physical Sciences Informatics investigation search for combustion "
                       f"returned {len(HITS)} records in the archived search result: "
                       + ", ".join(f"PSI-{n}" for n in HITS) + "."))
    for n in HITS:
        accession = f"PSI-{n}"
        record, study = records[accession], studies[accession]
        title, acronym = record["title"], record["acronym"]
        citation = f"{acronym or title} ({accession})"
        if record["url"] != PSI_URL + accession or title != study["title"]:
            raise ValueError(f"Unexpected metadata for {accession}")
        result.append(item(f"psi{n}-record", f"{citation} · investigation record", record["url"],
                           f"{title}. {accession}. Project type: {record['project_type']}. "
                           f"Platform: {record['platform'] or '[not specified]'}. "
                           f"Sub-area: {record['sub_area'] or '[not specified]'}."))
        if n in (108, 181):  # Search also returns a fluid-flow study and solder study.
            continue
        result.extend(metadata_chunks(n, study, citation))
        for table in TABLES.get(n, ()):
            result.extend(table_chunks(n, table, acronym))
    valid_urls = SOURCE_URLS | {PSI_URL + accession for accession in admitted}
    if len({r["id"] for r in result}) != len(result):
        raise ValueError("Non-unique evidence IDs")
    for entry in result:
        if (entry["url"] not in valid_urls or LINK.search(entry["text"]) or
                LINK.search(entry["title"]) or not 0 < len(entry["text"]) <= MAX_TEXT):
            raise ValueError(f"Invalid evidence chunk: {entry['id']}")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify both indexes without writing files")
    args = parser.parse_args()
    entries = build()
    encoded = (json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    for path in OUTPUTS:
        if args.check:
            if not path.exists() or path.read_bytes().replace(b"\r\n", b"\n") != encoded:
                parser.exit(1, f"Stale or missing index: {path}\n")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(encoded)
    print(f"{len(entries)} evidence chunks from {len({e['url'] for e in entries})} source links.")


if __name__ == "__main__":
    main()
