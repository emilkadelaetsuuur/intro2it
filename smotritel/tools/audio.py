#!/usr/bin/env python3
"""Звук серии: голос + процедурная музыка, эмбиент и эффекты -> mix.wav.

Ассетов нет: каждый звук синтезируется (numpy/scipy), результат детерминирован.
  * голос — реплики из timing.json по своим start (fx "phone" — телефонная трубка);
  * музыка — настроения (cues.music), 96 BPM, ля минор, общий набор инструментов;
    сильная доля настроения приходится на момент метки, смена — кроссфейдом;
  * эмбиент — фоновые подложки нужной длины (cues.amb);
  * эффекты — короткие звуки (cues.sfx);
  * музыка и эмбиент приглушаются под голосом (sidechain), на выходе лимитер.

Метки (build/<ep>/cues.json), gain и pan (−1…1) необязательны:
  sfx:   [{t, name, gain, pan}]       звук начинается в t (riser длится 1.5 с, пик — в конце)
  music: [{t, mood, gain}]            до следующей метки; "none" — тишина
  amb:   [{t0, t1, name, gain, pan}]  фейды 0.5 с; соседние метки стыкуются без провала
Имена — ключи словарей SFX, AMB, MOODS; неизвестное имя: предупреждение и пропуск.

Запуск:
  python tools/audio.py episodes/ep01 [--cues путь.json]   -> build/ep01/mix.wav, stems/
  python tools/audio.py --demo                             -> build/audio_demo/*.wav
"""
import argparse
import json
import sys
import time
import zlib
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d

SR = 48000
ROOT = Path(__file__).resolve().parent.parent
BPM = 96
BEAT = 60.0 / BPM          # четверть, 0.625 с
BAR = 4 * BEAT             # такт, 2.5 с
TAU = 2 * np.pi

VOICE_PEAK_DB = -3.0       # пик голосовой дорожки
MUSIC_CEIL_DB = -12.0      # потолок музыки (до приглушения)
MASTER_CEIL_DB = -1.0      # потолок микса
DUCK_DB = 8.5              # глубина приглушения под голосом
XF_PRE, XF_POST = 0.5, 0.1  # кроссфейд музыки: [t-0.5, t+0.1]
AMB_FADE = 0.5


# ---------- базовые кирпичики ----------------------------------------------
def db(x):
    return 10.0 ** (x / 20.0)


def dbfs(v):
    return 20.0 * np.log10(max(float(v), 1e-10))


def rms(x):
    return float(np.sqrt(np.mean(np.square(x, dtype=np.float64)))) if len(x) else 0.0


def peak(x):
    return float(np.max(np.abs(x))) if len(x) else 0.0


def warn(msg):
    print(f"[audio] ВНИМАНИЕ: {msg}", file=sys.stderr)


def seed_of(name, v=0):
    return zlib.crc32(name.encode()) + 7919 * v


def num(c, key, default):
    """Число из метки; при пропуске/мусоре — значение по умолчанию."""
    try:
        return float(c[key])
    except (KeyError, TypeError, ValueError):
        return default


def pmap(fn, items):
    """map в потоках (numpy/scipy отпускают GIL); порядок результатов сохраняется."""
    items = list(items)
    if len(items) < 2:
        return [fn(x) for x in items]
    with ThreadPoolExecutor(4) as ex:
        return list(ex.map(fn, items))


@lru_cache(maxsize=None)
def _sos(kind, lo, hi, order):
    if kind == "bp":
        return signal.butter(order, [lo, hi], "band", fs=SR, output="sos")
    return signal.butter(order, lo, "low" if kind == "lp" else "high", fs=SR, output="sos")


def lp(x, fc, order=2):
    return signal.sosfilt(_sos("lp", float(fc), 0.0, order), x, axis=0)


def hp(x, fc, order=2):
    return signal.sosfilt(_sos("hp", float(fc), 0.0, order), x, axis=0)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(_sos("bp", float(lo), float(hi), order), x, axis=0)


def st(x):
    """Моно -> стерео (n, 2)."""
    return x if x.ndim == 2 else np.stack([x, x], axis=1)


def pan_st(x, p):
    """Панорама −1…1; в центре усиление 1."""
    x = st(x)
    if not p:
        return x
    a = (float(np.clip(p, -1, 1)) + 1) * np.pi / 4
    return x * (np.array([np.cos(a), np.sin(a)]) * np.sqrt(2))


def pan_curve(y, p):
    """Моно-сигнал с меняющейся панорамой p(t) ∈ [−1, 1]."""
    a = (np.clip(p, -1, 1) + 1) * np.pi / 4
    return np.stack([y * np.cos(a), y * np.sin(a)], axis=1) * np.sqrt(2)


def add(dst, t, sig, gain=1.0):
    """Подмешать sig в dst с момента t (с); всё, что не влезло, обрезается."""
    i = int(round(t * SR))
    if i < 0:
        sig, i = sig[-i:], 0
    j = min(len(dst), i + len(sig))
    if j > i:
        dst[i:j] += gain * sig[: j - i]


def edges(y, a=0.002, r=0.01):
    """Короткие фейды по краям (без щелчков)."""
    y = np.array(y, dtype=np.float64)
    for k, ramp in ((int(a * SR), 1), (int(r * SR), -1)):
        k = min(k, len(y))
        if k > 1:
            w = 0.5 - 0.5 * np.cos(np.pi * np.arange(k) / k)
            w = w if y.ndim == 1 else w[:, None]
            if ramp > 0:
                y[:k] *= w
            else:
                y[-k:] *= w[::-1]
    return y


def norm(y):
    return y / (np.abs(y).max() + 1e-12)


def slow_rand(rng, n, period, lo=0.0, hi=1.0):
    """Плавный случайный контур (узлы раз в period секунд)."""
    knots = rng.uniform(lo, hi, int(n / (period * SR)) + 3)
    x = np.arange(n) / (period * SR)
    i = x.astype(int)
    f = 0.5 - 0.5 * np.cos(np.pi * (x - i))
    return knots[i] * (1 - f) + knots[i + 1] * f


_PINK_B = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
_PINK_A = [1.0, -2.494956002, 2.017265875, -0.522189400]


def pink(rng, n, corr=0.25):
    """Розовый стерео-шум с частичной корреляцией каналов."""
    w = rng.standard_normal((n, 3))
    x = np.sqrt(1 - corr) * w[:, :2] + np.sqrt(corr) * w[:, 2:]
    return hp(signal.lfilter(_PINK_B, _PINK_A, x, axis=0), 35) * 8.0


def swept_noise(rng, n, fc, lo=250.0, hi=7000.0, nb=10, width=0.5):
    """Шум с плывущей полосой: банк полосовых фильтров с гауссовыми весами."""
    x = rng.standard_normal(n)
    cs = np.geomspace(lo, hi, nb)
    half = (hi / lo) ** (0.5 / (nb - 1))
    lf = np.log2(fc)
    out = np.zeros(n)
    for c in cs:
        out += np.exp(-0.5 * ((lf - np.log2(c)) / width) ** 2) * bp(x, c / half, c * half)
    return out


def thud(dur, f_hi, f_lo, glide, tau, att=0.002):
    """Низкий удар: синус с падающей высотой и экспоненциальным затуханием."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f_lo + (f_hi - f_lo) * np.exp(-t / glide)
    y = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / tau)
    return edges(y, att, 0.01)


def burst(rng, dur, lo, hi, tau, att=0.0005):
    """Короткая шумовая вспышка в полосе (пик = 1)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    return norm(edges(bp(rng.standard_normal(n), lo, hi) * np.exp(-t / tau), att, 0.003))


