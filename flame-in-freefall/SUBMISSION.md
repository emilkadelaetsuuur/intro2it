# Space Apps 2026 project page: QUENCH

Text for the Project tab on spaceappschallenge.org, field by field, in the order of the official
Project Submission Guide (13 November 2026). English only, as the rules require.

Before you press "Submit for Judging":

- Deadline: Sunday 15 November, 11:59 p.m. local time of your Local Event.
- Every link must open in a private browser window with no login.
- The demo is either the 7-slide deck or a video of 30 seconds or less. Longer demos are not judged.
- The slides must show the team name, the names of the team members and the challenge. Put yours in
  `submission/slides.html` (first slide) and print it to PDF again.
- The SI field must be true for your team. Edit the draft below so it says what you actually did.

## Project Name

QUENCH (Quantified Evidence Navigator for Combustion Hazards)

## High-Level Project Summary

The challenge asks about possible lunar cabin atmospheres with at least 30% oxygen at no more than 10.2 psia.
QUENCH is a web dashboard that summarizes, ranks and interprets a collection of combustion investigations in NASA's
Physical Sciences Informatics (PSI) archive to show what that means for fire safety. It reads 24
investigation records and 1,156 distinct flight test records from nine of them, ranks the investigations for the habitat you pick (station,
spacecraft, Moon base or rover, Mars base), shows what each one burned, varied and measured, and compares
them side by side. It then interprets the evidence: 15 ranked findings sorted into prevention, detection
and suppression, and a mission check that grades coverage by project rules for any cabin and lists the tests
still needed. The headline: the selected run tables stop at 22.2% ambient oxygen for solids; NASA's Saffire-VI flight data in a separate report go higher. Every run can be
downloaded as CSV for modelling, with a worked predictor and flame-spread numbers read from NASA's raw
video. It matters because materials approved at 21 % oxygen may behave differently in an oxygen-enriched cabin.

## Link to Project Demo

7 slides (PDF):
https://github.com/emilkadelaetsuuur/intro2it/blob/claude/loving-johnson-f47e2l/flame-in-freefall/submission/QUENCH-demo.pdf

## Link to Final Project

Live site: https://nasa.cartify.ink
Code and data: https://github.com/emilkadelaetsuuur/intro2it/tree/claude/loving-johnson-f47e2l/flame-in-freefall

If the live site is not up when you submit, give the code link here. The site is static: opening
`web/index.html` from the repository runs the whole project.

## Detailed Project Description

**What it does.** QUENCH answers the three things the challenge asks a dashboard to enable.

1. *Identify the investigations most relevant to a crew habitat.* The Archive ranks all 24 combustion
   investigations for a space station, a reduced-pressure spacecraft, a Moon base or rover, or a Mars base.
   The score has four visible parts: how the challenge statement and PSI tie the investigation to fire
   safety, how close its fuel is to cabin materials, how close its runs come to the cabin's oxygen and
   pressure, and how ready its data is to use. Users can change the weights. Each row opens to show the
   objective, the fuels with sample or burner sizes, what changed between runs and what was held constant
   (computed from the PSI run table), what was recorded, the measurement types named in the record, and
   the hardware. Two or three investigations can be compared side by side, with matching rows marked, and
   six hardware families (for example BASS, BASS-II, SPICE and SLICE in the glovebox flow duct) show which
   studies share hardware; other test conditions still need to be compared.
2. *Extract data for predictive modelling.* The Evidence map plots tests with both ambient oxygen and chamber pressure,
   with the cabin of interest and the Moon-base range drawn on it. The runs inside any cabin's window, or
   all 1,156, download as CSV with one row per run. The Lab shows what the data can do: a model trained on
   261 FLEX droplet runs predicts whether a flame goes out on its own (82 % correct on test days it never
   saw, against 69 % for the majority-class baseline; it warns when it extrapolates), and a tracker reads flame spread from
   raw BASS-II video (five consistency checks after calibration on one run).
3. *Highlight research that informs fire-safety controls and equipment.* Fifteen findings, each with its
   evidence, limits, an action and NASA sources, sorted into prevention, detection and suppression and
   ranked by weights the user sets. The Mission check turns them into a tool: set oxygen, pressure,
   gravity, ventilation, cabin materials and extinguishing agent, and QUENCH grades coverage by project rules
   A to D for six fire-safety questions, shows the runs it used, lists the tests still needed and names
   the investigations that say most about that cabin.

Two more sections give context: Lessons (Apollo 1, the Apollo flammability tests, Apollo 13 and the Mir
fire in NASA's words, plus firefighting applications documented by NASA Spinoff) and Ask (questions in
plain words, answered from the records only).

**Key findings.**

