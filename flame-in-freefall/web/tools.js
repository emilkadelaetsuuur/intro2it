/* QUENCH tools: outcome predictor, video lab, mission check, question engine, method notes, navigation.
   No model is called at run time. The predictor is a small logistic model shipped in model.js; analyst
   answers were written ahead of time and verified at build time.
   SI notice: written with SI (AI) assistance (Claude, Anthropic) and reviewed by the team. */
const M = window.FLAME_MODEL;

/* ---------- outcome predictor (FLEX model) ---------- */
const PQ = { o2: 34, psia: 8.2, fuel: "heptane", d0: 3.0, co2: 0, he: 0 };
const PIN = [
  { k: "o2", label: "Oxygen", min: 10, max: 40, step: 0.5, fmt: v => f1(v) + " %" },
  { k: "psia", label: "Pressure", min: 6, max: 45, step: 0.1, fmt: v => `${f1(v)} psia (${f2(v / PSIA)} atm)` },
  { k: "d0", label: "Droplet diameter", min: 1, max: 5, step: 0.1, fmt: v => f1(v) + " mm" },
  { k: "co2", label: "Carbon dioxide in the air", min: 0, max: 70, step: 1, fmt: v => Math.round(v) + " %" },
  { k: "he", label: "Helium in the air", min: 0, max: 45, step: 1, fmt: v => Math.round(v) + " %" }
];
const PRESETS = [
  ["Station air", { o2: 21, psia: 14.7, co2: 0, he: 0 }],
  ["10.2 psia cabin", { o2: 26.5, psia: 10.2, co2: 0, he: 0 }],
  ["Exploration atmosphere", { o2: 34, psia: 8.2, co2: 0, he: 0 }],
  ["Carbon dioxide flooding", { o2: 18, psia: 14.7, co2: 20, he: 0 }]
];
const xOf = q => [q.o2 / 100, Math.log(q.psia / PSIA), q.fuel === "heptane" ? 1 : 0, q.d0, q.co2 / 100, q.he / 100];
const pOf = x => { let z = M.intercept; x.forEach((v, i) => { z += M.coef[i] * v; }); return 1 / (1 + Math.exp(-z)); };
const PNAMES = { o2: "oxygen", logp: "pressure", d0: "droplet size", co2: "carbon dioxide", he: "helium" };
function domainOf(x) {
  const idx = [0, 1, 3, 4, 5], near = [];
  M.points.forEach((pt, i) => { if (pt[2] !== x[2]) return; let d = 0; idx.forEach(j => { const z = (pt[j] - x[j]) / M.train_sd[j]; d += z * z; }); near.push([Math.sqrt(d), i]); });
  near.sort((a, b) => a[0] - b[0]);
  const nn = near.length ? near[0][0] : Infinity;
  const out = M.features.filter((f, j) => j !== 2 && (x[j] < M.ranges[f.key][0] - 1e-9 || x[j] > M.ranges[f.key][1] + 1e-9)).map(f => PNAMES[f.key]);
  const status = out.length || nn > 2 * M.domain.nn95 ? "out" : nn > M.domain.nn95 ? "edge" : "in";
  return { nn, near: near.slice(0, 6), status, out };
}
const DOM = { in: ["ok", "✓", "Inside the tested conditions"], edge: ["thin", "!", "Near the edge of the tested conditions"], out: ["none", "✕", "Outside the tested conditions: the model is extrapolating"] };
const pct = p => p < 0.005 ? "<1" : p > 0.995 ? ">99" : String(Math.round(p * 100));
function burnK(q) { const b = M.burn_k, x = [q.o2 / 100, Math.log(q.psia / PSIA), q.fuel === "heptane" ? 1 : 0, q.co2 / 100, q.he / 100]; return b.intercept + b.coef.reduce((a, c, i) => a + c * x[i], 0); }
function drawPredInputs() {
  const R = M.cv.results;
  $("#psub").textContent = `A logistic model trained on ${M.n} FLEX droplet runs from the space station. Tested on whole days of runs it never saw, it is right ${Math.round(R["Full model"].accuracy.mean * 100)} % of the time, against ${Math.round(R["Always the most common outcome"].accuracy.mean * 100)} % for always guessing the most common outcome. It tells you when your conditions are outside anything NASA tested.`;
  const pr = $("#ppresets"); PRESETS.forEach(([n, v]) => { const b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.textContent = n; b.onclick = () => { Object.assign(PQ, v); syncPred(); }; pr.appendChild(b); });
  $("#pfuel").innerHTML = ["methanol", "heptane"].map(f => `<button type="button" data-f="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join("");
  $("#pfuel").onclick = e => { const b = e.target.closest("button"); if (b) { PQ.fuel = b.dataset.f; syncPred(); } };
  $("#pinputs").innerHTML = PIN.map(i => `<label class="field" for="pi_${i.k}"><span>${i.label} <output id="po_${i.k}"></output></span><input id="pi_${i.k}" type="range" min="${i.min}" max="${i.max}" step="${i.step}"></label>`).join("");
  PIN.forEach(i => { $("#pi_" + i.k).oninput = e => { PQ[i.k] = +e.target.value; const over = PQ.o2 + PQ.co2 + PQ.he - 100; if (over > 0) PQ[i.k] -= over; syncPred(); }; });
}
function syncPred() {
  PIN.forEach(i => { $("#pi_" + i.k).value = PQ[i.k]; $("#po_" + i.k).textContent = i.fmt(PQ[i.k]); });
  document.querySelectorAll("#pfuel button").forEach(b => b.setAttribute("aria-pressed", b.dataset.f === PQ.fuel));
  document.querySelectorAll("#ppresets .chip").forEach((b, i) => { const v = PRESETS[i][1]; b.setAttribute("aria-pressed", Object.keys(v).every(k => Math.abs(PQ[k] - v[k]) < 1e-9)); });
  const x = xOf(PQ), p = pOf(x), dm = domainOf(x), st = DOM[dm.status], K = burnK(PQ);
  const word = p >= 0.8 ? "very likely" : p >= 0.6 ? "likely" : p >= 0.4 ? "about as likely as not" : p >= 0.2 ? "unlikely" : "very unlikely";
  $("#pout").innerHTML = `<span class="lab">Chance the flame goes out on its own</span><div class="pbig num">${pct(p)} %<small>${word} for a ${f1(PQ.d0)} mm ${PQ.fuel} droplet at ${f1(PQ.o2)} % oxygen and ${f1(PQ.psia)} psia</small></div>
    <span class="pill ${st[0]}"><span aria-hidden="true">${st[1]}</span>${st[2]}</span>
    <p class="fine">${dm.status === "in" ? "Real runs exist close to these conditions; the table below lists them." : dm.out.length ? `Beyond the tested range of ${esc(dm.out.join(", "))}${dm.out.includes("pressure") ? `: FLEX ran ${f1(Math.exp(M.ranges.logp[0]) * PSIA)} to ${f1(Math.exp(M.ranges.logp[1]) * PSIA)} psia` : ""}. Read the number as a direction, not a forecast.` : "The closest real runs differ noticeably from these conditions. Read the number as a direction, not a forecast."}</p>
    <p class="fine">Burning-rate constant if it keeps burning: about <b class="num">${f2(Math.max(K, 0))} mm²/s</b> (typical model error ±${f2(M.burn_k.cv_rmse)}), so a ${f1(PQ.d0)} mm droplet would last about ${K > 0.05 ? Math.round(PQ.d0 * PQ.d0 / K) + " s" : "–"} by the d² law.</p>`;
  drawPredChart(x);
  const rows = dm.near.map(([d, i]) => { const pt = M.points[i]; return `<tr><td class="mono">${esc(M.point_ids[i])}</td><td class="n">${f1(pt[0] * 100)}</td><td class="n">${f2(Math.exp(pt[1]))}</td><td class="n">${f1(pt[3])}</td><td class="n">${pt[4] ? Math.round(pt[4] * 100) + " % CO₂" : pt[5] ? Math.round(pt[5] * 100) + " % He" : "–"}</td><td>${esc(M.point_end[i])}</td><td class="n">${f2(d)}</td></tr>`; }).join("");
  $("#pnear").innerHTML = `<span class="lab">Closest real ${PQ.fuel} runs</span><table><thead><tr><th>FLEX run</th><th class="n">O₂ %</th><th class="n">atm</th><th class="n">Drop mm</th><th class="n">Diluent</th><th>Ended in</th><th class="n">Distance</th></tr></thead><tbody>${rows}</tbody></table><p class="fine" style="margin-top:8px">Distance is in standard deviations of the training data. 95 % of real runs have a neighbour within ${f2(M.domain.nn95)}.</p>`;
}
function drawPredChart(x) {
  const box = $("#pchart"), W = Math.max(300, box.clientWidth), H = 240, m = { l: 44, r: 16, t: 26, b: 52 };
  const X = o => m.l + (o - 10) / 30 * (W - m.l - m.r), Y = v => m.t + (1 - v) * (H - m.t - m.b);
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Chance of self-extinction against oxygen level" xmlns="http://www.w3.org/2000/svg">`;
  [0, 0.25, 0.5, 0.75, 1].forEach(v => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--rule)"/><text x="${m.l - 7}" y="${Y(v) + 4}" text-anchor="end" font-size="11" font-family="var(--mono)">${v * 100}%</text>`; });
  for (let o = 10; o <= 40; o += 5) s += `<text x="${X(o)}" y="${H - m.b + 16}" text-anchor="middle" font-size="11" font-family="var(--mono)">${o}</text>`;
  s += `<text x="${W - m.r}" y="${H - m.b + 32}" text-anchor="end" font-size="11" font-family="var(--mono)">OXYGEN, % BY VOLUME</text><text x="${m.l}" y="14" font-size="11" fill="var(--ink3)" font-family="var(--mono)">CHANCE THE FLAME GOES OUT ON ITS OWN, OTHER CONDITIONS AS SET</text>`;
  M.points.forEach(pt => { if (pt[2] !== x[2] || Math.abs(pt[1] - x[1]) > 0.15 || Math.abs(pt[4] - x[4]) > 0.05 || Math.abs(pt[5] - x[5]) > 0.05) return;
    s += `<line x1="${X(pt[0] * 100)}" x2="${X(pt[0] * 100)}" y1="${pt[6] ? Y(1) - 2 : Y(0) + 2}" y2="${pt[6] ? Y(1) - 9 : Y(0) + 9}" stroke="var(--ink3)" stroke-width="1.5"/>`; });
  let seg = [], segs = [];
  for (let o = 10; o <= 40.001; o += 0.5) { const xx = xOf(Object.assign({}, PQ, { o2: o })), st = domainOf(xx).status === "out", pt = [X(o), Y(pOf(xx)), st];
    if (seg.length && seg[seg.length - 1][2] !== st) { seg.push(pt); segs.push(seg); seg = [pt]; } else seg.push(pt); }
  segs.push(seg);
  segs.forEach(sg => { s += `<polyline fill="none" stroke="var(--s2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${sg[0][2] ? 'stroke-dasharray="5 5" opacity=".7"' : ""} points="${sg.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}"/>`; });
  const cx = X(Math.min(40, Math.max(10, PQ.o2))), cy = Y(pOf(x));
  s += `<circle cx="${cx}" cy="${cy}" r="5" fill="var(--s2)" stroke="var(--bg)" stroke-width="2"/><text x="${cx + (cx > W - 140 ? -9 : 9)}" y="${cy - 9}" text-anchor="${cx > W - 140 ? "end" : "start"}" font-size="12" font-weight="700" fill="var(--ink)" stroke="var(--bg)" stroke-width="3" paint-order="stroke">${pct(pOf(x))} %</text>`;
  box.innerHTML = s + "</svg>";
  $("#plegend").innerHTML = `<span><svg width="26" height="10" aria-hidden="true"><line x1="0" x2="26" y1="5" y2="5" stroke="var(--s2)" stroke-width="2"/></svg>model, inside or near tested conditions</span><span><svg width="26" height="10" aria-hidden="true"><line x1="0" x2="26" y1="5" y2="5" stroke="var(--s2)" stroke-width="2" stroke-dasharray="5 5"/></svg>extrapolation</span><span><svg width="12" height="14" aria-hidden="true"><line x1="6" x2="6" y1="2" y2="12" stroke="var(--ink3)" stroke-width="1.5"/></svg>real runs at similar pressure and diluent: top went out, bottom kept burning</span>`;
}
function drawPredCard() {
  const r = M.cv.results, names = Object.keys(r);
  const eff = [["Oxygen +5 points", Math.exp(M.coef[0] * 0.05)], ["Pressure doubled", Math.exp(M.coef[1] * Math.log(2))], ["Heptane instead of methanol", Math.exp(M.coef[2])],
    ["Droplet 1 mm larger", Math.exp(M.coef[3])], ["Carbon dioxide +10 points", Math.exp(M.coef[4] * 0.1)], ["Helium +10 points", Math.exp(M.coef[5] * 0.1)]];
  $("#pcard").innerHTML = `<span class="lab">How good is it?</span><table><thead><tr><th>Model</th><th class="n">Accuracy</th><th class="n">AUC</th><th class="n">Brier</th></tr></thead><tbody>` +
    names.map(n => `<tr><td>${esc(n)}</td><td class="n">${Math.round(r[n].accuracy.mean * 100)} %</td><td class="n">${n.startsWith("Always") ? "–" : f2(r[n].auc.mean)}</td><td class="n">${r[n].brier.mean.toFixed(3)}</td></tr>`).join("") +
    `</tbody></table><p class="fine" style="margin:8px 0 14px">${esc(M.cv.method)}. Lower Brier is better.</p><span class="lab">What moves the odds of going out</span><div class="effects" style="margin-top:8px">${eff.map(e => `<span>${e[0]}</span><b>×${e[1] < 1 ? e[1].toFixed(2) : e[1].toFixed(1)}</b>`).join("")}</div>
    <p class="fine" style="margin-top:8px">Larger droplets go out more often because they lose more heat by radiation, which FLEX was designed to study. Carbon dioxide and helium are the suppressants FLEX tested.</p>`;
}

/* ---------- video lab ---------- */
function drawVideo() {
  const V = D.video; if (!V) { $("#videoblock").hidden = true; return; }
  const cols = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
  const rated = V.tests.filter(t => t.spread_mm_s).map(t => Object.assign({}, t, { series: t.series.filter(p => p[0] >= t.fit_window_s[0] && p[0] <= (t.fan_change_s || t.fit_window_s[1])) }));
  $("#vsub").textContent = `NASA's table for BASS-II lists the conditions of each test but not what the flame did. That answer sits in ${f1(inv("PSI-25").raw_gb)} GB of raw video. We tracked the flame's leading edge frame by frame in ${V.tests.length} side-view videos from 19 February 2014 and fitted the spread rate. ${V.validation.passed} of ${V.validation.independent} independent checks pass.`;
  const box = $("#vchart"), W = Math.max(300, box.clientWidth), wide = W >= 600, H = 280, m = { l: 48, r: wide ? 96 : 16, t: 24, b: 44 };
  const tmax = Math.max(...rated.map(t => t.series[t.series.length - 1][0] - t.series[0][0]));
  const ymax = Math.max(...rated.map(t => Math.max(...t.series.map(p => p[1] - t.series[0][1]))));
  const X = v => m.l + v / tmax * (W - m.l - m.r), Y = v => m.t + (1 - v / (ymax * 1.05)) * (H - m.t - m.b);
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Flame front distance against time during steady spread for four tests" xmlns="http://www.w3.org/2000/svg">`;
  for (let v = 0; v <= ymax; v += 10) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--rule)"/><text x="${m.l - 7}" y="${Y(v) + 4}" text-anchor="end" font-size="11" font-family="var(--mono)">${v}</text>`;
  for (let t = 0; t <= tmax; t += 10) s += `<text x="${X(t)}" y="${H - m.b + 16}" text-anchor="middle" font-size="11" font-family="var(--mono)">${t}</text>`;
  s += `<text x="${m.l}" y="14" font-size="11" fill="var(--ink3)" font-family="var(--mono)">DISTANCE THE FLAME FRONT TRAVELLED, MM</text><text x="${W - m.r}" y="${H - m.b + 32}" text-anchor="end" font-size="11" font-family="var(--mono)">${wide ? "SECONDS FROM THE START OF STEADY SPREAD TO THE FAN CUT" : "SECONDS OF STEADY SPREAD"}</text>`;
  const ends = [];
  rated.forEach((t, i) => { const t0 = t.series[0][0], x0 = t.series[0][1];
    s += `<polyline fill="none" stroke="${cols[i]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${t.series.map(p => X(p[0] - t0).toFixed(1) + "," + Y(p[1] - x0).toFixed(1)).join(" ")}"/>`;
    const l = t.series[t.series.length - 1]; ends.push({ y: Y(l[1] - x0), x: X(l[0] - t0), lab: `${t.test} · ${t.thickness_um} µm` }); });
  ends.sort((a, b) => a.y - b.y); for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  if (wide) ends.forEach(e => { s += `<text x="${Math.min(e.x + 6, W - m.r + 6)}" y="${e.y + 4}" font-size="11.5" font-weight="700" fill="var(--ink)">${esc(e.lab)}</text>`; });
  box.innerHTML = s + "</svg>";
  $("#vlegend").innerHTML = rated.map((t, i) => `<span><i style="background:${cols[i]}"></i>${t.test}: ${t.thickness_um} µm film, ${t.spread_mm_s} mm/s</span>`).join("");
  $("#vthumbs").innerHTML = rated.map(t => `<figure><img src="${esc(t.frames_web[0])}" alt="Side view of test ${t.test} with the detected flame front marked by a blue line" width="480" height="220"><figcaption>${t.test}: ${esc(t.material)}. Blue line: detected leading edge.</figcaption></figure>`).join("");
  $("#vtable").innerHTML = `<table><thead><tr><th>Test</th><th>Film</th><th class="n">O₂ %</th><th class="n">Air cm/s</th><th class="n">Spread mm/s</th><th class="n">Range across thresholds</th><th class="n">Fit R²</th><th class="n">Out after fan cut</th><th>Confidence</th></tr></thead><tbody>` +
    V.tests.map(t => `<tr><td><b>${t.test}</b></td><td>${esc(t.material)}</td><td class="n">${t.o2 == null ? "–" : t.o2}</td><td class="n">${esc(t.air_cm_s)}</td><td class="n">${t.spread_mm_s == null ? "–" : t.spread_mm_s}</td><td class="n">${t.spread_mm_s_range ? t.spread_mm_s_range.join(" – ") : "–"}</td><td class="n">${t.fit_r2 == null ? "–" : t.fit_r2}</td><td class="n">${t.flame_out_after_fan_s != null ? t.flame_out_after_fan_s + " s" : "–"}</td><td>${t.confidence}${t.notes ? `<br><span class="fine">${esc(t.notes)}</span>` : ""}</td></tr>`).join("") + "</tbody></table>";
  $("#vchecks").innerHTML = `<table><thead><tr><th>Check</th><th>What</th><th>Expected</th><th>Measured</th><th>Result</th></tr></thead><tbody>` +
    V.validation.checks.map(c => `<tr><td><b>${esc(c.check)}</b></td><td>${esc(c.what)}</td><td>${esc(c.expected)}</td><td>${esc(c.measured)}</td><td>${c.independent ? (c.pass ? '<span class="ok">✓ pass</span>' : '<span class="no">✕ fail</span>') : "used for scale"}</td></tr>`).join("") + "</tbody></table>";
  $("#vnote").innerHTML = `Scale ${V.scale_mm_per_px} mm per pixel, set from the 2.2 mm/s that the BASS-II Summary Report (NASA/TM-20210011385) gives for test B1. Ratios between tests do not depend on it. Code and method: <span class="mono">video/</span> in the repository.`;
}

