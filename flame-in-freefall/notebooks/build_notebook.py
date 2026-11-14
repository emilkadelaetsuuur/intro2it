#!/usr/bin/env python3
# SI notice: written with SI (AI) assistance (Claude, Anthropic).
"""Write notebooks/quench_runs_model.ipynb from the cells below, and run them once as a check.

    python3 notebooks/build_notebook.py          # run the cells, then write the notebook
    python3 notebooks/build_notebook.py --check  # run the cells only (used by the tests)

The notebook needs only numpy and pandas. It reads the runs CSV that QUENCH publishes, recounts
the cabin coverage shown on the site, and fits a small model of droplet self-extinction.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

CELLS = [
("md", """# QUENCH runs: from CSV to a model

This notebook starts from the file QUENCH publishes, `quench-runs.csv`: one row per flight test run from
NASA's Physical Sciences Informatics (PSI) combustion investigations. It does three things:

1. loads the runs and shows what the table holds;
2. recounts how many runs sit near each cabin atmosphere (the numbers on the QUENCH evidence map);
3. fits a small model of whether a burning droplet goes out on its own, and tests it on runs it has not seen.

The values are NASA's. QUENCH only renames columns and converts units. Blank cells mean PSI does not record
the value. Research example, not a design tool. *SI notice: this notebook was written with SI (AI) assistance.*"""),
("code", """import numpy as np
import pandas as pd

SOURCES = ["../web/downloads/quench-runs.csv",                      # a checkout of the repository
           "https://nasa.cartify.ink/downloads/quench-runs.csv"]    # the live site (Colab, Binder)
for src in SOURCES:
    try:
        runs = pd.read_csv(src)
        break
    except Exception:
        continue
print(f"{len(runs)} runs, {runs.shape[1]} columns, read from {src}")
runs.groupby(["investigation", "fuel_type"]).size().rename("runs").reset_index()"""),
("md", """## 1. What the table holds

Two oxygen columns matter. `ambient_o2_percent` is the oxygen around the flame. In the CFI-G inverse flames the
oxidizer comes out of the burner instead, so those rows fill `burner_oxidizer_o2_percent` and leave the ambient
column blank. Only runs with both ambient oxygen and a recorded pressure can be matched to a cabin."""),
("code", """has_o2 = runs["ambient_o2_percent"].notna()
has_p = runs["pressure_atm"].notna() & (runs["pressure_source"] == "recorded")
print("runs with ambient oxygen:        ", int(has_o2.sum()))
print("runs with oxygen and pressure:   ", int((has_o2 & has_p).sum()))
print("runs with an outcome in the table:", int(runs["outcome"].notna().sum()))
solids = runs[runs["fuel_type"] == "solid"]
print(f"solid-fuel runs: {len(solids)}, with oxygen {int(solids['ambient_o2_percent'].notna().sum())}, "
      f"highest oxygen {solids['ambient_o2_percent'].max()} %, with pressure {int((solids['pressure_source'] == 'recorded').sum())}")"""),
("md", """## 2. Runs near a cabin atmosphere

QUENCH counts a run for a cabin when its oxygen is within 4 percentage points and its pressure within 15 %
of the cabin's. NASA's three reference atmospheres are 14.7 psia at 21 % oxygen, 10.2 psia at 26.5 % and
8.2 psia at 34 %. Change `cabins` to test your own."""),
("code", """PSIA = 14.696
cabins = {"ISS / sea level": (21.0, 14.7), "10.2 psia cabin": (26.5, 10.2), "Exploration": (34.0, 8.2)}

def near(df, o2, psia, d_o2=4.0, d_p=0.15):
    ok = df["ambient_o2_percent"].notna() & df["pressure_atm"].notna() & (df["pressure_source"] == "recorded")
    return df[ok & ((df["ambient_o2_percent"] - o2).abs() <= d_o2) & ((df["pressure_atm"] / (psia / PSIA) - 1).abs() <= d_p)]

