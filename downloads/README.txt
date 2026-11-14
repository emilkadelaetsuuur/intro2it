QUENCH data downloads
=====================

quench-runs.csv            986 flight test runs from the run tables of NASA PSI combustion investigations, one row per run.
quench-investigations.csv  24 combustion investigations with their coverage and role in fire safety.

Source: NASA Physical Sciences Informatics (PSI), https://psi.nasa.gov, public domain (CC0-1.0).
Blank cells mean PSI does not record the value. Pressure of solid-fuel runs is not in PSI; they ran at cabin pressure.
outcome: self-extinguished, burned, did not ignite, other, or blank when the table has no result column.
burning_rate is the FLEX column 'Burning rate; mm' as given (the unit superscript is lost in PSI).
tier: 1 named in the Space Apps challenge statement as a fire-safety study, 2 related, 3 other combustion investigation.

SI notice: these files were produced by scripts/build_data.py, written with SI (AI) assistance (Claude, Anthropic).
The values are NASA's; the script only renames columns and converts units (mmHg and bar to atm, mole fraction to percent).
Built 2026-11-14.
