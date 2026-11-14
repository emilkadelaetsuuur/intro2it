#!/usr/bin/env python3
# SI notice: written with SI (AI) assistance (Claude, Anthropic).
"""Train and test the FLEX outcome model, then write web/model.js.

Question the model answers: under these conditions, does a burning fuel droplet in
microgravity go out on its own (FLEX end state "Extinction"), or does it keep burning
until the droplet is used up or breaks apart ("Completion" or "Disruption")?

Data: the FLEX run table (PSI-69), 274 runs on the space station, 2009 to 2012.
Model: logistic regression with a small ridge penalty, fitted with Newton's method.
Testing: 10-fold cross-validation grouped by test date, so runs from the same day never
sit on both sides of a split, repeated over 20 random fold assignments. The model is
compared with two simpler baselines. Needs numpy only.

    python3 scripts/train_model.py
"""
import csv
import io
import json
import math
import os
import re
import datetime

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "raw", "tables", "PSI-69_Experimental table_FLEX.csv")
OUT = os.path.join(ROOT, "web", "model.js")
LAM = 1.0          # ridge penalty on standardised coefficients (intercept not penalised)
FOLDS, REPEATS = 10, 20


def load():
    with open(SRC, encoding="utf-8", errors="replace") as fh:
        rows = [r for r in csv.reader(io.StringIO(fh.read())) if any(c.strip() for c in r)]
    h = [re.sub(r"\s+", " ", x).strip() for x in rows[0]]
    col = lambda pat: next(i for i, x in enumerate(h) if re.search(pat, x))
    ix = {k: col(p) for k, p in {"id": "^FLEX Identifier", "date": "^Test Date", "fuel": "^Fuel$", "p": "pressure",
                                 "o2": "^O initial", "co2": "^CO initial", "he": "^He initial", "d0": "initial diameter",
                                 "k": "^Burning rate", "end": "^Test end"}.items()}
    num = lambda s: float(s) if re.fullmatch(r"-?\d+(\.\d+)?", s.strip()) else None
    out, dropped = [], []
    for r in rows[1:]:
        rec = {"id": r[ix["id"]].strip(), "date": r[ix["date"]].strip(), "fuel": r[ix["fuel"]].strip(),
               "p_atm": (num(r[ix["p"]]) or 0) / 760.0, "o2": num(r[ix["o2"]]), "co2": num(r[ix["co2"]]) or 0.0,
               "he": num(r[ix["he"]]) or 0.0, "d0": num(r[ix["d0"]]), "k": num(r[ix["k"]]), "end": r[ix["end"]].strip()}
        if rec["p_atm"] <= 0 or rec["o2"] is None or rec["d0"] is None or rec["end"] not in ("Extinction", "Completion", "Disruption"):
            dropped.append(rec["id"])
            continue
        out.append(rec)
    return out, dropped


FEATURES = [
    ("o2", "Oxygen, mole fraction", lambda r: r["o2"]),
    ("logp", "ln(pressure, atm)", lambda r: math.log(r["p_atm"])),
    ("heptane", "Fuel is heptane (1) or methanol (0)", lambda r: 1.0 if r["fuel"].lower() == "heptane" else 0.0),
    ("d0", "Initial droplet diameter, mm", lambda r: r["d0"]),
    ("co2", "CO2, mole fraction", lambda r: r["co2"]),
    ("he", "Helium, mole fraction", lambda r: r["he"]),
]


def matrix(rows, feats):
    return np.array([[f[2](r) for f in feats] for r in rows], float)


def fit_logistic(X, y, lam=LAM):
    mu, sd = X.mean(0), X.std(0)
    sd[sd == 0] = 1
    Z = np.hstack([np.ones((len(X), 1)), (X - mu) / sd])
    w = np.zeros(Z.shape[1])
    P = np.eye(Z.shape[1]) * lam
    P[0, 0] = 0
    for _ in range(100):
        p = 1 / (1 + np.exp(-Z @ w))
        g = Z.T @ (p - y) + P @ w
        Hm = Z.T @ (Z * (p * (1 - p))[:, None]) + P
        step = np.linalg.solve(Hm, g)
        w -= step
        if np.abs(step).max() < 1e-9:
            break
    return {"mu": mu, "sd": sd, "w": w}


