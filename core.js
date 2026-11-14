/* QUENCH core: data helpers, briefing, evidence map, findings, lessons.
   Everything is computed in the browser from data.js. No network calls.
   SI notice: written with SI (AI) assistance (Claude, Anthropic). */
const D = window.FLAME, S = D.stats;
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const f1 = x => (Math.round(x * 10) / 10).toString();
const f2 = x => x.toFixed(2);
const pad2 = n => String(n).padStart(2, "0");
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
const PSIA = 14.696;
const KIND = {
  solid: { label: "Solid materials", one: "solid-material", color: "var(--s1)" },
  droplet: { label: "Liquid droplets", one: "liquid-fuel", color: "var(--s2)" },
  gas: { label: "Gas flames", one: "gas-flame", color: "var(--s3)" }
};
const KINDS = ["solid", "droplet", "gas"];
const DIM = { safety: "Safety impact", evidence: "Strength of evidence", mission: "Fit to Moon and Mars missions", action: "Can be acted on now" };
const state = { atm: "exp", custom: { o2: 30, p: 0.6 }, kinds: { solid: true, droplet: true, gas: true }, table: false,
  weights: { safety: 30, evidence: 25, mission: 25, action: 20 }, tag: null, fpillar: "all", invq: "", invkind: "all", open: null, openF: null, view: "brief" };
if (location.hash === "#evidence") {
  const cabin = new URLSearchParams(location.search).get("cabin");
  if (D.atmospheres.some(a => a.id === cabin)) state.atm = cabin;
}
const EXP = D.atmospheres[2];
const inv = acc => D.investigations.find(i => i.acc === acc);
function target() {
  if (state.atm === "custom") return { id: "custom", name: "Custom cabin", short: "Custom", o2: state.custom.o2, p: state.custom.p, psia: state.custom.p * PSIA };
  return D.atmospheres.find(a => a.id === state.atm);
}

/* ---------- bins for plotting; cabin comparisons always use individual runs ---------- */
const X0 = 10, X1 = 45, Y0 = 0.4, Y1 = 6;
const hasPressure = t => t.p > 0 && t.ps === "recorded";
const oxygenMatches = (o, T) => o != null && Math.abs(o - T.o2) <= S.o2_window;
const cabinMatches = (t, T) => oxygenMatches(t.o, T) && hasPressure(t) && Math.abs(t.p / T.p - 1) <= S.p_window;
const saffireReport = "https://ntrs.nasa.gov/citations/20250002675";
const saffireResults = "https://ntrs.nasa.gov/citations/20240007488";
const sofieReport = "https://doi.org/10.1016/j.combustflame.2025.114244";
const saffireEvents = D.external_saffire6?.runs || [];
const saffireConditions = r => `${r.material}, ${r.oxygen_percent.toFixed(1)}% O₂${r.pressure_kpa == null ? ", pressure unreported" : " at " + r.pressure_kpa + " kPa"}`;
const saffireMatches = (r, T) => r.pressure_kpa != null && oxygenMatches(r.oxygen_percent, T) && Math.abs(r.pressure_kpa / 101.325 / T.p - 1) <= S.p_window;
const pBucket = p => p < 1.5 ? Math.round(p * 20) / 20 : Math.round(p * 2) / 2;
function axisLimit(t) {
  if (t.o < X0) return `below ${X0}% ambient oxygen`;
  if (t.o > X1) return `above ${X1}% ambient oxygen`;
  if (hasPressure(t) && t.p < Y0) return `below ${Y0} atm`;
  if (hasPressure(t) && t.p > Y1) return `above ${Y1} atm`;
  return "";
}
function groupRuns(tests) {
  const m = new Map();
  for (const t of tests) {
    const recorded = hasPressure(t), off = axisLimit(t);
    const key = [t.k, Math.round(t.o), recorded ? pBucket(t.p) : "", off].join("|");
    if (!m.has(key)) m.set(key, { k: t.k, off, recorded, runs: [], inv: {}, out: {} });
    const g = m.get(key);
    g.runs.push(t); g.inv[t.a] = (g.inv[t.a] || 0) + 1; g.out[t.r] = (g.out[t.r] || 0) + 1;
  }
  return [...m.values()].map(g => {
    const os = g.runs.map(t => t.o), ps = g.runs.map(t => t.p), n = os.length;
    return Object.assign(g, { n, o: os.reduce((a, b) => a + b, 0) / n,
      p: g.recorded ? Math.exp(ps.reduce((a, b) => a + Math.log(b), 0) / n) : null,
      oxygen: [Math.min(...os), Math.max(...os)], pressure: g.recorded ? [Math.min(...ps), Math.max(...ps)] : null });
  });
}
const groups = groupRuns(D.tests.filter(t => t.o != null));
const stripKinds = KINDS.filter(k => groups.some(g => g.k === k && !g.recorded));
const breStrip = [...new Set(D.conditions.filter(c => c.i === "PSI-20").flatMap(c => c.o))].sort((a, b) => a - b).map(o => ({
  o, days: new Set(D.conditions.filter(c => c.i === "PSI-20" && c.o.includes(o)).map(c => c.day)).size
}));
const numText = x => Number(x.toPrecision(6)).toString();
const rangeText = ([lo, hi]) => lo === hi ? numText(lo) : `${numText(lo)}–${numText(hi)}`;

