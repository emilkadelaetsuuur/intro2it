/* Inspect a mark without losing the chart or table position. */
window.EvidenceInspector = (() => {
  const sourceOrigins = new Set(["https://psi.nasa.gov", "https://ntrs.nasa.gov", "https://science.nasa.gov", "https://doi.org"]);
  let dialog, heading, content, launcher;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function dismiss(restoreFocus) {
    if (!dialog?.open) return;
    const trigger = launcher;
    launcher = null;
    dialog.close();
    if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent("evidence-inspector-close", { detail: { trigger, restoreFocus } }));
  }

  function buildDialog() {
    dialog = node("dialog", "ei-dialog");
    dialog.id = "evidence-inspector";
    dialog.setAttribute("aria-labelledby", "ei-title");
    dialog.setAttribute("aria-describedby", "ei-summary");

    const header = node("header", "ei-header");
    heading = node("h2", "ei-title");
    heading.id = "ei-title";
    heading.tabIndex = -1;
    heading.autofocus = true;
    const close = node("button", "ei-close", "Close");
    close.type = "button";
    const cross = node("span", "ei-cross");
    cross.setAttribute("aria-hidden", "true");
    close.append(cross);
    close.addEventListener("click", () => dismiss(true));
    header.append(heading, close);

    content = node("div", "ei-content");
    dialog.append(header, content);
    document.getElementById("chart").closest(".frame").after(dialog);
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      dismiss(true);
    });
    dialog.addEventListener("keydown", event => {
      if (event.key !== "Tab" || event.ctrlKey || event.altKey || event.metaKey) return;
      const controls = [...dialog.querySelectorAll("button, summary, a[href]")].filter(el => el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      const current = document.activeElement;
      if (event.shiftKey ? current === first || current === heading : current === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    });
    // A drag that starts inside a record and ends on the backdrop should keep it open.
    let startedOnBackdrop = false;
    dialog.addEventListener("pointerdown", event => { startedOnBackdrop = event.target === dialog; });
    dialog.addEventListener("click", event => {
      if (startedOnBackdrop && event.target === dialog) dismiss(true);
      startedOnBackdrop = false;
    });
  }

  function sourceLinks(study) {
    const item = node("li", "ei-source");
    item.append(node("span", "ei-study", study.name));
    const links = node("div", "ei-links");
    for (const source of study.sources) {
      let url;
      try { url = new URL(source.url); } catch { continue; }
      if (!sourceOrigins.has(url.origin) || url.username || url.password) continue;
      const link = node("a", null, source.label);
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const arrow = node("span", "ei-arrow", "↗");
      arrow.setAttribute("aria-hidden", "true");
      link.append(arrow);
      links.append(link);
    }
    item.append(links);
    return item;
  }

  function recordList(study) {
    const list = node("dl", "ei-values");
    study.columns.forEach((label, index) => {
      const field = node("div");
      field.append(node("dt", null, label), node("dd", null, study.rows[0][index]));
      list.append(field);
    });
    return list;
  }

  function recordTable(study) {
    const table = node("table", "ei-table");
    // Preserve table navigation when the narrow layout reflows each row into a card.
    table.setAttribute("role", "table");
    table.setAttribute("aria-label", study.name + " records");
    const headers = table.createTHead();
    headers.setAttribute("role", "rowgroup");
    const labels = headers.insertRow();
    labels.setAttribute("role", "row");
    for (const label of study.columns) {
      const column = node("th", null, label);
      column.scope = "col";
      column.setAttribute("role", "columnheader");
      labels.append(column);
    }
    const body = table.createTBody();
    body.setAttribute("role", "rowgroup");
    for (const values of study.rows) {
      const row = body.insertRow();
      row.setAttribute("role", "row");
      values.forEach((value, index) => {
        const field = node(index === 0 ? "th" : "td");
        field.setAttribute("role", index === 0 ? "rowheader" : "cell");
        if (index === 0) field.scope = "row";
        const label = node("span", "ei-field-label", study.columns[index]);
        label.setAttribute("aria-hidden", "true");
        field.append(label, document.createTextNode(value));
        row.append(field);
      });
    }
    return table;
  }

  function overlaps(points) {
    const details = node("details", "ei-overlaps");
    details.append(node("summary", null, `Overlapping points (${points.length})`));
    const list = node("ul");
    for (const point of points) {
      const item = node("li");
      const choice = node("button", null, point.label);
      choice.type = "button";
      choice.addEventListener("click", point.select);
      item.append(choice);
      list.append(item);
    }
    details.append(list);
    return details;
  }

  function open(detail, trigger, options = {}) {
    if (!dialog) buildDialog();
    const fragment = document.createDocumentFragment();
    const summary = node("p", "ei-summary", detail.summary);
    summary.id = "ei-summary";
    fragment.append(summary);
    if (options.nearby?.length) fragment.append(overlaps(options.nearby));

    const sources = node("section", "ei-sources");
    sources.append(node("h3", "ei-section-title", detail.groups.length > 1 ? "Investigations and sources" : "Investigation and sources"));
    const list = node("ul", "ei-source-list");
    for (const study of detail.groups) list.append(sourceLinks(study));
    sources.append(list);
    fragment.append(sources);

    const records = node("section", "ei-records");
    records.append(node("h3", "ei-section-title", "Reported values"));
    for (const study of detail.groups) {
      if (detail.groups.length > 1) records.append(node("h4", "ei-record-heading", study.accession || study.name));
      records.append(study.rows.length === 1 ? recordList(study) : recordTable(study));
    }
    fragment.append(records);
    heading.textContent = detail.title;
    content.replaceChildren(fragment);
    if (!dialog.open) {
      launcher = trigger;
      dialog.showModal();
    }
    content.scrollTop = 0;
    heading.focus({ preventScroll: true });
  }

  return { open, clear: () => dismiss(false), isOpen: () => Boolean(dialog?.open) };
})();
