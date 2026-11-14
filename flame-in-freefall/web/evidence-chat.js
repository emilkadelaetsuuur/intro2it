/* Ask Cosmo about the records attached to one Evidence map mark. */
window.EvidenceChat = (() => {
  const russian = text => /[а-яё]/iu.test(text || "");
  const clean = text => String(text || "").normalize("NFKC").toLowerCase().replace(/[‐‑–—]/g, "-").replace(/\s+/g, " ").trim();
  const words = (ru, en, translation) => ru ? translation : en;
  const unique = values => [...new Set(values)];
  const contains = (text, term) => (" " + text + " ").includes(" " + term + " ");
  const tokens = text => clean(text).replace(/[^\p{L}\p{N}-]+/gu, " ").trim();
  const normalizedId = text => tokens(text).replace(/(\d{5})\s+([a-z]\d+)\b/g, "$1$2");
  const studyNames = [
    ["PSI-159", /\bcfi[- ]g\b/], ["PSI-10", /\bflame design\b/], ["PSI-39", /\bcfi\b(?![- ]g\b)/],
    ["PSI-69", /\bflex\b(?![- ]?(?:2|ii)\b)/], ["PSI-68", /\bflex[- ]?(?:2|ii)\b/],
    ["PSI-25", /\bbass[- ]?(?:ii|2)\b/], ["PSI-26", /\bbass\b(?![- ]?(?:ii|2)\b)/],
    ["PSI-98", /\bsaffire[- ]?(?:i|1)\b/], ["PSI-99", /\bsaffire[- ]?(?:ii|2)\b/],
    ["PSI-100", /\bsaffire[- ]?(?:iii|3)\b/], ["saffire", /\bsaffire[- ]?(?:vi|6)\b/],
    ["PSI-20", /\bbre\b/], ["sofie", /\bsofie\b/]
  ];
  // These short descriptions summarize the objectives in the corresponding PSI catalog entries.
  const objectives = {
    "PSI-10": ["Flame Design investigated when gas flames form soot or go out.", "Flame Design изучал, при каких условиях газовое пламя образует сажу или гаснет."],
    "PSI-25": ["BASS-II studied ignition, flame spread and extinction on solid samples in weak airflows.", "В BASS-II изучали воспламенение, распространение и угасание пламени на твёрдых образцах при слабом потоке воздуха."],
    "PSI-39": ["CFI studied cool flames in burning droplets of dodecane and fuel mixtures.", "В CFI изучали холодное пламя при горении капель додекана и топливных смесей."],
    "PSI-69": ["FLEX studied how liquid-fuel droplets burn and when their flames go out.", "В FLEX изучали, как горят капли жидкого топлива и когда гаснет пламя."],
    "PSI-98": ["Saffire-I tracked fire growth on a fabric sample aboard Cygnus.", "В Saffire-I наблюдали за распространением огня по ткани на корабле Cygnus."],
    "PSI-99": ["Saffire-II compared how far flames spread on materials in microgravity and on Earth.", "В Saffire-II сравнивали, на какое расстояние пламя распространяется по материалам в микрогравитации и на Земле."],
    "PSI-159": ["CFI-G studied the conditions in which gaseous fuels form cool flames.", "В CFI-G изучали условия образования холодного пламени при горении газообразного топлива."]
  };

  function intent(text) {
    if (!text) return "overview";
    if (/\b(sources?|references?|citation|cite|link|verify|evidence from)\b|источник|ссылк|публикац|откуда|проверить/.test(text)) return "sources";
    if (/(why|почему).*(?:pressure|давлен|missing|отсутств|нет данных)|unreported pressure/.test(text)) return "conditions";
    if (/(why|почему|how|как).*(?:group|together|same (?:mark|point)|one point|одн[оуа]й? точк|объедин|сгруппир)/.test(text)) return "grouping";
    if (/\b(why|cause|caused|predict|safe|safety|dangerous|would|risk)\b|почему|причин|предска|опасн|риск|случится|будет ли/.test(text)) return "limits";
    if (/\b(compare|comparison|differ\w*)\b|сравн|отлич|разниц|различ/.test(text)) return "compare";
    if (/\b(temperature|weather|cost|price|president|population|lunch|recipe|joke)\b|температур|погод|стоит|президент|анекдот|рецепт/.test(text)) return "unavailable";
    if (/\b(how long|durations?|burn times?)\b|длительн|сколько времен|как долго/.test(text)) return "time";
    if (/\b(diameters?)\b|диаметр/.test(text)) return "diameter";
    if (/\b(airflow|flows?|velocity)\b|скорост|поток/.test(text) && !/terminat|stopp|прекращ|останов/.test(text)) return "flow";
    if (/\b(fuel|fuels|material|materials|samples?|tested substance)\b|топлив|материал|образц|образец|веществ/.test(text) && !/happen|burn|ignit|extin|произош|горел|горени|воспламен/.test(text)) return "materials";
    if (/\b(pressures?|oxygen|o2|atmosphere|conditions?|settings?)\b|услови|кислород|давлен/.test(text)) return "conditions";
    if (/\b(happen\w*|outcomes?|results?|report(?:ed)?|measur\w*|extin\w*|burn\w*|ignit\w*|go out|went out|ended|spread)\b|произош|исход|результат|наблюдал|измер|зажиг|зажиган|воспламен|горел|горени|сгорел|погас|гасло|потух|зафиксир/.test(text)) return "outcomes";
    if (/\b(runs?|test[s]?|records?|ids?|identifiers?|dates?|days?|list|how many|which ones)\b|испытан|запуск|опыт|идентификатор|список|перечисл|дат[ауы]|даты|дней|дни|(?:^|\s)сколько/.test(text)) return "ids";
    if (/\b(point|mark|experiment[s]?|stud(?:y|ies)|investigations?|overview|summari[sz]e|summary|explain this|tell me more|what does this mean)\b|точк|исследован|эксперимент|объясни|подробн|расскажи|что это/.test(text)) return "overview";
    return "unknown";
  }

  function sourceList(studies) {
    const links = new Map();
    for (const study of studies) {
      for (const src of study.sources) {
        // Only the specific PSI record, reports and paper used by the inspector can be cited.
        const valid = /^https:\/\/psi\.nasa\.gov\/physci\/repo\/data\/investigations\/PSI-\d+$/.test(src.url)
          || (D.sources.some(item => ["saffire6events", "saffire6tests", "sofiegel"].includes(item.key) && item.url === src.url)
            && /^https:\/\/(?:ntrs\.nasa\.gov\/citations\/\d+|doi\.org\/10\.1016\/j\.combustflame\.2025\.114244)$/.test(src.url))
          || src.url === "https://science.nasa.gov/biological-physical/investigations/sofie-gel/";
        if (valid) links.set(src.url, {title: src.label, url: src.url});
      }
    }
    return [...links.values()];
  }

  function requestedStudies(question) {
    const accessions = [...question.matchAll(/\bpsi[- ]?(\d+)\b/g)].map(match => "PSI-" + match[1]);
    return unique(accessions.concat(studyNames.filter(([, pattern]) => pattern.test(question)).map(([key]) => key)));
  }

  function cutoff(values, all, ru) {
    if (all || values.length <= 4) return values.join(", ");
    return values.slice(0, 4).join(", ") + words(ru, ` (+${values.length - 4} more)`, ` (ещё ${values.length - 4})`);
  }

  function runId(run, ru) {
    return run.source_test_number == null ? run.id : run.id + words(ru, ` (test ${run.source_test_number})`, ` (тест ${run.source_test_number})`);
  }

  function conditions(runs, ru) {
    const span = values => rangeText([Math.min(...values), Math.max(...values)]);
    const oxygens = runs.map(run => run.o);
    const ps = runs.filter(hasPressure).map(run => Number(run.p.toFixed(4)));
    const pressure = ps.length ? span(ps) + words(ru, " atm", " атм") : words(ru, "unreported", "не указано");
    let phrase = words(ru, `Plotted ambient oxygen was ${span(oxygens)}%. Chamber pressure: ${pressure}.`,
      `Кислород в окружающей среде по данным карты — ${span(oxygens)}%. Давление в камере — ${pressure}.`);
    if (runs.some(run => run.ambient_o2_reported)) {
      phrase += words(ru, " Saffire rows can give approximate values or ranges. The map uses the first listed oxygen value.",
        " Для Saffire в таблице приведены приближённые значения или интервалы. На карте показано первое значение кислорода в строке.");
    }
    return phrase;
  }

  function endpoint(run, ru) {
    if (run.i === "PSI-69") return ru ? ({Extinction: "угасание", Completion: "завершение горения", Disruption: "разрушение капли"}[run.rr] || run.rr) : run.rr;
    if (run.i === "PSI-159" && run.r === "burn") return words(ru, "flow terminated (FT)", "подача прекращена (FT)");
    if (run.i === "PSI-159" && run.r === "ext") return words(ru, "self-extinguished (SE)", "самозатухание (SE)");
    const codes = {
      cool: ["direct cool ignition without hot ignition", "прямое холодное воспламенение без горячего"],
      nohot: ["no hot ignition", "без горячего воспламенения"], noign: ["did not ignite", "без воспламенения"],
      nospread: ["near-zero flame spread", "распространение пламени близко к нулю"],
      burn: ["burning recorded", "зафиксировано горение"], na: ["outcome unreported", "результат не указан"]
    };
    return codes[run.r]?.[Number(ru)] || run.rr || codes.na[Number(ru)];
  }

  function endpoints(runs, ru) {
    const counts = new Map();
    for (const run of runs) {
      const name = endpoint(run, ru);
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts].map(([name, count]) => `${name} (${count})`).join(", ");
  }

  const measures = {
    time: {key: "t", name: ["Burn time", "Время горения"], unit: ["s", "с"]},
    diameter: {key: "d0", name: ["Initial droplet diameter", "Начальный диаметр капли"], unit: ["mm", "мм"]},
    flow: {key: "flow", name: ["Airflow speed", "Скорость потока"], unit: ["cm/s", "см/с"]}
  };
  function measureSummary(runs, measure, ru) {
    const values = runs.map(run => run[measure.key]).filter(Number.isFinite);
    const name = measure.name[Number(ru)];
    if (!values.length) return words(ru, `${name} is unreported in these records.`, `${name}: для этих записей данные отсутствуют.`);
    const span = rangeText([Math.min(...values), Math.max(...values)]);
    return words(ru, `${name} was ${span} ${measure.unit[0]} (reported in ${values.length} of ${runs.length} records).`,
      `${name} — ${span} ${measure.unit[1]} (данные есть в ${values.length} из ${runs.length} записей).`);
  }

  function runCard(run, row, ru) {
    const pressure = hasPressure(run) ? row[3] + (run.i === "PSI-69" ? words(ru, " mmHg", " мм рт. ст.") : words(ru, " atm", " атм")) : words(ru, "unreported", "не указано");
    const result = run.rr ? row[4] : words(ru, "unreported", "не указан");
    let card = words(ru, `${run.a} · ${runId(run, ru)}. Fuel or material: ${run.f}. Ambient O₂: ${row[2]}%. Pressure: ${pressure}. Reported result: ${result}.`,
      `${run.a} · ${runId(run, ru)}. Топливо или материал — ${run.f}. Кислород в среде — ${row[2]}%. Давление — ${pressure}. Результат по таблице — ${result}.`);
    if (run.d0 != null) card += words(ru, ` Initial droplet diameter: ${run.d0} mm.`, ` Начальный диаметр капли — ${run.d0} мм.`);
    if (run.t != null) card += words(ru, ` Reported burn time: ${run.t} s.`, ` Указанное время горения — ${run.t} с.`);
    if (run.flow != null) card += words(ru, ` Airflow: ${run.flow} cm/s.`, ` Поток воздуха — ${run.flow} см/с.`);
    return card.replace(/\.\./g, ".");
  }

  function breAnswer(group, study, mode, q, all, ru) {
    const rows = study.rows;
    const selected = rows.filter(row => contains(tokens(q), tokens(row[0])));
    const listing = (selected.length ? selected : rows).map(([date, fuel, settings, count]) =>
      words(ru, `${date}: ${fuel}, O₂ settings ${settings}%, ${count} ignitions that day`,
        `${date} — ${fuel}, настройки O₂ ${settings}%, за день зажиганий: ${count}`));
    const overview = words(ru, `ACME BRE used a gas burner to emulate burning solids. This mark collects the ${rows.length} test day${rows.length === 1 ? "" : "s"} listing about ${group.bre.o}% chamber oxygen.`,
      `В ACME BRE горение твёрдых материалов моделировали с помощью газовой горелки. В этой точке собраны дни испытаний (всего ${rows.length}), когда среди настроек камеры указывали около ${group.bre.o}% кислорода.`);
    const limit = words(ru, "Ignitions are counted for the entire day across its listed settings. The table gives neither pressure nor a flame outcome for individual ignitions.",
      "Число зажиганий приводится за весь день по всем указанным настройкам. Для отдельных зажиганий в таблице нет давления и результата.");
    const details = selected.length || ["ids", "conditions", "outcomes", "materials"].includes(mode);
    return [overview, details ? (all || selected.length ? listing : listing.slice(0, 3)).join("\n") : "", limit,
      details && !all && !selected.length && listing.length > 3 ? words(ru, "Ask for all dates to see the remaining days.", "Запросите все даты, чтобы увидеть остальные дни.") : ""].filter(Boolean).join("\n\n");
  }

  function publication(group, mode, ru) {
    const event = group.pub.r;
    if (group.pub.kind === "sofie") {
      const experiment = words(ru, `SoFIE-GEL measured when flames around ${event.sphere_diameter_cm} cm PMMA spheres went out aboard the ISS.`,
        `В SoFIE-GEL на МКС измеряли условия, при которых гаснет пламя вокруг сфер из ПММА диаметром ${event.sphere_diameter_cm} см.`);
      const bounds = words(ru, `The study reports ${event.oxygen_min_percent}–${event.oxygen_max_percent}% oxygen, ${event.pressure_min_atm}–${event.pressure_max_atm} atm pressure and ${event.flow_min_cm_s}–${event.flow_max_cm_s} cm/s forced flow.`,
        `В исследовании указаны диапазоны: кислород ${event.oxygen_min_percent}–${event.oxygen_max_percent}%, давление ${event.pressure_min_atm}–${event.pressure_max_atm} атм и скорость потока ${event.flow_min_cm_s}–${event.flow_max_cm_s} см/с.`);
      const limit = words(ru, "These are separate ranges. The published summary gives no run IDs or paired oxygen and pressure for an individual test.",
        "Это отдельные диапазоны. В опубликованной сводке нет номеров опытов или пар значений кислорода и давления для отдельного опыта.");
      if (mode === "outcomes") return experiment + " " + words(ru, "The measured endpoint was flame extinction. The summary does not say which sphere extinguished at a specific combination of oxygen, pressure and flow.",
        "Наблюдали момент угасания пламени. В сводке не указано, для какого отдельного образца при угасании наблюдалось конкретное сочетание кислорода, давления и потока.");
      if (mode === "ids") return limit;
      if (mode === "materials" || mode === "diameter") return experiment;
      return (mode === "conditions" || mode === "flow" ? "" : experiment + " ") + bounds + " " + limit;
    }
    const p = event.pressure_kpa;
    const pressure = p == null ? words(ru, "Table 1 gives no pressure for this event.", "В таблице 1 давление для этого события не указано.") :
      words(ru, `The recorded pressure was ${p} kPa.`, `Указанное давление — ${p} кПа.`);
    const specimen = words(ru, `In Saffire-VI flight event ${event.event} aboard Cygnus, sample ${event.id} (${event.material})`,
      `Во время полётного события ${event.event} Saffire-VI на корабле Cygnus образец ${event.id} (${event.material})`);
    const result = event.outcome === "burn" ? words(ru, "burned", "горел") : words(ru, "did not ignite", "не воспламенился");
    const atmosphere = words(ru, `at ${event.oxygen_percent.toFixed(1)}% ambient oxygen`, `при ${event.oxygen_percent.toFixed(1)}% кислорода`);
    if (mode === "conditions") return words(ru, `The crewless Cygnus spacecraft had ${event.oxygen_percent.toFixed(1)}% ambient oxygen during event ${event.event}. ${pressure}`,
      `Во время события ${event.event} на беспилотном корабле Cygnus было ${event.oxygen_percent.toFixed(1)}% кислорода. ${pressure}`);
    if (mode === "outcomes") return `${specimen} ${result} ${atmosphere}.`;
    if (mode === "ids" || mode === "materials") return words(ru, `The report identifies event ${event.event}, sample ${event.id}: ${event.material}. This point contains that single flight event.`,
      `В отчёте это событие ${event.event}, образец ${event.id}: ${event.material}. В точке представлено одно полётное событие.`);
    return `${specimen} ${result} ${atmosphere}. ${pressure} ` + words(ru, "This event comes from the published flight report, outside the PSI run tables.",
      "Источник — полётный отчёт, опубликованный отдельно от таблиц PSI.");
  }

  function suggestions(group, question = "") {
    const ru = russian(question);
    if (group.bre) return ru ? ["Покажи все даты", "Сколько было зажиганий?", "Какие источники?"] : ["List all dates", "How many ignitions were recorded?", "Which sources document this?"];
    if (group.pub) return ru ? ["Какие были условия?", "Что именно измеряли?", "Какие источники?"] : ["What were the conditions?", "What did the study report?", "Which sources document this?"];
    return ru ? ["Какие испытания здесь?", "Что произошло?", "Какие были условия?"] : ["Which runs are here?", "What happened?", "What were the conditions?"];
  }

  function answer(group, question = "") {
    const q = clean(question), ru = russian(q), mode = intent(q);
    const detail = window.getEvidenceDetail(group);
    const label = words(ru, "Selected evidence", "Данные выбранной точки");
    const reply = (answer, studies = detail.groups) => ({answer, sources: sourceList(studies), label});
    const keys = requestedStudies(q);
    const studies = detail.groups.filter(study => !keys.length || keys.includes(study.accession || group.pub?.kind));
    const outside = () => reply(words(ru, "That record is outside this selection. Ask which records are here, or select its own mark on the map.",
      "Такой записи нет в выбранной точке. Запросите список записей этой точки или выберите другую точку на карте."), []);
    if (keys.some(key => !studies.some(study => (study.accession || group.pub?.kind) === key))) return outside();
    const all = /\b(all|every|full|remaining|rest|complete list)\b|все|весь|полн|остальн/.test(q);
    const scope = studies.map(study => study.name.split(" · ")[0]).join(", ");
    const unclear = () => reply(words(ru, `I can use the records for ${scope} at this point to identify the tests, their conditions and their reported outcomes. Which would you like to look at?`,
      `По данным ${scope} для этой точки можно уточнить состав испытаний, условия или результаты. Что вас интересует?`));
    const sourcesReply = selected => reply(words(ru, `The linked sources document ${selected.map(study => study.name.split(" · ")[0]).join(", ")} at the selected point.`, `По ссылкам приведены источники данных для ${selected.map(study => study.name.split(" · ")[0]).join(", ")} в выбранной точке.`), selected);
    if (mode === "unavailable") return unclear();
    const caveat = words(ru, "These records describe observations under the reported conditions. They do not establish a physical cause or predict what would happen in another atmosphere.",
      "Записи описывают наблюдения при указанных условиях. По ним нельзя установить физическую причину или предсказать результат в другой атмосфере.");
    if (group.pub || group.bre) {
      if (group.pub?.kind === "saffire") {
        const events = [...q.matchAll(/(?:event|событи[ея])\s*#?\s*(\d+)|\bvi-(\d+)\b/g)];
        if (events.some(match => match[1] ? +match[1] !== group.pub.r.event : "vi-" + match[2] !== clean(group.pub.r.id))) return outside();
        if (events.length && mode === "unknown") return reply(publication(group, "overview", ru));
      }
      const dayMentioned = group.bre && studies[0].rows.some(row => contains(tokens(q), tokens(row[0])));
      if (group.bre && !dayMentioned && /\b\d{1,2} (?:jan|feb|march|apr|sept|oct|dec)\w* \d{4}\b/.test(q)) return outside();
      if (mode === "unknown" && !keys.length && !dayMentioned) return unclear();
      if (mode === "sources") return sourcesReply(studies);
      const paragraph = group.bre ? breAnswer(group, studies[0], mode, q, all, ru) : publication(group, mode, ru);
      if (measures[mode] && (mode === "time" || group.pub?.kind !== "sofie")) {
        const name = measures[mode].name[Number(ru)];
        return reply(words(ru, `${name} is unreported in the selected record.`, `${name}: для выбранной записи данные отсутствуют.`) + "\n\n" + paragraph);
      }
      return reply(mode === "limits" ? caveat + "\n\n" + paragraph : paragraph);
    }

    const runs = group.runs.filter(run => studies.some(study => study.accession === run.i));
    const idQuery = normalizedId(q);
    const testNo = q.match(/(?:\btest|тест)\s*(?:number\s*|no\.?\s*|[№#]\s*)?(\d{1,3})(?![\w-])/);
    const ids = unique(runs.map(run => run.id)).filter(id => {
      if (clean(id) === "o2" && !/(?:run|test|id|испытани[ея]|опыт)\s+o2\b|^o2\??$/i.test(q)) return false;
      return contains(idQuery, normalizedId(id));
    });
    const candidates = runs.filter(run => (!ids.length || ids.includes(run.id)) && (!testNo || run.source_test_number === testNo[1]));
    const idWords = idQuery.split(" ").filter(word => /^(?:[a-z]\d{2}[a-z]\d{3}|\d{2,5}[a-z]+\d+|[bfmopst]\d+[ab]?|2-\d+|\d{4})$/.test(word) && word !== "o2");
    if (idWords.some(word => !ids.some(id => normalizedId(id) === word)) || (testNo && !candidates.length)) return outside();
    if (ids.length || testNo) {
      const selectedStudies = studies.filter(study => candidates.some(run => run.i === study.accession));
      if (mode === "sources") return sourcesReply(selectedStudies);
      const cards = candidates.map(run => {
        const study = selectedStudies.find(item => item.accession === run.i);
        return runCard(run, study.rows.find(row => row[0] === runId(run, false)), ru);
      });
      if (mode === "limits") cards.unshift(caveat);
      return reply(cards.join("\n\n"), selectedStudies);
    }
    if (mode === "sources") return sourcesReply(studies);
    if (mode === "unknown" && !keys.length) return unclear();
    const listHint = words(ru, 'Ask for “all run IDs” to see the full list, or ask about one ID.', 'Запросите «все номера испытаний» для полного списка или уточните один номер.');
    const paragraphs = [];
    if (mode === "grouping" || (mode === "overview" && !keys.length && runs.length > 1)) {
      paragraphs.push(words(ru, `This mark groups ${runs.length} ${KIND[group.k].one} tests by their nearby oxygen settings and ${group.recorded ? "pressures" : "shared absence of a measured pressure"}. Each row is a separate test.`,
        `Точка объединяет испытания одного типа (всего ${runs.length}) с близкими значениями кислорода${group.recorded ? " и давления" : ", для которых не указано давление"}. Каждая строка соответствует отдельному испытанию.`));
    }
    if (mode === "limits") paragraphs.push(caveat);
    if (["overview", "grouping", "compare", "limits"].includes(mode)) paragraphs.push(conditions(runs, ru));
    for (const study of studies) {
      const members = runs.filter(run => run.i === study.accession);
      const title = `${members[0].a} (${study.accession})`;
      const count = words(ru, `${members.length} run${members.length === 1 ? "" : "s"}`, `испытаний: ${members.length}`);
      const result = endpoints(members, ru);
      if (mode === "ids") paragraphs.push(`${title} · ${count} — ${cutoff(members.map(run => runId(run, ru)), all, ru)}.`);
      else if (mode === "materials") paragraphs.push(`${title} · ${cutoff(unique(members.map(run => run.f)), all, ru)}.`);
      else if (mode === "conditions") {
        if (members.length === 1) paragraphs.push(runCard(members[0], study.rows[0], ru));
        else paragraphs.push(`${title} · ${count}. ${conditions(members, ru)}`);
      } else if (measures[mode]) {
        paragraphs.push(`${title} · ${measureSummary(members, measures[mode], ru)}`);
      } else {
        const purpose = ["outcomes", "limits"].includes(mode) ? "" : objectives[study.accession]?.[Number(ru)];
        const summary = `${title} · ${count}. ${words(ru, "Reported endpoints", "Результаты")} — ${result}.`;
        paragraphs.push([purpose, summary].filter(Boolean).join(" "));
      }
    }
    if (!all && mode === "ids" && studies.some(study => study.rows.length > 4)) paragraphs.push(listHint);
    if (mode === "compare" && studies.length === 1) paragraphs.push(words(ru, "This point contains one investigation.", "В этой точке представлено одно исследование."));
    return reply(paragraphs.join("\n\n"), studies);
  }

  return Object.freeze({answer, suggestions});
})();