/* ---------- mission check ---------- */
const MC = { o2: 34, psia: 8.2, g: "moon", flow: 10, mats: ["pmma", "sibal", "nomex"], liquids: true, agent: "co2", ventOff: true };
const MC_PRESETS = HABITATS.map(h => [h.name, { o2: h.o2, psia: h.psia, g: h.g }]);
const GRAV = { "0": ["0 g", "microgravity"], moon: ["1/6 g", "lunar gravity"], mars: ["3/8 g", "Martian gravity"] };
const GRADE = { A: "Flight-tested", B: "Partly tested", C: "Indirect evidence", D: "No flight evidence" };
const AGENT = { co2: "carbon dioxide", n2: "nitrogen", he: "helium" };
const worst = gs => gs.slice().sort().pop();
function mcEval(c) {
  const T = { o2: c.o2, p: c.psia / PSIA, psia: c.psia }, cabin = Math.abs(c.psia / 14.7 - 1) <= S.p_window, hi = c.o2 > S.solid_o2_max + 0.3;
  const rows = [];
  // 1. materials
  const per = c.mats.map(id => {
    const m = D.materials.find(z => z.id === id), ts = D.tests.filter(t => (t.m || []).includes(id) && t.o != null);
    const near = ts.filter(t => Math.abs(t.o - c.o2) <= S.o2_window).length;
    let g, txt;
    if (!m.flame) { g = "D"; txt = m.smoke ? `Never burned in a flight test in this archive. ${plural(m.smoke, "smoke test")} only.` : "Not in the archive."; }
    else if (!ts.length) { g = "D"; txt = `${plural(m.flame, "flaming test")}, none with a recorded oxygen level.`; }
    else if (near >= 5 && cabin) { g = "A"; txt = `${near} runs within ${S.o2_window} points of this oxygen level, at cabin pressure.`; }
    else if (near >= 1) { g = "B"; txt = cabin ? `Only ${plural(near, "run")} within ${S.o2_window} points of this oxygen level.` : `${plural(near, "run")} match the oxygen level, but at station pressure, not ${f1(c.psia)} psia.`; }
    else { g = "D"; txt = c.o2 > m.o2[1] ? `Tested from ${f1(m.o2[0])} to ${f1(m.o2[1])} % oxygen: ${f1(c.o2 - m.o2[1])} points short of this cabin.` : `Tested only from ${f1(m.o2[0])} % oxygen up.`; }
    return { m, g, txt };
  });
  if (per.length) {
    const g = worst(per.map(x => x.g)), bad = per.filter(x => x.g === "D").map(x => x.m.name);
    rows.push({ key: "mat", q: "Will the cabin materials burn in this air?", g,
      text: (g === "A" ? "Each selected material was flight-tested near this oxygen level. The results are in video and papers, not in the table." : g === "B" ? "Flight tests exist near this oxygen level, but they are few or at another pressure." : hi ? `No selected material was flight-tested at ${f1(c.o2)} % oxygen. The archive stops at ${f1(S.solid_o2_max)} %.` : "At least one selected material has no flight test near this oxygen level.") + " NASA's guide adds that the ground approval test is not conservative: materials can burn at lower oxygen levels in microgravity than on Earth.",
      list: per.map(x => [x.m.name, x.txt, x.g]), refs: ["F-solid-gap", "F-one-g"], prio: 5,
      action: g > "B" ? `Burn ${bad.join(", ")} at ${f1(c.o2)} % oxygen and ${f1(c.psia)} psia in microgravity. NASA's guide says SoFIE can run exploration atmospheres.` : null });
  }
  // 2. ventilation
  const flowNote = c.flow >= 5 && c.flow <= 20 ? ` Your ventilation speed, ${c.flow} cm/s, is in the range NASA's guide calls most flammable (about 10 cm/s).` : "";
  rows.push(hi ? { key: "vent", q: "Does stopping ventilation put the fire out?", g: "C",
      text: "The evidence points to no. No solid material was tested at this oxygen level, and in the one experiment at elevated oxygen (ACME BRE, a gas burner standing in for solids) flames kept burning with no airflow." + flowNote,
      refs: ["F-vent", "F-vent-speed"], prio: 5, action: `Test ventilation shutdown on solid materials at ${f1(c.o2)} % oxygen before the fire response relies on it.` }
    : { key: "vent", q: "Does stopping ventilation put the fire out?", g: "B",
      text: "For thin plastic film, yes: BASS-II flames went out when the airflow fell to about 1 cm/s at 21 % oxygen, and already at 2.6 to 4 cm/s at 16 %. Thicker materials are not in the table." + flowNote,
      refs: ["F-vent-speed", "F-vent"], prio: 5, action: null });
  // 3. extinguishing agent
  if (c.agent === "n2") rows.push({ key: "agent", q: "Will nitrogen put the fire out?", g: "C",
      text: "BASS used nitrogen as an extinguishing agent, but its table holds no results. NASA's guide reports that a local jet was not adequate: it pulled in air and kept the flame alive.",
      refs: ["F-local-jet", "PSI-26"], prio: 4, action: `Measure how much nitrogen is needed at ${f1(c.o2)} % oxygen, applied by flooding the volume, not by a directed jet.` });
  else {
    const key = c.agent, runs = D.tests.filter(t => t.i === "PSI-69" && t[key] > 0), near = runs.filter(t => Math.abs(t.o - c.o2) <= S.o2_window).length, top = key === "co2" ? S.flex_co2_o2_max : S.flex_he_o2_max;
    rows.push({ key: "agent", q: `Will ${AGENT[key]} put the fire out?`, g: near ? "B" : "D",
      text: near ? `Tested on burning droplets only: ${plural(near, "FLEX run")} with ${AGENT[key]} within ${S.o2_window} points of this oxygen level. Not tested on solid materials, and NASA's guide warns that a directed jet can feed the flame.` : `No flight run with ${AGENT[key]} above ${f1(top)} % oxygen. Quantities for this cabin cannot be scaled from station values.`,
      refs: ["F-suppress", "F-local-jet"], prio: 4, action: near ? null : `Measure how much ${AGENT[key]} is needed at ${f1(c.o2)} % oxygen, on droplets and on solid materials.` });
  }
  // 4. liquids
  if (c.liquids) {
    const cv = coverage(T).droplet, n = cv.n, same = D.tests.filter(t => t.k === "droplet" && t.o != null && Math.abs(t.o - c.o2) <= S.o2_window).length;
    const g = n >= 10 ? "A" : n >= 1 ? "B" : same ? "C" : "D", known = cv.res.ext + cv.res.burn + cv.res.other + cv.res.noign;
    const x = xOf({ o2: c.o2, psia: c.psia, fuel: "heptane", d0: 3, co2: 0, he: 0 }), dm = domainOf(x);
    rows.push({ key: "liq", q: "Will a burning liquid go out on its own?", g,
      text: (n ? `${plural(n, "droplet run")} inside the window.` + (known ? ` Of ${known} with a recorded end, ${cv.res.ext} went out on their own.` : "") : same ? nearText(cv) : `No droplet run within ${S.o2_window} points of this oxygen level.`) +
        ` Model estimate for a 3 mm heptane droplet: ${pct(pOf(x))} % chance of going out on its own${dm.status === "out" ? ", extrapolated beyond the tested conditions" : ""}.`,
      refs: ["F-selfext", "F-corner", "MODEL"], prio: 3, action: g > "B" ? `Run droplet tests at ${f1(c.psia)} psia and ${f1(c.o2)} % oxygen. FLEX-2 planned such conditions, but PSI holds no run table for it.` : null });
  }
  // 5. smoke
  const station = cabin && Math.abs(c.o2 - 21) <= S.o2_window;
  rows.push({ key: "smoke", q: "Will smoke be detected in time?", g: station ? "B" : "C",
    text: station ? `Smoke from five overheated materials was measured in flight at station air (${S.same_rows} table rows). Particle sizes are in the data files, not in the table.` : `Smoke was measured in flight only at station air. Nothing at ${f1(c.psia)} psia and ${f1(c.o2)} % oxygen.`,
    refs: ["F-smoke"], prio: 3, action: station ? null : `Repeat the smoke measurements at ${f1(c.psia)} psia and ${f1(c.o2)} % oxygen to calibrate detectors.` });
  // 6. gravity
  rows.push(c.g === "0" ? { key: "grav", q: "Does the evidence hold at this gravity?", g: "A", text: `Yes. All ${S.tests} runs in the archive were in microgravity.`, refs: ["F-gravity"], prio: 4, action: null }
    : { key: "grav", q: `Does the evidence hold at ${GRAV[c.g][1]}?`, g: "D",
      text: (c.g === "moon" ? "No. Every run was in orbit, and NASA's challenge statement confirms that PSI holds no partial-gravity combustion data. LUCI and FM2 are expected to add it." : "No. Every run was in orbit, PSI holds no partial-gravity data, and no experiment in these sources addresses Martian gravity.")
        + " Until then the microgravity result and the normal-gravity result bound what happens in between; ACME E-FIELD Flames mimicked partial gravity with an electric field.",
      refs: c.g === "moon" ? ["F-gravity", "N-fm2", "N-luci", "PSI-22"] : ["F-gravity", "PSI-22"], prio: 4,
      action: c.g === "moon" ? "Fly partial-gravity flammability tests (LUCI, FM2), and meanwhile bound each case between its microgravity and normal-gravity results." : "Plan flammability tests at Martian gravity. None is named in these sources. Meanwhile bound each case between its microgravity and normal-gravity results." });
  return rows;
}
function mcSetup() {
  const pr = $("#mcpresets"); MC_PRESETS.forEach(([n, v]) => { const b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.textContent = n; b.onclick = () => { Object.assign(MC, v); drawMission(); }; pr.appendChild(b); });
  $("#mc_g").innerHTML = Object.keys(GRAV).map(k => `<button type="button" data-g="${k}">${GRAV[k][0]}</button>`).join("");
  $("#mc_g").onclick = e => { const b = e.target.closest("button"); if (b) { MC.g = b.dataset.g; drawMission(); } };
  $("#mc_mats").innerHTML = D.materials.map(m => `<label title="${esc(m.what)}"><input type="checkbox" value="${m.id}"> ${esc(m.name)}</label>`).join("");
  $("#mc_mats").onchange = () => { MC.mats = [...document.querySelectorAll("#mc_mats input:checked")].map(i => i.value); drawMission(); };
  $("#mc_o2").oninput = e => { MC.o2 = +e.target.value; drawMission(); };
  $("#mc_p").oninput = e => { MC.psia = +e.target.value; drawMission(); };
  $("#mc_flow").oninput = e => { MC.flow = +e.target.value; drawMission(); };
  $("#mc_agent").onchange = e => { MC.agent = e.target.value; drawMission(); };
  $("#mc_liq").onchange = e => { MC.liquids = e.target.checked; drawMission(); };
  $("#mc_vent").onchange = e => { MC.ventOff = e.target.checked; drawMission(); };
  $("#mccopy").onclick = () => { const done = ok => { $("#mccopied").textContent = ok ? "Copied to clipboard" : "Copy failed. Select the text instead."; };
    try { navigator.clipboard.writeText(MC.report).then(() => done(true), () => done(false)); } catch (e) { done(false); } };
  $("#mcmap").addEventListener("click", e => { e.preventDefault(); state.atm = "custom"; state.custom = { o2: MC.o2, p: MC.psia / PSIA }; go("evidence"); });
  $("#mcrules").textContent = `How grades are set. A: enough flight runs match the cabin (5 for a material, 10 for liquids), within ${S.o2_window} points of oxygen and ${Math.round(S.p_window * 100)} % of pressure. B: fewer runs, a match in oxygen but not pressure, or one kind of fuel only. C: no direct test, but related flight evidence. D: nothing in the archive. Solid-material tables record no pressure, so they count as a pressure match only for a cabin at station pressure. This is a research aid, not a basis for spacecraft design decisions.`;
}
function drawMission() {
  $("#mc_o2").value = MC.o2; $("#mc_p").value = MC.psia; $("#mc_flow").value = MC.flow; $("#mc_agent").value = MC.agent; $("#mc_liq").checked = MC.liquids; $("#mc_vent").checked = MC.ventOff;
  $("#mc_o2o").textContent = f1(MC.o2) + " %"; $("#mc_po").textContent = `${f1(MC.psia)} psia (${f2(MC.psia / PSIA)} atm)`; $("#mc_flowo").textContent = MC.flow + " cm/s";
  document.querySelectorAll("#mc_g button").forEach(b => b.setAttribute("aria-pressed", b.dataset.g === MC.g));
  document.querySelectorAll("#mc_mats input").forEach(i => { i.checked = MC.mats.includes(i.value); });
  document.querySelectorAll("#mcpresets .chip").forEach((b, i) => { const v = MC_PRESETS[i][1]; b.setAttribute("aria-pressed", MC.o2 === v.o2 && Math.abs(MC.psia - v.psia) < 1e-9 && MC.g === v.g); });
  const rows = mcEval(MC), nD = rows.filter(r => r.g === "D").length, nC = rows.filter(r => r.g === "C").length, hi = MC.o2 > S.solid_o2_max + 0.3;
  const head = nD ? `${nD} of ${rows.length} questions have no flight evidence for this cabin` : nC ? `Evidence is only indirect for ${nC} of ${rows.length} questions` : "Flight evidence exists for every question";
  const where = `${f1(MC.o2)} % oxygen, ${f1(MC.psia)} psia, ${GRAV[MC.g][1]}.`;
  const warn = MC.ventOff && hi ? " The fire response starts with a step that is unproven in this air: stopping ventilation." : "";
  $("#mcverdict").innerHTML = `<h3>${esc(head)}</h3><div class="meter" role="img" aria-label="Grades: ${rows.map(r => r.g).join(", ")}">${rows.map(r => `<i class="${r.g}" title="${esc(r.q)} ${GRADE[r.g]}"></i>`).join("")}</div><p>${esc(where + warn)}</p>`;
  $("#mcscore").innerHTML = rows.map(r => `<div class="q"><h3>${esc(r.q)}</h3><span class="grade ${r.g}"><i>${r.g}</i>${GRADE[r.g]}</span><p>${esc(r.text)}</p>${r.list ? `<ul>${r.list.map(l => `<li><b>${esc(l[0])}</b><span><span class="grade ${l[2]}" style="margin-right:6px"><i>${l[2]}</i></span>${esc(l[1])}</span></li>`).join("")}</ul>` : ""}<span class="refs">Based on ${r.refs.map(refLink).join(" · ")}</span></div>`).join("");
  const open = rows.filter(r => r.action).sort((a, b) => b.prio * (b.g === "D" ? 2 : 1) - a.prio * (a.g === "D" ? 2 : 1));
  $("#mcprio").innerHTML = open.length ? open.map(r => `<li>${esc(r.action)}<span>${esc(r.q)} ${GRADE[r.g]}.</span></li>`).join("") : `<li>Nothing open in the archive's terms: flight tests exist for every question at these conditions.<span>Results for solid materials still have to be read from video. See the Lab.</span></li>`;
  MC.report = `QUENCH MISSION CHECK\n${where}\nVentilation ${MC.flow} cm/s. Materials: ${MC.mats.map(id => D.materials.find(m => m.id === id).name).join(", ") || "none selected"}. Agent: ${AGENT[MC.agent]}.\nSource: NASA PSI combustion archive, ${S.tests} flight test runs.\n\n${head}.${warn}\n\n` +
    rows.map(r => `[${r.g}] ${r.q} ${GRADE[r.g]}.\n    ${r.text}` + (r.list ? "\n" + r.list.map(l => `    - ${l[0]} [${l[2]}]: ${l[1]}`).join("\n") : "")).join("\n") +
    "\n\nTESTS STILL NEEDED\n" + (open.length ? open.map((r, i) => `${i + 1}. ${r.action}`).join("\n") : "None in the archive's terms.") + "\n\nResearch aid, not a design basis. Not an official NASA product.\n";
  $("#mccopied").textContent = "";
  const topInv = rankInv({ o2: MC.o2, psia: MC.psia, p: MC.psia / PSIA, g: MC.g }).slice(0, 5);
  $("#mcinv").innerHTML = topInv.map((x, n) => `<li><div><b>${esc(nameOf(x.i))}</b>${roleTags(x.i)}</div><span>${esc(x.parts[2][3])}. ${esc(x.i.summary || "")}</span></li>`).join("");
  MC.report += "\nMOST RELEVANT INVESTIGATIONS FOR THIS CABIN\n" + topInv.map((x, n) => `${n + 1}. ${nameOf(x.i)} (${x.i.acc}), score ${Math.round(x.s)}: ${x.parts[2][3]}.`).join("\n") + "\n";
}