coverage = pd.DataFrame({name: near(runs, *c).groupby("fuel_type").size() for name, c in cabins.items()}).T
coverage = coverage.reindex(columns=["solid", "droplet", "gas"]).fillna(0).astype(int)
coverage["all"] = coverage.sum(axis=1)
coverage"""),
("md", """No solid-fuel run matches any cabin, because the solid-fuel tables do not record pressure. The exploration
atmosphere is matched only by gas flames. The challenge statement puts Moon-base air at 30 % oxygen or more
and 10.2 psi or less; the next cell counts the runs in that whole region."""),
("code", """moon = runs[(runs["ambient_o2_percent"] >= 30) & (runs["pressure_source"] == "recorded") & (runs["pressure_atm"] <= 10.2 / PSIA)]
print("runs at 30 % oxygen or more and 10.2 psi or less:", len(moon))
moon.groupby(["investigation", "fuel_type"]).size().rename("runs").reset_index()"""),
("md", """## 3. A model of droplet self-extinction

FLEX burned single droplets of methanol and heptane in many atmospheres and recorded how each test ended.
The question for the model: given oxygen, pressure, fuel, droplet size and the diluents carbon dioxide and
helium, did the flame go out on its own?

The model is a logistic regression with a small ridge penalty, written out in numpy so nothing is hidden.
It is tested on runs it did not see. Neighbouring test numbers stay in the same fold, because runs from one
session share conditions and would make the test too easy. QUENCH's own figure (82 % against 69 % for always
guessing the common outcome) groups by test date, which this file does not carry, so expect a number close
to it, not identical."""),
("code", """flex = runs[(runs["investigation"] == "FLEX") & runs["droplet_diameter_mm"].notna() & runs["pressure_atm"].notna()].copy()
flex["y"] = (flex["outcome"] == "self-extinguished").astype(float)
flex["heptane"] = (flex["fuel_or_material"].str.lower() == "heptane").astype(float)
flex["log_p"] = np.log(flex["pressure_atm"])
features = ["ambient_o2_percent", "log_p", "heptane", "droplet_diameter_mm", "co2_mole_fraction", "he_mole_fraction"]
X_raw, y = flex[features].fillna(0.0).to_numpy(float), flex["y"].to_numpy()
print(f"{len(flex)} FLEX runs, {int(y.sum())} self-extinguished ({y.mean():.0%})")

def fit(X, y, lam=1.0, steps=50):
    w = np.zeros(X.shape[1])
    penalty = lam * np.eye(X.shape[1]); penalty[0, 0] = 0          # the intercept is not penalised
    for _ in range(steps):                                         # Newton's method
        p = 1 / (1 + np.exp(-X @ w))
        w = w - np.linalg.solve(X.T @ (X * (p * (1 - p))[:, None]) + penalty, X.T @ (p - y) + penalty @ w)
    return w

def design(X, mean, std):
    return np.column_stack([np.ones(len(X)), (X - mean) / std])

number = pd.to_numeric(flex["source_test_number"], errors="coerce").fillna(0).to_numpy()
block = (number - 1) // 10                                         # ten neighbouring tests per block
scores = []
for seed in range(20):
    order = np.random.default_rng(seed).permutation(np.unique(block))
    fold_of = {b: i % 10 for i, b in enumerate(order)}
    folds = np.array([fold_of[b] for b in block])
    pred = np.zeros(len(y))
    for k in range(10):
        train, test = folds != k, folds == k
        mean, std = X_raw[train].mean(0), X_raw[train].std(0) + 1e-9
        w = fit(design(X_raw[train], mean, std), y[train])
        pred[test] = 1 / (1 + np.exp(-design(X_raw[test], mean, std) @ w))
    scores.append(((pred > 0.5) == (y > 0.5)).mean())