def predict(m, X):
    Z = np.hstack([np.ones((len(X), 1)), (X - m["mu"]) / m["sd"]])
    return 1 / (1 + np.exp(-Z @ m["w"]))


def auc(y, p):
    order = np.argsort(p)
    ranks = np.empty(len(p))
    ranks[order] = np.arange(1, len(p) + 1)
    # average ranks for ties
    for v in np.unique(p):
        idx = p == v
        ranks[idx] = ranks[idx].mean()
    n1, n0 = y.sum(), len(y) - y.sum()
    return float((ranks[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def metrics(y, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return {"accuracy": float(((p >= 0.5) == (y == 1)).mean()), "auc": auc(y, p),
            "brier": float(((p - y) ** 2).mean()), "log_loss": float(-(y * np.log(p) + (1 - y) * np.log(1 - p)).mean())}


def grouped_cv(rows, y, feats, seed):
    rng = np.random.default_rng(seed)
    dates = sorted({r["date"] for r in rows})
    rng.shuffle(dates)
    fold_of = {d: i % FOLDS for i, d in enumerate(dates)}
    folds = np.array([fold_of[r["date"]] for r in rows])
    X = matrix(rows, feats) if feats else np.zeros((len(rows), 0))
    p = np.zeros(len(rows))
    for k in range(FOLDS):
        tr, te = folds != k, folds == k
        if feats:
            m = fit_logistic(X[tr], y[tr])
            p[te] = predict(m, X[te])
        else:
            p[te] = y[tr].mean()
    return p


def main():
    rows, dropped = load()
    y = np.array([1.0 if r["end"] == "Extinction" else 0.0 for r in rows])
    candidates = {
        "Always the most common outcome": [],
        "Oxygen only": [FEATURES[0]],
        "Oxygen, pressure and fuel": FEATURES[:3],
        "Full model": FEATURES,
    }
    results = {}
    for name, feats in candidates.items():
        ms = [metrics(y, grouped_cv(rows, y, feats, seed)) for seed in range(REPEATS)]
        results[name] = {k: {"mean": float(np.mean([m[k] for m in ms])), "sd": float(np.std([m[k] for m in ms]))} for k in ms[0]}
        print(f"{name:34s} " + "  ".join(f"{k} {v['mean']:.3f}±{v['sd']:.3f}" for k, v in results[name].items()))

    # calibration of the full model, from one cross-validated run
    p_cv = grouped_cv(rows, y, FEATURES, 0)
    bins = []
    for lo in np.arange(0, 1, 0.2):
        idx = (p_cv >= lo) & (p_cv < lo + 0.2 + (1e-9 if lo >= 0.8 else 0))
        if idx.sum():
            bins.append({"from": round(float(lo), 1), "to": round(float(lo + 0.2), 1), "n": int(idx.sum()),
                         "predicted": round(float(p_cv[idx].mean()), 3), "observed": round(float(y[idx].mean()), 3)})

    X = matrix(rows, FEATURES)
    m = fit_logistic(X, y)
    # coefficients back in original units: logit = b0 + sum(b_j * x_j)
    b = m["w"][1:] / m["sd"]
    b0 = m["w"][0] - (m["w"][1:] * m["mu"] / m["sd"]).sum()

    # applicability domain: nearest-neighbour distance in standardised space (continuous features, same fuel)
    cont = [0, 1, 3, 4, 5]
    Zc = (X[:, cont] - m["mu"][cont]) / m["sd"][cont]
    nn = []
    for i in range(len(rows)):
        same = X[:, 2] == X[i, 2]
        same[i] = False
        nn.append(np.sqrt(((Zc[same] - Zc[i]) ** 2).sum(1)).min())
    nn = np.array(nn)
    nn95 = float(np.quantile(nn, 0.95))

    # burning-rate constant K (mm^2/s), linear model, same grouped CV
    kr = [r for r in rows if r["k"] is not None and r["k"] > 0]
    Xk = matrix(kr, FEATURES[:3] + FEATURES[4:])
    yk = np.array([r["k"] for r in kr])
    preds = np.zeros(len(kr))
    dates = sorted({r["date"] for r in kr})
    rng = np.random.default_rng(0)
    rng.shuffle(dates)
    fold_of = {d: i % FOLDS for i, d in enumerate(dates)}
    folds = np.array([fold_of[r["date"]] for r in kr])
    A = lambda M: np.hstack([np.ones((len(M), 1)), M])
    for k in range(FOLDS):
        tr, te = folds != k, folds == k
        coef, *_ = np.linalg.lstsq(A(Xk[tr]), yk[tr], rcond=None)
        preds[te] = A(Xk[te]) @ coef
    k_r2 = 1 - ((yk - preds) ** 2).sum() / ((yk - yk.mean()) ** 2).sum()
    k_rmse = float(np.sqrt(((yk - preds) ** 2).mean()))
    kcoef, *_ = np.linalg.lstsq(A(Xk), yk, rcond=None)

    model = {
        "built": datetime.date.today().isoformat(),
        "source": "FLEX run table, NASA PSI-69 (https://psi.nasa.gov/physci/repo/data/investigations/PSI-69)",
        "question": "Does the droplet flame go out on its own (FLEX end state Extinction)?",
        "n": len(rows), "n_ext": int(y.sum()), "dropped": dropped,
        "features": [{"key": f[0], "label": f[1]} for f in FEATURES],
        "intercept": float(b0), "coef": [float(v) for v in b],
        "train_mu": [float(v) for v in m["mu"]], "train_sd": [float(v) for v in m["sd"]],
        "ranges": {f[0]: [float(X[:, j].min()), float(X[:, j].max())] for j, f in enumerate(FEATURES)},
        "cv": {"method": f"{FOLDS}-fold cross-validation grouped by test date, repeated over {REPEATS} random fold assignments",
               "results": results, "calibration": bins},
        "domain": {"features": [FEATURES[j][0] for j in cont], "nn95": nn95, "median_nn": float(np.median(nn))},
        "points": [[round(float(v), 4) for v in X[i]] + [int(y[i])] for i in range(len(rows))],
        "point_ids": [r["id"] for r in rows],
        "point_end": [r["end"] for r in rows],
        "burn_k": {"features": [f[0] for f in FEATURES[:3] + FEATURES[4:]], "intercept": float(kcoef[0]),
                   "coef": [float(v) for v in kcoef[1:]], "cv_r2": float(k_r2), "cv_rmse": k_rmse, "n": len(kr),
                   "unit": "mm^2/s"},
    }
    with open(OUT, "w") as fh:
        fh.write("// Generated by scripts/train_model.py from the FLEX table (PSI-69). Do not edit by hand.\n")
        fh.write("// SI notice: the training script was written with SI (AI) assistance. The model is fitted to NASA data only.\n")
        fh.write("window.FLAME_MODEL = " + json.dumps(model, separators=(",", ":")) + ";\n")
    print("coefficients (original units):", dict(zip([f[0] for f in FEATURES], np.round(b, 3))), "intercept", round(b0, 3))
    print("calibration:", bins)
    print(f"domain nn95 {nn95:.2f}, median {np.median(nn):.2f}; burning-rate model CV R2 {k_r2:.3f}, RMSE {k_rmse:.3f} mm2/s (n={len(kr)})")
    print("dropped:", dropped)


if __name__ == "__main__":
    main()