/* ---------- coverage of a cabin atmosphere ---------- */
function coverage(T) {
  const out = {};
  KINDS.forEach(k => {
    const all = D.tests.filter(t => t.k === k && t.o != null);
    const win = all.filter(t => cabinMatches(t, T));
    const o2only = all.filter(t => !hasPressure(t) && oxygenMatches(t.o, T));
    let best = null;
    const measured = all.filter(hasPressure), candidates = measured.length ? measured : all;
    candidates.forEach(t => {
      const dp = hasPressure(t) ? Math.log(t.p / T.p) / Math.log(1 + S.p_window) : 0;
      const d = Math.hypot((t.o - T.o2) / S.o2_window, dp);
      if (!best || d < best.d) best = { d, t };
    });
    let near = null;
    if (best) {
      const same = candidates.filter(t => t.o === best.t.o && t.p === best.t.p);
      near = { n: same.length, o: best.t.o, p: hasPressure(best.t) ? best.t.p : null, accs: [...new Set(same.map(t => t.a))] };
    }
    const res = {};
    win.forEach(t => { res[t.r] = (res[t.r] || 0) + 1; });
    const n = win.length, status = n >= 10 ? "ok" : n ? "thin" : "none";
    out[k] = { n, win, o2only, near, res, status };
  });
  return out;
}
const STATUS = { none: ["✕", "No matches"], thin: ["!", "1–9 matching runs"], ok: ["✓", "10 or more matching runs"] };
function nearText(c) {
  const n = c.near; if (!n) return "No run lists ambient oxygen.";
  return `Closest ${n.p == null ? "by oxygen" : "measured conditions"}: ${plural(n.n, "run")} from ${n.accs.join(" and ")} at ${numText(n.o)}% ambient oxygen${n.p == null ? ", pressure unavailable" : " and " + numText(n.p) + " atm"}.`;
}
const oxygenOnlyText = c => c.o2only.length ? `${plural(c.o2only.length, "run")} in the oxygen window with unreported pressure.` : "";

/* ---------- briefing ---------- */
const cabinCoverage = Object.fromEntries(D.atmospheres.map(a => [a.id, coverage(a)]));
const maxCabinRuns = Math.max(1, ...Object.values(cabinCoverage).flatMap(c => KINDS.map(k => c[k].n)));
let briefingCabin = "iss";

function drawCabinCoverage() {
  const cabin = D.atmospheres.find(a => a.id === briefingCabin);
  $(".cabin-switch").querySelectorAll("button").forEach(button => {
    button.setAttribute("aria-pressed", button.dataset.cabin === cabin.id);
  });
  $("#cabin-o2").textContent = f1(cabin.o2) + "%";
  $("#cabin-pressure").textContent = f1(cabin.psia) + " psia";
  const evidenceLink = $("#cabin-evidence");
  evidenceLink.href = "?cabin=" + encodeURIComponent(cabin.id) + "#evidence";
  evidenceLink.setAttribute("aria-label", "Open evidence map for " + cabin.name);
  KINDS.forEach(k => {
    const row = $("#cabin-row-" + k), count = cabinCoverage[cabin.id][k].n;
    $(".cabin-count", row).textContent = count;
    $(".cabin-track i", row).style.transform = "scaleX(" + count / maxCabinRuns + ")";
  });
  const partial = KINDS.filter(k => cabinCoverage[cabin.id][k].o2only.length)
    .map(k => plural(cabinCoverage[cabin.id][k].o2only.length, KIND[k].one + " run"));
  $("#cabin-partial").textContent = partial.length ? `${partial.join(" and ")} match on oxygen alone. Their tables omit pressure.` : "";
}

function setupCabinCoverage() {
  $("#cabin-chart").innerHTML = KINDS.map(k =>
    `<div class="cabin-row" id="cabin-row-${k}"><span class="cabin-fuel">${KIND[k].label}</span>
      <span class="cabin-track" aria-hidden="true"><i style="background:${KIND[k].color}"></i></span><b class="cabin-count"></b></div>`
  ).join("");
  $("#matrix1").innerHTML = `<thead><tr><th scope="col">Fuel</th>${D.atmospheres.map(a =>
    `<th scope="col">${esc(a.name)}<small>${f1(a.o2)}% O₂ · ${f1(a.psia)} psia</small></th>`
  ).join("")}</tr></thead><tbody>${KINDS.map(k =>
    `<tr><th scope="row">${KIND[k].label}</th>${D.atmospheres.map(a => {
      const cell = cabinCoverage[a.id][k];
      return `<td><b>${cell.n}</b><small>${cell.o2only.length ? cell.o2only.length + " oxygen-only" : STATUS[cell.status][1]}</small></td>`;
    }).join("")}</tr>`
  ).join("")}</tbody>`;
  $("#matrixnote").textContent = `A run counts when its ambient oxygen is within ±${S.o2_window} percentage points and its recorded pressure is within ±${Math.round(S.p_window * 100)}% of the selected cabin. Oxygen-only counts are listed separately wherever pressure is missing.`;
  $(".cabin-switch").addEventListener("click", event => {
    const button = event.target.closest("button[data-cabin]");
    if (!button || button.dataset.cabin === briefingCabin) return;
    briefingCabin = button.dataset.cabin;
    drawCabinCoverage();
  });
  $("#cabin-evidence").addEventListener("click", event => {
    if (event.currentTarget.search === location.search && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      state.atm = briefingCabin;
    }
  });
  drawCabinCoverage();
}
setupCabinCoverage();