def ping(dur, parts, att=0.002):
    """Сумма затухающих синусов: parts = [(частота, амплитуда, tau)]."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f, a, tau in parts:
        y += a * np.sin(TAU * f * t) * np.exp(-t / tau)
    return edges(y, att, 0.01)


# ---------- ревербератор ----------------------------------------------------
@lru_cache(maxsize=None)
def _ir(rt60, seed):
    """Импульс: затухающий шум, к хвосту темнее; энергия канала = 1."""
    n = int(SR * rt60 * 1.15)
    t = np.arange(n) / SR
    ir = np.random.default_rng(seed).standard_normal((n, 2)) * np.exp(-6.9 * t / rt60)[:, None]
    w = np.clip(t / (0.6 * rt60), 0, 1)[:, None]
    ir = hp(lp(ir, 6500) * (1 - w) + lp(ir, 1800) * w, 180)
    k = int(0.004 * SR)
    ir[:k] *= np.linspace(0, 1, k)[:, None]
    ir = np.vstack([np.zeros((int(0.012 * SR), 2)), ir])
    return ir / np.sqrt((ir ** 2).sum(axis=0))


def reverb(x, rt60=1.2, seed=7):
    """«Мокрый» стерео-сигнал (с хвостом) — свёртка с импульсом."""
    ir, x = _ir(rt60, seed), st(x)
    return np.stack([signal.oaconvolve(x[:, c], ir[:, c]) for c in (0, 1)], axis=1)


def with_reverb(y, mix, rt60=1.2, dur=None, tail=0.25):
    """Сухой + ревер, обрезка до dur с плавным хвостом."""
    wet = reverb(y, rt60)
    n = int(dur * SR) if dur else len(wet)
    out = np.zeros((n, 2))
    add(out, 0, st(y))
    add(out, 0, wet, mix)
    return edges(out, 0, tail)


def limiter(x, ceil, win=0.012):
    """Лимитер с упреждением: плавная огибающая усиления, пик ≤ ceil."""
    pk = np.abs(x).max(axis=1).astype(np.float64)
    if pk.max() <= ceil:
        return x
    g = np.minimum(1.0, ceil / np.maximum(pk, 1e-9))
    w = int(win * SR) | 1
    g = uniform_filter1d(minimum_filter1d(g, w, mode="nearest"), w, mode="nearest")
    return (x * g[:, None]).astype(x.dtype)


# ---------- эффекты (SFX) ---------------------------------------------------
POP_CENTS = (0, 35, -25, 60, -45, 15, -60, 45)   # расстройка повторов, центы


def _blip(f0, dur, glide, g_tau, tau, h2=0.12):
    """Короткий тон: высота съезжает к f0, экспоненциальное затухание."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    ph = TAU * np.cumsum(f0 * (1 + glide * np.exp(-t / g_tau))) / SR
    return edges((np.sin(ph) + h2 * np.sin(2 * ph)) * np.exp(-t / tau), 0.002, 0.012)


def sfx_pop(rng, v=0):
    """Мягкий «поп» появления надписи: тон со скольжением вниз, 90 мс."""
    return _blip(660 * 2 ** (POP_CENTS[v % 8] / 1200), 0.09, 0.6, 0.012, 0.020)


def sfx_pop2(rng, v=0):
    """Ниже и круглее — пузыри реплик, карточки."""
    return _blip(330 * 2 ** (POP_CENTS[v % 8] / 1200), 0.14, 0.5, 0.018, 0.032, 0.05)


def sfx_whoosh(rng, v=0):
    """Воздушный свист смены сцены: шум с плывущей вверх полосой."""
    n = int(0.35 * SR)
    u = np.arange(n) / n
    y = swept_noise(rng, n, 450 * 2 ** (3.0 * u ** 0.8), 300, 6000, 9, 0.55)
    return pan_curve(y * np.sin(np.pi * u ** 1.3) ** 1.5, 0.5 * (2 * u - 1))


def sfx_tick(rng, v=0):
    """Крошечный тик (счётчик, часы)."""
    f = 2100 * (1.0, 1.015, 0.99, 1.005)[v % 4]
    y = ping(0.035, [(f, 1.0, 0.004), (2 * f, 0.5, 0.0025)], 0.0005)
    add(y, 0, burst(rng, 0.01, 3000, 8000, 0.0015), 0.3)
    return y


def sfx_ding(rng, v=0):
    """Колокольчик (ми 6-й октавы)."""
    f = 1318.5
    y = ping(1.3, [(f, 1.0, 0.38), (2 * f, 0.22, 0.19), (2.756 * f, 0.16, 0.08),
                   (5.404 * f, 0.07, 0.04)])
    return with_reverb(y, 0.25, 1.2, 1.3)


def sfx_cash(rng, v=0):
    """Касса «ча-чинг»: механика ящика, затем звонок и монетки."""
    y = np.zeros(int(1.0 * SR))
    add(y, 0, burst(rng, 0.09, 1500, 6000, 0.018), 0.8)
    add(y, 0, thud(0.12, 260, 170, 0.02, 0.03), 0.5)
    add(y, 0.11, ping(0.85, [(2637.0, 1.0, 0.26), (3951.1, 0.5, 0.18), (5274.0, 0.22, 0.10)]))
    for t0 in 0.2 + np.sort(rng.uniform(0, 0.3, 4)):
        f = rng.uniform(4500, 7000)
        add(y, t0, ping(0.12, [(f, 1.0, 0.02), (1.31 * f, 0.5, 0.012)]), 0.13)
    return with_reverb(y, 0.12, 1.2, 1.0)


def sfx_impact(rng, v=0):
    """Низкий кинематографичный удар: саб-дроп + шумовая вспышка."""
    y = np.zeros(int(1.4 * SR))
    add(y, 0, np.tanh(3 * thud(1.4, 130, 42, 0.09, 0.38, 0.003)))
    add(y, 0, burst(rng, 0.5, 90, 500, 0.09, 0.002), 0.6)
    add(y, 0, burst(rng, 0.25, 300, 2500, 0.035, 0.001), 0.4)
    return with_reverb(y, 0.22, 1.2, 1.4, 0.4)


def sfx_riser(rng, v=0):
    """Нарастание 1.5 с, кульминация в самом конце."""
    n = int(1.5 * SR)
    u = np.arange(n) / n
    fc = 300 * (5500 / 300) ** u
    nz = np.stack([swept_noise(rng, n, fc, 250, 7000, 10, 0.5) for _ in (0, 1)], axis=1)
    ph = TAU * np.cumsum(220 * 2 ** (2 * u ** 1.6)) / SR       # ля3 -> ля5
    trem = 1 - 0.35 * (0.5 + 0.5 * np.sin(TAU * np.cumsum(4 + 14 * u) / SR))
    tone = (np.sin(ph) + 0.5 * np.sin(1.5 * ph)) * trem
    return edges((0.5 * nz + 0.25 * tone[:, None]) * (u ** 2.2)[:, None], 0, 0.02)


def _marimba(m, dur=0.5):
    f = mtof(m)
    return ping(dur, [(f, 1.0, 0.16), (4 * f, 0.25, 0.05), (9.2 * f, 0.08, 0.02)], 0.003)