- Applying both challenge conditions (ambient O₂ ≥30% and pressure ≤10.2 psia) gives 20 gas tests, no droplet tests and no solid tests with both coordinates in the selected tables. The narrower comparison window around 34% / 8.2 psia contains 15 gas tests. These are counts of test records, not of successful ignitions.
- In separate [Saffire-VI results](https://ntrs.nasa.gov/citations/20240007488), NASA reports SIBAL fabric at 31.0% / 54.1 kPa and two-sided PMMA at 30.3% / 54.6 kPa. [SoFIE-GEL](https://doi.org/10.1016/j.combustflame.2025.114244) reports tests on solid PMMA spheres up to 34% oxygen.
- In the Burning Rate Emulator, flames in elevated oxygen kept burning after the airflow stopped, although
  stopping ventilation is the first step of the station's fire response (NASA calls this preliminary).
- In FLEX, 92 % of droplet flames below 18 % oxygen went out on their own; at 25 % and above, 8 %.
- NASA's Researcher's Guide reports that the material approval test (NASA-STD-6001 Test 1) can be nonconservative for some materials in microgravity, and that a local extinguisher jet can supply flow to a flame under some conditions.
- The normalized run tables do not provide measurements at sustained lunar or Martian gravity. Microgravity and Earth-gravity tests cannot establish a numerical bound for a specific material at partial gravity.

**How it works.** Python scripts read the raw PSI tables, clean them without guessing missing values,
calculate run counts and measurement ranges, match every quote word for word against a saved copy of its source
(including the challenge statement), and stop the build if anything does not match. Automated regression tests
recount key facts from the raw CSV files with independent code. The site is static HTML and JavaScript:
no server code, no API, no key, nothing to pay.

**Benefits.** A mission designer gets an evidence check for their own cabin, with sources and a ranked
test list, in seconds. A researcher or student sees which investigations to read first, how they differ
and where the data is thin, and leaves with a clean table of runs. The Lessons section separates documented uses on Earth from proposed applications.

**What we hope to achieve.** That exploration fire-safety requirements name the oxygen gap explicitly,
that more flight test results become available as run-level data, and that the results still locked in BASS
video are extracted into a public table. QUENCH shows the method for each.

**Tools.** Python (standard library, numpy; ffmpeg for video frames), HTML, CSS and JavaScript with no
framework, Playwright with Chromium for interface tests and for rendering the slides.

## Use of Super Intelligence (SI)

Draft. Edit it so that it is true for your team.

Yes. We used Claude (Anthropic), a large language model, throughout the project:

- Code: the data-cleaning and build scripts, the model training script, the video tracker, the web
  pages and the tests were written with SI assistance. Source files and the page metadata say so.
- Data: SI-written code renames columns and converts units. The values are NASA's. The download files
  carry a notice in their README.
- Text: the one-line investigation summaries, the wording of the 15 findings and the 38 analyst answers
  in the Ask section were drafted with SI. The page labels them as SI drafts.
- Analysis and design: SI helped explore the PSI tables, proposed analyses and helped lay out the pages
  and the slides.

The build script calculates the run statistics, checks the answer bank for source references and numeric tokens, and compares selected quotations with archived originals. These checks cannot certify an interpretation; the dashboard distinguishes observations, project-defined rules and open questions. No
model runs when the site is used. The predictor is a machine-learning model trained on NASA data and the
video lab is computer vision.

OpenAI Codex assisted with the interface redesign and the run-table and source audit. OpenAI image generation was used for the QUENCH logo and an earlier orbital illustration.
The current website uses credited NASA photographs. The Lab uses frames from NASA BASS-II video. Charts are drawn from project data.

## NASA Data

- NASA Physical Sciences Informatics (PSI), combustion investigations: https://psi.nasa.gov/physci/repo/search?q=combustion
  Records, experimental run tables and publication lists of 24 investigations: BASS, BASS-II, Saffire-I
  to -III, SAME, SAME-R, DAFT, FLEX, FLEX-2, CFI, the six ACME experiments (BRE, CFI-G, CLD Flame, E-FIELD
  Flames, Flame Design, s-Flame), SPICE, SLICE and five ground studies. This is the core of the project:
  the run export covers nine investigations; other cited quantities come from reports, the video analysis or the model.
- BASS-II raw video, ReadMe and Summary Report (NASA/TM-20210011385), from PSI-25: used for the video lab.
- NASA Combustion Science, Glenn Research Center: https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/
- A Researcher's Guide to International Space Station Combustion Science: https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/
- NASA ScienceCasts, The Power of Studying Combustion on the ISS: https://www.youtube.com/watch?v=W1oXykoz9zg
- Apollo 1: https://sma.nasa.gov/sma-disciplines/accllp/apollo-1
- Apollo 13: https://sma.nasa.gov/sma-disciplines/accllp/apollo-13
- 25 Years Ago: Fire Aboard Space Station Mir: https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/
- NASA Spinoff: Fireman's Air Tanks (https://spinoff.nasa.gov/node/9582), Fire Detector
  (https://spinoff.nasa.gov/node/9407), New Technology for the Fire Attire (https://spinoff.nasa.gov/node/9918)
- 50 Years Ago: Apollo Flammability Tests: https://www.nasa.gov/feature/50-years-ago-apollo-flammability-tests
- Flame Burns Out on NASA's Long-Running Spacecraft Fire Experiment (Saffire-VI): https://www.nasa.gov/centers-and-facilities/glenn/flame-burns-out-on-nasas-long-running-spacecraft-fire-experiment/
- Flame in Freefall challenge statement: https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/

## Space Agency Partner Data and Other References

No Space Agency Partner data was used.

Everything else used to make the project:

- Olson, S. L., Ferkul, P. V. et al., BASS-II Summary Report, NASA/TM-20210011385.
- A Researcher's Guide to International Space Station Combustion Science, NASA, 2015.
- The publications listed in each PSI record, linked from the Archive page.
- Website fonts: Barlow, Barlow Condensed and IBM Plex Mono, distributed locally under the SIL Open Font License.
- Software: Python 3, numpy, ffmpeg, Playwright and Chromium (testing and slide rendering).
- SI tools: Claude (Anthropic), Codex and image generation (OpenAI), as described above.
- Cover photograph: NASA, Jessica Watkins servicing SoFIE aboard the ISS, Expedition 67, June 2022 (ISS067-E-170237). https://www.nasa.gov/humans-in-space/best-space-station-science-imagery-of-2022/
- Candle photographs: NASA Glenn Research Center, GRC-1998-C-00485. https://science.nasa.gov/image-detail/amf-grc-1998-c-00485/