function score(f) { const w = state.weights, tot = Object.keys(w).reduce((a, k) => a + w[k], 0) || 1; return Object.keys(w).reduce((a, k) => a + w[k] * f.scores[k], 0) / tot / 5 * 100; }
const ranked = () => D.findings.filter(f => (!state.tag || f.tags.includes(state.tag)) && (state.fpillar === "all" || f.pillar === state.fpillar)).map(f => ({ f, s: score(f) })).sort((a, b) => b.s - a.s);
function drawBrief() {
  const index = [
    [S.combustion, "investigations", "archive"],
    [S.tests, "flight test runs", "evidence"],
    [D.findings.length, "ranked findings", "findings"]
  ];
  $("#overview-metrics").innerHTML = index.map(([count, label, route]) =>
    `<a href="#${route}" data-go="${route}"><b>${count}</b> ${label}</a>`
  ).join("");
  const moon = D.challenge.moon_air;
  const min = f1(S.moon_o2_min), pressure = f1(S.moon_psia_max);
  $("#thesis").textContent = `The PSI archive contains ${S.solid_with_o2} solid-fuel flight runs with a reported ambient oxygen level. ${S.moon_o2_min > S.solid_o2_max ? "The proposed lunar cabin starts above the highest value in those records." : "The table compares that range with the proposed lunar cabin."}`;
  $("#gapfig").innerHTML = `<table class="oxygen-table"><caption>Oxygen by volume</caption>
    <thead><tr><th scope="col">Condition</th><th scope="col">Oxygen</th></tr></thead>
    <tbody><tr><th scope="row">Solid-fuel runs in NASA PSI</th><td>${f1(S.solid_o2_min)}–${f1(S.solid_o2_max)}%</td></tr>
    <tr><th scope="row">Proposed lunar cabin <small>At or below ${pressure} psia</small></th><td>≥${min}%</td></tr></tbody></table>
    <p class="source-line">Sources <a href="${esc(D.meta.source_url)}" target="_blank" rel="noopener">NASA PSI</a>
    <span> / </span><a href="${esc(moon.url)}" target="_blank" rel="noopener">Lunar cabin specification</a></p>`;
  const external = saffireEvents.filter(r => r.outcome === "burn" && saffireMatches(r, EXP));
  $("#archive-limit").innerHTML = `Outside these PSI tables, Saffire-VI reported ${plural(external.length, "burn")} within the exploration window: ${esc(external.map(saffireConditions).join("; "))}. <a href="${saffireReport}" target="_blank" rel="noopener">NASA flight report, Table 1</a> · <a href="${saffireResults}" target="_blank" rel="noopener">Saffire-VI results</a>. SoFIE-GEL also tested PMMA spheres on the ISS at oxygen levels up to ${D.external_sofie.oxygen_max_percent}%. Its published ranges do not pair each oxygen level with a pressure. <a href="${sofieReport}" target="_blank" rel="noopener">SoFIE-GEL flight study</a>.`;
  $("#o2ctx").innerHTML = `<table class="breakdown-table"><caption>Number of flight runs meeting each condition</caption>
    <thead><tr><th scope="col">Fuel</th><th scope="col">O₂ ≥${min}%</th><th scope="col">O₂ ≥${min}% and ≤${pressure} psia</th></tr></thead>
    <tbody>${KINDS.map(k => `<tr><th scope="row">${KIND[k].label}</th><td>${S.hi_o2[k]}</td><td>${S.moon_range[k]}</td></tr>`).join("")}</tbody></table>
    <p>${S.moon_range.gas ? `The ${S.moon_range.gas} gas-flame runs meeting both conditions come from ${esc([...new Set(D.tests.filter(t => t.k === "gas" && t.o >= S.moon_o2_min && hasPressure(t) && t.p * PSIA <= S.moon_psia_max).map(t => t.a))].join(", "))}.` : "No gas-flame run meets both conditions."} <a href="#evidence" data-go="evidence">Explore the evidence map</a></p>`;
  const top = ranked().slice(0, 5);
  $("#toplist").innerHTML = top.map((x, i) => `<a href="#findings" data-go="findings" data-f="${x.f.id}"><span class="r">${pad2(i + 1)}</span><h3>${esc(x.f.title)}</h3><span class="sc">${Math.round(x.s)}/100</span><p>${esc(x.f.claim)}</p></a>`).join("");
  $("#todo").innerHTML = top.map(x => `<li>${esc(x.f.action)}<span>${esc(x.f.title)}</span></li>`).join("");
  $("#nextgrid").innerHTML = D.next.map(n => `<div class="hcard"><span class="lab">${esc(n.full)}</span><h3>${esc(n.name)}</h3><p>${esc(n.what)}</p><a href="${esc(n.url)}" target="_blank" rel="noopener">${/nasa\.gov/.test(n.url) ? "NASA Glenn page" : "Challenge statement"}</a></div>`).join("");
}

