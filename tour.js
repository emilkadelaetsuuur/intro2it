/* QUENCH guided tour: seven stops through the dashboard in about a minute.
   It only navigates and points; it changes no settings and calls no service.
   SI notice: written with SI (AI) assistance (Claude, Anthropic). */
(() => {
  const data = window.FLAME;
  if (!data || typeof go !== "function") return;
  const stats = data.stats;
  const model = data.model_card;
  const published = (data.external_saffire6?.runs || []).filter(r => r.pressure_kpa != null &&
    r.oxygen_percent >= stats.moon_o2_min && r.pressure_kpa / 101.325 * 14.696 <= stats.moon_psia_max).length;
  const stops = [
    ["brief", ".cabin-panel", "Start with the gap",
      `NASA expects Moon-base air with ${stats.moon_o2_min} % oxygen or more. Pick a cabin here: for exploration air, the PSI run tables hold ${stats.hi_o2.solid} solid-material runs.`],
    ["evidence", "#chart", "Every flight run on one map",
      `${stats.tests} runs by oxygen and pressure. The dashed box is the Moon-base range. Triangles are Saffire-VI results published outside PSI: ${published} of them are the only solid-material points inside it.`],
    ["mission", "#mcverdict", "Check your own cabin",
      "Set oxygen, pressure, gravity, materials and extinguishing agent. Each fire-safety question gets a grade from written rules, with the tests the mission still needs."],
    ["archive", "#invtable", "Rank the investigations",
      `${stats.combustion} investigations ranked for the habitat you pick. Open a row to see what it burned, what changed between runs and what it measured. Tick two or three to compare them.`],
    ["findings", "#flist", "What it means for fire safety",
      `${data.findings.length} findings sorted into prevention, detection and suppression. Each one shows its evidence, its limits, an action and the NASA records behind it.`],
    ["lab", "#pout", "Data you can model",
      model ? `Every run downloads as CSV. This predictor is right ${Math.round(model.acc * 100)} % of the time on test days it never saw, against ${Math.round(model.base_acc * 100)} % for guessing, and it says when it extrapolates.`
        : "Every run downloads as CSV, with a worked predictor and flame spread read from NASA video."],
    ["ask", "#askform", "Ask in plain words",
      `Common questions get one of ${data.answers.length} checked answers at once, with the records behind each statement. Anything else searches the resources the challenge organizers selected.`]
  ];

  const bar = document.createElement("section");
  bar.className = "tour";
  bar.hidden = true;
  bar.setAttribute("role", "dialog");
  bar.setAttribute("aria-label", "Guided tour");
  bar.innerHTML = `<p class="tour-step" id="tour-step"></p><div class="tour-copy"><h2 id="tour-title"></h2><p id="tour-text" aria-live="polite"></p></div>
    <div class="tour-actions"><button type="button" id="tour-back">Back</button><button type="button" id="tour-next" class="primary">Next</button><button type="button" id="tour-end" aria-label="End the tour">End</button></div>`;
  document.body.append(bar);
  const stepLabel = bar.querySelector("#tour-step"), title = bar.querySelector("#tour-title"), text = bar.querySelector("#tour-text");
  const back = bar.querySelector("#tour-back"), next = bar.querySelector("#tour-next"), end = bar.querySelector("#tour-end");
  let index = -1, marked = null, opener = null;

  function mark(element) {
    if (marked) marked.classList.remove("tour-target");
    marked = element;
    if (element) {
      element.classList.add("tour-target");
      // Put the target under the masthead, clear of the tour bar at the bottom.
      element.scrollIntoView({block: "start", behavior: "auto"});
    }
  }

  function showStop(i) {
    index = i;
    const [view, selector, heading, body] = stops[i];
    go(view);
    stepLabel.textContent = `Tour · ${i + 1} of ${stops.length}`;
    title.textContent = heading;
    text.textContent = body;
    back.disabled = i === 0;
    next.textContent = i === stops.length - 1 ? "Finish" : "Next";
    // The view draws on navigation; point at the target once it has laid out.
    requestAnimationFrame(() => requestAnimationFrame(() => mark(document.querySelector(selector))));
  }

  function start(from) {
    opener = from || null;
    document.getElementById("cosmo-close")?.click();
    document.body.classList.add("touring");
    bar.hidden = false;
    showStop(0);
    next.focus({preventScroll: true});
  }

  function finish() {
    mark(null);
    bar.hidden = true;
    index = -1;
    document.body.classList.remove("touring");
    if (opener && opener.isConnected && opener.offsetParent) opener.focus({preventScroll: true});
  }

  next.addEventListener("click", () => index >= stops.length - 1 ? finish() : showStop(index + 1));
  back.addEventListener("click", () => { if (index > 0) showStop(index - 1); });
  end.addEventListener("click", finish);
  document.addEventListener("keydown", event => {
    if (bar.hidden || event.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); finish(); }
    else if (event.key === "ArrowRight" && !event.target.closest("input, textarea, select")) next.click();
    else if (event.key === "ArrowLeft" && !event.target.closest("input, textarea, select")) back.click();
  });
  // Leaving the stop by hand ends the tour instead of fighting the visitor.
  window.addEventListener("hashchange", () => {
    if (!bar.hidden && index >= 0 && location.hash.slice(1) !== stops[index][0]) finish();
  });
  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-tour-start]");
    if (trigger) { event.preventDefault(); start(trigger); }
  });
  window.QUENCH_TOUR = Object.freeze({start, stops: stops.length});
})();
