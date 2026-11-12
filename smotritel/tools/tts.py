#!/usr/bin/env python3
"""Озвучка серии: lines.json -> голосовые дорожки + timing.json.

Каждая реплика синтезируется отдельно (edge-tts, нейроголоса), затем:
  * обрезается тишина в начале и конце,
  * длинные паузы внутри реплики ужимаются (динамичный «тикток»-темп),
  * громкость выравнивается между голосами,
  * пословные метки времени пересчитываются под новую длину.
По длительностям реплик собирается таймлайн серии (timing.json) — под него
потом подстраиваются анимация и звук.

Интонация: в lines.json у реплики можно задать "parts" — куски фразы со своей
подачей: [текст, темп %, высота Гц, пауза после]. Поправки прибавляются к базовым
настройкам голоса; так напряжённые фразы звучат ниже и медленнее, тревожные — быстрее.

Свой голос вместо синтеза: положи запись реплики в
episodes/<ep>/voice_override/<id>.wav — она заменит синтез для этой реплики.

Запуск:  python tools/tts.py episodes/ep01
"""
import asyncio
import hashlib
import json
import os
import re
import ssl
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 48000
ROOT = Path(__file__).resolve().parent.parent


# ---------- синтез ----------------------------------------------------------
def _patch_tls():
    """Доверять системному/проксирующему CA (SSL_CERT_FILE), а не только certifi."""
    import edge_tts.communicate as c
    import edge_tts.voices as v
    ca = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    if ca and os.path.exists(ca):
        ctx = ssl.create_default_context(cafile=ca)
        c._SSL_CTX = ctx
        v._SSL_CTX = ctx


async def synth(text, cfg, mp3_path, tries=9):
    import edge_tts
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    last = None
    for attempt in range(tries):
        try:
            com = edge_tts.Communicate(
                text, cfg["voice"], rate=cfg.get("rate", "+0%"),
                pitch=cfg.get("pitch", "+0Hz"), proxy=proxy, boundary="WordBoundary")
            words, audio = [], bytearray()
            async for ch in com.stream():
                if ch["type"] == "audio":
                    audio += ch["data"]
                elif ch["type"] == "WordBoundary":
                    words.append({"w": ch["text"], "t": ch["offset"] / 1e7,
                                  "d": ch["duration"] / 1e7})
            if len(audio) < 2000:
                raise RuntimeError("пустой ответ сервиса")
            mp3_path.write_bytes(bytes(audio))
            await asyncio.sleep(0.5)  # не частим запросами
            return words
        except Exception as e:  # сеть/сервис — пробуем ещё раз
            last = e
            await asyncio.sleep(2 + attempt * 3)  # сервис иногда отдаёт пустой ответ
    raise RuntimeError(f"не удалось синтезировать «{text[:40]}…»: {last}")


def _num(v):
    """'+8%' / '-16Hz' -> целое."""
    m = re.search(r"-?\d+", str(v or 0))
    return int(m.group()) if m else 0


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR),
         "-f", "f32le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


# ---------- обработка -------------------------------------------------------
def frame_rms(x, hop):
    n = len(x) // hop
    return np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-12)


