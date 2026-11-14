/* QUENCH archive: ranks the investigations for a crew habitat, shows what each one varied and measured,
   compares investigations side by side, and hands the runs over as CSV. Computed in the browser from data.js.
   SI notice: written with SI (AI) assistance (Claude, Anthropic). */
const HABITATS = [
  { id: "station", name: "Space station", o2: 21, psia: 14.7, g: "0" },
  { id: "craft", name: "Spacecraft, 10.2 psia cabin", o2: 26.5, psia: 10.2, g: "0" },
  { id: "orbit", name: "Spacecraft, exploration air", o2: 34, psia: 8.2, g: "0" },
  { id: "moon", name: "Moon base or rover", o2: 34, psia: 8.2, g: "moon" },
  { id: "mars", name: "Mars base", o2: 34, psia: 8.2, g: "mars" }
];
const PILLAR = { prevention: "Prevention", detection: "Detection", suppression: "Suppression" };
const IW = { named: "Named for fire safety", fuel: "Fuel close to cabin materials", atm: "Tested near this cabin's air", data: "Data ready to use" };
const FUELSETS = [["all", "All"], ["solid", "Solid materials"], ["smoke", "Smoke"], ["droplet", "Liquids"], ["gas", "Gas flames"]];
const fuelSet = i => ({ solid: "solid", emulated: "solid", smoke: "smoke", instrument: "smoke", droplet: "droplet", gas: "gas" }[i.fuel_class]);
Object.assign(state, { hab: "moon", pillar: "all", fuel: "all", withResults: false, cmp: [], iw: { named: 35, fuel: 20, atm: 25, data: 20 } });
const habitat = () => { const h = HABITATS.find(x => x.id === state.hab); return Object.assign({ p: h.psia / PSIA }, h); };
const combustion = D.investigations.filter(i => i.combustion);
const nameOf = i => i.acr || i.acc;

/* ---------- how close an investigation's runs come to a cabin ---------- */
function atmMatch(i, T) {
  if (i.based_on) { const a = atmMatch(inv(i.based_on), T); return { v: a.v * 0.8, why: `Builds on ${nameOf(inv(i.based_on))}: ${a.why.charAt(0).toLowerCase() + a.why.slice(1)}` }; }
  const runs = D.tests.filter(t => t.i === i.acc && t.o != null), days = D.conditions.filter(c => c.i === i.acc);
  const w = S.o2_window, pw = S.p_window, cabin = Math.abs(1 / T.p - 1) <= pw;
  const near = runs.filter(t => Math.abs(t.o - T.o2) <= w);
  const inWin = near.filter(t => t.ps === "recorded" ? Math.abs(t.p / T.p - 1) <= pw : cabin);
  const dayNear = days.filter(c => c.o.some(o => Math.abs(o - T.o2) <= w));
  if (inWin.length >= 10) return { v: 1, why: `${inWin.length} runs inside this cabin's window` };
  if (inWin.length) return { v: 0.8, why: `${plural(inWin.length, "run")} inside this cabin's window` };
  if (near.length) return { v: 0.5, why: `${plural(near.length, "run")} at this oxygen level, ${near[0].ps === "recorded" ? "at another pressure" : "pressure not recorded"}` };
  if (dayNear.length) return { v: 0.5, why: `${plural(dayNear.length, "test day")} at this oxygen level, pressure not listed` };
  if (runs.length || days.length) return { v: 0.2, why: `Oxygen in the table ${i.o2[0] === i.o2[1] ? "is " + f1(i.o2[0]) : "runs from " + f1(i.o2[0]) + " to " + f1(i.o2[1])} %, away from this cabin` };
  return { v: 0, why: i.rows ? "No oxygen level in the run table" : "No run table in PSI" };
}
function invScore(i, T) {
  const a = atmMatch(i, T), W = state.iw;
  const parts = [["named", i.rank.named, W.named, i.tier_why], ["fuel", i.rank.fuel, W.fuel, i.fuel_label], ["atm", a.v, W.atm, a.why], ["data", i.rank.data, W.data, i.data_why]];
  if (T.g !== "0") parts.push(["grav", i.rank.g, 10, i.rank.g ? (i.acc === "PSI-22" ? "Named in the challenge statement as mimicking partial gravity" : "Lists a normal-gravity result beside each microgravity one") : "No link to partial gravity"]);
  const tot = parts.reduce((s, p) => s + p[2], 0) || 1;
  return { s: parts.reduce((s, p) => s + p[1] * p[2], 0) / tot * 100, parts, tot };
}
const rankInv = T => combustion.map(i => Object.assign({ i }, invScore(i, T))).sort((a, b) => b.s - a.s || b.i.rows - a.i.rows);

