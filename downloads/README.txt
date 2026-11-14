QUENCH data downloads
=====================

quench-runs.csv            1156 flight test runs from the run tables of NASA PSI combustion investigations, one row per run.
quench-investigations.csv  24 combustion investigations with their coverage and role in fire safety.

Source: NASA Physical Sciences Informatics (PSI), https://psi.nasa.gov. Study records list CC0-1.0 except PSI-10, which omits a license.
ambient_o2_percent (alias o2_percent) is the reported initial, approximate, or first-listed ambient concentration.
ambient_o2_as_reported preserves the Saffire I and II source text, including ranges and approximate readings.
For inverse CFI-G, only burner_oxidizer_o2_percent is populated. The chamber contained fuel. Both CFI-G tables report chamber pressure.
Source for the configuration: https://ntrs.nasa.gov/citations/20220005205, pp. 4, 7–8. Rows with missing pressure are never pressure matches.
Compatibility fields in the investigations CSV: runs_with_oxygen counts ambient measurements; o2_min/max_percent include listed daily ambient settings.
BRE and s-Flame daily summaries and FLEX-2 planned settings are excluded from the individual-runs CSV. At PSI-39 eight identical source rows repeat.
The 121 numbered BASS test records exclude a soot-cleaning entry. For BASS and FLEX the source_test_number distinguishes reused test IDs.
Outcome categories pool different endpoints: a FLEX extinction ends the visible flame; CFI-G SE denotes self-extinction and FT denotes flow termination.
No hot ignition does not establish absence of a cool flame. No flame spread is a near-zero burn length in Saffire-II. Consult outcome_in_source.
burning_rate is the FLEX column 'Burning rate; mm' as given (the unit superscript is lost in PSI).
tier: 1 named in the Space Apps challenge statement as a fire-safety study, 2 related, 3 other combustion investigation.

SI notice: these files were produced by scripts/build_data.py, written with SI (AI) assistance (Claude, Anthropic).
The build converts units, distinguishes flame configurations, removes exact duplicate CFI rows and harmonizes outcome labels.
Built 2026-11-14.