/* ---------- evidence map ---------- */
function chips() {
  const ac = $("#atmchips"); ac.querySelectorAll("button").forEach(b => b.remove());
  [...D.atmospheres, { id: "custom", name: "Custom" }].forEach(a => {
    const b = document.createElement("button"); b.className = "chip"; b.setAttribute("aria-pressed", state.atm === a.id);
    b.textContent = a.id === "custom" ? `Custom · ${f1(state.custom.o2)} %, ${f1(state.custom.p * PSIA)} psia` : `${a.name} · ${f1(a.o2)} %`;
    b.onclick = () => { state.atm = a.id; drawEvidence(); }; ac.appendChild(b);
  });
  const kc = $("#kindchips"); kc.querySelectorAll("button").forEach(b => b.remove());
  KINDS.forEach(k => {
    const b = document.createElement("button"); b.className = "chip"; b.setAttribute("aria-pressed", state.kinds[k]);
    b.innerHTML = `<i class="sw" style="background:${KIND[k].color}"></i>${KIND[k].label}`; b.onclick = () => { state.kinds[k] = !state.kinds[k]; drawEvidence(); }; kc.appendChild(b);
  });
}
let hit = [];
function drawMap() {
  const box = $("#chart"), W = Math.max(240, box.clientWidth), small = W < 620;
  const m = { l: small ? 42 : 60, r: small ? 12 : 22, t: small ? 55 : 26 };
  const mainH = small ? 290 : 380, rowH = 54, gap = small ? 76 : 55;
  const stripY = m.t + mainH + gap, stripCount = stripKinds.length + 1, stripBottom = stripY + rowH * stripCount, H = stripBottom + 16;
  const x = o => m.l + (o - X0) / (X1 - X0) * (W - m.l - m.r);
  const y = p => m.t + (1 - Math.log(p / Y0) / Math.log(Y1 / Y0)) * mainH;
  const rad = n => 2.6 + (small ? 1.5 : 1.9) * Math.sqrt(n);
  const T = target(); hit = [];
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Flight test runs by oxygen level and pressure" xmlns="http://www.w3.org/2000/svg">`;
  if (small) {
    const selected = `${T.name} · ${f1(T.o2)}% O₂ · ${f1(T.psia)} psia`;
    s += `<desc>Selected cabin: ${esc(selected)}. The lower rows show runs with unreported pressure and the approximate oxygen settings listed on BRE test days.</desc>
      <text x="6" y="15" fill="var(--red)" font-size="13" font-weight="600">${esc(selected)}</text>`;
  }
  for (let o = X0; o <= X1; o += 5) s += `<line x1="${x(o)}" x2="${x(o)}" y1="${m.t}" y2="${m.t + mainH}" stroke="var(--rule)"/><text x="${x(o)}" y="${m.t + mainH + 16}" text-anchor="middle" font-size="11" font-family="var(--mono)">${o}</text>`;
  [0.5, 0.7, 1, 2, 3, 5].forEach(p => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(p)}" y2="${y(p)}" stroke="var(--rule)"/><text x="${m.l - 7}" y="${y(p) + 4}" text-anchor="end" font-size="11" font-family="var(--mono)">${p}</text>`; });
  s += `<text x="${m.l}" y="${m.t - 12}" font-size="11" fill="var(--ink3)" font-family="var(--mono)">PRESSURE, ATM (LOG SCALE)</text><text x="${W - m.r}" y="${m.t + mainH + 32}" text-anchor="end" font-size="11" font-family="var(--mono)">OXYGEN, % BY VOLUME</text>`;
  const mp = S.moon_psia_max / PSIA;
  s += `<rect x="${x(S.moon_o2_min)}" y="${y(mp)}" width="${x(X1) - x(S.moon_o2_min)}" height="${y(Y0) - y(mp)}" fill="var(--red)" fill-opacity=".05" stroke="var(--red)" stroke-opacity=".7" stroke-dasharray="4 4"/>`;
  s += `<text x="${x(X1) - 6}" y="${y(Y0) - 7}" text-anchor="end" font-size="11" fill="var(--red)" font-family="var(--mono)">${small ? "MOON RANGE" : `MOON BASE RANGE: ${f1(S.moon_o2_min)} % OR MORE, ${f1(S.moon_psia_max)} PSI OR LESS`}</text>`;
  const wx0 = Math.max(X0, T.o2 - S.o2_window), wx1 = Math.min(X1, T.o2 + S.o2_window), wy0 = Math.min(Y1, T.p * (1 + S.p_window)), wy1 = Math.max(Y0, T.p * (1 - S.p_window));
  s += `<rect x="${x(wx0)}" y="${y(wy0)}" width="${x(wx1) - x(wx0)}" height="${y(wy1) - y(wy0)}" fill="var(--red)" fill-opacity=".08" stroke="var(--red)" stroke-width="1.5"/>`;
  s += `<line x1="${x(T.o2)}" x2="${x(T.o2)}" y1="${y(wy1)}" y2="${small ? m.t + mainH : stripBottom}" stroke="var(--red)" stroke-width="1" stroke-opacity=".6"/>`;
  if (small) s += `<line x1="${x(T.o2)}" x2="${x(T.o2)}" y1="${stripY}" y2="${stripBottom}" stroke="var(--red)" stroke-opacity=".6"/>`;
  [...stripKinds.map(k => [KIND[k].label, "runs"]), ["BRE test days", "approximate chamber oxygen settings"]].forEach((r, i) => {
    const cy = stripY + rowH * i + rowH / 2;
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${cy}" y2="${cy}" stroke="var(--rule)"/>`;
    s += `<text x="${m.l}" y="${cy - rowH / 2 + 9}" font-size="11.5" font-weight="700" fill="var(--ink)">${r[0]}<tspan font-weight="400" fill="var(--ink3)">  ${small ? "" : r[1]}</tspan></text>`;
  });
  s += `<text x="${m.l}" y="${stripY - 12}" font-size="11" fill="var(--ink3)" font-family="var(--mono)">OXYGEN ONLY · PRESSURE UNRECORDED</text>`;
  const marks = [];
  groups.filter(g => state.kinds[g.k] && !g.off).forEach(g => {
    const cy = g.recorded ? y(g.p) : stripY + rowH * (stripKinds.indexOf(g.k) + 0.5) + 4;
    marks.push({ cx: x(g.o), cy, r: rad(g.n), g, hollow: !g.recorded });
  });
  if (state.kinds.gas) breStrip.filter(b => b.o >= X0 && b.o <= X1).forEach(b => {
    marks.push({ cx: x(b.o), cy: stripY + rowH * (stripKinds.length + 0.5) + 4, r: 6, g: { k: "gas", bre: b } });
  });
  marks.sort((a, b) => b.r - a.r).forEach(mk => {
    const c = KIND[mk.g.k].color, i = hit.push(mk) - 1;
    const attrs = `class="bub" data-i="${i}" tabindex="0" aria-label="${esc(tipHtml(mk).replace(/<br>/g, ". ").replace(/<[^>]+>/g, ""))}"`;
    s += mk.g.bre ? `<rect ${attrs} x="-4.5" y="-4.5" width="9" height="9" transform="translate(${mk.cx} ${mk.cy}) rotate(45)" fill="${c}"/>`
      : `<circle ${attrs} cx="${mk.cx.toFixed(1)}" cy="${mk.cy.toFixed(1)}" r="${mk.r.toFixed(1)}" fill="${c}" fill-opacity="${mk.hollow ? 0.28 : 0.82}" stroke="${mk.hollow ? c : "var(--bg)"}" stroke-width="1.5"/>`;
  });
  const list = state.atm === "custom" ? [...D.atmospheres, T] : D.atmospheres;
  list.forEach(a => {
    const on = a.id === T.id, cx = x(a.o2), cy = y(a.p), col = on ? "var(--red)" : "var(--ink)";
    s += `<g pointer-events="none"><rect x="${cx - (on ? 5 : 4)}" y="${cy - (on ? 5 : 4)}" width="${on ? 10 : 8}" height="${on ? 10 : 8}" fill="var(--bg)" stroke="${col}" stroke-width="${on ? 2 : 1.4}"/><line x1="${cx - 12}" x2="${cx + 12}" y1="${cy}" y2="${cy}" stroke="${col}" stroke-width="${on ? 1.6 : 1}"/><line x1="${cx}" x2="${cx}" y1="${cy - 12}" y2="${cy + 12}" stroke="${col}" stroke-width="${on ? 1.6 : 1}"/>`;
    if (!small) { const lab = on ? `${a.name}: ${f1(a.o2)} %, ${f1(a.psia)} psia` : a.short; const right = cx + 16 + lab.length * 6.6 > W - m.r;
      s += `<text x="${right ? cx - 15 : cx + 15}" y="${on ? y(a.p * (1 + S.p_window)) - 8 : cy - 13}" text-anchor="${right ? "end" : "start"}" font-size="${on ? 12.5 : 11.5}" font-weight="${on ? 700 : 400}" fill="${on ? "var(--red)" : "var(--ink)"}" stroke="var(--bg)" stroke-width="3.5" paint-order="stroke">${esc(lab)}</text>`; }
    s += "</g>";
  });
  box.innerHTML = s + "</svg>";
  $("#legend").innerHTML = KINDS.map(k => `<span><i style="background:${KIND[k].color}"></i>${KIND[k].label}</span>`).join("") +
    `<span><svg width="46" height="20" aria-hidden="true"><circle cx="7" cy="10" r="${rad(1)}" fill="var(--ink3)"/><circle cx="30" cy="10" r="${rad(10)}" fill="var(--ink3)"/></svg>1 run and 10 runs</span>` +
    `<span><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="var(--ink3)" fill-opacity=".28" stroke="var(--ink3)" stroke-width="1.5"/></svg>runs with oxygen only</span>` +
    `<span><svg width="18" height="18" aria-hidden="true"><path d="M9 3l6 6-6 6-6-6z" fill="var(--s3)"/></svg>oxygen setting listed by BRE test day</span>` +
    `<span><svg width="20" height="18" aria-hidden="true"><rect x="6" y="5" width="8" height="8" fill="none" stroke="var(--red)" stroke-width="1.5"/><line x1="0" x2="20" y1="9" y2="9" stroke="var(--red)"/><line x1="10" x2="10" y1="0" y2="18" stroke="var(--red)"/></svg>selected cabin and its window</span>` +
    `<span><svg width="20" height="18" aria-hidden="true"><rect x="2" y="3" width="16" height="12" fill="var(--red)" fill-opacity=".05" stroke="var(--red)" stroke-dasharray="3 3"/></svg>Moon base range in the challenge statement</span>`;
  const shown = D.tests.filter(t => state.kinds[t.k]), limits = new Map();
  for (const t of shown.filter(t => t.o != null)) {
    const label = axisLimit(t);
    if (label) limits.set(label, (limits.get(label) || 0) + 1);
  }
  const notes = [...limits].map(([label, n]) => `The table includes ${plural(n, "run")} ${label}, outside the plot.`);
  const inverse = shown.filter(t => t.o == null && t.burner_o2 != null);
  if (inverse.length) notes.push(`${plural(inverse.length, "inverse-flame run")} report burner oxidizer oxygen (up to ${Math.max(...inverse.map(t => t.burner_o2))}%). They remain in the all-runs CSV and have no ambient oxygen coordinate.`);
  const missing = shown.filter(t => t.o == null && t.burner_o2 == null);
  if (missing.length) notes.push(`${plural(missing.length, "additional run")} with unreported ambient oxygen remain in the CSV.`);
  if (state.kinds.gas) notes.push("Each BRE diamond marks a setting listed on one or more test days. A day can appear at several settings.");
  $("#mapnote").textContent = notes.join(" ");
  drawMapTable();
}
function tipHtml(mk) {
  const g = mk.g;
  if (g.bre) return `<b>ACME BRE · about ${g.bre.o}% chamber oxygen</b><br>Setting listed on ${plural(g.bre.days, "test day")}.<br><span class="t2">A gas burner emulated solid fuels. Chamber pressure varied and the daily table omits its values.</span>`;
  const invs = Object.keys(g.inv).map(a => `${esc(a)} ${g.inv[a]}`).join(", ");
  return `<b>${plural(g.n, "run")} · ${KIND[g.k].label}</b><br>${rangeText(g.oxygen)}% ambient oxygen, ${g.recorded ? rangeText(g.pressure) + " atm" : "pressure unreported"}<br><span class="t2">${invs}</span><br>${groupOutcomes(g)}`;
}
function groupOutcomes(g) {
  const labels = { ext: "Self-extinguished", burn: "Burned", noign: "Did not ignite", nospread: "No flame spread", nohot: "No hot ignition", cool: "Direct cool ignition", other: "Other outcome", na: "Outcome unreported" };
  return Object.entries(g.out).map(([code, n]) => `${esc(labels[code] || code)}: ${n}`).join(" · ");
}
function showTip(el, ev) {
  const mk = hit[+el.dataset.i]; if (!mk) return; const tip = $("#tip"); tip.innerHTML = tipHtml(mk); tip.hidden = false;
  const r = el.getBoundingClientRect(), px = ev && ev.clientX != null ? ev.clientX : r.left + r.width / 2, py = ev && ev.clientY != null ? ev.clientY : r.top;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = Math.min(window.innerWidth - tw - 8, Math.max(8, px + 14)) + "px";
  tip.style.top = Math.max(8, py - th - 12 < 8 ? py + 18 : py - th - 12) + "px";
}
function drawMapTable() {
  const rows = groups.filter(g => state.kinds[g.k]).sort((a, b) => a.k.localeCompare(b.k) || a.o - b.o || a.p - b.p);
  const runRows = rows.map(g => `<tr><td><i class="kdot" style="background:${KIND[g.k].color}"></i>${KIND[g.k].label}</td><td class="n">${rangeText(g.oxygen)}</td><td class="n">${g.recorded ? rangeText(g.pressure) : "Unreported"}</td><td>${plural(g.n, "run")}</td><td>${esc(Object.keys(g.inv).join(", "))}</td><td>${groupOutcomes(g)}</td><td>${g.off ? "Off scale · " + g.off : g.recorded ? "Main plot" : "Oxygen strip"}</td></tr>`).join("");
  const breRows = state.kinds.gas ? breStrip.map(b => `<tr><td>Gas burner</td><td class="n">≈${b.o}</td><td>Unreported</td><td>${plural(b.days, "test day")}</td><td>ACME BRE</td><td>Daily settings only</td><td>${b.o >= X0 && b.o <= X1 ? "BRE strip" : "Off scale"}</td></tr>`).join("") : "";
  $("#maptable").innerHTML = `<table><caption>Conditions within each plotted group and groups outside the axes</caption><thead><tr><th>Fuel</th><th>Ambient O₂ (%)</th><th>Pressure (atm)</th><th>Count and unit</th><th>Investigations</th><th>Outcomes</th><th>Map position</th></tr></thead><tbody>` + runRows + breRows + "</tbody></table>";
  $("#maptable").hidden = !state.table; $("#chart").hidden = state.table; $("#legend").hidden = state.table;
  $("#viewbtn").setAttribute("aria-pressed", state.table); $("#viewbtn").textContent = state.table ? "Chart view" : "Table view";
}
function drawWindow() {
  const T = target(), C = coverage(T);
  $("#matrix2").style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
  $("#matrix2").innerHTML = KINDS.map(k => `<div class="h"><i class="kdot" style="background:${KIND[k].color}"></i>${KIND[k].label}</div>`).join("") +
    KINDS.map(k => { const c = C[k]; return `<div class="c ${c.status}"><b>${c.n}</b><span>${STATUS[c.status][1]}. ${esc(oxygenOnlyText(c))} ${c.n ? groupOutcomes({ out: c.res }) + "." : esc(nearText(c))}</span></div>`; }).join("");
}
function drawEvidence() {
  chips(); drawMap(); drawWindow();
  const T = target(), inside = D.tests.filter(t => state.kinds[t.k] && cabinMatches(t, T));
  $("#dlwin").textContent = `Runs inside the window (${inside.length}), CSV`; $("#dlwin").disabled = !inside.length;
  $("#dlwin").onclick = () => download("quench-runs-window.csv", runsCsv(inside));
}