/* ---------- columns of a run table ---------- */
const fmtN = v => Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 1000) / 1000);
function varText(c) {
  if (c.d === 1) return `${c.h}: ${c.top[0][0]}`;
  if (c.num) return `${c.h}: ${fmtN(c.num[0])} to ${fmtN(c.num[1])} (${c.d} values)`;
  const more = c.d - c.top.length;
  return `${c.h}: ${c.top.map(t => t[0]).join("; ")}${more > 0 ? `; and ${more} more` : ""}`;
}
const colsOf = (i, test) => i.vars.filter(test);
const isFuel = c => c.role === "fuel" || c.role === "geometry";
const varied = c => c.role === "condition" && c.d > 1, constant = c => c.role === "condition" && c.d === 1, result = c => c.role === "result";
const ul = (items, none) => items.length ? `<ul>${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p>${esc(none)}</p>`;
const rng = (r, d) => r ? (r[0] === r[1] ? d(r[0]) : d(r[0]) + " – " + d(r[1])) : "–";
const famOf = i => D.families.find(f => f.id === i.family);
const roleTags = i => (i.pillars.length ? i.pillars.map(p => `<span class="rel direct">${PILLAR[p]}</span>`).join("") : `<span class="rel indirect">Fundamentals</span>`);
const sbar = x => `<span class="sbar" role="img" aria-label="Score ${Math.round(x.s)} of 100">${x.parts.map(p => `<i style="width:${(p[1] * p[2] / x.tot * 100).toFixed(1)}%" title="${esc((IW[p[0]] || "Link to partial gravity") + ": " + p[3])}"></i>`).join("")}</span>`;

/* ---------- downloads ---------- */
async function download(name, text, type) {
  // Inside a claude.ai artifact the page may not save files itself: it asks the viewer through the host.
  if (window.claude && window.claude.use) {
    try { const cap = await window.claude.use("downloads"); if (cap) { await cap.save({ filename: name, data: text }); return; } }
    catch (e) { return; }   // the viewer said no, or saving is switched off in this view
  }
  const a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: type || "text/csv;charset=utf-8" }));
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
document.addEventListener("click", e => {
  const a = e.target.closest("a[download]"); if (!a || !window.claude) return;
  e.preventDefault(); const href = a.getAttribute("href");
  fetch(href).then(r => r.text()).then(t => download(href.split("/").pop(), t)).catch(() => {});
});
const cell = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const RUN_COLS = ["accession", "investigation", "fuel_type", "test_id", "fuel_or_material", "o2_percent", "pressure_atm", "pressure_source", "outcome", "outcome_in_source", "co2_mole_fraction", "he_mole_fraction", "droplet_diameter_mm", "extinction_diameter_mm", "burning_rate", "burn_time_s", "airflow_cm_s", "flow_direction", "normal_gravity_result", "materials", "psi_url"];
const OUTCOME = { ext: "self-extinguished", burn: "burned", noign: "did not ignite", other: "other", na: "" };
const runRow = t => [t.i, t.a, t.k, t.id, t.f, t.o, t.p, t.ps === "recorded" ? "recorded" : t.ps === "assumed" ? "not recorded (cabin pressure)" : "", OUTCOME[t.r], t.rr, t.co2, t.he, t.d0, t.dx, t.kb, t.t, t.flow, t.dir, t.g1, (t.m || []).join(" "), inv(t.i).url];
const runsCsv = tests => [RUN_COLS.join(",")].concat(tests.map(t => runRow(t).map(cell).join(","))).join("\n") + "\n";

