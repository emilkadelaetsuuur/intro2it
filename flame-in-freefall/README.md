# FlameGap

A dashboard for the NASA Space Apps 2026 challenge *Flame in Freefall*. It puts every flight test in NASA's
microgravity combustion archive on one map of oxygen level against pressure, and shows how much evidence
sits around the cabin atmosphere a mission plans to use.

Status: working prototype. Not validated for spacecraft design or fire-safety decisions.

## Run it

Open `web/index.html` in a browser. There is no build step and no server.

To rebuild the data after changing anything in `data/raw`:

```
python3 scripts/build_data.py
```

The script needs only the Python standard library. It writes `web/data.js` and prints the key numbers.

## What is here

- `web/index.html` — the whole app: evidence map, mission brief, ranked findings, investigation catalogue,
  question box, method notes.
- `web/data.js` — generated. Do not edit by hand.
- `scripts/build_data.py` — reads the raw NASA tables, cleans them, computes every number the page shows,
  and writes the findings. Quotes from NASA records are checked against the source at build time.
- `data/raw/` — 22 experiment tables, investigation metadata and publication lists exactly as NASA PSI
  serves them. See `data/raw/README.md` (in Russian) for how they were collected.

## Data

Source: [NASA Physical Sciences Informatics](https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation),
search term "combustion", collected 14 November 2026. Licence CC0-1.0.

Current NASA experiments (FM2, SoFIE, FLARE) are taken from the
[NASA Glenn combustion science page](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/).

## Still to do

- Publish the page at a public URL for the judges.
- Connect the question box to a model endpoint (the page already falls back to offline search).
- Write the Space Apps project page, the demo and the AI-use declaration.
