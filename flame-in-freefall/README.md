# FlameGap

**NASA Space Apps Challenge 2026 · Flame in Freefall**

FlameGap shows where NASA's flight evidence on spacecraft fire ends, and what that means for a Moon base.
It reads every combustion investigation in NASA's Physical Sciences Informatics (PSI) archive, puts all
986 listed test runs on one map of oxygen level against pressure, and compares them with the cabin
atmosphere NASA proposes for exploration: 8.2 psia and 34 % oxygen.

The headline: no solid material in the archive was ever flight-tested above **22.2 % oxygen**.

Research prototype. Not validated for spacecraft design or fire-safety decisions. Not an official NASA product.

## What is in it

| Part | What it does |
|---|---|
| Evidence map | All test runs by oxygen and pressure, with the ISS, 10.2 psia and exploration atmospheres and a matching window around each |
| Mission brief | For any atmosphere: how many runs of solids, droplets and gas flames sit near it, the closest tests, and a plain-language brief you can copy |
| Ranked findings | 15 findings, each with evidence, limits, an action and its sources, ranked by weights you set (safety, evidence, mission fit, actionability) |
| Outcome predictor | A model of 261 FLEX droplet runs: will the flame go out on its own? Tested on unseen days (82 % vs 69 % baseline), and it flags extrapolation |
| Video lab | Flame spread measured automatically from NASA's raw BASS-II video, checked against the NASA report and physics (5 of 5 independent checks pass) |
| History | Apollo 1, the Apollo flammability tests, Apollo 13 and the Mir fire, quoted from NASA and linked to what the archive can say today; three NASA Spinoffs for firefighting |
| Investigations | The 24 combustion investigations with plain summaries, data coverage, publications and links |
| Ask the archive | Questions answered by Claude from the archive only; every claim cites records and is checked by code. Works offline without a key |

## Run it

The page is static. Open `web/index.html` in a browser, or serve the `web/` folder from any static host.

To get answers written by Claude in the question box:

```
pip install -r server/requirements.txt
export ANTHROPIC_API_KEY=...
python3 server/serve.py          # http://localhost:8000
```

Without a key the server still serves the page and the question box falls back to its offline search.

## Rebuild and check everything

```
pip install -r requirements-dev.txt
./scripts/build_all.sh                 # retrain the model, rebuild the data, run 29 tests
./scripts/build_all.sh PATH_TO_VIDEOS  # also rerun the video measurement
```

- `scripts/build_data.py` computes every number on the page from the raw CSV files in `data/raw/tables`,
  checks every quote word for word against a saved copy of its NASA source in `data/sources`, and checks
  that every number in an investigation summary appears in that investigation's record or table.
- `scripts/train_model.py` trains and cross-validates the predictor (grouped by test date).
- `video/` holds the video pipeline and `video/METHOD.md` explains it.
- `tests/test_project.py` recounts key facts straight from the CSVs with independent code, and tests the
  model, the video results, the answer checker and the server.

## Data

- NASA PSI, every investigation returned for "combustion" (26 records, 24 about combustion), collected
  14 November 2026. Public domain (CC0-1.0). Raw files in `data/raw`.
- BASS-II raw video and the BASS-II Summary Report (NASA/TM-20210011385), from PSI-25.
- Organizer resources: NASA Glenn Combustion Science, A Researcher's Guide to ISS Combustion Science,
  NASA ScienceCasts video, Apollo 1, Apollo 13, the Mir fire, and three NASA Spinoff articles.

## Use of AI

Claude (Anthropic) helped write the code, normalise the tables, draft the investigation summaries and the
wording of the findings; a person reviewed them. Every number shown is computed by code from NASA data,
and every quote is checked against its source at build time. The optional question box calls Claude
(`claude-opus-5-5`) with the archive as its only source and checks each claim's citations and numbers
before display. No AI-generated images or video are used.
