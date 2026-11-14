# Atmospheric coverage audit · 14 November 2026

This release compares test conditions, not the probability of a spacecraft fire. The run-level export covers nine of 24 catalogued PSI investigations. Other investigations contribute metadata, day-level settings or published context.

| Independent recount from the archived test tables | Result |
|---|---:|
| Distinct exported test records | 1,156 |
| Records giving ambient oxygen | 879 |
| Records giving both ambient oxygen and chamber pressure | 738 |
| Both coordinates within the project window around 21% O₂ / 14.7 psia | 245 |
| Both coordinates within the project window around 26.5% O₂ / 10.2 psia | 43 |
| Both coordinates within the project window around 34% O₂ / 8.2 psia | 15 |
| Ambient O₂ ≥30% **and** pressure ≤10.2 psia (the challenge region) | 20 |

The window is a project choice: ±4 percentage points in oxygen and ±15% in absolute pressure, inclusive. NASA documents the [three reference atmospheres](https://ntrs.nasa.gov/citations/20240003211). Only individual rows containing both coordinates count. A marker can represent several records; CSVs retain the original per-run coordinates. BRE lists approximate oxygen settings and ignitions per day without linking individual settings, pressures and outcomes. An oxygen-only setting cannot establish a two-coordinate match.

## What changed

- [CFI-G, PSI-159](https://psi.nasa.gov/physci/repo/data/investigations/PSI-159): in 154 inverse-flame records, XO₂ is the **oxidizer feed**, not oxygen in the surrounding chamber. In the 179 normal-flame records, XO₂ before test **does** refer to the chamber. The [ACME report](https://ntrs.nasa.gov/citations/20220005205) describes the configurations. Both CSV columns now coexist, with missing ambient values left empty. Approximate chamber pressure in bar is divided by 1.01325 for atm. Test 21153 F1, for example, has 34.080788% ambient O₂ and 0.50665 bar (about 0.500 atm). The 15 exploration-window records all come from the normal-flame table: eight coded SE, five FT and two explicitly reporting direct cool ignition without hot ignition. These categories describe different flame outcomes; they do not mean all 15 achieved hot ignition.
- [CFI, PSI-39](https://psi.nasa.gov/physci/repo/data/investigations/PSI-39): eight identical rows in the 87-row droplet table are counted once. [BASS, PSI-26](https://psi.nasa.gov/physci/repo/data/investigations/PSI-26): one soot-cleaning entry was not a sample test. The previous total changes by +179 −8 −1. Where distinct tests share an identifier, the source test number is preserved.
- 22.2% is the highest reported solid-sample oxygen in the **included run tables**. It is not a NASA flight limit. Published [Saffire-VI Table 1](https://ntrs.nasa.gov/citations/20240002981) includes SIBAL at 31.0% / 54.1 kPa and two-sided PMMA at 30.3% / 54.6 kPa. [SoFIE-GEL](https://doi.org/10.1016/j.combustflame.2025.114244) separately reports solid PMMA sphere tests up to 34% O₂. Published evidence is linked without inserting synthetic rows into the PSI CSV.

## Reproducing and interpreting the checks

Run `python scripts/train_model.py`, `python scripts/build_data.py`, and `python -m unittest discover -s tests` at the project root. In particular, `tests/test_released_coordinates.py` independently reconstructs the ambient O₂, chamber pressure and burner O₂ for **every exported record**, distinguishing unknown values and checking the three windows. The FLEX model is evaluated on held-out test dates. The video checks use observations from the same experiment after one calibration; they are not independent validation of the instrument. Scientific interpretations, project rankings and A–D evidence grades do not carry NASA approval.

The 23 included CSVs are archived in `raw/tables/`. Two unrelated search hits do not contribute combustion evidence. During the release check, the PSI file-download endpoint intermittently returned HTTP 504. As a second check on the stored values, all 21 combustion tables were compared cell by cell with a [fixed public copy](https://github.com/AnteurAbderraouf/Fotia/tree/8dec5cbcaf98ea120f110200bb57c073c0263404/combustion_science). Their numeric values matched. In FLEX, 34 missing-diameter cells had different dash/replacement characters; both representations are read as missing. This comparison does not establish a fresh NASA checksum. See `raw/README.md` for omissions, provenance and the CFI-G file hash.
