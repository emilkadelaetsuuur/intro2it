/* QUENCH core: data helpers, briefing, evidence map, findings, archive, lessons, method, navigation.
   Everything is computed in the browser from data.js. No network calls. */
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
  weights: { safety: 30, evidence: 25, mission: 25, action: 20 }, tag: null, invq: "", invkind: "all", open: null, openF: null, view: "brief" };
const EXP = D.atmospheres[2];
const inv = acc => D.investigations.find(i => i.acc === acc);
function target() {
  if (state.atm === "custom") return { id: "custom", name: "Custom cabin", short: "Custom", o2: state.custom.o2, p: state.custom.p, psia: state.custom.p * PSIA };
  return D.atmospheres.find(a => a.id === state.atm);
}

/* ---------- grouping of runs with identical conditions ---------- */
const pBucket = p => p < 1.5 ? Math.round(p * 20) / 20 : Math.round(p * 2) / 2;
function groupBy(tests, keyFn) {
  const m = new Map();
  for (const t of tests) {
    const key = keyFn(t); let g = m.get(key);
    if (!g) { g = { k: t.k, n: 0, so: 0, slp: 0, inv: {}, out: { ext: 0, burn: 0, other: 0, noign: 0, na: 0 } }; m.set(key, g); }
    g.n++; g.so += t.o; g.slp += Math.log(t.p || 1); g.inv[t.a] = (g.inv[t.a] || 0) + 1; g.out[t.r]++;
  }
  return [...m.values()].map(g => Object.assign(g, { o: g.so / g.n, p: Math.exp(g.slp / g.n) }));
}
const recorded = D.tests.filter(t => t.o != null && t.p != null && t.ps === "recorded");
const groups = groupBy(recorded, t => t.k + "|" + Math.round(t.o) + "|" + pBucket(t.p));
const solidStrip = groupBy(D.tests.filter(t => t.k === "solid" && t.o != null), t => Math.round(t.o));
const breStrip = (() => { const m = {}; for (const c of D.conditions) if (c.i === "PSI-20") for (const o of c.o) { (m[o] = m[o] || { o, days: 0 }).days++; } return Object.values(m); })();
const X0 = 10, X1 = 45;
const offscale = recorded.filter(t => t.o > X1);

/* ---------- coverage of a cabin atmosphere ---------- */
function coverage(T) {
  const out = {};
  KINDS.forEach(k => {
    const all = D.tests.filter(t => t.k === k && t.o != null);
    const win = all.filter(t => t.ps === "recorded" && t.p != null && Math.abs(t.o - T.o2) <= S.o2_window && Math.abs(t.p / T.p - 1) <= S.p_window);
    const o2only = all.filter(t => t.ps !== "recorded" && Math.abs(t.o - T.o2) <= S.o2_window);
    let best = null;
    all.forEach(t => { const p = t.p || 1, d = Math.hypot((t.o - T.o2) / S.o2_window, Math.log(p / T.p) / Math.log(1 + S.p_window)); if (!best || d < best.d) best = { d, t, p }; });
    let near = null;
    if (best) { const same = all.filter(t => Math.round(t.o) === Math.round(best.t.o) && pBucket(t.p || 1) === pBucket(best.p));
      near = { n: same.length, o: best.t.o, p: best.p, assumed: best.t.ps !== "recorded", accs: [...new Set(same.map(t => t.a))], do: best.t.o - T.o2, dp: (best.p / T.p - 1) * 100 }; }
    const res = { ext: 0, burn: 0, other: 0, noign: 0 }; win.forEach(t => { if (res[t.r] != null) res[t.r]++; });
    const cabin = Math.abs(1 / T.p - 1) <= S.p_window;
    let status, n;
    if (k === "solid") { n = cabin ? o2only.length : 0; status = n >= 10 ? "ok" : (n > 0 || o2only.length) ? "thin" : "none"; }
    else { n = win.length; status = n >= 10 ? "ok" : n > 0 ? "thin" : "none"; }
    out[k] = { n, win, o2only, near, res, status, cabin };
  });
  return out;
}
const STATUS = { none: ["✕", "No flight tests"], thin: ["!", "Thin evidence"], ok: ["✓", "Tested"] };
function nearText(c) {
  const n = c.near; if (!n) return "No runs with an oxygen level on record.";
  const dOx = Math.abs(n.do) < 0.25 ? "the same oxygen level" : `${f1(Math.abs(n.do))} points ${n.do < 0 ? "less" : "more"} oxygen`;
  const dP = n.assumed ? "at cabin pressure, which the table does not record" : Math.abs(n.dp) < 3 ? "at the same pressure" : `at ${Math.abs(Math.round(n.dp))} % ${n.dp > 0 ? "higher" : "lower"} pressure`;
  return `Closest: ${plural(n.n, "run")} from ${n.accs.join(" and ")} at ${f1(n.o)} % oxygen${n.assumed ? "" : " and " + f2(n.p) + " atm"}. That is ${dOx}, ${dP}.`;
}
function matrixHtml(atms) {
  const NM = { iss: "Space station", eva: "Reduced-pressure cabin", exp: "Exploration atmosphere" };
  let h = `<div class="h">What burned</div>` + atms.map(a => `<div class="h">${esc(NM[a.id] || a.name)}<br>${f1(a.psia)} psia · ${f1(a.o2)} %</div>`).join("");
  KINDS.forEach(k => {
    h += `<div class="h"><i class="kdot" style="background:${KIND[k].color}"></i>${KIND[k].label}</div>`;
    atms.forEach(a => { const c = coverage(a)[k]; h += `<div class="c ${c.status}"><b>${c.n}</b><span>${STATUS[c.status][1]}</span></div>`; });
  });
  return h;
}

