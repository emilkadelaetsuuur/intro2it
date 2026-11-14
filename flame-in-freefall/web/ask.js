/* QUENCH Ask uses the organizer corpus served by /api/ask and its public snapshot. */
(() => {
  const pagesOrigin = "https://emilkadelaetsuuur.github.io";
  const liveSite = "https://nasa.cartify.ink";
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

  function appendSources(list, references) {
    for (const source of references) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.textContent = source.title;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      item.append(link);
      list.append(item);
    }
  }

  function showResult(reply, question) {
    resultLabel.textContent = reply.label;
    resultText.textContent = reply.answer;
    sourceList.replaceChildren();
    appendSources(sourceList, reply.sources);
    sources.hidden = !reply.sources.length;
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

  async function search(question) {
    const endpoint = location.origin === pagesOrigin ? liveSite + "/api/ask" : "/api/ask";
    let response;
    try {
      response = await fetch(endpoint, {
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
    const exchanges = [];
    let pending = false;
    let unread = null;
    let draftVersion = 0;

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
        toggle.focus({preventScroll: true});
      }
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
      return message;
    }

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
    field.addEventListener("input", () => {
      draftVersion++;
      field.setCustomValidity("");
    });
    field.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        composer.requestSubmit();
      }
    });
    composer.addEventListener("submit", async event => {
      event.preventDefault();
      if (pending) return;
      const draft = field.value;
      const submittedVersion = draftVersion;
      const question = draft.trim().replace(/\s+/gu, " ");
      if (!question) {
        field.setCustomValidity("Enter a question first.");
        field.reportValidity();
        return;
      }
      pending = true;
      send.setAttribute("aria-disabled", "true");
      if (intro) intro.hidden = true;
      if (exchanges.length >= 8) {
        for (const message of exchanges.shift()) message.remove();
      }
      const exchange = [addMessage("user", "You", question)];
      exchanges.push(exchange);
      field.value = "";
      field.focus({preventScroll: true});
      feedback.textContent = "Searching the organizer sources…";
      try {
        const reply = await search(question);
        const mode = reply.local ? "Local archive · " + reply.label : reply.label;
        exchange.push(addMessage("assistant", "Cosmo · " + mode, reply.answer, reply.sources));
      } catch (error) {
        exchange.push(addMessage("error", "Cosmo", error.message));
        if (draftVersion === submittedVersion) field.value = draft;
      } finally {
        pending = false;
        send.removeAttribute("aria-disabled");
        feedback.textContent = "";
      }
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
