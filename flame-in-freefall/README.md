# QUENCH

**Quantified Evidence Navigator for Combustion Hazards**
NASA Space Apps Challenge 2026 · Flame in Freefall

NASA expects the Moon base and its rovers to run on air with 30 % oxygen or more, at 10.2 psi or less.
QUENCH summarizes, ranks and interprets every combustion investigation in NASA's Physical Sciences
Informatics (PSI) archive, 24 investigations and 986 flight test runs, and answers one question for
mission designers, researchers and students: does flight evidence cover the air your crew will breathe?
The headline: the archive holds no solid-fuel flight test above **22.2 % oxygen**.

Research prototype. Not validated for spacecraft design or fire-safety decisions. Not an official NASA product.

## What it does

| Section | What you get |
|---|---|
| Briefing | The bottom line on one screen: the oxygen gap against the Moon-base air NASA expects, three ways in that follow the challenge statement, the top findings, evidence counts for NASA's three cabin atmospheres, what to do next |
| Mission check | Describe a cabin (oxygen, pressure, gravity, ventilation, materials, extinguishing agent). QUENCH grades the flight evidence behind each fire-safety question A to D by written rules, shows the runs it used, ranks the tests the mission still needs and names the investigations that say most about that cabin. One click copies the report |
| Evidence | Every run on a map of oxygen against pressure, with the matching window around any cabin and the Moon-base range. Download the runs in the window, or all 986, as CSV |
| Findings | 15 findings with evidence, limits, an action and sources, sorted into prevention, detection and suppression and ranked by weights you set |
| Lab | A predictor for droplet fires trained on 261 FLEX runs (82 % correct on unseen test days against 69 % for guessing, and it flags extrapolation), and flame spread measured from NASA's raw BASS-II video (5 of 5 independent checks pass). Training runs and model coefficients download |
| Archive | The 24 investigations ranked for the habitat you pick (station, spacecraft, Moon base or rover, Mars base). Each row shows what it burned, what changed between runs, what stayed the same, what was measured and on which hardware. Compare two or three side by side |
| Lessons | Apollo 1, the Apollo flammability tests, Apollo 13 and the Mir fire in NASA's words, and three NASA Spinoffs for firefighters |
| Ask | Questions in plain words, answered from the records only |

## How it answers the challenge

The [challenge statement](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/) asks for a
dashboard that "summarizes, ranks, and interprets combustion science investigations". A copy is saved in
`data/sources`, and the build quotes it word for word.

| The statement asks users to be able to | Where |
|---|---|
| Identify investigations most relevant to crew habitats: spacecraft, stations, Moon and Mars bases, rovers | Archive ranking, Mission check |
| Extract data that supports predictive modelling | Evidence and Lab downloads, `web/downloads/*.csv`, the predictor, the video lab |
| Highlight research that informs fire-safety controls and equipment | Findings by prevention, detection and suppression; Mission check |
| Show objectives, fuels with shape and size, test conditions, variables, measurements | Archive row detail, computed from each PSI run table |
| Show similarities and differences between investigations | Archive compare, hardware families |
| Address fire safety on Earth | Lessons |

## Free to run: no API, no key, no server code

The page is static files. Open `web/index.html`, or serve the `web/` folder from any web server.
Nothing calls a model at run time:

- counts and material look-ups are computed in the browser from `web/data.js`;
- the predictor is a small logistic model shipped in `web/model.js`;
- the 38 analyst answers in *Ask* were written with SI (AI) ahead of time; the build checks each of
  their 81 claims against the records it cites (the records must exist and every number must appear in
  them with the same unit) and stops if one fails.

## Put it on a server

On the server, as root. It adds one site and touches nothing else (see the header of `deploy/install.sh`):

```
mkdir -p /opt/quench && curl -fsSL https://github.com/emilkadelaetsuuur/intro2it/archive/refs/heads/claude/loving-johnson-f47e2l.tar.gz | tar xz --strip-components=2 -C /opt/quench --wildcards '*/flame-in-freefall/web' '*/flame-in-freefall/deploy' && bash /opt/quench/deploy/install.sh nasa.cartify.ink
```

Take it down again:

```
bash /opt/quench/deploy/install.sh nasa.cartify.ink --remove
```

Add `--tls you@example.com` to the install command for a Let's Encrypt certificate (nginx + certbot).
To update later, run the install command again.

## Rebuild and check everything

```
pip install -r requirements-dev.txt
./scripts/build_all.sh                 # retrain the model, rebuild the data, run 44 tests
./scripts/build_all.sh PATH_TO_VIDEOS  # also rerun the video measurement
```

- `scripts/build_data.py` computes every number from the raw CSV files in `data/raw/tables`, checks every
  quote word for word against a saved copy of its source in `data/sources`, checks the numbers in
  each investigation summary, verifies the answer bank (`scripts/verify.py`), and writes the CSV
  downloads in `web/downloads`.
- `scripts/train_model.py` trains and cross-validates the predictor, grouped by test date.
- `video/` holds the video pipeline; `video/METHOD.md` explains it.
- `tests/test_project.py` recounts key facts straight from the CSVs with independent code.

## Data

- NASA PSI, every investigation returned for "combustion" (26 records, 24 about combustion), collected
  14 November 2026. Public domain (CC0-1.0). Raw files in `data/raw`.
- BASS-II raw video, ReadMe and Summary Report (NASA/TM-20210011385), from PSI-25.
- Organizer resources: NASA Glenn Combustion Science, A Researcher's Guide to ISS Combustion Science,
  NASA ScienceCasts video, Apollo 1, Apollo 13, the Mir fire, and three NASA Spinoff articles.
- The Flame in Freefall challenge statement and NASA's article on the last Saffire flight, saved in
  `data/sources` and quoted word for word.
- PSI does not hold everything NASA has flown: Saffire-IV, -V and -VI are not in it.

## Use of SI

NASA Space Apps 2026 uses the term Super Intelligence (SI) for AI. Claude (Anthropic) was used while
building: to write code, normalise the tables, and draft the investigation summaries, the wording of the
findings and the analyst answers. Source files, the page metadata and the download README carry an SI
notice. Code checks the SI-drafted text against NASA's records at build time. No model runs when the page
is used. The predictor is a machine-learning model trained here on NASA data; the video lab is computer
vision. OpenAI Codex assisted with the interface redesign. OpenAI image generation was used for the QUENCH logo design and an earlier cover illustration. The current cover is a NASA photograph of Jessica Watkins operating SoFIE hardware (ISS067-E-170237). The candle comparison is NASA Glenn image GRC-1998-C-00485. Experimental frames in the Lab are from NASA BASS-II video.