/* ---------- briefing ---------- */
function score(f) { const w = state.weights, tot = Object.keys(w).reduce((a, k) => a + w[k], 0) || 1; return Object.keys(w).reduce((a, k) => a + w[k] * f.scores[k], 0) / tot / 5 * 100; }
const ranked = () => D.findings.filter(f => !state.tag || f.tags.includes(state.tag)).map(f => ({ f, s: score(f) })).sort((a, b) => b.s - a.s);
function drawGap(box) {
  const W = Math.max(300, box.clientWidth - 28), H = 96, l = 8, r = 8;
  const x = o => l + (o - 10) / 30 * (W - l - r);
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<line x1="${x(10)}" x2="${x(40)}" y1="52" y2="52" stroke="var(--strong)" stroke-width="1"/>`;
  for (let o = 10; o <= 40; o += 5) s += `<line x1="${x(o)}" x2="${x(o)}" y1="52" y2="57" stroke="var(--strong)"/><text x="${x(o)}" y="70" text-anchor="middle" font-size="11" fill="var(--ink3)" font-family="var(--mono)">${o}</text>`;
  s += `<text x="${x(40)}" y="86" text-anchor="end" font-size="11" fill="var(--ink3)" font-family="var(--mono)">OXYGEN, % BY VOLUME</text>`;
  s += `<rect x="${x(S.solid_o2_min)}" y="42" width="${x(S.solid_o2_max) - x(S.solid_o2_min)}" height="10" fill="var(--s1)"/>`;
  s += `<text x="${x(S.solid_o2_min)}" y="34" font-size="12.5" font-weight="700" fill="var(--ink)">Solid materials tested in flight: ${f1(S.solid_o2_min)} to ${f1(S.solid_o2_max)} %</text>`;
  D.atmospheres.forEach((a, i) => {
    const hot = a.id === "exp";
    s += `<line x1="${x(a.o2)}" x2="${x(a.o2)}" y1="${hot ? 10 : 40}" y2="52" stroke="${hot ? "var(--red)" : "var(--ink3)"}" stroke-width="${hot ? 2 : 1.2}"/>`;
    s += `<rect x="${x(a.o2) - 4}" y="48" width="8" height="8" fill="${hot ? "var(--red)" : "var(--bg)"}" stroke="${hot ? "var(--red)" : "var(--ink3)"}" stroke-width="1.5"/>`;
    if (hot) s += `<text x="${x(a.o2) - 8}" y="19" text-anchor="end" font-size="12.5" font-weight="700" fill="var(--red)">Exploration atmosphere: ${f1(a.o2)} %</text>`;
    else if (W > 520 || i === 0) s += `<text x="${x(a.o2) + 6}" y="${i === 0 ? 86 : 44}" font-size="11" fill="var(--ink3)" font-family="var(--mono)">${esc(a.short).toUpperCase()} ${f1(a.o2)} %</text>`;
  });
  box.innerHTML = s + "</svg>";
}
function drawBrief() {
  const cov = coverage(EXP);
  $("#thesis").innerHTML = `NASA plans to send crews to the Moon in cabin air with <b>${f1(EXP.o2)} % oxygen</b>. No solid material has ever been flight-tested above <b>${f1(S.solid_o2_max)} %</b>.`;
  $("#facts").innerHTML = [
    [f1(S.solid_o2_max) + " %", "highest oxygen level at which any solid material was flight-tested", 1],
    [f1(EXP.o2) + " %", `oxygen in the exploration atmosphere, at ${f1(EXP.psia)} psia`, 0],
    [cov.solid.n + cov.droplet.n, "solid or liquid test runs inside that atmosphere", 1],
    [S.tests, `flight test runs read from ${S.combustion} NASA investigations`, 0]
  ].map(a => `<div><b class="${a[2] ? "hot" : ""}">${esc(a[0])}</b><span>${esc(a[1])}</span></div>`).join("");
  $("#briefsub").textContent = `QUENCH reads every combustion investigation in NASA's Physical Sciences Informatics archive, ${S.tests} test runs in all, and answers one question for mission designers: does flight evidence cover the air your crew will breathe? It summarises the archive, ranks what matters, and turns it into a check you can run on any cabin.`;
  drawGap($("#gapfig"));
  const top = ranked().slice(0, 5);
  $("#toplist").innerHTML = top.map((x, i) => `<a href="#findings" data-go="findings" data-f="${x.f.id}"><span class="r">${pad2(i + 1)}</span><h3>${esc(x.f.title)}</h3><span class="sc">${Math.round(x.s)}/100</span><p>${esc(x.f.claim)}</p></a>`).join("");
  $("#matrix1").innerHTML = matrixHtml(D.atmospheres);
  $("#matrixnote").textContent = `A run counts when its oxygen is within ${S.o2_window} points and its pressure within ${Math.round(S.p_window * 100)} % of the cabin. Solid-material tables record no pressure, so they count only for a cabin at station pressure.`;
  $("#todo").innerHTML = top.map(x => `<li>${esc(x.f.action)}<span>${esc(x.f.title)}</span></li>`).join("");
  $("#nextgrid").innerHTML = D.next.map(n => `<div class="hcard"><span class="lab">${esc(n.full)}</span><h3>${esc(n.name)}</h3><p>${esc(n.what)}</p><a href="${esc(n.url)}" target="_blank" rel="noopener">NASA Glenn page</a></div>`).join("");
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
  const box = $("#chart"), W = Math.max(300, box.clientWidth), small = W < 620;
  const m = { l: small ? 42 : 60, r: small ? 12 : 22, t: 26 }, mainH = small ? 290 : 380, rowH = 44, gap = 46;
  const stripY = m.t + mainH + gap, H = stripY + rowH * 2 + 44;
  const x = o => m.l + (o - X0) / (X1 - X0) * (W - m.l - m.r);
  const Y0 = 0.4, Y1 = 6, y = p => m.t + (1 - Math.log(p / Y0) / Math.log(Y1 / Y0)) * mainH;
  const rad = n => 2.6 + (small ? 1.5 : 1.9) * Math.sqrt(n);
  const T = target(); hit = [];
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Flight test runs by oxygen level and pressure" xmlns="http://www.w3.org/2000/svg">`;
  for (let o = X0; o <= X1; o += 5) s += `<line x1="${x(o)}" x2="${x(o)}" y1="${m.t}" y2="${m.t + mainH}" stroke="var(--rule)"/><text x="${x(o)}" y="${m.t + mainH + 16}" text-anchor="middle" font-size="11" font-family="var(--mono)">${o}</text>`;
  [0.5, 0.7, 1, 2, 3, 5].forEach(p => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(p)}" y2="${y(p)}" stroke="var(--rule)"/><text x="${m.l - 7}" y="${y(p) + 4}" text-anchor="end" font-size="11" font-family="var(--mono)">${p}</text>`; });
  s += `<text x="${m.l}" y="14" font-size="11" fill="var(--ink3)" font-family="var(--mono)">PRESSURE, ATM (LOG SCALE)</text><text x="${W - m.r}" y="${m.t + mainH + 32}" text-anchor="end" font-size="11" font-family="var(--mono)">OXYGEN, % BY VOLUME</text>`;
  const wx0 = Math.max(X0, T.o2 - S.o2_window), wx1 = Math.min(X1, T.o2 + S.o2_window), wy0 = T.p * (1 + S.p_window), wy1 = T.p * (1 - S.p_window);
  s += `<rect x="${x(wx0)}" y="${y(wy0)}" width="${x(wx1) - x(wx0)}" height="${y(wy1) - y(wy0)}" fill="var(--red)" fill-opacity=".08" stroke="var(--red)" stroke-width="1.5"/>`;
  s += `<line x1="${x(T.o2)}" x2="${x(T.o2)}" y1="${y(wy1)}" y2="${stripY + rowH * 2}" stroke="var(--red)" stroke-width="1" stroke-opacity=".6"/>`;
  [["Solid materials", "pressure not in table"], ["Gas burner standing in for solids", "ACME BRE, pressure not listed"]].forEach((r, i) => {
    const cy = stripY + rowH * i + rowH / 2;
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${cy}" y2="${cy}" stroke="var(--rule)"/>`;
    s += `<text x="${m.l}" y="${cy - rowH / 2 + 9}" font-size="11.5" font-weight="700" fill="var(--ink)">${r[0]}<tspan font-weight="400" fill="var(--ink3)">  ${small ? "" : r[1]}</tspan></text>`;
  });
  s += `<text x="${m.l}" y="${stripY - 16}" font-size="11" fill="var(--ink3)" font-family="var(--mono)">RUNS WITH AN OXYGEN LEVEL BUT NO PRESSURE IN THE TABLE</text>`;
  const marks = [];
  groups.filter(g => state.kinds[g.k] && g.o <= X1).forEach(g => marks.push({ cx: x(g.o), cy: y(g.p), r: rad(g.n), g, hollow: false }));
  if (state.kinds.solid) solidStrip.forEach(g => marks.push({ cx: x(g.o), cy: stripY + rowH / 2 + 4, r: rad(g.n), g, hollow: true, strip: "solid" }));
  if (state.kinds.gas) breStrip.forEach(b => marks.push({ cx: x(b.o), cy: stripY + rowH * 1.5 + 4, r: rad(b.days * 3), g: { k: "gas", bre: b }, hollow: true, strip: "bre" }));
  marks.sort((a, b) => b.r - a.r).forEach(mk => {
    const c = KIND[mk.g.k].color, i = hit.push(mk) - 1;
    s += `<circle class="bub" data-i="${i}" tabindex="0" cx="${mk.cx.toFixed(1)}" cy="${mk.cy.toFixed(1)}" r="${mk.r.toFixed(1)}" fill="${c}" fill-opacity="${mk.hollow ? 0.28 : 0.82}" stroke="${mk.hollow ? c : "var(--bg)"}" stroke-width="1.5"/>`;
  });
  const list = state.atm === "custom" ? [...D.atmospheres, T] : D.atmospheres;
  list.forEach(a => {
    const on = a.id === T.id, cx = x(a.o2), cy = y(a.p), col = on ? "var(--red)" : "var(--ink)";
    s += `<g pointer-events="none"><rect x="${cx - (on ? 5 : 4)}" y="${cy - (on ? 5 : 4)}" width="${on ? 10 : 8}" height="${on ? 10 : 8}" fill="var(--bg)" stroke="${col}" stroke-width="${on ? 2 : 1.4}"/><line x1="${cx - 12}" x2="${cx + 12}" y1="${cy}" y2="${cy}" stroke="${col}" stroke-width="${on ? 1.6 : 1}"/><line x1="${cx}" x2="${cx}" y1="${cy - 12}" y2="${cy + 12}" stroke="${col}" stroke-width="${on ? 1.6 : 1}"/>`;
    if (on || !small) { const lab = on ? `${a.name}: ${f1(a.o2)} %, ${f1(a.psia)} psia` : a.short; const right = cx + 16 + lab.length * 6.6 > W - m.r;
      s += `<text x="${right ? cx - 15 : cx + 15}" y="${on ? y(a.p * (1 + S.p_window)) - 8 : cy - 13}" text-anchor="${right ? "end" : "start"}" font-size="${on ? 12.5 : 11.5}" font-weight="${on ? 700 : 400}" fill="${on ? "var(--red)" : "var(--ink)"}" stroke="var(--bg)" stroke-width="3.5" paint-order="stroke">${esc(lab)}</text>`; }
    s += "</g>";
  });
  box.innerHTML = s + "</svg>";
  $("#legend").innerHTML = KINDS.map(k => `<span><i style="background:${KIND[k].color}"></i>${KIND[k].label}</span>`).join("") +
    `<span><svg width="46" height="18" aria-hidden="true"><circle cx="7" cy="9" r="4.5" fill="var(--ink3)"/><circle cx="30" cy="9" r="8.6" fill="var(--ink3)"/></svg>1 run and 10 runs</span>` +
    `<span><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="var(--ink3)" fill-opacity=".28" stroke="var(--ink3)" stroke-width="1.5"/></svg>oxygen only</span>` +
    `<span><svg width="20" height="18" aria-hidden="true"><rect x="6" y="5" width="8" height="8" fill="none" stroke="var(--red)" stroke-width="1.5"/><line x1="0" x2="20" y1="9" y2="9" stroke="var(--red)"/><line x1="10" x2="10" y1="0" y2="18" stroke="var(--red)"/></svg>selected cabin and its window</span>`;
  const off = {}; offscale.forEach(t => off[t.k] = (off[t.k] || 0) + 1);
  $("#mapnote").textContent = `Not drawn: ${Object.keys(off).map(k => `${off[k]} ${KIND[k].one} runs above ${X1} % oxygen`).join(", ")}; ${S.solid_no_conditions} solid-material runs whose table lists no oxygen level; and the gas-jet and smoke investigations, whose tables hold no oxygen column. ACME BRE bubbles count test days, not runs.`;
  drawMapTable();
}
function tipHtml(mk) {
  const g = mk.g;
  if (g.bre) return `<b>ACME BRE · ${f1(g.bre.o)} % oxygen</b><br>${plural(g.bre.days, "test day")} included this level<br><span class="t2">A gas burner that imitates burning solids. PSI lists oxygen per test day and no chamber pressure.</span>`;
  const invs = Object.keys(g.inv).map(a => `${esc(a)} ${g.inv[a]}`).join(", ");
  const o = g.out, known = g.n - o.na;
  let h = `<b>${plural(g.n, "run")} · ${KIND[g.k].label}</b><br>${f1(g.o)} % oxygen` + (mk.strip ? ", cabin pressure (not in table)" : `, ${f2(g.p)} atm (${f1(g.p * PSIA)} psia)`) + `<br><span class="t2">${invs}</span>`;
  if (known) h += `<br>Went out on its own: ${o.ext} · Kept burning: ${o.burn}` + (o.other ? ` · Other end: ${o.other}` : "") + (o.noign ? ` · No ignition: ${o.noign}` : "");
  else h += `<br><span class="t2">Result not recorded in the table</span>`;
  return h;
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
  const strip = state.kinds.solid ? solidStrip.slice().sort((a, b) => a.o - b.o) : [];
  $("#maptable").innerHTML = `<table><thead><tr><th>What burned</th><th class="n">Oxygen %</th><th class="n">Pressure atm</th><th class="n">Runs</th><th>Investigations</th><th class="n">Went out</th><th class="n">Kept burning</th></tr></thead><tbody>` +
    strip.concat(rows).map(g => `<tr><td><i class="kdot" style="background:${KIND[g.k].color}"></i>${KIND[g.k].label}</td><td class="n">${f1(g.o)}</td><td class="n">${g.k === "solid" ? "not in table" : f2(g.p)}</td><td class="n">${g.n}</td><td>${esc(Object.keys(g.inv).join(", "))}</td><td class="n">${g.n - g.out.na ? g.out.ext : "–"}</td><td class="n">${g.n - g.out.na ? g.out.burn : "–"}</td></tr>`).join("") + "</tbody></table>";
  $("#maptable").hidden = !state.table; $("#chart").hidden = state.table; $("#legend").hidden = state.table;
  $("#viewbtn").setAttribute("aria-pressed", state.table); $("#viewbtn").textContent = state.table ? "Chart view" : "Table view";
}
function drawWindow() {
  const T = target(), C = coverage(T);
  $("#matrix2").style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
  $("#matrix2").innerHTML = KINDS.map(k => `<div class="h"><i class="kdot" style="background:${KIND[k].color}"></i>${KIND[k].label}</div>`).join("") +
    KINDS.map(k => { const c = C[k]; return `<div class="c ${c.status}"><b>${c.n}</b><span>${STATUS[c.status][1]}. ${esc(c.status === "ok" ? "" : nearText(c))}</span></div>`; }).join("");
}
function drawEvidence() { chips(); drawMap(); drawWindow(); }