/* ---------- ask the archive (no model at run time) ---------- */
const STOP = new Set("a an and are as at be but by can did do does for from has have how if in into is it its of on or that the their there these this to was we what when where which who why will with would you your any about been were than then so not no out up down".split(" "));
const stem = w => w.replace(/(ing|ed|es|s)$/, "");
const toks = s => s.toLowerCase().replace(/percent/g, "%").replace(/[^a-z0-9.% ]+/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP.has(w)).map(stem);
const SYN = {};
Object.entries({ moon: ["lunar", "exploration", "gravity"], lunar: ["moon", "exploration", "gravity"], mars: ["martian", "exploration", "gravity"], o2: ["oxygen"], oxygen: ["o2"],
  extinguish: ["extinction", "suppression", "suppressant", "extinguisher"], extinguisher: ["suppressant", "suppression", "jet"], ventilation: ["airflow", "flow", "fan"], fan: ["ventilation", "airflow"],
  airflow: ["ventilation", "flow"], smoke: ["detector", "detection"], detector: ["smoke", "detection"], material: ["solid", "fabric", "pmma"], plastic: ["pmma", "solid", "material"],
  liquid: ["droplet", "fuel"], droplet: ["liquid"], data: ["video", "table", "raw"], pressure: ["psia", "atm"], standard: ["6001", "approval", "ground"], habitat: ["cabin", "base"], base: ["moon", "habitat"],
  co2: ["carbon", "dioxide"], investigation: ["experiment"], study: ["experiment"], burn: ["fire", "flame"], safe: ["safety", "risk"], gap: ["missing", "untested"], accurate: ["accuracy", "good"], earth: ["firefighter", "spinoff", "benefit"] })
  .forEach(([k, v]) => { SYN[stem(k)] = v.map(stem); });
