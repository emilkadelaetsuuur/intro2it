/* Source records behind a single Evidence map mark or table group. */
window.getEvidenceDetail = (() => {
  function investigationGroup(accession, acronym, columns) {
    const study = inv(accession);
    return {
      name: `${acronym} · ${study.title}`,
      accession,
      sources: [{ label: `${accession} on NASA PSI`, url: study.url }],
      columns,
      rows: []
    };
  }

  function runDetail(group) {
    const studies = new Map();
    for (const run of group.runs) {
      if (!studies.has(run.i)) {
        studies.set(run.i, investigationGroup(run.i, run.a,
          ["Run ID", "Fuel / material", "Ambient O₂ (%)", run.i === "PSI-69" ? "Pressure (mmHg)" : "Pressure (atm)", "Reported result"]));
      }
      // FLEX can reuse an identifier. Its source test number distinguishes the records.
      const id = run.source_test_number == null ? run.id : `${run.id} (test ${run.source_test_number})`;
      let result = run.rr || "Unreported";
      if (run.i === "PSI-159") {
        result = result.replace(/^SE;/, "Self-extinguished (SE);").replace(/^FT;/, "Flow terminated (FT);");
      }
      // FLEX lists mmHg. Undo the plot's conversion to atm for the source table.
      let pressure = "Unreported";
      if (hasPressure(run)) pressure = numText(run.i === "PSI-69" ? run.p * 760 : run.p);
      studies.get(run.i).rows.push([
        id, run.f, run.ambient_o2_reported || String(run.o),
        pressure, result
      ]);
    }
    const count = group.runs.length;
    const first = group.runs[0];
    const sourceOxygenNote = group.runs.some(run => run.ambient_o2_reported)
      ? ". For Saffire samples, the map uses the first listed oxygen reading. The rows preserve the reported ranges and approximations." : "";
    return {
      title: count === 1 ? `${first.a} · run ${first.id}` : `${count} ${KIND[group.k].one} runs`,
      summary: `${plural(studies.size, "PSI investigation")} · ${rangeText(group.oxygen)}% plotted ambient O₂ · ${group.recorded ? rangeText(group.pressure.map(p => Number(p.toFixed(4)))) + " atm" : "pressure unreported"}${sourceOxygenNote}`,
      groups: [...studies.values()]
    };
  }

  function breDetail(setting) {
    const days = D.conditions.filter(day => day.i === "PSI-20" && day.o.includes(setting.o));
    const study = investigationGroup("PSI-20", "ACME BRE",
      ["Test day", "Fuel bottle", "Listed O₂ settings (%)", "Ignitions that day"]);
    study.rows = days.map(day => [day.day, day.f, day.o.join(", "), String(day.n)]);
    return {
      title: days.length === 1 ? `ACME BRE · ${days[0].day}` : `${plural(days.length, "BRE test day")} at about ${setting.o}% O₂`,
      summary: `Each date lists a chamber setting of about ${setting.o}% O₂. Ignitions are totals for the whole day, across all listed settings. The daily table omits pressure and individual flame outcomes.`,
      groups: [study]
    };
  }

  function source(key, label) {
    return { label, url: D.sources.find(entry => entry.key === key).url };
  }

  function saffireDetail(event) {
    const pressure = event.pressure_kpa == null ? "Unreported" : `${event.pressure_kpa} kPa (${(event.pressure_kpa / 101.325).toFixed(3)} atm)`;
    return {
      title: `Saffire-VI · event ${event.event} · ${event.material}`,
      summary: "One flight event from the Cygnus spacecraft, published outside the PSI run tables.",
      groups: [{
        name: "Spacecraft Fire Experiment VI",
        accession: "",
        sources: [source("saffire6events", "NASA flight report · Table 1"), source("saffire6tests", "NASA sample results")],
        columns: ["Flight event", "Material", "Ambient O₂ (%)", "Pressure", "Reported result"],
        rows: [[`Event ${event.event} (sample ${event.id})`, event.material, event.oxygen_percent.toFixed(1), pressure, pubOutcome[event.outcome] || event.outcome]]
      }]
    };
  }

  function sofieDetail(study) {
    return {
      title: "SoFIE-GEL · published extinction study",
      summary: "Researchers measured extinction limits for PMMA spheres aboard the ISS. The published summary gives separate ranges for oxygen, pressure and flow. Individual run coordinates are unavailable from this summary.",
      groups: [{
        name: "SoFIE-GEL flight study · T’ien et al. (2025)",
        accession: "",
        sources: [
          { label: "NASA SoFIE-GEL investigation", url: "https://science.nasa.gov/biological-physical/investigations/sofie-gel/" },
          { label: "NASA NTRS · published flight study", url: "https://ntrs.nasa.gov/citations/26234896351764" },
          source(study.source, "Published flight study")
        ],
        columns: ["Material", "O₂ range (%)", "Pressure range (atm)", "Flow range (cm/s)"],
        rows: [[`PMMA spheres, ${study.sphere_diameter_cm} cm diameter`,
          `${study.oxygen_min_percent}–${study.oxygen_max_percent}`, `${study.pressure_min_atm}–${study.pressure_max_atm}`,
          `${study.flow_min_cm_s}–${study.flow_max_cm_s}`]]
      }]
    };
  }

  return function getEvidenceDetail(group) {
    if (group.bre) return breDetail(group.bre);
    if (group.pub) return group.pub.kind === "sofie" ? sofieDetail(group.pub.r) : saffireDetail(group.pub.r);
    return runDetail(group);
  };
})();