/* ---------- findings ---------- */
function drawWeights() {
  $("#weights").innerHTML = Object.keys(DIM).map(k => `<label class="field" for="w_${k}"><span>${DIM[k]} <output id="wv_${k}">${state.weights[k]}</output></span><input id="w_${k}" type="range" min="0" max="50" step="5" value="${state.weights[k]}"></label>`).join("");
  Object.keys(DIM).forEach(k => { $("#w_" + k).oninput = e => { state.weights[k] = +e.target.value; $("#wv_" + k).textContent = e.target.value; drawFindings(); }; });
  const tags = [...new Set(D.findings.flatMap(f => f.tags))].sort(), tc = $("#tagchips");
  ["all", ...tags].forEach(t => { const b = document.createElement("button"); b.className = "chip"; b.textContent = t; b.dataset.t = t; b.onclick = () => { state.tag = t === "all" ? null : t; drawFindings(); }; tc.appendChild(b); });
}
function drawFindings() {
  document.querySelectorAll("#tagchips .chip").forEach(b => b.setAttribute("aria-pressed", (state.tag || "all") === b.dataset.t));
  const list = ranked();
  if (!state.openF && list.length) state.openF = list[0].f.id;
  $("#flist").innerHTML = list.map((x, i) => {
    const f = x.f;
    return `<details class="f" id="f-${f.id}" ${state.openF === f.id ? "open" : ""}><summary><span class="r">${pad2(i + 1)}</span><h3>${esc(f.title)}</h3><span class="tagk k">${esc(f.kind)}</span><span class="sc">${Math.round(x.s)}</span></summary>
      <div class="body"><div><p>${esc(f.claim)}</p>${f.quote ? `<blockquote>“${esc(f.quote)}”<cite>${f.quote_url ? `<a href="${esc(f.quote_url)}" target="_blank" rel="noopener">${esc(f.quote_src)}</a>` : "NASA, " + esc(f.quote_src)}</cite></blockquote>` : ""}
      <dl><dt>Evidence</dt><dd>${esc(f.evidence)}</dd><dt>Limits</dt><dd>${esc(f.limits)}</dd><dt>What to do</dt><dd class="act">${esc(f.action)}</dd>
      <dt>Sources</dt><dd>${f.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} (${esc(s.acc)})</a>`).join(", ")}${f.next.length ? ` · open question for ${f.next.map(n => esc(D.next.find(z => z.id === n).name)).join(", ")}` : ""}</dd>
      <dt>Topics</dt><dd>${f.tags.map(t => `<span class="tagk">${esc(t)}</span>`).join(" ")}</dd></dl></div>
      <div class="scores">${Object.keys(DIM).map(k => `<div><span>${DIM[k]}</span><b>${f.scores[k]}</b><span class="track"><i style="width:${f.scores[k] * 20}%"></i></span></div>`).join("")}</div></div></details>`;
  }).join("");
}

/* ---------- archive ---------- */
function drawInv() {
  const kc = $("#invkind");
  if (!kc.children.length) [["all", "All"], ["solid", "Solids"], ["droplet", "Liquids"], ["gas", "Gases"], ["outcome", "Has results in table"]].forEach(a => { const b = document.createElement("button"); b.className = "chip"; b.textContent = a[1]; b.dataset.k = a[0]; b.onclick = () => { state.invkind = a[0]; drawInv(); }; kc.appendChild(b); });
  kc.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.k === state.invkind));
  const q = state.invq.toLowerCase();
  const rows = D.investigations.filter(i => i.combustion).filter(i => state.invkind === "all" || (state.invkind === "outcome" ? i.outcome : i.kind === state.invkind))
    .filter(i => !q || (i.acr + " " + i.title + " " + i.keywords + " " + i.area + " " + i.objective + " " + (i.summary || "")).toLowerCase().includes(q)).sort((a, b) => b.rows - a.rows);
  const rng = (r, d) => r ? (r[0] === r[1] ? d(r[0]) : d(r[0]) + " – " + d(r[1])) : "–";
  const REL = { direct: "fire safety", indirect: "related", background: "background" };
  $("#invtable").innerHTML = `<thead><tr><th>Investigation</th><th>Burned</th><th>Platform</th><th class="n">Runs listed</th><th class="n">Oxygen %</th><th class="n">Pressure atm</th><th>Results in table</th><th class="n">Raw data</th><th class="n">Papers</th></tr></thead><tbody>` +
    rows.map(i => `<tr class="row" data-acc="${i.acc}" tabindex="0" aria-expanded="${state.open === i.acc}"><td><b>${esc(i.acr || i.acc)}</b>${i.relevance ? `<span class="rel ${i.relevance}">${REL[i.relevance]}</span>` : ""}<br><span class="fine">${esc(i.summary || i.title)}</span></td><td>${i.kind ? `<i class="kdot" style="background:${KIND[i.kind].color}"></i>${KIND[i.kind].label}` : esc(i.area || "–")}</td><td>${esc(i.platform.replace("International Space Station (ISS)", "Space station").replace("Not Applicable", "Ground analysis") || "–")}</td><td class="n">${i.rows || "–"}</td><td class="n">${rng(i.o2, f1)}</td><td class="n">${rng(i.p, f2)}</td><td>${esc(i.outcome || "no")}</td><td class="n">${i.raw_gb ? (i.raw_gb >= 1000 ? f1(i.raw_gb / 1000) + " TB" : Math.round(i.raw_gb) + " GB") : "–"}</td><td class="n">${i.npub}</td></tr>` +
      (state.open === i.acc ? `<tr class="detail"><td colspan="9"><div class="dcols"><div><h4>Full title</h4><p>${esc(i.title)}</p><p class="fine" style="margin-top:6px">The one-line summary above was drafted with AI from this record; every number in it is checked against the record or its table at build time.</p></div><div><h4>Objective</h4><p>${esc(i.objective || "Not given in the record.")}</p></div><div><h4>Hypothesis</h4><p>${esc(i.hypothesis || "Not given in the record.")}</p></div><div><h4>Approach</h4><p>${esc(i.approach || "Not given in the record.")}</p></div><div><h4>Why it matters</h4><p>${esc(i.impacts || "Not given in the record.")}</p></div><div><h4>Publications (${i.pubs.length})</h4><ol>${i.pubs.map(p => `<li>${p.doi ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener">${esc(p.t)}</a>` : esc(p.t)}</li>`).join("") || "<li>None listed</li>"}</ol></div><div><h4>Record</h4><p><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.acc)} on NASA PSI</a>${i.doi ? `<br>DOI ${esc(i.doi)}` : ""}<br>${esc(i.start || "?")} to ${esc(i.end || "?")}<br>Licence ${esc(i.lic || "not stated")}</p></div></div></td></tr>` : "")).join("") + "</tbody>";
  const skipped = D.investigations.filter(i => !i.combustion);
  $("#invnote").textContent = `${rows.length} of ${S.combustion} investigations shown. The archive search for "combustion" also returns ${skipped.map(i => i.acc).join(" and ")}, which are about solders and fluid physics and are left out.`;
}

