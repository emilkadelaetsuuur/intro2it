# Space Apps 2026 project page: FlameGap

Text to paste into the Space Apps submission form. English only, as the rules require.
Fill in the links marked TODO before submitting.

## Project name

FlameGap

## High-level summary

NASA plans to run lunar landers and habitats at 8.2 psia and 34 % oxygen. FlameGap asks whether decades
of microgravity fire experiments actually cover that air. It reads all 24 combustion investigations in
NASA's Physical Sciences Informatics archive, places 986 test runs on one oxygen-and-pressure map, and
ranks 15 evidence-backed findings for mission designers. The answer is clear: no solid material in the
archive was flight-tested above 22.2 % oxygen. FlameGap adds a model that predicts whether a droplet fire
puts itself out and flags when it is extrapolating, a video tool that turns NASA's raw flame footage into
spread rates checked against NASA's own report, lessons from Apollo 1, Apollo 13 and Mir, and a question
box where Claude answers from the archive only, with every claim checked by code.

## Links

- Demo (7 slides): https://github.com/emilkadelaetsuuur/intro2it/blob/claude/loving-johnson-f47e2l/flame-in-freefall/submission/FlameGap-demo.pdf
  (30-second video: `submission/FlameGap-demo-30s.mp4` in the same folder)
- Project: https://claude.ai/artifact/8mt9hxj4G4EAC5e5hbvMan (turn on public sharing in its Share menu first),
  or any static host serving the `web/` folder
- Code: https://github.com/emilkadelaetsuuur/intro2it/tree/claude/loving-johnson-f47e2l/flame-in-freefall
- Check before submitting: every link must open for someone who is not logged in.

## Project details

**What it does.** FlameGap is one web page with eight parts:

1. An evidence map of every flight test by oxygen level and pressure, with the ISS, 10.2 psia and
   exploration atmospheres and a matching window around each.
2. A mission brief for any atmosphere: how many solid, droplet and gas-flame runs sit near it, the
   closest tests, and a plain brief a designer can copy.
3. Fifteen ranked findings. Each has a claim, evidence, limits, an action and its NASA sources. Users
   set the weights (safety, evidence, mission fit, actionability) and the ranking follows.
4. An outcome predictor trained on 261 FLEX droplet runs. On whole test days it never saw, it is right
   82 % of the time against 69 % for always guessing the common outcome (AUC 0.86). For every query it
   shows the nearest real runs and warns when the conditions are outside anything NASA tested, as the
   exploration atmosphere is.
5. A video lab that measures flame spread from NASA's raw BASS-II video. One scale value comes from the
   NASA report; five checks it does not use all pass: two identical tests agree within 1.6 %, the flame
   goes out 1.9 s after the fan is cut (report: within 2 s), spread follows the thin-fuel law, and the
   camera's field of view and the burn length match the hardware.
6. Lessons from Apollo 1, the Apollo flammability tests, Apollo 13 and the Mir fire, quoted from NASA
   and linked to today's gaps, plus three NASA Spinoffs that made firefighting on Earth safer.
7. A catalogue of the 24 investigations with plain summaries, data coverage and publications.
8. "Ask the archive": Claude answers using only the archive. Each claim must cite record IDs; code
   checks that the records exist and that every number appears in them with the same unit.

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
source, and fail the build if anything does not match. A test suite recounts key facts from the raw CSV
files with independent code. The page is static HTML and JavaScript, so it runs anywhere without a
server. An optional Python server adds Claude for the question box.

**Benefits and impact.** Mission designers get a one-page answer to "is our atmosphere covered by flight
data?" with sources. Researchers get a ranked list of the gaps that matter most and a working method to
unlock the results held only in NASA's 6.3 TB of raw combustion data. The same knowledge protects people
on Earth in mines, submarines, aircraft and buildings.

**Tools.** Python (numpy, ffmpeg for video), HTML, CSS and JavaScript (no framework), the Anthropic
Python SDK. Data processing and tests run on a laptop.

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
tables, draft the one-line investigation summaries and the wording of the findings. A team member
reviewed all of it. No number on the page is written by AI: the build script computes every figure
from NASA's tables, and checks every quote against its source. In the product, the optional question
box calls Claude (model claude-opus-5-5) with the archive as its only source; its answers are labelled
as AI-written and each claim's citations and numbers are checked by code before display. No
AI-generated images, video or audio are used, and no NASA logos.

## References

- Olson, S. L., Ferkul, P. V. et al., BASS-II Summary Report, NASA/TM-20210011385.
- Ferkul, P. V., A Researcher's Guide to International Space Station Combustion Science, NASA, 2015.
- All PSI investigation records and their publication lists, linked from the page.