const BANK = D.answers.map(a => ({ a, qs: a.q.map(q => new Set(toks(q))), body: new Set(toks(a.a)) }));
const FDOCS = D.findings.map(f => ({ f, title: toks(f.title), tags: f.tags.map(stem), body: toks(f.claim + " " + f.evidence + " " + f.action) }));
const DF = {}; BANK.forEach(b => { const seen = new Set(); b.qs.forEach(set => set.forEach(w => seen.add(w))); seen.forEach(w => { DF[w] = (DF[w] || 0) + 1; }); });
const idf = w => Math.log(1 + BANK.length / DF[w]);
function bankScore(base) {
  // For each stored answer: the summed weight of the question's words found in any of its phrasings.
  // Rare words weigh more, so a shared "test" or "oxygen" is not enough; a synonym counts for 60 %.
  // Words the bank never uses add nothing. Ties go to the answer with the closest single phrasing.
  let best = { s: 0, r: -1, a: null };
  BANK.forEach(b => {
    const all = new Set(); b.qs.forEach(set => set.forEach(w => all.add(w)));
    const hit = (set, w) => set.has(w) ? idf(w) : (z => z ? 0.6 * idf(z) : 0)((SYN[w] || []).find(y => set.has(y)));
    let s = 0; base.forEach(w => { s += hit(all, w); });
    let one = 0, extra = 0;
    b.qs.forEach(set => { let v = 0; base.forEach(w => { v += hit(set, w); }); if (v > one) { one = v; extra = [...set].filter(w => !base.includes(w)).length; } });
    const r = s + 0.3 * one - 0.05 * extra;
    if (s > 0 && r > best.r) best = { s, r, a: b.a };
  });
  return best;
}
function bankMatch(base, strict) { const b = bankScore(base); return b.s >= (strict ? 4.8 : 2.7) ? b.a : null; }
function relatedFindings(base, skip) {
  const terms = []; base.forEach(w => { terms.push([w, 1]); (SYN[w] || []).forEach(z => terms.push([z, 0.5])); });
  return FDOCS.map(d => { let s = 0; terms.forEach(([w, wt]) => { if (d.title.includes(w)) s += 3 * wt; if (d.tags.includes(w)) s += 2 * wt; if (d.body.includes(w)) s += wt; }); return { f: d.f, s }; })
    .filter(x => x.s > 1.5 && !skip.includes("F-" + x.f.id)).sort((a, b) => b.s - a.s).slice(0, 2).map(x => x.f);
}
function countAnswer(q) {
  const mo = q.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i); if (!mo) return "";
  const mp = q.match(/(\d+(?:\.\d+)?)\s*(psia|psi|atm)/i), o2 = +mo[1]; if (o2 < 5 || o2 > 100) return "";
  const p = mp ? (/atm/i.test(mp[2]) ? +mp[1] : +mp[1] / PSIA) : null;
  const near = k => D.tests.filter(t => t.k === k && t.o != null && Math.abs(t.o - o2) <= S.o2_window && (p == null || (t.ps === "recorded" && Math.abs(t.p / p - 1) <= S.p_window))).length;
  return `<div class="a"><span class="lab">Counted from the run tables just now</span><p>Within ${S.o2_window} points of ${f1(o2)} % oxygen${p ? ` and ${Math.round(S.p_window * 100)} % of ${f2(p)} atm` : ", at any pressure"}: <b>${near("solid")}</b> solid-material runs, <b>${near("droplet")}</b> liquid-droplet runs and <b>${near("gas")}</b> gas-flame runs.${p ? " Solid-material tables record no pressure, so they cannot match a pressure." : ""}</p></div>`;
}
const MAT_WORDS = { pmma: ["pmma", "acrylic", "plexiglas"], sibal: ["sibal", "cotton", "fabric", "fiberglass"], nomex: ["nomex"], silicone: ["silicone"], ultem: ["ultem"], wax: ["wax", "candle", "paraffin"], kapton: ["kapton", "polyimide"], teflon: ["teflon", "ptfe"] };
function materialAnswer(q) {
  const lq = q.toLowerCase();
  return D.materials.filter(m => MAT_WORDS[m.id].some(w => lq.includes(w))).map(m => {
    const invs = Object.keys(m.invs).map(a => `${a} ${m.invs[a]}`).join(", ");
    let t = m.flame ? `${plural(m.flame, "flaming flight test")} in the archive (${esc(invs)}).` + (m.o2 ? ` ${m.with_o2} of them record an oxygen level, from ${f1(m.o2[0])} to ${f1(m.o2[1])} %. The exploration atmosphere is ${f1(EXP.o2)} %, ${f1(EXP.o2 - m.o2[1])} points above the highest.` : " None records an oxygen level.") : "Never burned in a flight test in this archive.";
    if (m.smoke) t += ` ${plural(m.smoke, "smoke test")} in SAME and SAME-R.`;
    return `<div class="a"><span class="lab">Looked up in the run tables · ${esc(m.name)}</span><p>${t}</p>${m.results.map(r => `<p>${esc(r)}</p>`).join("")}<p class="fine">${esc(m.what)}. <a href="#mission" data-go="mission">Check it against a cabin</a></p></div>`;
  }).join("");
}
function investigationAnswer(q) {
  const lq = " " + q.toLowerCase().replace(/[^a-z0-9-]+/g, " ") + " ";
  const hits = D.investigations.filter(i => i.combustion && i.acr).map(i => { const full = i.acr.toLowerCase().split(/\s*\/\s*/).concat(i.acr.toLowerCase().replace(/^acme\s+/, "")); return { i, keys: full.concat(full.map(k => k.replace(/[-\s](i{1,3}|r|2)$/, ""))) }; })
    .filter(x => x.keys.some(k => k.length > 2 && lq.includes(" " + k + " "))).sort((a, b) => b.i.acr.length - a.i.acr.length).slice(0, 2);
  return hits.map(({ i }) => `<div class="a"><span class="lab">From the NASA record · ${esc(i.acr)}</span><p>${esc(i.summary || i.title)}</p><p class="fine">${i.rows ? plural(i.rows, "run") + " listed" : "No run table"}${i.o2 ? `, oxygen ${f1(i.o2[0])} to ${f1(i.o2[1])} %` : ""}${i.p ? `, pressure ${f2(i.p[0])} to ${f2(i.p[1])} atm` : ""}, ${plural(i.npub, "publication")}. ${refLink(i.acc)}</p></div>`).join("");
}
function ask(q) {
  const box = $("#answer"); box.hidden = false;
  const base = toks(q); if (!base.length) { box.innerHTML = `<div class="a"><p>Type a question first.</p></div>`; return; }
  const counted = countAnswer(q);
  const a = bankMatch(base, !!counted);
  let h = "";
  if (a) h += `<div class="a"><span class="lab">Analyst answer · written with AI ahead of time, every claim checked against the records</span><p class="lead">${esc(a.a)}</p>` +
    a.claims.map(c => `<div class="claim"><span class="ok" title="Checked at build time">✓</span><span>${esc(c.text)}</span><span class="src">${c.sources.map(refLink).join(" · ")}</span></div>`).join("") + `</div>`;
  h += counted + materialAnswer(q) + investigationAnswer(q);
  const rel = relatedFindings(base, a ? a.claims.flatMap(c => c.sources) : []);
  if (rel.length) h += `<div class="a"><span class="lab">Related findings</span>${rel.map(f => `<p><a href="#findings" data-go="findings" data-f="${f.id}">${esc(f.title)}</a>. ${esc(f.claim.split(/(?<=\.)\s/)[0])}</p>`).join("")}</div>`;
  box.innerHTML = h || `<div class="a"><p class="lead">Nothing in the archive answers that.</p><p>Try naming a material, an experiment, a hazard or an oxygen level. QUENCH answers only from NASA's records; it does not guess.</p></div>`;
}
function askSetup() {
  const nClaims = D.answers.reduce((n, a) => n + a.claims.length, 0);
  $("#asksub").textContent = `Ask in plain words. QUENCH answers from the records only: it counts runs in the tables, looks up materials and experiments, and picks from ${D.answers.length} analyst answers that were written with SI (AI) ahead of time and checked claim by claim (${nClaims} claims against ${D.record_ids.length} records). It runs in your browser: no account, no key, no cost, and nothing is made up on the spot.`;
  ["Does turning off ventilation put out a fire at 34 % oxygen?", "Has Nomex been tested?", "How many tests were run at 26.5 % oxygen and 10.2 psia?", "What is the biggest fire risk for a Moon base?", "What did FLEX do?", "Is the ground flammability test the worst case?"]
    .forEach(q => { const b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.textContent = q; b.onclick = () => { $("#askq").value = q; ask(q); }; $("#askchips").appendChild(b); });
  $("#askform").addEventListener("submit", e => { e.preventDefault(); ask($("#askq").value); });
}