def tighten(x, words, max_pause=0.30, lead=0.02, tail=0.09):
    """Обрезать края, ужать внутренние паузы; вернуть (x, words)."""
    hop = SR // 100  # 10 мс
    rms = frame_rms(x, hop)
    thr = max(rms.max() * 0.035, 1e-4)
    voiced = rms > thr
    idx = np.flatnonzero(voiced)
    if len(idx) == 0:
        return x, words
    a = max(0, idx[0] * hop - int(lead * SR))
    b = min(len(x), (idx[-1] + 1) * hop + int(tail * SR))
    cuts = []  # (start, end) в сэмплах исходника — вырезаемые куски
    i, n = idx[0], idx[-1]
    while i <= n:
        if not voiced[i]:
            j = i
            while j <= n and not voiced[j]:
                j += 1
            run = (j - i) * hop / SR
            if run > max_pause:
                extra = int((run - max_pause) * SR)
                mid = (i + j) * hop // 2
                cuts.append((mid - extra // 2, mid - extra // 2 + extra))
            i = j
        else:
            i += 1
    pieces, pos = [], a
    for s, e in cuts:
        pieces.append(x[pos:s])
        pos = e
    pieces.append(x[pos:b])
    fade = int(0.006 * SR)
    out = pieces[0].copy()
    for p in pieces[1:]:
        p = p.copy()
        if len(out) > fade and len(p) > fade:
            out[-fade:] *= np.linspace(1, 0, fade) ** 0.5
            p[:fade] *= np.linspace(0, 1, fade) ** 0.5
        out = np.concatenate([out, p])
    f = int(0.008 * SR)
    out[:f] *= np.linspace(0, 1, f)
    out[-f:] *= np.linspace(1, 0, f)

    def remap(t):
        s = t * SR
        removed = a
        for cs, ce in cuts:
            if s >= ce:
                removed += ce - cs
            elif s > cs:
                removed += s - cs
        return max(0.0, (s - removed) / SR)

    words = [{"w": w["w"], "t": round(remap(w["t"]), 3)} for w in words]
    return out, words


def normalize(x, target_db=-20.0):
    hop = SR // 50
    rms = frame_rms(x, hop)
    loud = rms[rms > rms.max() * 0.1]
    cur = 20 * np.log10(np.sqrt((loud ** 2).mean()) + 1e-9)
    g = 10 ** ((target_db - cur) / 20)
    y = x * g
    peak = np.abs(y).max()
    if peak > 0.89:
        y *= 0.89 / peak
    return y.astype(np.float32)


# ---------- сборка ----------------------------------------------------------
async def main(ep_dir):
    ep_dir = Path(ep_dir).resolve()
    data = json.loads((ep_dir / "lines.json").read_text(encoding="utf-8"))
    cache = ep_dir / "voice"
    cache.mkdir(exist_ok=True)
    override = ep_dir / "voice_override"
    build = ROOT / "build" / ep_dir.name
    (build / "voice").mkdir(parents=True, exist_ok=True)
    _patch_tls()

    t = 0.0
    scenes_out = []
    for sc in data["scenes"]:
        s_out = {"id": sc["id"], "start": round(t, 3), "lines": []}
        if not sc.get("lines"):
            t += sc.get("dur", 3.0)
        else:
            t += sc.get("pre", 0.3)
            for ln in sc["lines"]:
                cfg = data["voices"][ln["who"]]
                text = ln.get("tts", ln["text"])
                # фраза целиком или по кускам со своей подачей: [текст, темп %, высота Гц, пауза после]
                parts = ln.get("parts") or [[text, ln.get("rate", 0), ln.get("pitch", 0), 0]]
                ovr = override / f"{ln['id']}.wav"
                if ovr.exists():
                    x, words = tighten(decode(ovr), [], max_pause=ln.get("max_pause", 0.30))
                    src = "override"
                else:
                    chunks, words, src = [], [], "cache"
                    for k, part in enumerate(parts):
                        ptext, drate, dpitch, pause = (list(part) + [0, 0, 0])[:4]
                        pcfg = {"voice": cfg["voice"],
                                "rate": f"{_num(cfg.get('rate')) + drate:+d}%",
                                "pitch": f"{_num(cfg.get('pitch')) + dpitch:+d}Hz"}
                        key = hashlib.sha1(json.dumps(
                            [ptext, pcfg["voice"], pcfg["rate"], pcfg["pitch"]],
                            ensure_ascii=False).encode()).hexdigest()[:12]
                        stem = ln["id"] if len(parts) == 1 else f"{ln['id']}_{k}"
                        mp3, meta = cache / f"{stem}.mp3", cache / f"{stem}.json"
                        m = json.loads(meta.read_text()) if meta.exists() else {}
                        if m.get("key") != key or not mp3.exists():
                            pw = await synth(ptext, pcfg, mp3)
                            meta.write_text(json.dumps({"key": key, "words": pw}, ensure_ascii=False))
                            src = "synth"
                        else:
                            pw = m["words"]
                        px, pw = tighten(decode(mp3), pw, max_pause=ln.get("max_pause", 0.30))
                        off = sum(len(c) for c in chunks) / SR
                        words += [{"w": w["w"], "t": round(off + w["t"], 3)} for w in pw]
                        chunks.append(px)
                        if k < len(parts) - 1:
                            chunks.append(np.zeros(int((pause or 0.3) * data.get('pause_scale', 1.0) * SR), dtype=np.float32))
                    x = np.concatenate(chunks)
                x = normalize(x)
                dur = len(x) / SR
                if not words:  # своя запись: слова распределяем равномерно
                    ws = ln["text"].replace("—", " ").split()
                    words = [{"w": w.strip(".,!?:;«»\""), "t": round(dur * i / max(1, len(ws)), 3)}
                             for i, w in enumerate(ws)]
                sf.write(build / "voice" / f"{ln['id']}.wav", x, SR, subtype="PCM_16")
                s_out["lines"].append({
                    "id": ln["id"], "who": ln["who"], "text": ln["text"],
                    "start": round(t, 3), "end": round(t + dur, 3),
                    "fx": cfg.get("fx"),
                    "words": [{"w": w["w"], "t": round(t + w["t"], 3)} for w in words],
                    "file": f"voice/{ln['id']}.wav"})
                print(f"{ln['id']:>4} {src:8} {dur:5.2f}s  {ln['text'][:60]}", flush=True)
                t += dur + ln.get("gap", 0.25)
            t += sc.get("post", 0.4)
            t = max(t, s_out["start"] + sc.get("minDur", 0))
        s_out["end"] = round(t, 3)
        scenes_out.append(s_out)

    timing = {"episode": data.get("episode"), "title": data.get("title"),
              "fps": 30, "duration": round(t, 3), "scenes": scenes_out}
    (build / "timing.json").write_text(
        json.dumps(timing, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nИтого: {t:.1f} c  ->  {build / 'timing.json'}")
    lim = data.get("max_duration")
    if lim and t > lim:
        print(f"ВНИМАНИЕ: серия длиннее лимита на {t - lim:.1f} c (max_duration = {lim} c, YouTube Shorts — до 180 c)")
    for s in scenes_out:
        print(f"  {s['id']:<9} {s['start']:7.2f} – {s['end']:7.2f}  ({s['end'] - s['start']:.2f} c)")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "episodes/ep01"))
