#!/usr/bin/env python3
# SI notice: written with SI (AI) assistance (Claude, Anthropic) and reviewed by the team.
"""Run the BASS-II video measurement on a set of tests and write data/derived/video_results.json.

    python3 video/run_all.py VIDEO_DIR

VIDEO_DIR holds the PSI-25 files named like Raw_Data_BASS_GMT50_SAMPLE_147_TEST_B1.mp4
(download them from https://psi.nasa.gov/physci/repo/data/investigations/PSI-25).
The test conditions come from the BASS-II experimental table in data/raw/tables.
See video/METHOD.md for what is measured and how it was checked.
"""
import csv
import datetime
import glob
import io
import json
import os
import re
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import extract  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "derived", "video_results.json")
FRAMES = os.path.join(ROOT, "data", "derived", "video", "frames")
TABLE = os.path.join(ROOT, "data", "raw", "tables", "PSI-25_Experimental table_BASS-II.csv")
PSI = "https://psi.nasa.gov/physci/repo/data/investigations/PSI-25"
REPORT = "Olson, Ferkul et al., BASS-II Summary Report, NASA/TM-20210011385 (PSI-25, Reports)"

FPS = 10.0
THRESHOLDS = (20, 35, 60)      # the rate is measured at all three; the spread is reported as uncertainty
MAIN_T = 35
SKIP_AFTER_IGNITION = 8.0      # igniter glow and flame establishment
# Reference values stated in the BASS-II Summary Report, section 2.1.2.1 / 2.2.5 (Bhattacharjee):
REF_SPREAD_B1 = 2.2            # mm/s, "steady spread rate of 2.2 mm/s" for the first test, 100-um film
REF_EXT_DELAY = 2.0            # s, "the flame was observed to extinguish within 2 s" after the flow was cut
REF_SAMPLE_LEN = 95.0          # mm, "about 95 mm long"; cut-off came after "half the sample length"
REF_SECTION_LEN = 170.0        # mm, "The test section was 17 cm long" (hardware description)

# Bright, constant-flow tests used for spread rates; the low-flow tests (2 cm/s) burned as dim
# blue flames close to extinction and are reported without a rate.
TESTS = ["B1", "B2", "B4", "B5", "B3", "B12", "B7"]


def conditions():
    with open(TABLE, encoding="utf-8", errors="replace") as fh:
        rows = list(csv.reader(io.StringIO(fh.read())))
    h = [re.sub(r"\s+", " ", x).strip() for x in rows[0]]
    out = {}
    for r in rows[1:]:
        if not r or not r[1].strip():
            continue
        d = dict(zip(h, [re.sub(r"\s+", " ", x).strip() for x in r]))
        out[d["Test #"]] = d
    return out


def thickness_um(material):
    m = re.search(r"(\d+)\s*micron", material, re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"(0\.\d+)\s*mm", material)
    return int(round(float(m.group(1)) * 1000)) if m else None


def fit_between(tr, t0, t1):
    pts = [(t, l) for t, l, *_ in tr if l is not None and t0 <= t <= t1]
    if len(pts) < 20:
        return None
    a, b, r2 = extract.fit([p[0] for p in pts], [p[1] for p in pts])
    return {"rate_px_s": a, "intercept": b, "r2": r2, "t_from": pts[0][0], "t_to": pts[-1][0], "n": len(pts)}


def thumb(video, t, name, lead_px=None):
    os.makedirs(FRAMES, exist_ok=True)
    out = os.path.join(FRAMES, name)
    vf = f"crop=720:330:0:120,eq=gamma=1.6"
    if lead_px is not None:
        vf += f",drawbox=x={max(0, lead_px - 1)}:y=0:w=3:h=330:color=0x2a78d6@0.9:t=fill"
    vf += ",scale=480:-2"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", video, "-frames:v", "1", "-vf", vf,
                    "-q:v", "6", out], check=True)
    return os.path.relpath(out, ROOT)