def sfx_phone(rng, v=0):
    """Звонок смартфона: два вибро-импульса + мягкая «маримба»."""
    n = int(1.6 * SR)
    y = np.zeros(n)
    m = int(0.42 * SR)
    t = np.arange(m) / SR
    buzz = (np.sin(TAU * 155 * t) + 0.5 * np.sin(TAU * 310 * t) + 0.25 * np.sin(TAU * 465 * t))
    buzz *= 0.6 + 0.4 * np.sin(TAU * 31 * t)
    buzz += 0.25 * bp(rng.standard_normal(m), 600, 2500) * np.maximum(0, np.sin(TAU * 155 * t)) ** 4
    buzz = edges(buzz, 0.02, 0.03)
    for t0 in (0.0, 0.62):
        add(y, t0, buzz, 0.45)
        for dt, note in ((0.0, 76), (0.14, 81), (0.28, 84)):
            add(y, t0 + dt, _marimba(note), 0.6)
    return edges(y, 0, 0.1)


def sfx_click(rng, v=0):
    """Тяжёлое реле/рубильник: щелчок, металлический призвук, низкий «тук»."""
    y = np.zeros(int(0.4 * SR))
    hit = np.zeros(int(0.06 * SR))
    add(hit, 0, burst(rng, 0.03, 1200, 7000, 0.0025), 1.2)
    add(hit, 0, ping(0.06, [(760, 0.6, 0.012), (1530, 0.5, 0.008), (2890, 0.35, 0.006),
                            (4100, 0.2, 0.004)], 0.0005))
    add(y, 0, hit)
    add(y, 0.028, hit, 0.35)                                   # дребезг контакта
    add(y, 0.002, np.tanh(2.5 * thud(0.35, 150, 70, 0.02, 0.07)), 0.8)
    return with_reverb(y, 0.12, 0.5, 0.4, 0.1)


