#!/usr/bin/env python3
# SI notice: written with SI (AI) assistance (Claude, Anthropic).
"""Measure flame spread from a BASS-II side-view video.

The BASS-II video camera (Panasonic WV-CP654, 720x480, 29.97 fps) looks at the
edge of a thin PMMA film through the front window of the flow duct. The flame
burns on both faces of the film and moves from the ignition end (left) toward
the incoming flow (right). This script finds the flame in every sampled frame,
tracks its leading edge (the rightmost flame pixel), and fits a straight line
to the steady part of the track.

    python3 video/extract.py VIDEO.mp4 [--fps 10] [--threshold 60] [--json out.json]

Needs ffmpeg on PATH and numpy. Positions are in pixels; converting to mm needs a
scale, which calibrate.py derives from the sample length (see METHOD.md).
"""
import argparse
import json
import subprocess
import sys

import numpy as np

W, H = 720, 480
ROW0, ROW1 = 110, 470     # rows below the text overlay (FUEL / AIR / FAN / RAD and the clock)
MIN_COLS = 4              # a flame must span at least this many adjacent columns
MIN_PIXELS = 40           # and cover at least this many pixels


def frames(path, fps):
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    size = W * H * 3
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    finally:
        proc.stdout.close()
        proc.kill()
        proc.wait()


def leading_edge(mask_cols):
    """Rightmost end of the longest run of flame columns, plus the run's left end."""
    idx = np.flatnonzero(mask_cols)
    if idx.size < MIN_COLS:
        return None
    runs = np.split(idx, np.flatnonzero(np.diff(idx) > 3) + 1)
    run = max(runs, key=len)
    if len(run) < MIN_COLS:
        return None
    return int(run[0]), int(run[-1])


def track(path, fps=10.0, threshold=60, smooth=1):
    """Return a list of (t, lead_px, trail_px, area_px, peak) for every sampled frame.

    `smooth` averages the signal over that many consecutive frames before thresholding.
    Dim blue flames near extinction sit only a little above the video noise; averaging
    k frames cuts the noise by about sqrt(k) so a lower threshold can be used safely.
    """
    out = []
    bg = None
    hist = []
    for i, fr in enumerate(frames(path, fps)):
        band = fr[ROW0:ROW1].astype(np.int16)
        lum = band.max(axis=2)                      # brightest channel: flames here are red to orange, or blue when dim
        if bg is None:
            # median of the first second, before ignition, removes fixed glare and the dark-current floor
            bg = lum.copy()
        sig = np.clip(lum - bg, 0, 255).astype(np.float32)
        if smooth > 1:
            hist.append(sig)
            hist = hist[-smooth:]
            sig = sum(hist) / len(hist)
        mask = sig > threshold
        area = int(mask.sum())
        t = i / fps
        cols = mask.any(axis=0)
        edge = leading_edge(cols) if area >= MIN_PIXELS else None
        if edge is None:
            out.append((t, None, None, area, int(sig.max())))
        else:
            out.append((t, edge[1], edge[0], area, int(sig.max())))
    return out


def burn_segment(tr, min_len_s=3.0):
    """Longest stretch of consecutive frames that contain a flame."""
    best, cur = (0, -1), None
    for i, r in enumerate(tr):
        if r[1] is not None:
            cur = i if cur is None else cur
            if i - cur > best[1] - best[0]:
                best = (cur, i)
        else:
            cur = None
    if best[1] < 0 or tr[best[1]][0] - tr[best[0]][0] < min_len_s:
        return None
    return best


def fit(ts, xs):
    ts, xs = np.asarray(ts, float), np.asarray(xs, float)
    a, b = np.polyfit(ts, xs, 1)
    pred = a * ts + b
    ss = ((xs - xs.mean()) ** 2).sum()
    r2 = 1 - ((xs - pred) ** 2).sum() / ss if ss > 0 else 0.0
    return float(a), float(b), float(r2)