/* ---------- findings ---------- */
function drawWeights() {
  $("#weights").innerHTML = Object.keys(DIM).map(k => `<label class="field" for="w_${k}"><span>${DIM[k]} <output id="wv_${k}">${state.weights[k]}</output></span><input id="w_${k}" type="range" min="0" max="50" step="5" value="${state.weights[k]}"></label>`).join("");
  Object.keys(DIM).forEach(k => { $("#w_" + k).oninput = e => { state.weights[k] = +e.target.value; $("#wv_" + k).textContent = e.target.value; drawFindings(); }; });
  const pc = $("#pillarchips");
  [["all", "All"], ["prevention", "Prevention"], ["detection", "Detection"], ["suppression", "Suppression"]].forEach(([id, label]) => { const b = document.createElement("button"); b.className = "chip"; b.textContent = label; b.dataset.p = id; b.onclick = () => { state.fpillar = id; state.openF = null; drawFindings(); }; pc.appendChild(b); });
  const tags = [...new Set(D.findings.flatMap(f => f.tags))].sort(), tc = $("#tagchips");
  ["all", ...tags].forEach(t => { const b = document.createElement("button"); b.className = "chip"; b.textContent = t; b.dataset.t = t; b.onclick = () => { state.tag = t === "all" ? null : t; drawFindings(); }; tc.appendChild(b); });
}
function drawFindings() {
  document.querySelectorAll("#tagchips .chip").forEach(b => b.setAttribute("aria-pressed", (state.tag || "all") === b.dataset.t));
  document.querySelectorAll("#pillarchips .chip").forEach(b => b.setAttribute("aria-pressed", state.fpillar === b.dataset.p));
  const list = ranked();
  if ((!state.openF || !list.some(x => x.f.id === state.openF)) && list.length) state.openF = list[0].f.id;
  $("#fcount").textContent = list.length === D.findings.length ? "" : `${list.length} of ${D.findings.length} findings shown.`;
  $("#flist").innerHTML = list.map((x, i) => {
    const f = x.f;
    return `<details class="f" id="f-${f.id}" ${state.openF === f.id ? "open" : ""}><summary><span class="r">${pad2(i + 1)}</span><h3>${esc(f.title)}</h3><span class="tagk k">${esc(f.pillar)} · ${esc(f.kind)}</span><span class="sc">${Math.round(x.s)}</span></summary>
      <div class="body"><div><p>${esc(f.claim)}</p>${f.quote ? `<blockquote>“${esc(f.quote)}”<cite>${f.quote_url ? `<a href="${esc(f.quote_url)}" target="_blank" rel="noopener">${esc(f.quote_src)}</a>` : "NASA, " + esc(f.quote_src)}</cite></blockquote>` : ""}
      <dl><dt>Evidence</dt><dd>${esc(f.evidence)}</dd><dt>Limits</dt><dd>${esc(f.limits)}</dd><dt>What to do</dt><dd class="act">${esc(f.action)}</dd>
      <dt>Sources</dt><dd>${f.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} (${esc(s.acc)})</a>`).join(", ")}${f.next.length ? ` · open question for ${f.next.map(n => esc(D.next.find(z => z.id === n).name)).join(", ")}` : ""}</dd>
      <dt>Topics</dt><dd>${f.tags.map(t => `<span class="tagk">${esc(t)}</span>`).join(" ")}</dd></dl></div>
      <div class="scores">${Object.keys(DIM).map(k => `<div><span>${DIM[k]}</span><b>${f.scores[k]}</b><span class="track"><i style="width:${f.scores[k] * 20}%"></i></span></div>`).join("")}</div></div></details>`;
  }).join("");
}

/* ---------- lessons ---------- */
function drawHistory() {
  const box = $("#o2hist"), W = Math.max(300, box.clientWidth - 28), H = 120, l = 8, r = 16;
  const x = o => l + o / 100 * (W - l - r);
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<line x1="${x(0)}" x2="${x(100)}" y1="70" y2="70" stroke="var(--strong)"/>`;
  for (let o = 0; o <= 100; o += 20) s += `<line x1="${x(o)}" x2="${x(o)}" y1="70" y2="75" stroke="var(--strong)"/><text x="${x(o)}" y="88" text-anchor="middle" font-size="11" fill="var(--ink3)" font-family="var(--mono)">${o}</text>`;
  s += `<text x="${x(100)}" y="106" text-anchor="end" font-size="11" fill="var(--ink3)" font-family="var(--mono)">OXYGEN IN THE CABIN, % BY VOLUME</text>`;
  s += `<rect x="${x(S.solid_o2_min)}" y="60" width="${x(S.solid_o2_max) - x(S.solid_o2_min)}" height="10" fill="var(--s1)"/><text x="${x(S.solid_o2_min)}" y="52" font-size="12" font-weight="700" fill="var(--ink)">Solid runs in the PSI tables</text>`;
  [{ o2: 34, lab: "Exploration 34 %", y: 20, hot: true }, { o2: 60, lab: "Apollo prelaunch 60 %", y: 36 }, { o2: 100, lab: "Apollo 1 and Apollo flight 100 %", y: 20, end: true }].forEach(mk => {
    s += `<line x1="${x(mk.o2)}" x2="${x(mk.o2)}" y1="${mk.y + 4}" y2="70" stroke="${mk.hot ? "var(--red)" : "var(--ink3)"}" stroke-width="${mk.hot ? 2 : 1.2}"/><rect x="${x(mk.o2) - 4}" y="66" width="8" height="8" fill="${mk.hot ? "var(--red)" : "var(--bg)"}" stroke="${mk.hot ? "var(--red)" : "var(--ink2)"}" stroke-width="1.5"/>`;
    if (W > 520 || mk.hot || mk.end) s += `<text x="${x(mk.o2) + (mk.end ? -6 : 6)}" y="${mk.y}" text-anchor="${mk.end ? "end" : "start"}" font-size="11.5" ${mk.hot ? 'font-weight="700" fill="var(--red)"' : 'fill="var(--ink2)"'}>${mk.lab}</text>`; });
  box.innerHTML = s + "</svg>";
  const fl = id => { const f = D.findings.find(z => z.id === id); return f ? `<a href="#findings" data-go="findings" data-f="${id}">${esc(f.title)}</a>` : ""; };
  $("#hcards").innerHTML = D.history.map(h => `<article class="hcard"><span class="lab">${esc(h.date)}</span><h3>${esc(h.name)}</h3>${h.atmosphere ? `<span class="atm">${esc(h.atmosphere.label)}</span>` : ""}<p>${esc(h.what)}</p>
    ${h.quotes.slice(0, 1).map(q => `<blockquote>“${esc(q.text)}”<cite><a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.src)}</a></cite></blockquote>`).join("")}
    <p><b>What changed:</b> ${esc(h.changed)}</p><p class="today">${esc(h.today)}</p><p class="fine">Related: ${h.findings.map(fl).filter(Boolean).join("; ")}</p></article>`).join("");
  $("#earthq").innerHTML = `<blockquote>“${esc(D.challenge.earth.text)}”<cite><a href="${esc(D.challenge.earth.url)}" target="_blank" rel="noopener">Flame in Freefall challenge statement</a></cite></blockquote><p class="fine">In this archive the link to Earth runs through the same three questions: which materials burn (BASS, BASS-II, Saffire), how smoke is detected (SAME, SAME-R) and what puts a flame out (FLEX).</p>`;
  $("#spin").innerHTML = D.spinoffs.map(sp => `<div class="hcard"><span class="lab">${sp.year}</span><h3>${esc(sp.name)}</h3><p>${esc(sp.what)}</p><blockquote>“${esc(sp.quote)}”<cite><a href="${esc(sp.url)}" target="_blank" rel="noopener">${esc(sp.src_title)}</a></cite></blockquote></div>`).join("");
}