/* ---------- lessons ---------- */
function drawHistory() {
  const box = $("#o2hist"), W = Math.max(300, box.clientWidth - 28), H = 120, l = 8, r = 16;
  const x = o => l + o / 100 * (W - l - r);
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<line x1="${x(0)}" x2="${x(100)}" y1="70" y2="70" stroke="var(--strong)"/>`;
  for (let o = 0; o <= 100; o += 20) s += `<line x1="${x(o)}" x2="${x(o)}" y1="70" y2="75" stroke="var(--strong)"/><text x="${x(o)}" y="88" text-anchor="middle" font-size="11" fill="var(--ink3)" font-family="var(--mono)">${o}</text>`;
  s += `<text x="${x(100)}" y="106" text-anchor="end" font-size="11" fill="var(--ink3)" font-family="var(--mono)">OXYGEN IN THE CABIN, % BY VOLUME</text>`;
  s += `<rect x="${x(S.solid_o2_min)}" y="60" width="${x(S.solid_o2_max) - x(S.solid_o2_min)}" height="10" fill="var(--s1)"/><text x="${x(S.solid_o2_min)}" y="52" font-size="12" font-weight="700" fill="var(--ink)">Solid materials tested in flight</text>`;
  [{ o2: 34, lab: "Exploration 34 %", y: 20, hot: true }, { o2: 60, lab: "Apollo prelaunch 60 %", y: 36 }, { o2: 100, lab: "Apollo 1 and Apollo flight 100 %", y: 20, end: true }].forEach(mk => {
    s += `<line x1="${x(mk.o2)}" x2="${x(mk.o2)}" y1="${mk.y + 4}" y2="70" stroke="${mk.hot ? "var(--red)" : "var(--ink3)"}" stroke-width="${mk.hot ? 2 : 1.2}"/><rect x="${x(mk.o2) - 4}" y="66" width="8" height="8" fill="${mk.hot ? "var(--red)" : "var(--bg)"}" stroke="${mk.hot ? "var(--red)" : "var(--ink2)"}" stroke-width="1.5"/>`;
    if (W > 520 || mk.hot || mk.end) s += `<text x="${x(mk.o2) + (mk.end ? -6 : 6)}" y="${mk.y}" text-anchor="${mk.end ? "end" : "start"}" font-size="11.5" ${mk.hot ? 'font-weight="700" fill="var(--red)"' : 'fill="var(--ink2)"'}>${mk.lab}</text>`; });
  box.innerHTML = s + "</svg>";
  const fl = id => { const f = D.findings.find(z => z.id === id); return f ? `<a href="#findings" data-go="findings" data-f="${id}">${esc(f.title)}</a>` : ""; };
  $("#hcards").innerHTML = D.history.map(h => `<article class="hcard"><span class="lab">${esc(h.date)}</span><h3>${esc(h.name)}</h3>${h.atmosphere ? `<span class="atm">${esc(h.atmosphere.label)}</span>` : ""}<p>${esc(h.what)}</p>
    ${h.quotes.slice(0, 1).map(q => `<blockquote>“${esc(q.text)}”<cite><a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.src)}</a></cite></blockquote>`).join("")}
    <p><b>What changed:</b> ${esc(h.changed)}</p><p class="today">${esc(h.today)}</p><p class="fine">Related: ${h.findings.map(fl).filter(Boolean).join("; ")}</p></article>`).join("");
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
  return `<a href="#method" data-go="method">${esc(id)}</a>`;
}
