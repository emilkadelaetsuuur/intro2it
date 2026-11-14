# Space Apps 2026 project page: QUENCH

Text to paste into the Space Apps submission form. English only, as the rules require.
Fill in the links marked TODO before submitting.

## Project name

QUENCH (Quantified Evidence Navigator for Combustion Hazards)

## High-level summary

NASA plans to send crews to the Moon in cabin air with 34 % oxygen at 8.2 psia. QUENCH asks whether
decades of microgravity fire experiments cover that air. It reads all 24 combustion investigations in
NASA's Physical Sciences Informatics archive, places 986 flight test runs on one oxygen-and-pressure
map, ranks 15 evidence-backed findings, and turns them into a mission check: describe any cabin and
get graded evidence for each fire-safety question plus the tests still needed. The answer for the Moon
is clear: no solid material was ever flight-tested above 22.2 % oxygen. QUENCH also predicts whether a
droplet fire puts itself out, reads flame spread from NASA's raw video, and answers questions from the
records only. It is free to run: static files, no API, no key.

## Links

- Project: https://nasa.cartify.ink
- Demo (7 slides): https://github.com/emilkadelaetsuuur/intro2it/blob/claude/loving-johnson-f47e2l/flame-in-freefall/submission/QUENCH-demo.pdf
  (30-second video: `submission/QUENCH-demo-30s.mp4` in the same folder)
- Code: https://github.com/emilkadelaetsuuur/intro2it/tree/claude/loving-johnson-f47e2l/flame-in-freefall
- Check before submitting: every link must open for someone who is not logged in.

## Project details

**What it does.** QUENCH is one web app with nine sections:

1. **Briefing.** The bottom line on one screen: the oxygen gap, the top findings, how many flight runs
   sit near each of NASA's three cabin atmospheres, and what to do next.
2. **Mission check.** The user sets oxygen, pressure, gravity, ventilation speed, cabin materials and
   extinguishing agent. For each fire-safety question (will the materials burn, does stopping
   ventilation work, will the agent work, will a liquid fire go out, will smoke be detected, does the
   evidence hold at this gravity) QUENCH grades the flight evidence A to D by written rules, shows the
   runs it used, and ranks the tests the mission still needs. A lunar habitat scores "no flight
   evidence" on three of six questions; the space station has evidence for all six.
3. **Evidence map.** Every flight run by oxygen level and pressure, with a matching window around any cabin.
4. **Findings.** Fifteen findings, each with a claim, evidence, limits, an action and its NASA sources.
   Users set the weights (safety, evidence, mission fit, actionability) and the ranking follows.
5. **Lab: predictor.** A model trained on 261 FLEX droplet runs. On whole test days it never saw it is
   right 82 % of the time against 69 % for always guessing the common outcome (AUC 0.86). It shows the
   nearest real runs and warns when conditions are outside anything NASA tested.
6. **Lab: video.** Flame spread measured from NASA's raw BASS-II video. One scale value comes from the
   NASA report; five checks it does not use all pass: two identical tests agree within 1.6 %, the flame
   goes out 1.9 s after the fan is cut (report: within 2 s), spread follows the thin-fuel law, and the
   camera's field of view and the burn length match the hardware.
7. **Archive.** The 24 investigations with plain summaries, data coverage and publications.
8. **Lessons.** Apollo 1, the Apollo flammability tests, Apollo 13 and the Mir fire, quoted from NASA
   and tied to today's gaps, plus three NASA Spinoffs that made firefighting on Earth safer.
9. **Ask.** Questions in plain words, answered from the records only: live counts from the tables,
   material and experiment look-ups, and 30 analyst answers written with AI ahead of time whose 56
   claims were each checked by code against the records they cite.

**Key findings.**

- No solid material in the archive was flight-tested above 22.2 % oxygen; the exploration atmosphere is 34 %.
- In NASA's Burning Rate Emulator, flames in elevated oxygen kept burning after the airflow stopped,
  although stopping ventilation is the first step of the station's fire response (NASA calls this preliminary).
- In FLEX, 92 % of droplet flames below 18 % oxygen went out on their own; at 25 % and above, 8 %.
- Droplets were burned at 34 % oxygen, but at 0.70 atm, not the 0.56 atm of the exploration atmosphere.
- NASA's own Researcher's Guide reports that the material approval test (NASA-STD-6001 Test 1) is not
  conservative in microgravity, and that a local extinguisher jet can keep a flame alive.
- Every flight test was in microgravity; none at lunar gravity, the gap NASA's FM2 experiment on the Moon is designed to fill.

**How it works.** Python scripts read the raw PSI tables, clean them without guessing missing values,
compute every number on the page, check every quote word for word against a saved copy of its NASA
source, verify the AI-written text against the records, and fail the build if anything does not match.
A suite of 34 tests recounts key facts from the raw CSV files with independent code. The app is static
HTML and JavaScript: it needs no server code, no API and no key, and costs nothing to run.

**Benefits and impact.** Mission designers get an evidence check for their own cabin, with sources and a
ranked test list, in seconds. Researchers get the gaps that matter most and a working method to unlock
the results held only in NASA's 6.3 TB of raw combustion data. The same knowledge protects people on
Earth in mines, submarines, aircraft and buildings.

**Tools.** Python (numpy, ffmpeg for video), HTML, CSS and JavaScript with no framework. Data processing
and tests run on a laptop.

## NASA data

- Physical Sciences Informatics, combustion investigations: https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation
  (experimental tables of BASS, BASS-II, FLEX, FLEX-2, Saffire I–III, SAME, SAME-R, ACME, CFI, SPICE,
  SLICE, DAFT and others; metadata, publication lists)
- BASS-II raw video and the BASS-II Summary Report (NASA/TM-20210011385), PSI-25
- NASA Glenn Combustion Science: https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/
- A Researcher's Guide to ISS Combustion Science: https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/
- NASA ScienceCasts, The Power of Studying Combustion on the ISS: https://www.youtube.com/watch?v=W1oXykoz9zg
- Apollo 1: https://sma.nasa.gov/sma-disciplines/accllp/apollo-1
- Apollo 13: https://sma.nasa.gov/sma-disciplines/accllp/apollo-13
- 50 Years Ago: Apollo Flammability Tests: https://www.nasa.gov/feature/50-years-ago-apollo-flammability-tests
- 25 Years Ago: Fire Aboard Space Station Mir: https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/
- NASA Spinoff: Fireman's Air Tanks (https://spinoff.nasa.gov/node/9582), Fire Detector
  (https://spinoff.nasa.gov/node/9407), New Technology for the Fire Attire (https://spinoff.nasa.gov/node/9918)

## Space agency partner and other data

None.

## Use of artificial intelligence

We used Claude (Anthropic) as a coding and writing assistant: to write and debug code, normalise the
tables, and draft the one-line investigation summaries, the wording of the findings and the 30 analyst
answers shown in the Ask section. A team member reviewed all of it. Code then checks the AI-written
text against NASA's records at build time: every cited record must exist and every number must appear
in it with the same unit, otherwise the build stops. No number on the page is written by AI: the build
script computes every figure from NASA's tables and checks every quote against its source. No AI model
runs when the app is used. The predictor is a machine-learning model we trained on NASA data, and the
video lab uses computer vision. No AI-generated images, video or audio are used, and no NASA logos.

## References

- Olson, S. L., Ferkul, P. V. et al., BASS-II Summary Report, NASA/TM-20210011385.
- Ferkul, P. V., A Researcher's Guide to International Space Station Combustion Science, NASA, 2015.
- All PSI investigation records and their publication lists, linked from the page.