def steady_rate(tr, seg, window_s=5.0, skip_s=3.0):
    """Spread rate on the steady part of the burn.

    The first `skip_s` seconds after ignition are dropped (igniter transient). Then a
    `window_s` sliding fit gives a local rate; the steady part is the run of windows
    whose rate is within 15 % of the median rate. The final rate is one straight-line
    fit over that run. This mirrors the NASA/SDSU approach (linear regression over
    consecutive leading-edge positions) on video frames instead of still photographs.
    """
    pts = [(r[0], r[1]) for r in tr[seg[0]:seg[1] + 1] if r[1] is not None]
    t0 = pts[0][0]
    pts = [p for p in pts if p[0] >= t0 + skip_s]
    if len(pts) < 10:
        return None
    ts = np.array([p[0] for p in pts])
    xs = np.array([p[1] for p in pts], float)
    step = ts[1] - ts[0]
    n = max(5, int(round(window_s / step)))
    local = []
    for i in range(0, len(ts) - n):
        a, _, r2 = fit(ts[i:i + n], xs[i:i + n])
        local.append((i, a, r2))
    if not local:
        return None
    rates = np.array([l[1] for l in local])
    med = float(np.median(rates[rates > 0])) if (rates > 0).any() else 0.0
    ok = [l for l in local if med > 0 and abs(l[1] - med) <= 0.15 * med]
    if not ok:
        return None
    # longest contiguous run of steady windows
    runs, cur = [], [ok[0]]
    for l in ok[1:]:
        if l[0] == cur[-1][0] + 1:
            cur.append(l)
        else:
            runs.append(cur)
            cur = [l]
    runs.append(cur)
    run = max(runs, key=len)
    i0, i1 = run[0][0], run[-1][0] + n
    a, b, r2 = fit(ts[i0:i1], xs[i0:i1])
    return {"rate_px_s": a, "r2": r2, "t_from": float(ts[i0]), "t_to": float(ts[i1 - 1]),
            "n_points": int(i1 - i0), "local_rates_px_s": [float(x) for x in rates]}


FAN_BOX = (48, 68, 480, 560)   # rows, cols of the FAN reading (fan voltage x10) in the text overlay


def fan_change_time(path, t_ref, fps=10.0):
    """First time after t_ref when the FAN digits on the overlay change and stay changed.

    The digits are compared as a binary pattern with the pattern shown at t_ref (during
    steady spread). A change that lasts at least one second marks the crew turning the
    fan down. Returns None if the reading never changes.
    """
    r0, r1, c0, c1 = FAN_BOX
    ref, changed_since = None, None
    for i, fr in enumerate(frames(path, fps)):
        t = i / fps
        pat = fr[r0:r1, c0:c1].max(axis=2) > 128
        if t < t_ref:
            continue
        if ref is None:
            ref = pat
            continue
        diff = (pat != ref).mean()
        if diff > 0.04:
            changed_since = t if changed_since is None else changed_since
            if t - changed_since >= 1.0:
                return changed_since
        else:
            changed_since = None
    return None


def analyse(path, fps=10.0, threshold=60, smooth=1):
    tr = track(path, fps, threshold, smooth)
    seg = burn_segment(tr)
    res = {"file": path.split("/")[-1], "fps_used": fps, "threshold": threshold, "smooth": smooth, "frames": len(tr)}
    if seg is None:
        res.update({"burn": None})
        return res, tr
    lead = [r[1] for r in tr[seg[0]:seg[1] + 1] if r[1] is not None]
    t_ign, t_end = tr[seg[0]][0], tr[seg[1]][0]
    res.update({
        "ignition_s": t_ign, "last_flame_s": t_end, "video_end_s": tr[-1][0],
        "flame_out_before_video_end": tr[-1][0] - t_end > 1.0,
        "lead_start_px": lead[0], "lead_max_px": int(max(lead)), "lead_travel_px": int(max(lead) - lead[0]),
        "steady": steady_rate(tr, seg),
    })
    return res, tr


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("--fps", type=float, default=10.0)
    ap.add_argument("--threshold", type=int, default=60)
    ap.add_argument("--smooth", type=int, default=1)
    ap.add_argument("--json")
    a = ap.parse_args()
    res, tr = analyse(a.video, a.fps, a.threshold, a.smooth)
    res["track"] = [[round(t, 2), l, tl, ar] for t, l, tl, ar, _ in tr]
    if a.json:
        with open(a.json, "w") as fh:
            json.dump(res, fh)
    s = res.get("steady") or {}
    print(json.dumps({k: v for k, v in res.items() if k not in ("track", "steady")}, indent=1))
    print("steady:", {k: v for k, v in s.items() if k != "local_rates_px_s"})


if __name__ == "__main__":
    sys.exit(main())