baseline = max(y.mean(), 1 - y.mean())
print(f"accuracy on unseen runs: {np.mean(scores):.1%} (20 repeats, from {min(scores):.1%} to {max(scores):.1%})")
print(f"always guessing the common outcome: {baseline:.1%}")"""),
("md", """## 4. What the model learned, and where it stops

Coefficients are per standard deviation of each input, so their sizes can be compared. A negative value
means the input makes self-extinction less likely."""),
("code", """mean, std = X_raw.mean(0), X_raw.std(0) + 1e-9
w = fit(design(X_raw, mean, std), y)
print(pd.Series(w[1:], index=features).round(2).sort_values().to_string())

def chance(o2, psia, heptane=1, d0=3.0, co2=0.0, he=0.0):
    x = np.array([[o2, np.log(psia / PSIA), heptane, d0, co2, he]])
    return float(1 / (1 + np.exp(-design(x, mean, std) @ w))[0])

for name, (o2, psia) in cabins.items():
    inside = (flex["ambient_o2_percent"].between(o2 - 4, o2 + 4) & ((flex["pressure_atm"] / (psia / PSIA) - 1).abs() <= 0.15)).sum()
    print(f"{name:16} 3 mm heptane droplet goes out on its own: {chance(o2, psia):5.1%}   FLEX runs near these conditions: {int(inside)}")"""),
("md", """For the exploration atmosphere the model has **no FLEX run nearby**: FLEX never went below about 0.7 atm at
34 % oxygen. The number printed for it is an extrapolation and should be read as "unknown", which is the
point QUENCH makes about the archive as a whole.

### Ideas to take further

- Add `burn_time_s` or `extinction_diameter_mm` as targets and predict how long a droplet burns.
- Use the CFI-G normal-flame runs (`flame_configuration`) to model gas flames in the exploration window.
- Join `quench-investigations.csv` to weight runs by how close each investigation is to cabin materials.
- Read flame spread from the BASS-II videos (see `video/` in the repository) to give the solid-fuel runs outcomes."""),
]


def run():
    """Execute the code cells in order, as a notebook would, and return the printed text."""
    import ast
    import contextlib
    import io
    env, out = {}, io.StringIO()
    cwd = os.getcwd()
    os.chdir(HERE)
    try:
        with contextlib.redirect_stdout(out):
            for kind, src in CELLS:
                if kind != "code":
                    continue
                tree = ast.parse(src)
                last = None
                if tree.body and isinstance(tree.body[-1], ast.Expr):
                    last = ast.Expression(tree.body.pop().value)   # a notebook shows the last expression
                exec(compile(tree, "<cell>", "exec"), env)
                if last is not None:
                    value = eval(compile(last, "<cell>", "eval"), env)
                    if value is not None:
                        print(value.to_string() if hasattr(value, "to_string") else value)
    finally:
        os.chdir(cwd)
    return out.getvalue(), env


def write():
    cells = []
    for kind, src in CELLS:
        lines = [line + "\n" for line in src.split("\n")]
        lines[-1] = lines[-1].rstrip("\n")
        cell = {"cell_type": "markdown" if kind == "md" else "code", "metadata": {}, "source": lines}
        if kind == "code":
            cell.update({"execution_count": None, "outputs": []})
        cells.append(cell)
    nb = {"cells": cells, "nbformat": 4, "nbformat_minor": 5,
          "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                       "language_info": {"name": "python"},
                       "si_notice": "Written with SI (AI) assistance (Claude, Anthropic). Data: NASA PSI."}}
    with open(os.path.join(HERE, "quench_runs_model.ipynb"), "w", encoding="utf-8") as fh:
        json.dump(nb, fh, indent=1, ensure_ascii=False)
        fh.write("\n")


if __name__ == "__main__":
    text, _ = run()
    print(text)
    if "--check" not in sys.argv:
        write()
        print("wrote notebooks/quench_runs_model.ipynb")