def main(video_dir):
    cond = conditions()
    results = []
    for test in TESTS:
        files = [f for f in glob.glob(os.path.join(video_dir, f"*TEST_{test}.mp4"))]
        if not files:
            print("missing video for", test)
            continue
        video = files[0]
        c = cond.get(test, {})
        res, tr = extract.analyse(video, FPS, MAIN_T)
        rec = {"test": test, "psi_url": PSI, "material": c.get("Fuel Sample Material"), "thickness_um": thickness_um(c.get("Fuel Sample Material", "")),
               "o2": float(c["Calibrated initial O2 % by vol"]) if c.get("Calibrated initial O2 % by vol") else None,
               "air_cm_s": c.get("Air display"), "fan": c.get("Fan display"), "fps_used": FPS, "threshold": MAIN_T,
               "ignition_s": res.get("ignition_s"), "last_flame_s": res.get("last_flame_s")}
        rec["file"] = "PSI-25_Raw Data_" + os.path.basename(video).replace("Raw_Data_", "")
        if res.get("burn", 1) is None or res.get("ignition_s") is None:
            rec.update({"confidence": "low", "notes": "No sustained flame found in the video."})
            results.append(rec)
            continue
        t_ign = res["ignition_s"]
        fan_t = extract.fan_change_time(video, t_ign + SKIP_AFTER_IGNITION)
        t_end = (fan_t - 0.5) if fan_t else res["last_flame_s"] - 1.0
        rates = {}
        for th in THRESHOLDS:
            r2, tr2 = extract.analyse(video, FPS, th) if th != MAIN_T else (res, tr)
            f = fit_between(tr2, t_ign + SKIP_AFTER_IGNITION, t_end)
            rates[th] = f
        main = rates[MAIN_T]
        bright = test in ("B1", "B2", "B4", "B5")
        rec.update({"fan_change_s": fan_t, "flame_out_after_fan_s": round(res["last_flame_s"] - fan_t, 1) if fan_t else None,
                    "went_out": bool(res.get("flame_out_before_video_end"))})
        if bright and main:
            vals = [rates[t]["rate_px_s"] for t in THRESHOLDS if rates[t]]
            rec.update({"spread_px_s": round(main["rate_px_s"], 3), "spread_px_s_range": [round(min(vals), 3), round(max(vals), 3)],
                        "fit_r2": round(main["r2"], 4), "fit_window_s": [main["t_from"], main["t_to"]]})
            lead = [l for t, l, *_ in tr if l is not None and t_ign <= t <= (fan_t or res["last_flame_s"])]
            rec["lead_travel_px"] = int(max(lead) - min(lead))
            rec["confidence"] = "high" if main["r2"] > 0.98 else "medium"
            pts = [(round(t, 1), l) for t, l, *_ in tr if l is not None and t_ign <= t <= res["last_flame_s"]]
            step = max(1, len(pts) // 110)
            rec["series_px"] = pts[::step]
            mid = (main["t_from"] + main["t_to"]) / 2
            lead_mid = int(round(main["rate_px_s"] * mid + main["intercept"]))
            rec["frames"] = [thumb(video, mid, f"{test}_steady.jpg", lead_mid),
                             thumb(video, max(res["last_flame_s"] - 0.6, mid), f"{test}_end.jpg")]
        else:
            rec.update({"spread_px_s": None, "confidence": "low", "flame_out_after_fan_s": None, "went_out": None,
                        "notes": "Low flow (about 2 cm/s): the flame turned dim and blue, close to extinction, and is too faint "
                                 "in the side-view video to track reliably. No rate is reported."})
            rec["frames"] = [thumb(video, t_ign + 4, f"{test}_dim.jpg")]
        results.append(rec)
        print(test, {k: rec.get(k) for k in ("spread_px_s", "spread_px_s_range", "fit_r2", "fan_change_s", "flame_out_after_fan_s", "confidence")})

    # ---- calibration on the one test the report describes, and independent checks ----
    b = {r["test"]: r for r in results}
    b1 = b["B1"]
    scale = REF_SPREAD_B1 / b1["spread_px_s"]           # mm per pixel
    for r in results:
        if r.get("spread_px_s"):
            r["scale_mm_per_px"] = round(scale, 4)
            r["spread_mm_s"] = round(r["spread_px_s"] * scale, 2)
            lo, hi = r["spread_px_s_range"]
            r["spread_mm_s_range"] = [round(lo * scale, 2), round(hi * scale, 2)]
            r["series"] = [[t, round(x * scale, 1)] for t, x in r.pop("series_px")]
    # thin-fuel check: spread rate x thickness should be constant at fixed O2 and flow
    thin = [(r["thickness_um"], r["spread_px_s"]) for r in results if r.get("spread_px_s") and r.get("thickness_um")]
    lx = np.log([t for t, _ in thin]); ly = np.log([v for _, v in thin])
    slope, icpt = np.polyfit(lx, ly, 1)
    pred = slope * lx + icpt
    r2 = 1 - ((ly - pred) ** 2).sum() / ((ly - ly.mean()) ** 2).sum()
    b2, b5 = b["B2"]["spread_px_s"], b["B5"]["spread_px_s"]
    checks = [
        {"check": "Repeat test", "what": "B2 and B5 are the same film (200 um) at the same oxygen and flow",
         "expected": "same spread rate", "measured": f"{b2 * scale:.2f} and {b5 * scale:.2f} mm/s, {abs(b2 - b5) / ((b2 + b5) / 2) * 100:.1f} % apart",
         "pass": abs(b2 - b5) / ((b2 + b5) / 2) < 0.05, "independent": True},
        {"check": "Flame out after the flow is cut", "what": "Time from the fan reading dropping to the last visible flame, test B1",
         "expected": f"within {REF_EXT_DELAY:g} s (report, section 2.1.2.1)", "measured": f"{b1['flame_out_after_fan_s']} s",
         "pass": b1["flame_out_after_fan_s"] is not None and b1["flame_out_after_fan_s"] <= REF_EXT_DELAY + 0.5, "independent": True},
        {"check": "Thin-fuel law", "what": "For thermally thin films the spread rate falls as 1 / thickness (report, section 2.1.2.1)",
         "expected": "exponent -1", "measured": f"exponent {slope:.2f} (R2 {r2:.3f}) across 100, 200, 300 um",
         "pass": -1.25 <= slope <= -0.75, "independent": True},
        {"check": "Camera field of view", "what": "Image width (720 px) times the calibrated scale against the 17 cm test section",
         "expected": f"close to {REF_SECTION_LEN:g} mm", "measured": f"{720 * scale:.0f} mm",
         "pass": abs(720 * scale - REF_SECTION_LEN) / REF_SECTION_LEN < 0.15, "independent": True},
        {"check": "Distance before the cut", "what": "B1 leading-edge travel from ignition to the flow cut, against 'half the sample length'",
         "expected": f"about {REF_SAMPLE_LEN / 2:.0f} mm", "measured": f"{b1['lead_travel_px'] * scale:.0f} mm",
         "pass": abs(b1["lead_travel_px"] * scale - REF_SAMPLE_LEN / 2) / (REF_SAMPLE_LEN / 2) < 0.3, "independent": True},
        {"check": "Calibration", "what": "Pixel scale fixed so that B1 matches the report's 2.2 mm/s", "expected": "2.2 mm/s",
         "measured": f"{b1['spread_px_s'] * scale:.2f} mm/s by construction", "pass": True, "independent": False},
    ]
    data = {
        "generated": datetime.date.today().isoformat(),
        "source": PSI, "reference": REPORT,
        "method": "Side-view video (720x480, 29.97 fps) sampled at 10 fps. Flame = pixels brighter than the pre-ignition frame "
                  f"by more than {MAIN_T} (brightest colour channel), below the text overlay. Leading edge = right end of the flame. "
                  f"Spread rate = straight-line fit of leading-edge position from {SKIP_AFTER_IGNITION:g} s after ignition to the moment the "
                  "fan reading on the overlay changes. Repeated at thresholds 20, 35 and 60. Scale: one value, set so that test B1 "
                  "matches the 2.2 mm/s stated in the NASA report; checked against four facts the calibration does not use.",
        "scale_mm_per_px": round(scale, 4),
        "tests": results,
        "validation": {"checks": checks, "thin_fuel_exponent": round(float(slope), 3), "thin_fuel_r2": round(float(r2), 3),
                       "n_rate_tests": len(thin), "passed": sum(1 for c in checks if c["pass"] and c["independent"]),
                       "independent": sum(1 for c in checks if c["independent"])},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(data, fh, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    print("scale mm/px", round(scale, 4))
    for c in checks:
        print(("PASS " if c["pass"] else "FAIL ") + c["check"], "|", c["measured"], "| expected", c["expected"])


if __name__ == "__main__":
    main(sys.argv[1])