/* ---------- method ---------- */
function drawMethod() {
  const R = M.cv.results;
  $("#methodbody").innerHTML = `
  <div><h3>Data</h3><ul><li>Source: <a href="${esc(D.meta.source_url)}" target="_blank" rel="noopener">NASA Physical Sciences Informatics</a>, every investigation returned for “combustion”. Public domain (CC0-1.0).</li><li>${S.investigations} records, ${S.combustion} of them about combustion; ${S.table_rows} table rows; ${S.pubs} linked publications; ${S.raw_tb} TB of raw data.</li><li>Cabin atmospheres are the three NASA names in the ACME BRE record: 14.7 psia at 21 %, 10.2 psia at 26.5 % and 8.2 psia at 34 % oxygen. The Moon-base range, ${f1(S.moon_o2_min)} % oxygen or more at ${f1(S.moon_psia_max)} psi or less, is from the <a href="${esc(D.meta.challenge_url)}" target="_blank" rel="noopener">challenge statement</a>.</li><li>PSI does not hold everything NASA has flown. Saffire-IV, -V and -VI are not in it; NASA reports that Saffire-VI burned solid samples at “${esc(D.challenge.saffire6.text.split("because of the ")[1].split(" generated")[0])}”.</li><li>Current experiments are from the <a href="${esc(D.meta.glenn_url)}" target="_blank" rel="noopener">NASA Glenn combustion science page</a>.</li><li>Built ${esc(D.meta.built)}. One script rebuilds every number from the CSV files.</li></ul></div>
  <div><h3>Rules we held to</h3><ul><li>A missing value stays missing. Nothing is estimated or filled in.</li><li>Runs without a recorded pressure are drawn apart and never counted as a pressure match.</li><li>Every quote is matched word for word against a saved copy of its NASA source; the build stops if one is not found.</li><li>Finding scores are judgements. They are shown in full and you can reweight them.</li><li>Research prototype. Not validated for spacecraft design or fire-safety decisions.</li></ul></div>
  <div><h3>Mission check</h3><ul><li>Grades are set by fixed rules, printed under the scorecard, from counts of flight runs near the cabin's oxygen level and pressure.</li><li>Materials are matched by name in the BASS, BASS-II and Saffire tables; smoke-only materials come from SAME.</li><li>The ventilation, agent and smoke rows rest on the findings they link to, including their limits.</li></ul></div>
  <div><h3>Predictor</h3><ul><li>Logistic regression on ${M.n} FLEX runs (${M.dropped.length} dropped for a missing droplet size or pressure). Inputs: oxygen, pressure, fuel, droplet size, carbon dioxide, helium.</li><li>${esc(M.cv.method)}: accuracy ${Math.round(R["Full model"].accuracy.mean * 100)} %, AUC ${f2(R["Full model"].auc.mean)}.</li><li>A query farther than ${f2(M.domain.nn95)} standard deviations from every real run, or beyond a tested range, is flagged as extrapolation.</li></ul></div>
  <div><h3>Video lab</h3><ul><li>Leading-edge tracking on BASS-II side-view video at 10 frames per second, straight-line fit between ignition and the fan cut, repeated at three brightness thresholds.</li><li>One scale value from the NASA report; ${D.video ? D.video.validation.passed + " of " + D.video.validation.independent : "–"} checks it does not use pass.</li></ul></div>
  <div><h3>Use of SI</h3><ul><li>NASA Space Apps 2026 uses the term Super Intelligence (SI) for what is usually called AI. This is where it sits in QUENCH.</li><li>SI wrote the first draft, code checks it: Claude (Anthropic) was used to write code, normalise tables, and draft the ${S.combustion} investigation summaries, the wording of the ${D.findings.length} findings and the ${D.answers.length} analyst answers. The team reviewed them.</li><li>Each analyst claim must cite existing records and every number must appear in them with the same unit; every number in a summary must be in its record or table; every quote must match its saved source word for word. The build stops otherwise. This catches invented numbers and quotes; it cannot catch a correct number used in the wrong sense, so each claim links to its records.</li><li>Machine learning: the predictor is a model trained here on NASA data, with its accuracy on unseen test days shown beside it. Computer vision: the video lab measures flame spread from NASA's raw video.</li><li>No model is called while you use QUENCH: no API, no key, no cost. Everything on these pages is computed in your browser from files shipped with it. No SI-generated images, video or audio; the cover drawing and the charts are drawn by code.</li></ul></div>
  <div><h3>What the challenge asks</h3><ul><li>“${esc(D.challenge.task.text)}”</li><li>Summarise: Briefing, Archive rows, Lessons. Rank: Archive (investigations for a habitat) and Findings (by weights you set). Interpret: Mission check, Findings, Ask.</li><li>${esc(D.challenge.obj_relevant.text)} See <a href="#archive" data-go="archive">Archive</a> and <a href="#mission" data-go="mission">Mission check</a>.</li><li>${esc(D.challenge.obj_data.text)} See the downloads in <a href="#evidence" data-go="evidence">Evidence</a> and the <a href="#lab" data-go="lab">Lab</a>.</li><li>${esc(D.challenge.obj_controls.text)} See <a href="#findings" data-go="findings">Findings</a>, sorted into prevention, detection and suppression.</li><li>${esc(D.challenge.scope.text)} QUENCH leaves rockets and propellants out as well.</li></ul></div>
  <div><h3>Ranking of investigations</h3><ul><li>Four parts, each from 0 to 100, combined with weights you can change: how the challenge statement and PSI tie the investigation to fire safety, how close its fuel is to cabin materials, how close its runs come to the chosen cabin's oxygen and pressure, and how ready its data is to use.</li><li>Tier 1 (${S.tiers["1"]} investigations) is named in the challenge statement as a prevention, detection or suppression study. Tier 2 (${S.tiers["2"]}) is named there as related, filed by PSI under fire safety, or built on a tier 1 study. Tier 3 (${S.tiers["3"]}) is every other combustion investigation, which the statement calls “still relevant to fire safety, just not as strongly or directly”.</li><li>What varied, what stayed the same and what was recorded are computed from each PSI run table. Measurement types are found by keyword in the record, so a type the record does not name is not listed.</li><li>The parts follow NASA's records. The numbers given to them are our judgement and are printed in full under the weights.</li></ul></div>
  <div><h3>Cleaning decisions</h3><ul>${D.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>
  <div><h3>Resources from the organizers</h3><ul>${D.sources.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></li>`).join("")}<li><a href="${esc(D.meta.source_url)}" target="_blank" rel="noopener">NASA PSI combustion investigations</a></li><li><a href="${esc(D.meta.glenn_url)}" target="_blank" rel="noopener">NASA Glenn combustion science</a></li></ul></div>`;
}

/* ---------- navigation and wiring ---------- */
const VIEWS = [["brief", "Briefing"], ["mission", "Mission check"], ["evidence", "Evidence"], ["findings", "Findings"], ["lab", "Lab"], ["archive", "Archive"], ["lessons", "Lessons"], ["ask", "Ask"], ["method", "Method"]];
const DRAW = { brief: drawBrief, mission: drawMission, evidence: drawEvidence, findings: drawFindings, lab: () => { syncPred(); drawVideo(); }, archive: drawInv, lessons: drawHistory, ask: () => {}, method: drawMethod };
function show(name, f) {
  if (!DRAW[name]) name = "brief";
  state.view = name;
  VIEWS.forEach(([id]) => { $("#v-" + id).hidden = id !== name; });
  document.querySelectorAll("#tabs a").forEach(a => { if (a.dataset.go === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (f) state.openF = f;
  DRAW[name]();
  window.scrollTo(0, 0);
  if (name === "findings" && f) { const el = $("#f-" + f); if (el) el.scrollIntoView({ block: "start" }); }
  const tab = $(`#tabs a[data-go="${name}"]`), nav = $("#tabs");
  if (tab && nav.scrollWidth > nav.clientWidth) nav.scrollLeft += tab.getBoundingClientRect().left - nav.getBoundingClientRect().left - nav.clientWidth / 2 + tab.offsetWidth / 2;
}
function go(name, f) { show(name, f); try { if (location.hash !== "#" + name) location.hash = name; } catch (e) { /* hash not available: the view still switches */ } }
$("#tabs").innerHTML = VIEWS.map(([id, label]) => `<a href="#${id}" data-go="${id}">${label}</a>`).join("");
document.addEventListener("click", e => { const a = e.target.closest("a[data-go]"); if (!a || a.id === "mcmap") return; e.preventDefault(); go(a.dataset.go, a.dataset.f || null); });
window.addEventListener("hashchange", () => { const n = location.hash.slice(1); if (n && n !== state.view) show(n); });
$("#flist").addEventListener("toggle", e => { if (e.target.open) state.openF = e.target.id.slice(2); }, true);
$("#chart").addEventListener("mousemove", e => { const el = e.target.closest(".bub"); if (el) showTip(el, e); else $("#tip").hidden = true; });
$("#chart").addEventListener("mouseleave", () => { $("#tip").hidden = true; });
$("#chart").addEventListener("focusin", e => { const el = e.target.closest(".bub"); if (el) showTip(el); });
$("#chart").addEventListener("focusout", () => { $("#tip").hidden = true; });
$("#chart").addEventListener("click", e => { const el = e.target.closest(".bub"); if (el) showTip(el, e); });
$("#viewbtn").onclick = () => { state.table = !state.table; drawMapTable(); };
$("#dlall").onclick = () => download("quench-runs.csv", runsCsv(D.tests));
$("#dlflex").onclick = () => download("quench-flex-training-runs.csv", runsCsv(D.tests.filter(t => t.i === "PSI-69")));
$("#dlmodel").onclick = () => download("quench-flex-model.json", JSON.stringify(M, null, 1), "application/json");
let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => DRAW[state.view](), 120); });
$("#foot").textContent = "QUENCH · NASA Space Apps Challenge 2026 · Flame in Freefall · Data: NASA Physical Sciences Informatics, CC0-1.0 · Code and draft text made with SI (AI) assistance and checked against NASA records · Research prototype, not a design basis · Not an official NASA product";

drawWeights(); drawPredInputs(); drawPredCard(); mcSetup(); askSetup(); invSetup();
show(location.hash.slice(1) || "brief");
