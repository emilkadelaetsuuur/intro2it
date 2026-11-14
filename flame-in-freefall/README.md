# QUENCH

**Quantified Evidence Navigator for Combustion Hazards**
NASA Space Apps Challenge 2026 · Flame in Freefall

QUENCH compares a cabin atmosphere with data from 24 NASA Physical Sciences Informatics (PSI) investigations. The run download includes 1,156 distinct flight test records from nine investigations. Of these, 15 normal-flame CFI-G gas tests fall within the project's comparison window around NASA's proposed 34% O₂ / 8.2 psia exploration atmosphere. This is a coverage count, not an ignition count.

Ambient oxygen for solid materials in these particular run tables reaches 22.2%. Separate flight evidence goes higher: [NASA's Saffire-VI results](https://ntrs.nasa.gov/citations/20240007488) report a cotton/fiberglass sample at 31.0% and two-sided PMMA at 30.3%; [SoFIE-GEL](https://doi.org/10.1016/j.combustflame.2025.114244) tested PMMA spheres at up to 34%.

[Read the release audit and reproduction steps](data/AUDIT.md).

Research prototype. Not validated for spacecraft design or fire-safety decisions. Not an official NASA product.

## What it does

| Section | What you get |
|---|---|
| Briefing | The bottom line on one screen: the oxygen gap against the Moon-base air NASA expects, three ways in that follow the challenge statement, the top findings, evidence counts for NASA's three cabin atmospheres, what to do next |
| Mission check | Describe a cabin (oxygen, pressure, gravity, ventilation, materials, extinguishing agent). QUENCH grades the flight evidence behind each fire-safety question A to D by written rules, shows the runs it used, ranks the tests the mission still needs and names the investigations that say most about that cabin. One click copies the report |
| Evidence | Tests with both ambient readings are plotted by oxygen and pressure. Incomplete records remain identifiable in the export. Saffire-VI and SoFIE-GEL results published outside PSI are drawn as their own layer and never counted. A second chart sets each Saffire-II sample in microgravity beside its normal-gravity result. Download matching tests or all 1,156 as CSV |
| Findings | 15 findings with evidence, limits, an action and sources, sorted into prevention, detection and suppression and ranked by weights you set |
| Lab | A predictor for droplet fires trained on 261 FLEX runs (82 % correct on unseen test days against 69 % for the majority-class baseline, and it flags extrapolation), and flame spread measured from NASA's raw BASS-II video (five consistency checks after a one-run calibration). Training runs and model coefficients download |
| Archive | The 24 investigations ranked for the habitat you pick (station, spacecraft, Moon base or rover, Mars base). Each row shows what it burned, what changed between runs, what stayed the same, what was measured and on which hardware. Compare two or three side by side |
| Lessons | Apollo 1, the Apollo flammability tests, Apollo 13 and the Mir fire in NASA's words, and three NASA Spinoffs for firefighters |
| Ask | Common questions get one of 38 checked analyst answers at once, with the statements the build verified and their records. Other questions are answered with linked excerpts from the organizers’ source list |
| Tour | Seven stops through the dashboard in about a minute, started from the briefing or from Cosmo |
| Method | How every number is produced, plus nine notes for the PSI archive team drawn from the cleaning decisions |

## How it answers the challenge

The [challenge statement](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/) asks for a
dashboard that "summarizes, ranks, and interprets combustion science investigations". A copy is saved in
`data/sources`, and the build quotes it word for word.

| The statement asks users to be able to | Where |
|---|---|
| Identify investigations most relevant to crew habitats: spacecraft, stations, Moon and Mars bases, rovers | Archive ranking, Mission check |
| Extract data that supports predictive modelling | Evidence and Lab downloads, `web/downloads/*.csv`, the predictor, the video lab, and `notebooks/quench_runs_model.ipynb`, which rebuilds the cabin coverage and a model from the CSV |
| Highlight research that informs fire-safety controls and equipment | Findings by prevention, detection and suppression; Mission check |
| Show objectives, fuels with shape and size, test conditions, variables, measurements | Archive row detail, computed from each PSI run table |
| Show similarities and differences between investigations | Archive compare, hardware families |
| Address fire safety on Earth | Lessons |
| Note that microgravity and normal-gravity results could bound partial gravity | Evidence: Saffire-II pairs chart |

## Ask and the offline dashboard

Counts, plots and the fitted FLEX model run locally in the browser. Ask first looks for a checked analyst answer shipped with the page: these were drafted with SI ahead of time, the build verifies every statement against the records it cites, and matching happens in the browser, so they appear at once and need no service. Any other question, or the “search the organizer sources” button, goes to the service. The production server retrieves passages only from the organizers’ NASA resource list, including combustion investigations returned by their PSI search. Claude selects passages to cite; the site displays sourced excerpts and never accepts URLs invented by a model. If the provider is unavailable, Ask labels its answer as archive search. A question unsupported by the approved sources can receive no answer.

Only the server holds the two API credentials. For installation, renewal and fallback behavior see [Ask service](deploy/ASK.md).

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
./scripts/build_all.sh                 # retrain the model, rebuild the data, run the regression suite
./scripts/build_all.sh PATH_TO_VIDEOS  # also rerun the video measurement
```

- `scripts/build_data.py` computes run counts and measurement ranges from the raw CSV files in `data/raw/tables`, checks every
  quote word for word against a saved copy of its source in `data/sources`, checks the numbers in
  each investigation summary, verifies the answer bank (`scripts/verify.py`), and writes the CSV
  downloads in `web/downloads`.
- `scripts/train_model.py` trains and cross-validates the predictor, grouped by test date.
- `video/` holds the video pipeline; `video/METHOD.md` explains it.
- `tests/test_project.py` recounts key facts straight from the CSVs with independent code. `tests/test_additions.py` covers the gravity pairs, the published layer, the instant answers, the notebook and the tour.
- `scripts/stamp_assets.py` refreshes the `?v=` cache tags in `web/index.html` after any change under `web/`; the build runs it and a test fails if a tag is stale.
- `notebooks/build_notebook.py` runs the notebook's cells and writes `notebooks/quench_runs_model.ipynb`.

## Data

- NASA PSI, every investigation returned for "combustion" (26 records, 24 about combustion), collected
  14 November 2026. For attribution and license information, consult each source record. Raw files in `data/raw`.
- BASS-II raw video, ReadMe and Summary Report (NASA/TM-20210011385), from PSI-25.
- Organizer resources: NASA Glenn Combustion Science, A Researcher's Guide to ISS Combustion Science,
  NASA ScienceCasts video, Apollo 1, Apollo 13, the Mir fire, and three NASA Spinoff articles.
- The Flame in Freefall challenge statement and NASA's article on the last Saffire flight, saved in
  `data/sources` and quoted word for word.
- The run export does not include Saffire-IV through -VI or SoFIE-GEL; published results are linked separately.

## Use of SI

NASA Space Apps 2026 uses the term Super Intelligence (SI) for AI. Claude (Anthropic) was used while
building: to write code, normalise the tables, and draft the investigation summaries, the wording of the
findings and the analyst answers. Source files, the page metadata and the download README carry an SI
notice. Code checks the SI-drafted text against NASA's records at build time. The optional Ask endpoint sends the question and selected organizer-source passages to the configured Claude provider. The predictor is a machine-learning model trained here on NASA data; the video lab is computer
vision. OpenAI Codex assisted with the interface redesign and the run-table and source audit. OpenAI image generation was used for the QUENCH logo, the Cosmo companion and an earlier cover illustration. The current cover is a NASA photograph of Jessica Watkins operating SoFIE hardware (ISS067-E-170237). The candle comparison is NASA Glenn image GRC-1998-C-00485. Experimental frames in the Lab are from NASA BASS-II video.