/* ---------- compare ---------- */
function compareHtml() {
  const sel = state.cmp.map(inv).filter(Boolean);
  if (sel.length < 2) return "";
  const yrs = i => (i.start ? i.start.slice(-4) : "?") + " to " + (i.end ? i.end.slice(-4) : "?");
  const list = (i, test) => colsOf(i, test).map(c => c.h).join("; ") || "–";
  const ROWS = [
    ["Role in fire safety", i => i.pillars.map(p => PILLAR[p]).join(", ") || "Fundamentals"],
    ["How the challenge statement treats it", i => i.tier_why],
    ["What burned", i => i.fuel_label],
    ["Fuels in the table", i => colsOf(i, c => c.role === "fuel").map(c => c.top.map(t => t[0]).join("; ") + (c.d > c.top.length ? `; and ${c.d - c.top.length} more` : "")).join(" · ") || "–"],
    ["Sample or burner size", i => colsOf(i, c => c.role === "geometry").map(varText).join(" · ") || "–"],
    ["Hardware", i => famOf(i) ? famOf(i).name : (i.hardware || "–")],
    ["Platform and years", i => (i.ground ? "Ground study" : i.platform.replace("International Space Station (ISS)", "Space station")) + ", " + yrs(i)],
    ["Oxygen, %", i => rng(i.o2, f1)],
    ["Pressure, atm", i => rng(i.p, f2)],
    ["What changed between runs", i => list(i, varied)],
    ["What stayed the same", i => list(i, constant)],
    ["What was recorded in the table", i => list(i, result)],
    ["Measurements named in the record", i => i.measures.join("; ") || "–"],
    ["Runs listed", i => String(i.rows || "–")],
    ["Raw data and papers", i => (i.raw_gb ? (i.raw_gb >= 1000 ? f1(i.raw_gb / 1000) + " TB" : Math.round(i.raw_gb) + " GB") : "no raw data") + ", " + plural(i.npub, "paper")]
  ];
  const body = ROWS.map(([label, fn]) => { const vals = sel.map(fn), same = vals.every(v => v === vals[0]) && vals[0] !== "–"; return { label, vals, same }; });
  const common = body.filter(r => r.same).map(r => r.label.toLowerCase());
  return `<div class="cmphead"><span class="lab">Side by side</span><p>${common.length ? "The same in all of them: " + esc(common.join(", ")) + "." : "Nothing in this table is identical across them."} Rows that match are marked.</p><button class="chip" id="cmpclear" type="button">Clear</button></div>
    <div class="tablewrap"><table class="cmp"><thead><tr><th></th>${sel.map(i => `<th>${esc(nameOf(i))}</th>`).join("")}</tr></thead><tbody>${body.map(r => `<tr class="${r.same ? "same" : ""}"><th scope="row">${esc(r.label)}${r.same ? `<span class="tagk">same</span>` : ""}</th>${r.vals.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

/* ---------- the ranked table ---------- */
function detailHtml(i, x) {
  const fam = famOf(i), sib = fam ? fam.members.filter(a => a !== i.acc).map(inv) : [];
  const none = i.rows ? "Not in the run table." : "PSI holds no run table for this investigation.";
  const P = (h, t) => `<div><h4>${h}</h4><p>${esc(t || "Not given in the record.")}</p></div>`;
  return `<tr class="detail"><td colspan="8"><div class="dcols">
    <div><h4>Why it ranks here</h4><ul class="why">${x.parts.map(p => `<li><b>${Math.round(p[1] * 100)}</b><span>${esc(IW[p[0]] || "Link to partial gravity")}: ${esc(p[3])}</span></li>`).join("")}</ul></div>
    <div><h4>Fuel, shape and size</h4>${ul(colsOf(i, isFuel).map(varText), none)}</div>
    <div><h4>What changed between runs</h4>${ul(colsOf(i, varied).map(varText), none)}</div>
    <div><h4>What stayed the same</h4>${ul(colsOf(i, constant).map(varText), i.rows ? "No condition was held constant across the whole table." : none)}</div>
    <div><h4>What was recorded in the table</h4>${ul(colsOf(i, result).map(varText), i.rows ? "The table lists conditions only. Results are in video, data files and papers." : none)}</div>
    <div><h4>Measurements named in the record</h4>${ul(i.measures, "None named.")}</div>
    <div><h4>Hardware</h4><p>${esc(i.hardware || "Not given in the record.")}</p>${fam ? `<p>${esc(fam.name)}${sib.length ? ". Shared with " + sib.map(s => `<a href="#archive" data-open="${s.acc}">${esc(nameOf(s))}</a>`).join(", ") : ""}.</p>` : ""}</div>
    ${P("Full title", i.title)}${P("Objective", i.objective)}${P("Hypothesis", i.hypothesis)}${P("Approach", i.approach)}${P("Why it matters", i.impacts)}
    <div><h4>Publications (${i.pubs.length})</h4><ol>${i.pubs.map(p => `<li>${p.doi ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener">${esc(p.t)}</a>` : esc(p.t)}</li>`).join("") || "<li>None listed</li>"}</ol></div>
    <div><h4>Record</h4><p><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.acc)} on NASA PSI</a>${i.doi ? `<br>DOI ${esc(i.doi)}` : ""}<br>${esc(i.start || "?")} to ${esc(i.end || "?")}<br>Licence ${esc(i.lic || "not stated")}</p>
      <p class="fine" style="margin-top:6px">The one-line summary in the row was drafted with SI from this record. Every number in it is checked against the record or its table when the site is built. The lists above are computed from the PSI run table.</p></div>
  </div></td></tr>`;
}
function invSetup() {
  const chipRow = (box, items, key) => { items.forEach(([id, label]) => { const b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.textContent = label; b.dataset.v = id; b.onclick = () => { state[key] = id; drawInv(); }; box.appendChild(b); }); };
  chipRow($("#invhab"), HABITATS.map(h => [h.id, h.name]), "hab");
  chipRow($("#invpillar"), [["all", "All"], ...Object.entries(PILLAR), ["none", "Fundamentals"]], "pillar");
  chipRow($("#invkind"), FUELSETS, "fuel");
  const rb = document.createElement("button"); rb.className = "chip"; rb.type = "button"; rb.id = "invres"; rb.textContent = "Results in table"; rb.onclick = () => { state.withResults = !state.withResults; drawInv(); }; $("#invkind").appendChild(rb);
  $("#invweights").innerHTML = Object.keys(IW).map(k => `<label class="field" for="iw_${k}"><span>${IW[k]} <output id="iwv_${k}">${state.iw[k]}</output></span><input id="iw_${k}" type="range" min="0" max="50" step="5" value="${state.iw[k]}"></label>`).join("");
  Object.keys(IW).forEach(k => { $("#iw_" + k).oninput = e => { state.iw[k] = +e.target.value; $("#iwv_" + k).textContent = e.target.value; drawInv(); }; });
  $("#invq").oninput = e => { state.invq = e.target.value; drawInv(); };
  const toggle = acc => { state.open = state.open === acc ? null : acc; drawInv(); };
  $("#invtable").addEventListener("click", e => {
    const jump = e.target.closest("a[data-open]"); if (jump) { e.preventDefault(); state.open = jump.dataset.open; state.pillar = "all"; state.fuel = "all"; state.withResults = false; state.invq = ""; $("#invq").value = ""; drawInv(); const el = $(`#invtable tr[data-acc="${jump.dataset.open}"]`); if (el) el.scrollIntoView({ block: "center" }); return; }
    if (e.target.closest("a, input, label")) return;
    const tr = e.target.closest("tr.row"); if (tr) toggle(tr.dataset.acc);
  });
  $("#invtable").addEventListener("change", e => { const c = e.target.closest("input[data-cmp]"); if (!c) return; const a = c.dataset.cmp; state.cmp = c.checked ? state.cmp.concat(a).slice(-3) : state.cmp.filter(z => z !== a); drawInv(); });
  $("#invtable").addEventListener("keydown", e => { if ((e.key !== "Enter" && e.key !== " ") || e.target.closest("input")) return; const tr = e.target.closest("tr.row"); if (tr) { e.preventDefault(); toggle(tr.dataset.acc); } });
  $("#invcompare").addEventListener("click", e => { if (e.target.closest("#cmpclear")) { state.cmp = []; drawInv(); } });
  $("#invfam").addEventListener("click", e => { const b = e.target.closest("button[data-fam]"); if (!b) return; state.cmp = D.families.find(f => f.id === b.dataset.fam).members.slice(0, 3); drawInv(); $("#invcompare").scrollIntoView({ block: "start" }); });
  $("#dlshown").onclick = () => { const accs = new Set(invRows().map(x => x.i.acc)); download("quench-runs-selected.csv", runsCsv(D.tests.filter(t => accs.has(t.i)))); };
}
function invRows() {
  const q = state.invq.toLowerCase();
  return rankInv(habitat()).filter(x => { const i = x.i;
    return (state.pillar === "all" || (state.pillar === "none" ? !i.pillars.length : i.pillars.includes(state.pillar)))
      && (state.fuel === "all" || fuelSet(i) === state.fuel) && (!state.withResults || i.outcome)
      && (!q || (i.acr + " " + i.title + " " + i.keywords + " " + i.area + " " + i.objective + " " + (i.summary || "") + " " + i.fuel_label + " " + i.measures.join(" ")).toLowerCase().includes(q)); });
}
function drawInv() {
  const T = habitat(), all = rankInv(T), pos = new Map(all.map((x, n) => [x.i.acc, n + 1])), rows = invRows();
  const press = (sel, v) => document.querySelectorAll(sel + " .chip[data-v]").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === v));
  press("#invhab", state.hab); press("#invpillar", state.pillar); press("#invkind", state.fuel); $("#invres").setAttribute("aria-pressed", state.withResults);
  $("#invsub").textContent = `The ${S.combustion} combustion investigations in NASA's Physical Sciences Informatics repository, ranked by how much each one tells you about fire safety in the habitat you pick. Open a row to see what it burned, what changed between its runs and what it measured. Tick two or three to compare them.`;
  const grav = T.g === "0" ? "" : " For a habitat with partial gravity, a link to partial gravity adds a fifth part with a fixed weight of 10.";
  $("#invrule").textContent = `Each part is scored from 0 to 100 and the weights above combine them. Named for fire safety: 100 if the challenge statement names the investigation as a prevention, detection or suppression study, 70 if it names it as related, PSI files it under fire safety or it builds on a named study, 40 otherwise. Fuel: solid materials 100, smoke 90, gas burner emulating solids 80, droplets 60, aerosol instrument 50, gas flames 30. Tested near this cabin's air: 100 for ten or more runs within ${S.o2_window} points of oxygen and ${Math.round(S.p_window * 100)} % of pressure, 80 for fewer, 50 for the right oxygen at another or unrecorded pressure, 20 for other oxygen levels, 0 with no oxygen level in the table. Data ready to use: 100 with results in the run table, down to 15 when PSI holds papers only.${grav} The parts follow NASA's records and the challenge statement; the numbers given to them are our judgement.`;
  $("#invhabnote").textContent = `${T.name}: ${f1(T.o2)} % oxygen, ${f1(T.psia)} psia, ${T.g === "0" ? "microgravity" : T.g === "moon" ? "one sixth gravity" : "three eighths gravity"}.` + (T.id === "mars" ? " The Mars-base air is our assumption: the challenge statement gives no figure for it, so the exploration atmosphere is used." : T.id === "moon" ? ` The challenge statement expects ${f1(S.moon_o2_min)} % oxygen or more at ${f1(S.moon_psia_max)} psi or less; NASA's exploration atmosphere is used here.` : "");
  $("#invtable").innerHTML = `<thead><tr><th class="n">Rank</th><th>Investigation</th><th>What burned</th><th class="n">Runs</th><th class="n">Oxygen %</th><th>Near this cabin</th><th class="n">Score</th><th>Compare</th></tr></thead><tbody>` +
    rows.map(x => { const i = x.i, a = x.parts[2];
      return `<tr class="row" data-acc="${i.acc}" tabindex="0" aria-expanded="${state.open === i.acc}"><td class="n">${pad2(pos.get(i.acc))}</td><td><b>${esc(nameOf(i))}</b>${roleTags(i)}<br><span class="fine">${esc(i.summary || i.title)}</span></td><td>${esc(i.fuel_label)}</td><td class="n">${i.rows || "–"}</td><td class="n">${rng(i.o2, f1)}</td><td class="fine">${esc(a[3])}</td><td class="n sccell"><b>${Math.round(x.s)}</b>${sbar(x)}</td><td><label class="cmpbox"><input type="checkbox" data-cmp="${i.acc}" ${state.cmp.includes(i.acc) ? "checked" : ""} aria-label="Compare ${esc(nameOf(i))}"></label></td></tr>` + (state.open === i.acc ? detailHtml(i, x) : ""); }).join("") + "</tbody>";
  const skipped = D.investigations.filter(i => !i.combustion);
  $("#invnote").textContent = `${rows.length} of ${S.combustion} investigations shown. The score bar is split into its parts; hover a part to read it. The archive search for "combustion" also returns ${skipped.map(i => i.acc).join(" and ")}, which are about solders and fluid physics and are left out.`;
  const cmp = compareHtml(); $("#invcompare").innerHTML = cmp || (state.cmp.length === 1 ? `<p class="fine">Tick one or two more investigations to compare them with ${esc(nameOf(inv(state.cmp[0])))}.</p>` : ""); $("#invcompare").hidden = !state.cmp.length;
  $("#invfam").innerHTML = D.families.map(f => `<div class="hcard"><span class="lab">${f.members.length} investigations</span><h3>${esc(f.name)}</h3><p>${f.members.map(a => `<a href="#archive" data-open="${a}">${esc(nameOf(inv(a)))}</a>`).join(", ")}</p>${f.quote ? `<blockquote>“${esc(f.quote.text)}”<cite><a href="${esc(f.quote.url)}" target="_blank" rel="noopener">Challenge statement</a></cite></blockquote>` : ""}<button class="chip" type="button" data-fam="${f.id}">Compare ${f.members.length > 3 ? "the first three" : "them"}</button></div>`).join("");
  $("#dlshown").textContent = `Runs of the ${rows.length} shown (CSV)`;
}
$("#invfam").addEventListener("click", e => { const a = e.target.closest("a[data-open]"); if (!a) return; e.preventDefault(); state.open = a.dataset.open; state.pillar = "all"; state.fuel = "all"; state.withResults = false; state.invq = ""; $("#invq").value = ""; drawInv(); const el = $(`#invtable tr[data-acc="${a.dataset.open}"]`); if (el) el.scrollIntoView({ block: "center" }); });
