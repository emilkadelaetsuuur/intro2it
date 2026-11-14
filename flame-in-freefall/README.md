# QUENCH

**Quantified Evidence Navigator for Combustion Hazards**
NASA Space Apps Challenge 2026 · Flame in Freefall

NASA plans to send crews to the Moon in cabin air with 34 % oxygen at 8.2 psia. QUENCH reads every
combustion investigation in NASA's Physical Sciences Informatics (PSI) archive, 986 flight test runs in
all, and answers one question for mission designers: does flight evidence cover the air your crew will
breathe? The headline: no solid material in the archive was ever flight-tested above **22.2 % oxygen**.

Research prototype. Not validated for spacecraft design or fire-safety decisions. Not an official NASA product.

## What it does

| Section | What you get |
|---|---|
| Briefing | The bottom line on one screen: the oxygen gap, the top findings, evidence counts for NASA's three cabin atmospheres, what to do next |
| Mission check | Describe a cabin (oxygen, pressure, gravity, ventilation, materials, extinguishing agent). QUENCH grades the flight evidence behind each fire-safety question A to D by written rules, shows the runs it used, and ranks the tests the mission still needs. One click copies the report |
| Evidence | Every run on a map of oxygen against pressure, with the matching window around any cabin |
| Findings | 15 findings with evidence, limits, an action and sources, ranked by weights you set |
| Lab | A predictor for droplet fires trained on 261 FLEX runs (82 % correct on unseen test days against 69 % for guessing, and it flags extrapolation), and flame spread measured from NASA's raw BASS-II video (5 of 5 independent checks pass) |
| Archive | The 24 investigations with plain summaries, data coverage, publications and links |
| Lessons | Apollo 1, the Apollo flammability tests, Apollo 13 and the Mir fire in NASA's words, and three NASA Spinoffs for firefighters |
| Ask | Questions in plain words, answered from the records only |

## Free to run: no API, no key, no server code

The page is static files. Open `web/index.html`, or serve the `web/` folder from any web server.
Nothing calls a model at run time:

- counts and material look-ups are computed in the browser from `web/data.js`;
- the predictor is a small logistic model shipped in `web/model.js`;
- the 30 analyst answers in *Ask* were written with AI ahead of time; the build checks each of their 56
  claims against the records it cites (the records must exist and every number must appear in them
  with the same unit) and stops if one fails.

## Put it on a server

On the server, as root (adds one site, touches nothing else; see the header of the script):

```
git clone -b claude/loving-johnson-f47e2l https://github.com/emilkadelaetsuuur/intro2it.git /opt/quench
bash /opt/quench/flame-in-freefall/deploy/install.sh nasa.cartify.ink
```

Add `--tls you@example.com` for a Let's Encrypt certificate (nginx + certbot), or `--remove` to take
the site down again. To update later: `git -C /opt/quench pull` and run the same command.

## Rebuild and check everything

```
pip install -r requirements-dev.txt
./scripts/build_all.sh                 # retrain the model, rebuild the data, run 34 tests
./scripts/build_all.sh PATH_TO_VIDEOS  # also rerun the video measurement
```

- `scripts/build_data.py` computes every number from the raw CSV files in `data/raw/tables`, checks every
  quote word for word against a saved copy of its NASA source in `data/sources`, checks the numbers in
  each investigation summary, and verifies the answer bank (`scripts/verify.py`).
- `scripts/train_model.py` trains and cross-validates the predictor, grouped by test date.
- `video/` holds the video pipeline; `video/METHOD.md` explains it.
- `tests/test_project.py` recounts key facts straight from the CSVs with independent code.

## Data

- NASA PSI, every investigation returned for "combustion" (26 records, 24 about combustion), collected
  14 November 2026. Public domain (CC0-1.0). Raw files in `data/raw`.
- BASS-II raw video, ReadMe and Summary Report (NASA/TM-20210011385), from PSI-25.
- Organizer resources: NASA Glenn Combustion Science, A Researcher's Guide to ISS Combustion Science,
  NASA ScienceCasts video, Apollo 1, Apollo 13, the Mir fire, and three NASA Spinoff articles.

## Use of AI

Claude (Anthropic) was used while building: to write code, normalise the tables, and draft the
investigation summaries, the wording of the findings and the analyst answers; a person reviewed them.
Code checks the AI text against NASA's records at build time. No model runs when the page is used.
The predictor is a machine-learning model trained here on NASA data; the video lab is computer vision.
No AI-generated images or video, and no NASA logos.