/* ---------- links to records ---------- */
function refLink(id) {
  if (/^PSI-\d+$/.test(id) && inv(id)) return `<a href="${inv(id).url}" target="_blank" rel="noopener">${id}</a>`;
  if (id.startsWith("F-")) return `<a href="#findings" data-go="findings" data-f="${esc(id.slice(2))}">${esc(id)}</a>`;
  if (id.startsWith("H-") || id.startsWith("S-")) return `<a href="#lessons" data-go="lessons">${esc(id)}</a>`;
  if (id.startsWith("N-")) { const n = D.next.find(z => z.id === id.slice(2)); return n ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.name)}</a>` : esc(id); }
  if (id.startsWith("M-")) return `<a href="#mission" data-go="mission">${esc(id)}</a>`;
  if (id === "VIDEO" || id === "MODEL") return `<a href="#lab" data-go="lab">${id}</a>`;
  if (id === "GUIDE") return `<a href="${esc(D.quotes.not_conservative.url)}" target="_blank" rel="noopener">NASA guide</a>`;
  if (id === "SAFFIRE6") return `<a href="${saffireReport}" target="_blank" rel="noopener">Saffire-VI flight events</a> · <a href="${saffireResults}" target="_blank" rel="noopener">Saffire-VI results</a>`;
  if (id === "SOFIEGEL") return `<a href="${sofieReport}" target="_blank" rel="noopener">SoFIE-GEL flight study</a>`;
  return `<a href="#method" data-go="method">${esc(id)}</a>`;
}
