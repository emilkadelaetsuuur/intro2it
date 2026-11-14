/* QUENCH Ask answers in two steps. First it looks for a checked analyst answer shipped with the
   page (no network, instant). Otherwise it searches the organizer corpus served by /api/ask, or
   its public snapshot when the service cannot be reached. */
(() => {
  const pagesOrigin = "https://emilkadelaetsuuur.github.io";
  const liveSite = "https://nasa.cartify.ink";
  const askEndpoint = location.origin === pagesOrigin ? liveSite + "/api/ask" : "/api/ask";
  const form = document.getElementById("askform");
  const input = document.getElementById("askq");
  const submitButton = form.querySelector("[type=submit]");
  const status = document.getElementById("ask-status");
  const result = document.getElementById("answer");
  const resultLabel = document.getElementById("ask-result-label");
  const resultText = document.getElementById("ask-result-text");
  const sources = document.getElementById("ask-sources");
  const sourceList = sources.querySelector("ol");
  const examples = document.getElementById("askchips");
  const sourceUrls = new Set([
    "https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation",
    "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/",
    "https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/",
    "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/",
    "https://www.youtube.com/watch?v=W1oXykoz9zg",
    "https://sma.nasa.gov/sma-disciplines/accllp/apollo-1",
    "https://sma.nasa.gov/sma-disciplines/accllp/apollo-13",
    "https://spinoff.nasa.gov/node/9582",
    "https://spinoff.nasa.gov/node/9407",
    "https://spinoff.nasa.gov/node/9918"
  ]);
  for (const accession of [10, 20, 21, 22, 23, 25, 26, 39, 47, 60, 62, 68, 69, 98, 99, 100, 101, 102, 106, 107, 108, 115, 117, 142, 159, 181]) {
    sourceUrls.add("https://psi.nasa.gov/physci/repo/data/investigations/PSI-" + accession);
  }
  let archive;
  let busy = false;

  function safeSource(source) {
    return source && typeof source.title === "string" && source.title.trim() && sourceUrls.has(source.url);
  }

  // Local search displays one intact source passage, even when the model service is unreachable.
  const stop = new Set(("a an and are as at be by can did do does for from how in into is it of on or that the this to was what when which why with " +
    "about aboard according change describe during happen nasa spacecraft tell using " +
    "в во для и из как какие какой ли на о от по почему при с со у что это").split(" "));
  const aliases = [
    [/^(измер|measur)/u, "measure"], [/^(космонавт|astronaut)/u, "crew"],
    [/^(кислород|o2$)/u, "oxygen"], [/^(давлен)/u, "pressure"],
    [/^(вентиляц|вентилятор|airflow|ventilation|fans?$)/u, "flow"],
    [/^(микрогравитац|невесом)/u, "microgravity"], [/^(гравитац|тяжест)/u, "gravity"], [/^форм/u, "shape"], [/^мир$/u, "mir"],
    [/^аполлон/u, "apollo"], [/^(причин|вызва|cause)/u, "cause"],
    [/^(пожарн|firefight|fireman|firemen)/u, "firefighter"], [/^(пожар|fires?$)/u, "fire"],
    [/^(технолог|technolog)/u, "technology"], [/^(баллон|tanks?$)/u, "tank"],
    [/^(скафандр|spacesuits?$)/u, "spacesuit"], [/^воздух/u, "air"],
    [/^(станци|station)/u, "station"], [/^исследова/u, "research"],
    [/^(плам|flames?$)/u, "flame"], [/^дым/u, "smoke"],
    [/^(частиц|particles?$)/u, "particle"], [/^(датчик|детектор|detect)/u, "detector"]
  ];
  function terms(text) {
    const words = text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+(?:[.,]\d+)?/gu) || [];
    return new Set(words.filter(word => !stop.has(word)).map(word => {
      const alias = aliases.find(([pattern]) => pattern.test(word));
      return alias ? alias[1] : word.replace(",", ".");
    }));
  }

  async function localPassage(question) {
    if (!archive) {
      const response = await fetch("downloads/ask-sources.json", {credentials: "omit", redirect: "error", signal: AbortSignal.timeout(8000)});
      if (!response.ok) throw new Error("Archive unavailable");
      const records = await response.json();
      if (!Array.isArray(records) || !records.length || !records.every(r => safeSource(r) && typeof r.text === "string" && r.text.trim())) {
        throw new Error("Invalid archive");
      }
      archive = records.map(record => ({record, title: terms(record.title), words: terms(record.title + " " + record.text)}));
    }
    const query = [...terms(question)];
    const numbers = query.filter(word => /^\d/.test(word));
    const weights = new Map(query.map(word => {
      const count = archive.filter(entry => entry.words.has(word)).length;
      return [word, Math.log(1 + archive.length / (1 + count))];
    }));
    let best = null;
    let bestScore = 0;
    for (const entry of archive) {
      const hits = query.filter(word => entry.words.has(word));
      if (!hits.length || hits.length < Math.ceil(query.length * .6) || !numbers.every(word => entry.words.has(word))) continue;
      const score = hits.reduce((sum, word) => sum + weights.get(word) * (entry.title.has(word) ? 1.6 : 1), 0);
      if (score > bestScore) {
        best = entry.record;
        bestScore = score;
      }
    }
    return best ? {answer: best.text + " [1]", sources: [best], mode: "archive", supported: true} :
      {answer: "", sources: [], mode: "archive", supported: false};
  }

  function evidence(data, local) {
    if (!data || !["claude", "archive"].includes(data.mode) || !Array.isArray(data.sources)) throw new Error("Invalid reply");
    if (data.supported === false || !data.sources.length) {
      return {label: "No supporting passage found",
        answer: "The available organizer resources do not establish an answer. Try naming a specific experiment, material or mission.",
        sources: [], local};
    }
    if (typeof data.answer !== "string" || !data.answer.trim() || !data.sources.every(safeSource)) throw new Error("Invalid evidence");
    return {label: data.mode === "claude" ? "Claude-selected evidence" : "Matching archive excerpt",
      answer: data.answer, sources: data.sources, local};
  }

  function sourceLink(source) {
    const link = document.createElement("a");
    link.href = source.url;
    link.textContent = source.title;
    if (source.go) {
      // A section of this site: the page's own navigation handles it.
      link.dataset.go = source.go;
      if (source.finding) link.dataset.f = source.finding;
    } else {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    return link;
  }

  function appendSources(list, references) {
    for (const source of references) {
      const item = document.createElement("li");
      item.append(sourceLink(source));
      list.append(item);
    }
  }

  /* Checked analyst answers. They were drafted with SI ahead of time, and the build checks every
     statement against the records it cites: the records must exist and each number must appear
     in them with the same unit. Matching runs in the browser, so nothing is generated on the spot. */
  const bank = (() => {
    const data = window.FLAME;
    if (!data || !Array.isArray(data.answers)) return {match: () => null};
    const stopWords = new Set(("a an and are as at be but by can did do does for from has have how if in into is it its of on or " +
      "that the their there these this to was we what when where which who why will with would you your any about been were " +
      "than then so not no out up down").split(" "));
    const stem = word => word.replace(/(ing|ed|es|s)$/, "");
    const tokens = text => text.toLowerCase().replace(/percent/g, "%").replace(/[^a-z0-9.% ]+/g, " ").split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.has(word)).map(stem);
    const synonyms = Object.create(null);   // no inherited keys: a visitor may type "constructor"
    Object.entries({moon: ["lunar", "exploration", "gravity"], lunar: ["moon", "exploration", "gravity"],
      mars: ["martian", "exploration", "gravity"], o2: ["oxygen"], oxygen: ["o2"],
      extinguish: ["extinction", "suppression", "suppressant", "extinguisher"], extinguisher: ["suppressant", "suppression", "jet"],
      ventilation: ["airflow", "flow", "fan"], fan: ["ventilation", "airflow"], airflow: ["ventilation", "flow"],
      smoke: ["detector", "detection"], detector: ["smoke", "detection"], material: ["solid", "fabric", "pmma"],
      plastic: ["pmma", "solid", "material"], liquid: ["droplet", "fuel"], droplet: ["liquid"], data: ["video", "table", "raw"],
      pressure: ["psia", "atm"], standard: ["6001", "approval", "ground"], habitat: ["cabin", "base"], base: ["moon", "habitat"],
      co2: ["carbon", "dioxide"], investigation: ["experiment"], study: ["experiment"], burn: ["fire", "flame"],
      safe: ["safety", "risk"], gap: ["missing", "untested"], accurate: ["accuracy", "good"],
      earth: ["firefighter", "spinoff", "benefit"]}).forEach(([word, list]) => { synonyms[stem(word)] = list.map(stem); });
    const entries = data.answers.map(answer => ({answer, phrasings: answer.q.map(q => new Set(tokens(q)))}));
    const frequency = Object.create(null);
    for (const entry of entries) {
      const seen = new Set();
      entry.phrasings.forEach(set => set.forEach(word => seen.add(word)));
      seen.forEach(word => { frequency[word] = (frequency[word] || 0) + 1; });
    }
    const weight = word => frequency[word] ? Math.log(1 + entries.length / frequency[word]) : 0;

    // Summed weight of the question's words found in an answer's stored phrasings. Rare words weigh
    // more, a synonym counts for 60 %, and words the bank never uses add nothing.
    function best(base) {
      let top = {score: 0, rank: -1, entry: null, phrasing: ""};
      for (const entry of entries) {
        const all = new Set();
        entry.phrasings.forEach(set => set.forEach(word => all.add(word)));
        const hit = (set, word) => {
          if (set.has(word)) return weight(word);
          const alias = (synonyms[word] || []).find(other => set.has(other));
          return alias ? .6 * weight(alias) : 0;
        };
        const score = base.reduce((sum, word) => sum + hit(all, word), 0);
        const matched = base.filter(word => hit(all, word) > 0).length;
        let closest = 0, extra = 0, index = 0;
        entry.phrasings.forEach((set, i) => {
          const value = base.reduce((sum, word) => sum + hit(set, word), 0);
          if (value > closest) { closest = value; extra = [...set].filter(word => !base.includes(word)).length; index = i; }
        });
        const rank = score + .3 * closest - .05 * extra;
        if (score > 0 && rank > top.rank) top = {score, rank, entry, matched, phrasing: entry.answer.q[index]};
      }
      return top;
    }

    function references(id) {
      const section = (title, go, finding) => [{title, url: "#" + go, go, finding}];
      const record = /^PSI-\d+$/.test(id) && data.investigations.find(item => item.acc === id);
      if (record) return [{title: (record.acr || id) + " (" + id + ") on NASA PSI", url: record.url}];
      if (id.startsWith("F-")) {
        const finding = data.findings.find(item => item.id === id.slice(2));
        return finding ? section("Finding: " + finding.title, "findings", finding.id) : [];
      }
      if (id.startsWith("H-") || id.startsWith("S-")) return section("Lessons from real fires", "lessons");
      if (id.startsWith("N-")) {
        const next = data.next.find(item => item.id === id.slice(2));
        return next ? [{title: next.name + ": " + next.full, url: next.url}] : [];
      }
      if (id.startsWith("M-")) return section("Mission check: materials", "mission");
      if (id === "VIDEO" || id === "MODEL") return section("Lab: predictor and video measurements", "lab");
      if (id === "GUIDE") return [{title: data.quotes.not_conservative.src, url: data.quotes.not_conservative.url}];
      if (id === "CHALLENGE") return [{title: "Flame in Freefall challenge statement", url: data.meta.challenge_url}];
      if (id === "SAFFIRE6") return [{title: "Saffire-VI flight events (NASA report)", url: saffireReport},
        {title: "Saffire-VI results (NASA report)", url: saffireResults}];
      if (id === "SOFIEGEL") return [{title: "SoFIE-GEL flight study", url: sofieReport}];
      return section("Method and limits", "method");
    }

    function match(question) {
      const base = tokens(question);
      if (!base.length) return null;
      // A request for a count at given conditions needs a much closer match than a general question.
      const counting = /\b(how many|number of|count)\b/i.test(question) && /\d/.test(question);
      const top = best(base);
      if (!top.entry || top.score < (counting ? 4.8 : 2.7)) return null;
      // One shared word out of several is not enough ("weather on Mars" is not about gravity data):
      // more than half of the question's words must match, unless the match is strong on its own.
      if (base.length > 1 && top.matched / base.length <= .5 && top.score < 5) return null;
      const seen = new Set();
      const sources = [];
      const claims = top.entry.answer.claims.map(claim => {
        const refs = claim.sources.flatMap(references);
        for (const ref of refs) {
          const key = ref.title + "|" + ref.url;
          if (!seen.has(key)) { seen.add(key); sources.push(ref); }
        }
        return {text: claim.text, refs};
      });
      return {label: "Checked analyst answer", answer: top.entry.answer.a, claims, sources,
        matched: top.phrasing, checked: true, local: false, id: top.entry.answer.id,
        coverage: [top.matched, base.length], score: top.score};
    }
    return {match, size: entries.length};
  })();
  // Read-only hook for the interface tests.
  window.QUENCH_ASK = Object.freeze({checkedAnswer: bank.match, checkedAnswers: bank.size});

  const checkedNote = "Drafted with SI ahead of time. The build checked each statement below against the NASA records it cites.";
  const resultNote = document.getElementById("ask-result-note");
  const claimBox = document.getElementById("ask-claims");
  const moreButton = document.getElementById("ask-more");
  let lastQuestion = "";

  function showResult(reply, question) {
    lastQuestion = question;
    resultLabel.textContent = reply.label;
    resultText.textContent = reply.answer;
    resultNote.hidden = !reply.checked;
    resultNote.textContent = reply.checked ? "Closest stored question: “" + reply.matched + "” " + checkedNote : "";
    const claimList = claimBox.querySelector("ul");
    claimList.replaceChildren();
    for (const claim of reply.claims || []) {
      const item = document.createElement("li");
      item.append(claim.text + " ");
      claim.refs.forEach((ref, index) => { if (index) item.append(" · "); item.append(sourceLink(ref)); });
      claimList.append(item);
    }
    claimBox.hidden = !reply.checked;
    moreButton.hidden = !reply.checked;
    sourceList.replaceChildren();
    appendSources(sourceList, reply.checked ? [] : reply.sources);
    sources.hidden = reply.checked || !reply.sources.length;
    result.hidden = false;
    status.textContent = reply.local ? "Live Ask is unavailable. Showing results from the local organizer archive." : "";
    const edited = question !== input.value.trim().replace(/\s+/gu, " ");
    const questionLabel = document.getElementById("ask-result-question");
    questionLabel.hidden = !edited;
    questionLabel.textContent = question;
    if (!edited && !document.getElementById("v-ask").hidden && (form.contains(document.activeElement) || examples.contains(document.activeElement))) {
      resultLabel.focus({preventScroll: true});
      result.scrollIntoView({block: "nearest"});
    } else if (!reply.local) {
      status.textContent = resultLabel.textContent + ".";
    }
  }

  async function search(question, sourcesOnly = false) {
    if (!sourcesOnly) {
      const checked = bank.match(question);
      if (checked) return checked;
    }
    let response;
    try {
      response = await fetch(askEndpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json", "Accept": "application/json"},
        credentials: "omit",
        redirect: "error",
        body: JSON.stringify({question}),
        signal: AbortSignal.timeout(38000)
      });
      if (response.ok && response.headers.get("Content-Type")?.includes("application/json")) {
        return evidence(await response.json(), false);
      }
    } catch {
      // A static mirror can still serve its verified snapshot when live search is unreachable.
    }
    if (response && [400, 413, 422].includes(response.status)) {
      throw new Error("Ask accepts up to 600 printable characters. Check your question and try again.");
    }
    try {
      return evidence(await localPassage(question), true);
    } catch {
      throw new Error(response?.status === 429 ? "Ask is busy. Try your question again in a minute." :
        "Ask could not reach the organizer archive. Check your connection and try again.");
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const question = input.value.trim().replace(/\s+/gu, " ");
    if (!question) {
      input.setCustomValidity("Enter a question first.");
      input.reportValidity();
      return;
    }
    busy = true;
    submitButton.setAttribute("aria-disabled", "true");
    result.hidden = true;
    status.textContent = "Searching the organizer sources…";
    try {
      showResult(await search(question), question);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;
      submitButton.removeAttribute("aria-disabled");
    }
  });
  moreButton.addEventListener("click", async () => {
    if (busy || !lastQuestion) return;
    busy = true;
    submitButton.setAttribute("aria-disabled", "true");
    moreButton.hidden = true;
    status.textContent = "Searching the organizer sources…";
    try {
      showResult(await search(lastQuestion, true), lastQuestion);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;
      submitButton.removeAttribute("aria-disabled");
    }
  });
  input.addEventListener("input", () => input.setCustomValidity(""));
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  examples.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || busy) return;
    input.value = button.textContent.trim();
    input.setCustomValidity("");
    form.requestSubmit();
  });

  function setupCosmo() {
    const toggle = document.getElementById("cosmo-toggle");
    const panel = document.getElementById("cosmo-panel");
    if (!toggle || !panel) return;
    const close = document.getElementById("cosmo-close");
    const log = document.getElementById("cosmo-log");
    const intro = document.getElementById("cosmo-intro");
    const composer = document.getElementById("cosmo-form");
    const field = document.getElementById("cosmo-input");
    const send = document.getElementById("cosmo-send");
    const feedback = document.getElementById("cosmo-status");
    const viewport = window.visualViewport;
    const context = document.getElementById("cosmo-point-context");
    const contextName = document.getElementById("cosmo-point-name");
    const clearPoint = document.getElementById("cosmo-point-clear");
    const conversations = new Map();
    let exchanges = [];
    let point = null;
    let origin = null;
    let returnToPoint = false;
    let contextVersion = 0;
    let interruptedSearch = null;
    // A map index is meaningful only for the data and grouping rules loaded by this tab.
    const pointDataset = ["data.js", "core.js", "evidence-records.js"].map(name => {
      const tag = document.querySelector(`script[src^="${name}?"]`);
      return tag ? new URL(tag.src).searchParams.get("v") : "";
    }).join(".");
    const russianUI = /^ru\b/i.test(navigator.language);
    if (russianUI) {
      context.querySelector(".cosmo-point-label").textContent = "Точка на карте";
      clearPoint.textContent = "Снять выбор";
    }
    let pending = false;
    let unread = null;
    let draftVersion = 0;

    // Keep a separate draft and transcript for the general chat and recently opened points.
    function switchConversation(next) {
      if (point === next) return;
      if (pending && interruptedSearch) {
        interruptedSearch.controller?.abort();
        if (!field.value && interruptedSearch.version === draftVersion) field.value = interruptedSearch.draft;
        const stopped = addMessage("notice", "Cosmo", russianUI
          ? "Поиск остановлен при переходе к другой беседе. Можно отправить вопрос ещё раз."
          : "Search stopped when you switched conversations. You can send the question again.");
        interruptedSearch.exchange.push(stopped);
        interruptedSearch = null;
      }
      const history = document.createDocumentFragment();
      for (const message of log.querySelectorAll(":scope > .cosmo-message")) history.append(message);
      conversations.set(point, {history, exchanges, draft: field.value});
      const saved = conversations.get(next);
      conversations.delete(next);
      if (conversations.size > 8) {
        const oldest = [...conversations.keys()].find(key => key !== null);
        conversations.delete(oldest);
      }
      point = next;
      contextVersion++;
      draftVersion++;
      exchanges = saved?.exchanges || [];
      field.value = saved?.draft || "";
      field.setCustomValidity("");
      if (saved) log.append(saved.history);
      context.hidden = !point;
      contextName.textContent = point ? pointLabel(point) : "";
      intro.hidden = Boolean(point || exchanges.length);
      let placeholder = "Ask Cosmo a question…";
      if (point) placeholder = russianUI ? "Спросите об этой точке…" : "Ask about this point…";
      field.placeholder = placeholder;
      pending = false;
      unread = null;
      send.removeAttribute("aria-disabled");
      feedback.textContent = "";
      // Retry a supplementary search if it was interrupted while switching conversations.
      log.querySelectorAll(".cosmo-more:disabled").forEach(button => { button.disabled = false; });
      if (exchanges.length) scrollToMessage(exchanges.at(-1).at(-1));
      syncAttention();
    }

    function rememberExchange(messages) {
      if (exchanges.length >= 8) for (const message of exchanges.shift()) message.remove();
      exchanges.push(messages);
    }

    function syncAttention() {
      const composing = document.activeElement === field && field.value.trim().length > 0;
      panel.toggleAttribute("data-attentive", !panel.hidden && (pending || composing));
      for (const button of log.querySelectorAll(".cosmo-followups button")) button.disabled = pending;
    }

    async function mountPortraits() {
      const template = document.getElementById("cosmo-rig-template");
      if (!template || location.protocol === "file:") return;
      // Keep the original portrait visible on a slow connection or if artwork fails.
      const rig = template.content.firstElementChild;
      const paths = new Set(Array.from(rig.querySelectorAll("[href]"),
        node => node.getAttribute("href").split("#")[0]));
      try {
        await Promise.all(Array.from(paths, path => {
          const asset = new Image();
          asset.src = path;
          return asset.decode();
        }));
      } catch { return; }
      for (const slot of toggle.closest(".cosmo-dock").querySelectorAll("[data-cosmo-figure]")) {
        const clone = rig.cloneNode(true);
        const clip = "cosmo-aperture-" + slot.dataset.cosmoFigure;
        clone.querySelector("clipPath").id = clip;
        clone.querySelector(".cosmo-shutter").setAttribute("clip-path", "url(#" + clip + ")");
        slot.replaceChildren(clone);
      }
    }
    mountPortraits();

    function adjustViewport() {
      if (!viewport || panel.hidden) return;
      panel.style.setProperty("--cosmo-viewport-height", viewport.height + "px");
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      panel.style.setProperty("--cosmo-keyboard-inset", inset + "px");
    }

    function scrollToMessage(message) {
      // Keep the beginning of a long excerpt in view, with its sources below.
      const offset = message.getBoundingClientRect().top - log.getBoundingClientRect().top;
      log.scrollTop += offset;
    }

    function setOpen(open) {
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      if (open) {
        adjustViewport();
        (composer.hidden ? close : field).focus({preventScroll: true});
        if (unread) scrollToMessage(unread);
        unread = null;
      } else {
        const pointOpener = point && returnToPoint && origin ? document.querySelector(origin) : null;
        (pointOpener?.getClientRects().length ? pointOpener : toggle).focus({preventScroll: true});
        returnToPoint = false;
      }
      syncAttention();
    }

    function addMessage(kind, label, content, references = []) {
      const message = document.createElement("div");
      message.className = "cosmo-message cosmo-message--" + kind;
      const byline = document.createElement("strong");
      byline.className = "cosmo-message-label";
      byline.textContent = label;
      const body = document.createElement("p");
      body.className = "cosmo-message-text";
      body.dir = "auto";
      body.textContent = content;
      message.append(byline, body);
      if (references.length) {
        const list = document.createElement("ol");
        list.className = "cosmo-sources";
        list.setAttribute("aria-label", "Sources");
        appendSources(list, references);
        message.append(list);
      }
      const atEnd = log.scrollHeight - log.clientHeight - log.scrollTop < 8;
      log.append(message);
      if (panel.hidden) unread = message;
      else if (kind === "user" || atEnd) scrollToMessage(message);
      if (kind === "assistant") window.CosmoReactions?.answer();
      return message;
    }

    function claudePointReply(data, group, question) {
      if (data?.mode !== "claude" || data.supported !== true || data.pointId !== pointIds.get(group) ||
          typeof data.answer !== "string" || !data.answer.trim() || !Array.isArray(data.sources) || !data.sources.length) return null;
      const allowed = new Map(getEvidenceDetail(group).groups.flatMap(study => study.sources)
        .filter(source => /^https:\/\/(?:[a-z0-9-]+\.)*nasa\.gov\//i.test(source.url))
        .map(source => [source.url, {title: source.label, url: source.url}]));
      const refs = data.sources.map(source => allowed.get(source?.url));
      const cited = new Set(Array.from(data.answer.matchAll(/\[(\d+)\]/g), match => Number(match[1])));
      if (!refs.every(Boolean) || refs.some((_, i) => !cited.has(i + 1)) || cited.size !== refs.length ||
          /(?:https?:\/\/|www\.)/i.test(data.answer)) return null;
      return {answer: data.answer.trim(), sources: refs, label: /[а-яё]/iu.test(question)
        ? "Claude по выбранным опытам" : "Claude on selected evidence"};
    }

    async function searchPoint(group, question, controller) {
      const fallback = () => ({...EvidenceChat.answer(group, question), label: /[а-яё]/iu.test(question)
        ? "Локальные данные точки" : "Local point records"});
      if (!navigator.onLine || !/^[0-9a-f]{10}(?:\.[0-9a-f]{10}){2}$/.test(pointDataset)) return fallback();
      const pointId = pointIds.get(group);
      const timeout = setTimeout(() => controller.abort(), 38000);
      try {
        const response = await fetch(askEndpoint, {
          method: "POST", headers: {"Content-Type": "application/json", "Accept": "application/json"},
          credentials: "omit", redirect: "error", signal: controller.signal,
          body: JSON.stringify({question, pointId, dataset: pointDataset})
        });
        if (response.ok && response.headers.get("Content-Type")?.includes("application/json")) {
          const live = claudePointReply(await response.json(), group, question);
          if (live) return live;
        }
      } catch {
        // The selected records are already loaded, including when the live request times out.
      } finally {
        clearTimeout(timeout);
      }
      return fallback();
    }

    function pointReply(question, reply) {
      const allowed = new Set(getEvidenceDetail(point).groups.flatMap(g => g.sources.map(s => s.url)));
      const cited = reply.sources.filter(source => allowed.has(source.url) && /^https:\/\//.test(source.url));
      const message = addMessage("assistant", "Cosmo · " + reply.label, reply.answer, cited);
      log.querySelector(".cosmo-followups")?.remove();
      const choices = document.createElement("div");
      choices.className = "cosmo-followups";
      for (const suggestion of EvidenceChat.suggestions(point, question).slice(0, 3)) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = suggestion;
        button.addEventListener("click", () => {
          submitQuestion(suggestion, true);
        });
        choices.append(button);
      }
      message.append(choices);
      return message;
    }

    document.addEventListener("cosmo-inspect-point", event => {
      const {group, trigger} = event.detail;
      if (!evidencePoints.includes(group)) return;
      origin = (trigger.closest("#maptable") ? "#maptable" : "#chart") + " [data-point='" + pointIds.get(group) + "']";
      switchConversation(group);
      returnToPoint = true;
      setOpen(true);
      window.CosmoReactions?.receivePoint();
      if (!exchanges.length) {
        const prompt = russianUI ? "Объясни эту точку" : "";
        const greeting = pointReply(prompt, EvidenceChat.answer(group, prompt));
        rememberExchange([greeting]);
        scrollToMessage(greeting);
      }
    });
    clearPoint.addEventListener("click", () => {
      switchConversation(null);
      returnToPoint = false;
      field.focus({preventScroll: true});
    });

    toggle.addEventListener("click", () => setOpen(panel.hidden));
    close.addEventListener("click", () => setOpen(false));
    function onEscape(event) {
      if (event.key === "Escape" && !event.isComposing && !panel.hidden) {
        event.preventDefault();
        setOpen(false);
      }
    }
    panel.addEventListener("keydown", onEscape);
    toggle.addEventListener("keydown", onEscape);
    viewport?.addEventListener("resize", adjustViewport);
    viewport?.addEventListener("scroll", adjustViewport);

    if (location.protocol === "file:") {
      if (intro) intro.hidden = true;
      composer.hidden = true;
      const message = addMessage("assistant", "Cosmo", "Ask is available on the live QUENCH site.");
      const link = document.createElement("a");
      link.href = liveSite + "/#ask";
      link.textContent = "Open Ask on QUENCH";
      message.append(link);
      return;
    }

    intro?.addEventListener("click", event => {
      const prompt = event.target.closest("[data-cosmo-question]");
      if (!prompt || pending) return;
      field.value = prompt.dataset.cosmoQuestion || prompt.textContent.trim();
      field.setCustomValidity("");
      composer.requestSubmit();
    });
    field.addEventListener("focus", syncAttention);
    field.addEventListener("blur", () => panel.toggleAttribute("data-attentive", !panel.hidden && pending));
    field.addEventListener("input", () => {
      draftVersion++;
      field.setCustomValidity("");
      syncAttention();
    });
    field.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        composer.requestSubmit();
      }
    });
    async function submitQuestion(draft, suggestion = false) {
      if (pending) return;
      const submittedVersion = draftVersion;
      const submittedContext = contextVersion;
      const question = draft.trim().replace(/\s+/gu, " ");
      if (!question) {
        field.setCustomValidity("Enter a question first.");
        field.reportValidity();
        return;
      }
      if (intro) intro.hidden = true;
      const exchange = [addMessage("user", "You", question)];
      rememberExchange(exchange);
      if (!suggestion) field.value = "";
      field.focus({preventScroll: true});
      pending = true;
      const controller = point ? new AbortController() : null;
      interruptedSearch = {draft, version: submittedVersion, exchange, controller};
      syncAttention();
      send.setAttribute("aria-disabled", "true");
      feedback.textContent = point
        ? (/[а-яё]/iu.test(question) ? "Читаю записи выбранной точки…" : "Reading the selected records…")
        : "Searching the organizer sources…";
      try {
        if (point) {
          const reply = await searchPoint(point, question, controller);
          if (submittedContext === contextVersion) exchange.push(pointReply(question, reply));
          return;
        }
        const reply = await search(question);
        if (submittedContext !== contextVersion) return;
        const mode = reply.local ? "Local archive · " + reply.label : reply.label;
        const message = addMessage("assistant", "Cosmo · " + mode, reply.answer, reply.sources);
        exchange.push(message);
        if (reply.checked) {
          // The stored answer may not be the angle the visitor wanted: offer the source search too.
          const more = document.createElement("button");
          more.type = "button";
          more.className = "cosmo-more";
          more.textContent = "Search the organizer sources";
          more.addEventListener("click", async () => {
            if (pending) return;
            const searchContext = contextVersion;
            pending = true;
            syncAttention();
            more.disabled = true;
            feedback.textContent = "Searching the organizer sources…";
            try {
              const extra = await search(question, true);
              if (contextVersion !== searchContext) return;
              more.remove();
              exchange.push(addMessage("assistant", "Cosmo · " + (extra.local ? "Local archive · " : "") + extra.label, extra.answer, extra.sources));
            } catch (error) {
              if (contextVersion === searchContext) {
                exchange.push(addMessage("error", "Cosmo", error.message));
                more.disabled = false;
              }
            } finally {
              if (contextVersion === searchContext) {
                pending = false;
                syncAttention();
                feedback.textContent = "";
              }
            }
          });
          message.append(more);
        }
      } catch (error) {
        if (submittedContext !== contextVersion) return;
        exchange.push(addMessage("error", "Cosmo", error.message));
        if (!suggestion && draftVersion === submittedVersion) field.value = draft;
      } finally {
        if (submittedContext === contextVersion) {
          interruptedSearch = null;
          pending = false;
          syncAttention();
          send.removeAttribute("aria-disabled");
          feedback.textContent = "";
        }
      }
    }
    composer.addEventListener("submit", event => {
      event.preventDefault();
      submitQuestion(field.value);
    });
  }
  setupCosmo();

  if (location.protocol === "file:") {
    document.getElementById("ask-workspace").hidden = true;
    const link = document.createElement("a");
    link.href = liveSite + "/#ask";
    link.textContent = "Open Ask on the live QUENCH site";
    document.getElementById("v-ask").append(link);
  }
})();
