// Build the Ask server's point catalog with the actual map grouping and inspector records.
// Run from any directory with Node: node scripts/build_point_catalog.cjs [--check]
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "server", "points.json");
const scripts = ["data.js", "core.js", "evidence-records.js"];
const context = vm.createContext({ location: { hash: "" } });
context.window = context;
const stamps = scripts.map(filename => {
  const bytes = fs.readFileSync(path.join(root, "web", filename));
  vm.runInContext(bytes.toString("utf8"), context, { filename });
  return createHash("sha256").update(bytes).digest("hex").slice(0, 10);
});

// Extra measurements carried by the same PSI row, including zeros. Each study
// gets just the columns it has reported for at least one selected run.
const fields = [
  ["d0", "Initial droplet diameter (mm)"],
  ["dx", "Visible flame extinction diameter (mm)"],
  ["t", "Burn time (s)"],
  ["flow", "Airflow speed (cm/s)"],
  ["dir", "Airflow direction"],
  ["g1", "Normal-gravity burn length"],
  ["he", "Initial helium mole fraction"],
  ["co2", "Initial carbon dioxide mole fraction (CO₂; subscript lost in PSI header)"],
  ["flame_config", "Flame configuration"]
];

function runRecords(study, runs) {
  if (runs.length !== study.rows.length) throw new Error("Missing rows for " + study.name);
  const extra = fields.filter(([key]) => runs.some(run => run[key] != null));
  study.columns.push(...extra.map(([, column]) => column));
  runs.forEach((run, index) => {
    const row = study.rows[index];
    const id = run.source_test_number == null ? run.id : `${run.id} (test ${run.source_test_number})`;
    if (row[0] !== id) throw new Error("Inspector row order changed for " + id);
    row.push(...extra.map(([key]) => String(run[key] ?? "Unreported")));
    // These two rows use a material inferred from the preceding PSI row.
    if (run.i === "PSI-99" && ["2-6", "2-9"].includes(run.id)) {
      row[1] += " (material carried forward from the preceding row; the source cell is blank)";
    }
  });
}

function exportPoint(mark) {
  const detail = context.getEvidenceDetail(mark);
  for (const study of detail.groups) {
    if (mark.runs) runRecords(study, mark.runs.filter(run => run.i === study.accession));
    // The 2025 SoFIE ranges come from the paper indexed in NTRS, not the NASA
    // Science mission overview. Its NTRS record links the publisher's version.
    if (mark.pub?.kind === "sofie") {
      study.sources = study.sources.filter(source => source.url.startsWith("https://ntrs.nasa.gov/citations/"));
    }
    if (!study.sources.length || !study.sources.every(source =>
      /^https:\/\/(?:psi\.nasa\.gov\/physci\/repo\/data\/investigations\/PSI-\d+|ntrs\.nasa\.gov\/citations\/\d+)$/.test(source.url))) {
      throw new Error("Missing or unrecognized investigation source for " + study.name);
    }
  }
  return detail;
}

const marks = vm.runInContext("evidencePoints", context);
const catalog = { dataset: stamps.join("."), points: Array.from(marks, exportPoint) };
// One group per line keeps changes reviewable without expanding all 879 rows.
const text = `{"dataset":${JSON.stringify(catalog.dataset)},"points":[\n` +
  catalog.points.map(point => JSON.stringify(point)).join(",\n") + "\n]}\n";
if (process.argv.includes("--check")) {
  if (!fs.existsSync(output) || fs.readFileSync(output, "utf8").replaceAll("\r\n", "\n") !== text) {
    throw new Error("server/points.json is stale. Run node scripts/build_point_catalog.cjs");
  }
} else {
  fs.writeFileSync(output, text, "utf8");
}
console.log(`${catalog.points.length} evidence points, dataset ${catalog.dataset}`);