def sfx_horn(rng, v=0):
    """Далёкий туманный горн: ля (110 Гц) с квинтой, медленная атака, ревер."""
    n = int(2.5 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f0, a in ((110.0, 1.0), (164.81, 0.35)):
        ph = TAU * f0 * t + 0.6 * np.sin(TAU * 0.7 * t)
        for k in range(1, 9):
            y += a * np.sin(k * ph) / k ** 1.3
    env = 0.5 - 0.5 * np.cos(np.pi * np.interp(t, [0, 0.5, 1.35, 1.9], [0, 1, 1, 0]))
    return with_reverb(lp(y * env, 800), 0.6, 1.8, 2.5, 0.4)


def _engine(t, f0, harm, cut):
    """Гул мотора: гармоники (номер, амплитуда) плывущей частоты f0, ФНЧ."""
    ph = TAU * np.cumsum(f0) / SR
    return lp(sum(a * np.sin(k * ph + 1.7 * k) for k, a in harm), cut)


def sfx_car(rng, v=0):
    """Машина подъезжает и останавливается: гул мотора вниз + шорох гравия."""
    n = int(2.6 * SR)
    t = np.arange(n) / SR
    harm = [(0.5, 0.4)] + [(k, k ** -1.1) for k in range(1, 7)]
    eng = _engine(t, 36 + 58 * np.exp(-t / 0.8), harm, 420)
    eng *= np.interp(t, [0, 0.4, 1.6, 2.2, 2.5], [0, 1, 0.6, 0.3, 0])
    grains = (rng.random(n) < 0.01) * rng.random(n)
    crunch = signal.lfilter([1.0], [1.0, -np.exp(-1 / (0.004 * SR))], grains)
    grav = bp(rng.standard_normal(n), 900, 6000) * (0.2 + crunch)
    grav *= np.interp(t, [0, 0.35, 1.9, 2.15], [0, 1, 0.25, 0])
    y = norm(eng) * 0.9 + norm(grav) * 0.4
    return edges(pan_curve(y, -0.5 * (1 - np.minimum(1, t / 1.8))), 0.01, 0.05)


def sfx_door(rng, v=0):
    """Хлопок автомобильной двери."""
    y = np.zeros(int(0.4 * SR))
    add(y, 0, burst(rng, 0.02, 2000, 5000, 0.003), 0.2)        # защёлка
    add(y, 0.012, np.tanh(2 * thud(0.35, 125, 62, 0.025, 0.07)), 1.0)
    add(y, 0.012, burst(rng, 0.15, 200, 900, 0.025, 0.001), 0.6)
    return with_reverb(y, 0.08, 0.5, 0.4, 0.1)


def sfx_paper(rng, v=0):
    """Шорох/скольжение бумаги."""
    n = int(0.4 * SR)
    u = np.arange(n) / n
    grain = lp(rng.random(n) ** 6, 70)
    y = swept_noise(rng, n, 2500 * 2 ** (1.2 * u), 1500, 8000, 6, 0.7)
    return edges(y * (0.25 + norm(grain)) * np.sin(np.pi * u) ** 0.8, 0.005, 0.02)


def sfx_keys(rng, v=0):
    """Связка ключей: несколько высоких металлических «дзынь»."""
    y = np.zeros(int(0.5 * SR))
    for t0 in np.sort(rng.uniform(0, 0.28, 6)):
        f = rng.choice([3100.0, 3700.0, 4350.0, 5200.0, 6100.0, 6900.0]) * rng.uniform(0.97, 1.03)
        tau = rng.uniform(0.03, 0.06)
        add(y, t0, ping(0.22, [(f, 1.0, tau), (1.31 * f, 0.5, tau * 0.6)], 0.001),
            rng.uniform(0.4, 1.0))
    return with_reverb(y, 0.1, 0.5, 0.5, 0.08)


def sfx_gulls(rng, v=0):
    """Три далёких крика чаек: нисходящие «кия» с вибрато, ревер."""
    y = np.zeros(int(1.8 * SR))
    for t0, d, a, fp in ((0.05, 0.42, 1.0, 1050), (0.55, 0.36, 0.8, 1150), (0.98, 0.33, 0.6, 1000)):
        m = int(d * SR)
        u = np.arange(m) / m
        shape = np.minimum(u / 0.12, 1) * (1 - np.clip((u - 0.12) / 0.88, 0, 1)) ** 1.2
        f = fp * (0.62 + 0.38 * shape) * (1 + 0.025 * u * np.sin(TAU * 13 * u * d))
        ph = TAU * np.cumsum(f) / SR
        cry = sum(np.exp(-0.5 * (np.log2(k * fp * 0.8 / 2600) / 0.7) ** 2) * np.sin(k * ph)
                  for k in range(1, 7))                        # форманта ~2.6 кГц — «носовой» крик
        add(y, t0, cry * np.sin(np.pi * u) ** 0.7, a)
    y = lp(y, 4500)
    return with_reverb(0.6 * y, 0.6, 1.6, 1.8, 0.3)


def sfx_flash(rng, v=0):
    """Стеклянный высокий «блик» — далёкая вспышка."""
    f = 2637.0
    return edges(ping(0.25, [(f, 1.0, 0.05), (2 * f, 0.3, 0.03), (3.01 * f, 0.15, 0.02)], 0.004),
                 0, 0.03)


def sfx_heartbeat(rng, v=0):
    """Один удар сердца «тук-тук»."""
    y = np.zeros(int(0.6 * SR))
    for t0, f, tau, a in ((0.0, 110, 0.06, 1.0), (0.21, 130, 0.045, 0.75)):
        add(y, t0, thud(0.3, f, f / 2, 0.025, tau, 0.004), a)
        add(y, t0, burst(rng, 0.15, 90, 350, 0.03, 0.003), 0.35 * a)
    return edges(lp(np.tanh(3 * y), 500), 0, 0.05)


def sfx_swell(rng, v=0):
    """Тёмное низкое нарастание 2.5 с с обрывом."""
    n = int(2.5 * SR)
    t = np.arange(n) / SR
    u = t / 2.5
    two = np.zeros((n, 2))                                     # два расстроенных голоса
    for f in (55.0, 82.41, 110.0, 164.81, 220.0):
        for c, d in ((0, 0.998), (1, 1.002)):
            ph = TAU * f * d * t + rng.uniform(0, TAU)
            two[:, c] += (np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.2 * np.sin(3 * ph)) * (110 / f) ** 0.3
    two += 1.2 * lp(rng.standard_normal((n, 2)), 300)
    y = two + 0.45 * two[:, ::-1]                              # каналы частично общие (моно-совместимость)
    w = (u ** 2)[:, None]
    y = lp(y, 260) * (1 - w) + lp(y, 1300) * w                 # фильтр «открывается»
    return edges(y * (u ** 1.8)[:, None], 0, 0.035)


def sfx_type(rng, v=0):
    """Одно мягкое нажатие клавиши."""
    k = 1 + 0.05 * ((v % 6) - 2.5)
    y = np.zeros(int(0.07 * SR))
    add(y, 0, burst(rng, 0.03, 1200 * k, 4500 * k, 0.005), 0.6)
    add(y, 0.001, thud(0.06, 230 * k, 140 * k, 0.008, 0.016, 0.001))
    return y


def sfx_stamp(rng, v=0):
    """Удар резинового штампа."""
    y = np.zeros(int(0.35 * SR))
    add(y, 0, thud(0.3, 135, 70, 0.02, 0.06))
    add(y, 0, burst(rng, 0.12, 300, 1300, 0.02, 0.001), 0.45)
    add(y, 0, ping(0.2, [(240, 0.3, 0.04)]))
    return with_reverb(np.tanh(1.5 * y), 0.06, 0.5, 0.35, 0.08)


def sfx_bus(rng, v=0):
    """Автобус подъезжает: дизель, обороты падают, в конце — пневматика."""
    n = int(2.5 * SR)
    t = np.arange(n) / SR
    f0 = 44 + 26 * np.exp(-t / 0.8)
    harm = [(0.5, 0.6)] + [(k, k ** -0.9) for k in range(1, 9)]
    eng = _engine(t, f0, harm, 600) * (1 + 0.3 * np.sin(TAU * np.cumsum(f0 / 4) / SR))
    eng = norm(eng) + 0.35 * norm(lp(rng.standard_normal(n), 180))
    y = eng * np.interp(t, [0, 0.5, 1.3, 1.9, 2.45], [0, 1, 0.75, 0.4, 0])
    add(y, 1.75, burst(rng, 0.6, 2500, 8000, 0.14, 0.015), 0.6)   # «пшш»
    return edges(pan_curve(y, 0.4 * (1 - np.minimum(1, t / 1.5))), 0.01, 0.05)


# имя: (функция, пик dBFS при gain=1, число вариантов)
SFX = {
    "pop": (sfx_pop, -16, 8), "pop2": (sfx_pop2, -16, 8), "whoosh": (sfx_whoosh, -15, 1),
    "tick": (sfx_tick, -20, 4), "ding": (sfx_ding, -14, 1), "cash": (sfx_cash, -14, 1),
    "impact": (sfx_impact, -8, 1), "riser": (sfx_riser, -13, 1), "phone": (sfx_phone, -14, 1),
    "click": (sfx_click, -8, 1), "horn": (sfx_horn, -11, 1), "car": (sfx_car, -13, 1),
    "door": (sfx_door, -12, 1), "paper": (sfx_paper, -19, 3), "keys": (sfx_keys, -18, 3),
    "gulls": (sfx_gulls, -21, 1), "flash": (sfx_flash, -17, 1), "heartbeat": (sfx_heartbeat, -12, 1),
    "swell": (sfx_swell, -12, 1), "type": (sfx_type, -21, 6), "stamp": (sfx_stamp, -12, 1),
    "bus": (sfx_bus, -13, 1),
}


@lru_cache(maxsize=None)
def _sfx(name, v):
    fn, level, _ = SFX[name]
    y = st(fn(np.random.default_rng(seed_of(name, v)), v))
    return (y * (db(level) / (np.abs(y).max() + 1e-12))).astype(np.float32)


def get_sfx(name, idx=0):
    """Эффект по имени; idx — номер срабатывания (выбирает вариант)."""
    return _sfx(name, idx % SFX[name][2])


# ---------- эмбиент ---------------------------------------------------------
def amb_sea(dur, rng, t0=0.0):
    """Море: шум, промодулированный медленными волнами (период 6–9 с)."""
    n = int(dur * SR)
    t = t0 + np.arange(n) / SR
    lo, mid, hi = (pink(rng, n) for _ in range(3))             # гул, тело волны, пена
    swell, foam = np.zeros(n), np.zeros(n)
    wr = np.random.default_rng(seed_of("waves"))               # расписание волн общее для всей шкалы:
    tw = -wr.uniform(1, 6)                                     # соседние куски моря качаются в такт
    while tw < t0 + dur:
        per, a, step = wr.uniform(7.0, 10.0), wr.uniform(0.65, 1.0), wr.uniform(0.85, 0.95)
        i0, i1 = max(0, int((tw - t0) * SR)), min(n, int((tw + per - t0) * SR))
        if i1 > i0:
            x = np.clip((t[i0:i1] - tw) / per, 0, 1)
            swell[i0:i1] += a * np.sin(np.pi * x ** 0.75) ** 2
            foam[i0:i1] += a * np.sin(np.pi * x) * np.exp(
                -0.5 * ((x - 0.42) / np.where(x < 0.42, 0.09, 0.2)) ** 2)
        tw += per * step
    sw, fo = np.minimum(swell, 1.1)[:, None], np.minimum(foam, 1.1)[:, None]
    return (0.35 * bp(lo, 60, 350) * (0.6 + 0.4 * sw) + bp(mid, 350, 2200) * (0.25 + 0.5 * sw)
            + bp(hi, 2200, 7000) * (0.05 + 0.45 * fo))


def amb_city(dur, rng, t0=0.0):
    """Город: далёкий гул трафика, редкие проезды."""
    n = int(dur * SR)
    nz = pink(rng, n)
    y = 0.5 * lp(nz, 160) + bp(nz, 160, 700) * (0.6 + 0.4 * slow_rand(rng, n, 6.0))[:, None]
    y += 0.12 * bp(nz, 700, 3000)
    tc = rng.uniform(0.5, 3.0)
    while tc < dur:
        m = int(rng.uniform(2.5, 4.5) * SR)
        u = np.arange(m) / m
        car = bp(rng.standard_normal(m), 250, 1400) * np.exp(-0.5 * ((u - 0.5) / 0.17) ** 2)
        add(y, tc, pan_curve(car, 0.8 * rng.choice([-1, 1]) * (2 * u - 1)), rng.uniform(0.2, 0.4))
        tc += rng.uniform(3.5, 7.0)
    return y


def amb_busride(dur, rng, t0=0.0):
    """Салон автобуса: гул двигателя + дорожный рокот, редкие кочки."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    nz = pink(rng, n)
    f0 = 43 * (1 + 0.04 * (slow_rand(rng, n, 3.0) - 0.5))
    eng = _engine(t, f0, [(0.5, 0.3), (1, 0.6), (2, 1.0), (3, 0.8), (4, 0.5), (6, 0.25)], 420)
    eng *= 1 + 0.12 * np.sin(TAU * 6.5 * t)
    y = 0.4 * st(eng) + 0.5 * lp(nz, 130)
    y += bp(nz, 250, 1600) * (0.3 * (0.7 + 0.3 * slow_rand(rng, n, 4.0)))[:, None]
    tb = rng.uniform(1.0, 3.0)
    while tb < dur:
        add(y, tb, st(thud(0.25, 90, 50, 0.03, 0.07)), rng.uniform(0.5, 1.0))
        tb += rng.uniform(2.5, 6.0)
    return y


def amb_room(dur, rng, t0=0.0):
    """Комната: очень тихий тон + часы (тик-так раз в секунду)."""
    n = int(dur * SR)
    nz = pink(rng, n)
    y = 0.6 * lp(nz, 300) + 0.25 * bp(nz, 300, 2500)
    for k in range(int(np.ceil(t0 - 0.5)), int(t0 + dur) + 1):    # тик в каждую «полсекунду» общей шкалы
        f = 2300.0 if k % 2 == 0 else 1750.0
        tk = ping(0.03, [(f, 1.0, 0.004), (1.9 * f, 0.4, 0.002)], 0.0005)
        add(tk, 0, burst(rng, 0.008, 1500, 5000, 0.0012), 0.5)
        add(y, 0.5 + k - t0, pan_st(tk, 0.2), 0.85)
    return y


def amb_night(dur, rng, t0=0.0):
    """Ночь: порывы ветра + едва слышные далёкие волны."""
    n = int(dur * SR)
    nz = pink(rng, n)
    w = slow_rand(rng, n, 4.0)
    gust = 0.5 + 0.5 * slow_rand(rng, n, 5.5) ** 1.5
    y = np.zeros((n, 2))
    for c, (lo, hi), g in ((0.15, (150, 400), 1.0), (0.5, (400, 900), 0.8), (0.85, (900, 2000), 0.5)):
        y += bp(nz, lo, hi) * (g * gust * np.exp(-0.5 * ((w - c) / 0.4) ** 2))[:, None]
    return y + 0.3 * lp(amb_sea(dur, rng, t0), 700)


def amb_lamp(dur, rng, t0=0.0):
    """Лампа маяка: гул 50/100 Гц и медленный «вум» вращения раз в 4 с (фаза — по общей шкале)."""
    n = int(dur * SR)
    t = t0 + np.arange(n) / SR
    hum = sum(a * np.sin(TAU * f * t + p) for f, a, p in
              ((50, 0.7, 0.0), (100, 0.8, 0.7), (150, 0.4, 1.9), (200, 0.2, 0.3), (300, 0.1, 2.2)))
    hum *= 1 + 0.06 * (slow_rand(rng, n, 2.0) - 0.5)
    ph = (t % 4.0) / 1.5
    w = np.where(ph < 1, np.sin(np.pi * np.minimum(ph, 1)) ** 2, 0.0)
    whum = (0.8 * np.sin(TAU * 100 * t) + 0.35 * np.sin(TAU * 200 * t) + 0.15 * np.sin(TAU * 300 * t)
            + 0.5 * bp(rng.standard_normal(n), 120, 600))
    return 0.45 * st(hum) + 1.1 * pan_curve(whum * w, 0.7 * (2 * np.minimum(ph, 1) - 1))


# имя: (функция, RMS dBFS до приглушения)
AMB = {
    "sea": (amb_sea, -31), "city": (amb_city, -32), "busride": (amb_busride, -30),
    "room": (amb_room, -40), "night": (amb_night, -32), "lamp": (amb_lamp, -33),
}


@lru_cache(maxsize=None)
def amb_gain(name):
    """Усиление по эталонным 24 с — уровень не зависит от длины куска."""
    fn, level = AMB[name]
    return db(level) / rms(fn(24.0, np.random.default_rng(seed_of(name))))


def render_amb(name, dur, t0=0.0):
    """Подложка длиной dur с фейдами; t0 — её начало на шкале серии."""
    fn, _ = AMB[name]
    y = fn(dur, np.random.default_rng(seed_of(name)), t0) * amb_gain(name)
    k = min(int(AMB_FADE * SR), len(y) // 2)
    w = np.sin(np.linspace(0, np.pi / 2, k))[:, None]
    y[:k] *= w
    y[-k:] *= w[::-1]
    return y.astype(np.float32)


# ---------- инструменты музыки ---------------------------------------------
def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


@lru_cache(maxsize=None)
def i_pluck(m, dur=1.1, tau=0.30, bright=0.5, cut=2800.0):
    """Мягкий щипок: гармоники с затуханием + ФНЧ."""
    f = mtof(m)
    t = np.arange(int(dur * SR)) / SR
    tau *= (261.6 / f) ** 0.25
    y = np.zeros(len(t))
    for k in range(1, 7):
        if k * f > 5000:
            break
        y += bright ** (k - 1) * np.sin(TAU * k * f * t) * np.exp(-t * k ** 0.8 / tau)
    return norm(edges(lp(edges(y, 0.004, 0), cut), 0, 0.02))


@lru_cache(maxsize=None)
def i_piano(m, dur=3.0):
    """«Пианино»: две чуть расстроенные струны, слабая негармоничность."""
    f = mtof(m)
    t = np.arange(int(dur * SR)) / SR
    tau = 1.3 * (440 / f) ** 0.4
    y = np.zeros(len(t))
    for cents in (-1.5, 1.5):
        ff = f * 2 ** (cents / 1200)
        for k in range(1, 7):
            fk = k * ff * np.sqrt(1 + 0.0004 * k * k)
            if fk > 7000:
                break
            y += np.sin(TAU * fk * t) / k ** 1.4 * np.exp(-t * k ** 0.9 / tau)
    return norm(edges(lp(edges(y, 0.003, 0), 4500), 0, 0.2))


@lru_cache(maxsize=None)
def i_bell(m, dur=2.0, tau=0.55):
    """Колокольчик/глокеншпиль."""
    f = mtof(m)
    parts = [(r * f, a, tau * d) for r, a, d in
             ((1, 1.0, 1.0), (2, 0.22, 0.5), (2.756, 0.16, 0.22), (5.404, 0.07, 0.12)) if r * f < 9000]
    return norm(edges(ping(dur, parts), 0, 0.1))


@lru_cache(maxsize=None)
def i_pad(notes, dur, cut=1400.0, det=7.0, att=0.6, rel=0.9):
    """Пэд (стерео): по три расстроенных голоса на ноту, медленные атака и спад."""
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(zlib.crc32(repr(notes).encode()))
    y = np.zeros((n, 2))
    for m in notes:
        for d, pl in ((-det, 0.2), (0.0, 0.5), (det, 0.8)):
            ph = TAU * mtof(m) * 2 ** (d / 1200) * t + rng.uniform(0, TAU)
            w = (np.sin(ph) + 0.3 * np.sin(2 * ph + 1.0) + 0.12 * np.sin(3 * ph + 2.0)
                 + 0.05 * np.sin(4 * ph + 0.5))
            y[:, 0] += w * np.sqrt(1 - pl)
            y[:, 1] += w * np.sqrt(pl)
    a, r = int(att * SR), int(rel * SR)
    env = np.ones(n)
    env[:a] = 0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a)
    env[-r:] = 0.5 + 0.5 * np.cos(np.pi * np.arange(r) / r)
    y = lp(y, cut)
    return y * env[:, None] * (0.25 / rms(y[a:n - r]))


@lru_cache(maxsize=None)
def i_sub(m, dur, att=0.015):
    """Саб-бас: синус + немного 2-й и 3-й гармоник (слышно и на телефоне)."""
    f = mtof(m)
    t = np.arange(int(dur * SR)) / SR
    y = np.sin(TAU * f * t) + 0.45 * np.sin(TAU * 2 * f * t) + 0.2 * np.sin(TAU * 3 * f * t)
    return norm(edges(y * np.exp(-t / (dur * 0.9)), att, 0.08))


@lru_cache(maxsize=None)
def i_bass(m, dur=0.30, tau=0.11, cut=600.0):
    """Пульсирующий бас: короткая приглушённая нота."""
    f = mtof(m)
    t = np.arange(int(dur * SR)) / SR
    y = sum(np.sin(TAU * k * f * t) / k for k in range(1, 6)) * np.exp(-t / tau)
    return norm(edges(lp(edges(y, 0.005, 0), cut), 0, 0.02))


@lru_cache(maxsize=None)
def i_kick(hard=0.0):
    """Мягкая бочка (лёгкое насыщение — чтобы читалась на телефоне)."""
    y = thud(0.42, 115 + 40 * hard, 50, 0.035, 0.11 + 0.03 * hard)
    return norm(edges(np.tanh((2.0 + hard) * y), 0, 0.05))


@lru_cache(maxsize=None)
def i_hat(v=0, tau=0.016):
    """Хэт: шум 6–9.5 кГц; короткий tau — «тик»."""
    n = int(max(0.03, tau * 4.5) * SR)
    y = bp(np.random.default_rng(900 + v).standard_normal(n), 6000, 9500, 4)
    return norm(edges(y * np.exp(-np.arange(n) / (tau * SR)), 0.001, 0.005))


@lru_cache(maxsize=None)
def i_clap(v=0):
    """Хлопок: три шумовых щелчка + хвост."""
    n = int(0.28 * SR)
    t = np.arange(n) / SR
    env = sum(np.where(t >= d, np.exp(-(t - d) / 0.006), 0.0) for d in (0.0, 0.011, 0.023))
    env = 0.7 * env + np.where(t >= 0.023, np.exp(-(t - 0.023) / 0.06), 0.0)
    y = bp(np.random.default_rng(950 + v).standard_normal(n), 900, 3600)
    return norm(edges(lp(y * env, 6000, 4), 0.0005, 0.02))


class Track:
    """Буфер настроения: сухой сигнал + посыл на ревер. t=0 — сильная доля."""

    def __init__(self, dur, pre, post, rt60):
        self.pre, self.end, self.rt60 = pre, dur + post, rt60
        self.n = int(round((pre + dur + post) * SR))
        self.dry = np.zeros((self.n, 2))
        self.wet = np.zeros((self.n, 2))

    def add(self, t, sig, gain=1.0, pan=0.0, send=0.0):
        if t < -self.pre - 1e-9 or t >= self.end:
            return
        s = pan_st(sig, pan)
        add(self.dry, t + self.pre, s, gain)
        if send:
            add(self.wet, t + self.pre, s, gain * send)

    def render(self):
        return self.dry + reverb(self.wet, self.rt60)[: self.n]


# ---------- настроения ------------------------------------------------------
# (саб-бас, аккорд пэда, арпеджио восьмыми): Am – F – C – G
PROG = (
    (33, (57, 60, 64), (57, 64, 69, 72, 64, 69, 72, 64)),
    (29, (57, 60, 65), (53, 60, 65, 69, 60, 65, 69, 60)),
    (36, (55, 60, 64), (55, 60, 64, 72, 60, 64, 72, 60)),
    (31, (55, 59, 62), (55, 62, 67, 71, 62, 67, 71, 62)),
)
VEL8 = (1.0, 0.6, 0.75, 0.85, 0.6, 0.75, 0.8, 0.6)


def _bars(dur):
    return range(-1, int(np.ceil(dur / BAR)) + 1)


def mood_hook(tr, dur):
    """Тёмное, напряжённое: дрон, пульс баса восьмыми, редкие ноты пианино."""
    roots = (45, 45, 45, 40)                                   # ля ×3, ми (только кварты/квинты к дрону)
    notes = ((0, 0.0, 76), (1, 2.0, 72), (2, 0.0, 69), (3, 1.0, 71),
             (4, 0.0, 76), (5, 2.5, 81), (6, 0.0, 72), (7, 1.0, 71))
    for b in _bars(dur):
        t0 = b * BAR
        if b % 4 == 0:
            tr.add(t0, i_pad((33, 45, 57), 4 * BAR, cut=420.0, det=5.0, att=0.5, rel=0.5), 0.9)
        for e in range(8):
            acc = 1.0 if e % 4 == 0 else (0.75 if e % 2 == 0 else 0.6)
            tr.add(t0 + e * BEAT / 2, i_bass(roots[b % 4]), 0.5 * acc)
        for bb, beat, m in notes:
            if bb == b % 8:
                tr.add(t0 + beat * BEAT, i_piano(m), 0.32, pan=0.3 * (-1) ** bb, send=0.6)


def mood_title(tr, dur):
    """Короткий подъём: тёплый пэд + арпеджио колокольчиков."""
    prog = (
        (41, (53, 57, 60, 64), (72, 76, 81, 84, 88, 84, 81, 76)),   # Fmaj7
        (36, (48, 55, 60, 64), (72, 76, 79, 84, 88, 84, 79, 76)),   # C
        (43, (55, 59, 62, 67), (71, 74, 79, 83, 86, 83, 79, 74)),   # G
        (45, (57, 60, 64, 69), (72, 76, 81, 84, 88, 84, 81, 76)),   # Am
    )
    for b in _bars(dur):
        t0 = b * BAR
        root, chord, arp = prog[b % 4]
        tr.add(t0, i_pad(chord, BAR, cut=1600.0, att=0.3, rel=0.9), 0.8)
        tr.add(t0, i_sub(root, 3.6 * BEAT), 0.3)
        for e, m in enumerate(arp):
            tr.add(t0 + e * BEAT / 2, i_bell(m, 1.6, 0.45), 0.3 * VEL8[e] * (1.0 if e < 5 else 0.7),
                   pan=0.35 * (-1) ** e, send=0.5)


def mood_light(tr, dur):
    """Основная подложка: арпеджио щипком, саб-бас, лёгкая бочка и хэт."""
    for b in _bars(dur):
        t0 = b * BAR
        root, chord, arp = PROG[b % 4]
        tr.add(t0, i_pad(chord, BAR, cut=1200.0), 0.5)
        tr.add(t0, i_sub(root, 3.6 * BEAT), 0.3)
        for e, m in enumerate(arp):
            tr.add(t0 + e * BEAT / 2, i_pluck(m), 0.5 * VEL8[e], pan=0.25 * (-1) ** e, send=0.3)
        tr.add(t0, i_kick(), 0.34)
        tr.add(t0 + 2 * BEAT, i_kick(), 0.27)
        for e in (1, 3, 5, 7):
            tr.add(t0 + e * BEAT / 2, i_hat(e % 3), 0.07, pan=0.15)


def mood_tension(tr, dur):
    """Долг/антагонист: глухое низкое остинато, тикающий хэт, минорный пэд."""
    prog = (
        (33, (57, 60, 64), (45, 45, 48, 45, 52, 45, 48, 47)),      # Am
        (33, (57, 60, 64), (45, 45, 48, 45, 52, 45, 48, 47)),
        (38, (57, 62, 65), (50, 50, 53, 50, 57, 50, 53, 52)),      # Dm
        (40, (56, 59, 64), (52, 52, 56, 52, 59, 52, 56, 52)),      # E
    )
    for b in _bars(dur):
        t0 = b * BAR
        root, chord, ost = prog[b % 4]
        tr.add(t0, i_pad(chord, BAR, cut=900.0, det=9.0), 0.45)
        tr.add(t0, i_sub(root, 3.5 * BEAT), 0.3)
        for e, m in enumerate(ost):
            t = t0 + e * BEAT / 2
            tr.add(t, i_pluck(m, 0.5, 0.10, 0.55, 900.0), 0.55 * VEL8[e], send=0.1)
            tr.add(t, i_hat(3 + e % 2, 0.007), 0.09 if e % 2 == 0 else 0.05, pan=-0.2)
        tr.add(t0, i_kick(), 0.32)
        tr.add(t0 + 2.5 * BEAT, i_kick(), 0.2)


def mood_night(tr, dur):
    """Жутковато и пусто: медленный расстроенный пэд, редкий колокольчик, без ударных."""
    chords = ((45, 52, 57, 64), (41, 48, 57, 64))               # пустые квинты ля / Fmaj7
    bells = ((0, 2.0, 88), (1, 3.5, 83), (3, 1.0, 84), (4, 2.5, 81), (6, 0.0, 88), (7, 2.0, 81))
    for b in _bars(dur):
        t0 = b * BAR
        if b % 2 == 0:
            k = (b // 2) % 2
            tr.add(t0, i_pad(chords[k], 2 * BAR, cut=800.0, det=14.0, att=1.2, rel=1.2), 0.6)
            tr.add(t0, i_sub((33, 29)[k], 2 * BAR, att=0.4), 0.22)
        for bb, beat, m in bells:
            if bb == b % 8:
                tr.add(t0 + beat * BEAT, i_bell(m, 3.0, 0.9), 0.28, pan=0.4 * (-1) ** bb, send=0.9)


def mood_choice(tr, dur):
    """Ожидание выбора: щипки + бочка/хлопок; энергия растёт 4 такта, дальше ровная петля."""
    for b in _bars(dur):
        t0 = b * BAR
        root, chord, arp = PROG[b % 4]
        lvl = 0 if b < 2 else (1 if b < 4 else 2)
        g = (0.8, 0.9, 1.0)[lvl]
        tr.add(t0, i_sub(root, 3.6 * BEAT), 0.28)
        for e, m in enumerate(arp):
            t = t0 + e * BEAT / 2
            tr.add(t, i_pluck(m, 1.1, 0.22, 0.6), 0.42 * VEL8[e] * g, pan=0.25 * (-1) ** e, send=0.25)
            tr.add(t, i_bass(root + 12), 0.28 * (1.0 if e % 2 == 0 else 0.7) * g)
            if lvl == 2:                                        # шестнадцатые октавой выше
                tr.add(t + BEAT / 4, i_pluck(m + 12, 0.6, 0.14), 0.2, pan=-0.3 * (-1) ** e, send=0.3)
        for beat in range(4):
            if lvl >= 1 or beat % 2 == 0:
                tr.add(t0 + beat * BEAT, i_kick(0.5), 0.32 * g)
            if lvl >= 1 and beat % 2 == 1:
                tr.add(t0 + beat * BEAT, i_clap(beat), 0.22, send=0.2)
        if lvl == 2:
            tr.add(t0, i_pad(chord, BAR, cut=1400.0), 0.5)
            for s in range(16):
                tr.add(t0 + s * BEAT / 4, i_hat(s % 4), 0.09 if s % 4 == 2 else 0.045, pan=0.2)


# имя: (функция, RMS dBFS без голоса, RT60 ревера)
MOODS = {
    "hook": (mood_hook, -24.0, 1.2), "title": (mood_title, -23.0, 1.2),
    "light": (mood_light, -24.0, 1.2), "tension": (mood_tension, -24.5, 1.2),
    "night": (mood_night, -26.0, 2.4), "choice": (mood_choice, -23.5, 1.2),
}


def _mood_raw(name, dur, pre, post):
    fn, _, rt60 = MOODS[name]
    tr = Track(dur, pre, post, rt60)
    fn(tr, dur + post)
    return tr.render()


@lru_cache(maxsize=None)
def mood_gain(name):
    """Усиление по эталону (такты 5–12) — уровень не зависит от длины куска."""
    ref = _mood_raw(name, 12 * BAR, 0.0, 0.0)[int(4 * BAR * SR):]
    return db(MOODS[name][1]) / rms(ref)


def render_mood(name, dur, pre=0.0, post=0.0):
    """Настроение длиной dur (+затакт pre и хвост post), сильная доля в t=0."""
    return _mood_raw(name, dur, pre, post) * mood_gain(name)


# ---------- сборка дорожек --------------------------------------------------
def phone_fx(x):
    """Телефонная трубка: полоса 350–3200 Гц, лёгкое насыщение, чуть тише."""
    y = bp(x, 350, 3200, 4)
    pk = peak(y) + 1e-9
    y = np.tanh(1.6 * y / pk) * pk / np.tanh(1.6)
    y *= rms(x) / (rms(y) + 1e-9) * db(-2.5)
    return y * min(1.0, peak(x) / (peak(y) + 1e-9))


def build_voice(timing, build, n):
    """Голос по центру + едва заметная «комната». Возвращает (стерео, сухое моно)."""
    dry = np.zeros(n)
    for sc in timing["scenes"]:
        for ln in sc.get("lines", []):
            path = build / ln["file"]
            if not path.exists():
                warn(f"нет файла реплики {ln['id']}: {path}")
                continue
            x, sr = sf.read(path, dtype="float64", always_2d=True)
            x = x.mean(axis=1)
            if sr != SR:
                x = signal.resample_poly(x, SR, sr)
            if ln.get("fx") == "phone":
                x = phone_fx(x)
            elif ln.get("fx"):
                warn(f"неизвестный fx «{ln['fx']}» у реплики {ln['id']} — без обработки")
            add(dry, ln["start"], x)
    out = st(dry) + 0.05 * reverb(dry, 0.45, 11)[:n]
    g = db(VOICE_PEAK_DB) / max(peak(out), 1e-9)               # один коэффициент: баланс реплик цел
    return (out * g).astype(np.float32), dry * g


def duck_curve(voice, n, depth_db=DUCK_DB, att=0.05, rel=0.35, look=0.03):
    """Огибающая приглушения по голосу (шаг 1 мс): атака ~50 мс, спад ~350 мс."""
    hop = SR // 1000
    nb = n // hop
    e = np.sqrt((voice[: nb * hop].reshape(nb, hop) ** 2).mean(axis=1))
    e = maximum_filter1d(uniform_filter1d(e, 10), 80)          # RMS 10 мс, удержание 80 мс
    x = np.clip((20 * np.log10(e + 1e-9) + 48) / 12, 0, 1)     # −48…−36 dBFS -> 0…1
    ka, kr = 1 - np.exp(-0.001 / att), 1 - np.exp(-0.001 / rel)
    s, y = np.empty(nb), 0.0
    for i, v in enumerate(x.tolist()):
        y += (v - y) * (ka if v > y else kr)
        s[i] = y
    s = np.interp(np.arange(n) / hop, np.arange(nb) + 0.5 - look * 1000, s)
    return (10 ** (-depth_db * s / 20)).astype(np.float32)


def build_music(cues, dur):
    """Музыка по меткам: настроение длится до следующей метки, смена — кроссфейдом."""
    out = np.zeros((int(np.ceil(dur * SR)), 2), np.float32)
    segs = []
    for c in sorted(cues, key=lambda c: num(c, "t", 0.0)):
        mood, g = str(c.get("mood", "none")), num(c, "gain", 1.0)
        if mood != "none" and mood not in MOODS:
            warn(f"неизвестное настроение музыки «{mood}» — пропущено")
            continue
        t = max(0.0, num(c, "t", 0.0))
        if t < dur and not (segs and segs[-1][1:] == [mood, g]):   # то же самое — продолжаем
            segs.append([t, mood, g])
    ends = [s[0] for s in segs[1:]] + [dur]
    jobs = [(t0, t1, mood, g, i + 1 == len(segs)) for i, ((t0, mood, g), t1) in enumerate(zip(segs, ends))
            if mood != "none" and t1 > t0]
    xf = int((XF_PRE + XF_POST) * SR)

    def seg(job):
        t0, t1, mood, g, last = job
        pre = min(XF_PRE, t0)
        y = render_mood(mood, t1 - t0, pre, 0.0 if last else XF_POST) * g
        k = min(xf, len(y) // 2)
        if t0 > 0:
            y[:k] *= np.sin(np.linspace(0, np.pi / 2, k))[:, None]
        if not last:
            y[-k:] *= np.cos(np.linspace(0, np.pi / 2, k))[:, None]
        return t0 - pre, y.astype(np.float32)

    pmap(mood_gain, sorted({j[2] for j in jobs}))               # калибровка — по разу на настроение
    for t, y in pmap(seg, jobs):
        add(out, t, y)
    return limiter(out, db(MUSIC_CEIL_DB), 0.03)


def build_amb(cues, dur):
    """Эмбиент: фейды по 0.5 с с центром на t0/t1 — стык соседних меток без провала."""
    out = np.zeros((int(np.ceil(dur * SR)), 2), np.float32)
    jobs = []
    for c in cues:
        name = str(c.get("name"))
        if name not in AMB:
            warn(f"неизвестный эмбиент «{name}» — пропущен")
            continue
        t0, t1 = max(0.0, num(c, "t0", 0.0)), min(dur, num(c, "t1", dur))
        if t1 - t0 >= 0.05:
            a, b = max(0.0, t0 - AMB_FADE / 2), min(dur, t1 + AMB_FADE / 2)
            jobs.append((name, a, b, num(c, "gain", 1.0), num(c, "pan", 0.0)))
    pmap(amb_gain, sorted({j[0] for j in jobs}))
    for (name, a, b, g, p), y in zip(jobs, pmap(lambda j: render_amb(j[0], j[2] - j[1], j[1]), jobs)):
        add(out, a, pan_st(y, p), g)
    return out


def build_sfx(cues, dur):
    """Эффекты по меткам; номер срабатывания (по времени) выбирает вариант звука."""
    out = np.zeros((int(np.ceil(dur * SR)), 2), np.float32)
    count = {}
    for c in sorted(cues, key=lambda c: num(c, "t", 0.0)):
        name = str(c.get("name"))
        if name not in SFX:
            warn(f"неизвестный эффект «{name}» — пропущен")
            continue
        idx = count.get(name, 0)
        count[name] = idx + 1
        add(out, num(c, "t", 0.0), pan_st(get_sfx(name, idx), num(c, "pan", 0.0)), num(c, "gain", 1.0))
    return out


def master(mix):
    """Лимитер до −1 dBFS, фейд 10 мс в начале и 0.8 с в конце."""
    mix = limiter(mix, db(MASTER_CEIL_DB) * 0.99)
    a, r = int(0.01 * SR), min(int(0.8 * SR), len(mix))
    mix[:a] *= np.linspace(0, 1, a, dtype=np.float32)[:, None]
    mix[-r:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, r, dtype=np.float32)))[:, None]
    return np.clip(mix, -db(MASTER_CEIL_DB), db(MASTER_CEIL_DB))


def write_wav(path, x):
    """48 кГц, стерео, PCM16."""
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, np.clip(st(np.asarray(x)), -1.0, 1.0), SR, subtype="PCM_16")


def render_episode(ep_dir, cues_path=None):
    """Собрать build/<ep>/mix.wav и stems/*.wav (дорожки — до мастер-лимитера), напечатать уровни."""
    t_start = time.time()
    build = ROOT / "build" / Path(ep_dir).resolve().name
    if not (build / "timing.json").exists():
        sys.exit(f"нет {build / 'timing.json'} — сначала tools/tts.py")
    timing = json.loads((build / "timing.json").read_text(encoding="utf-8"))
    cues_path = Path(cues_path) if cues_path else build / "cues.json"
    if cues_path.exists():
        cues = json.loads(cues_path.read_text(encoding="utf-8"))
    else:
        warn(f"нет {cues_path} — микс только из голоса")
        cues = {}
    dur = float(timing["duration"])
    n = int(np.ceil(dur * SR))

    def part(key):
        return [c for c in cues.get(key) or [] if isinstance(c, dict)]

    (voice, dry), music, amb, sfx = pmap(lambda f: f(), [
        lambda: build_voice(timing, build, n),
        lambda: build_music(part("music"), dur),
        lambda: build_amb(part("amb"), dur),
        lambda: build_sfx(part("sfx"), dur)])
    duck = duck_curve(dry, n)[:, None]
    stems = {"voice": voice, "music": music * duck, "amb": amb * duck, "sfx": sfx}
    mix = master(sum(stems.values()))
    write_wav(build / "mix.wav", mix)
    for name, x in stems.items():
        write_wav(build / "stems" / f"{name}.wav", x)

    talk = duck[:, 0] < db(-0.75 * DUCK_DB)      # голос звучит
    quiet = duck[:, 0] > db(-0.5)                # голоса нет
    print(f"\n{build / 'mix.wav'}")
    print(f"длительность {len(mix) / SR:.2f} c   пик микса {dbfs(peak(mix)):+.1f} dBFS   "
          f"RMS микса {dbfs(rms(mix)):+.1f} dBFS   ({time.time() - t_start:.1f} c)")
    print(f"{'дорожка':<8}{'RMS':>8}{'пик':>8}{'RMS под голосом':>18}{'RMS без голоса':>17}   (dBFS)")
    for name, x in stems.items():
        gap = "—" if name == "voice" else f"{dbfs(rms(x[quiet])):.1f}"
        print(f"{name:<8}{dbfs(rms(x)):>8.1f}{dbfs(peak(x)):>8.1f}{dbfs(rms(x[talk])):>18.1f}{gap:>17}")
    return mix, stems


def render_demo():
    """Все эффекты, эмбиенты (6 с) и настроения (12 с) — в build/audio_demo/."""
    out = ROOT / "build" / "audio_demo"
    print(f"{'файл':<22}{'длит., c':>9}{'пик':>8}{'RMS':>8}   (dBFS)")

    def save(fname, y):
        write_wav(out / fname, y)
        print(f"{fname:<22}{len(y) / SR:>9.2f}{dbfs(peak(y)):>8.1f}{dbfs(rms(y)):>8.1f}")

    for name in SFX:
        save(f"sfx_{name}.wav", get_sfx(name))
    for name in AMB:
        save(f"amb_{name}.wav", render_amb(name, 6.0))
    for name in MOODS:
        y = limiter(render_mood(name, 12.0), db(MUSIC_CEIL_DB), 0.03)
        save(f"music_{name}.wav", edges(y, 0.01, 0.3))
    print(f"\n-> {out}")


def main():
    ap = argparse.ArgumentParser(description="Сборка звуковой дорожки серии")
    ap.add_argument("episode", nargs="?", help="папка серии, например episodes/ep01")
    ap.add_argument("--cues", help="файл меток (по умолчанию build/<ep>/cues.json)")
    ap.add_argument("--demo", action="store_true", help="отрендерить все звуки в build/audio_demo/")
    args = ap.parse_args()
    if args.demo:
        render_demo()
    if args.episode:
        render_episode(args.episode, args.cues)
    if not args.demo and not args.episode:
        ap.error("укажи папку серии или --demo")


if __name__ == "__main__":
    main()
