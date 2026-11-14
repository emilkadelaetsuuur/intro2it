(() => {
  const cover = document.querySelector(".report-cover");
  const buttons = [...cover.querySelectorAll("[data-photo]")];
  const frames = [...cover.querySelectorAll("[data-frame]")];
  const credit = cover.querySelector("#photo-source");
  const dates = [...cover.querySelectorAll("time")];
  const formatDate = new Intl.DateTimeFormat("en-GB", {day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"});
  const viewer = cover.querySelector("#photo-viewer");
  const viewerImage = viewer.querySelector(".photo-viewer-image");
  const opener = cover.querySelector("#photo-open");
  let selected = frames.find(frame => frame.getAttribute("aria-hidden") === "false");

  function showInViewer() {
    const source = selected.querySelector("img");
    const image = new Image();
    image.alt = source.alt;
    image.src = source.src;
    viewerImage.replaceChildren(image);
    viewer.querySelector("#viewer-title").textContent = selected.dataset.title;
    viewer.querySelector("#viewer-source").href = selected.dataset.record;
  }

  function select(frame) {
    if (!frame || frame === selected) return;
    selected = frame;
    for (const item of frames) item.setAttribute("aria-hidden", String(item !== selected));
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.photo === selected.dataset.frame));
    credit.href = selected.dataset.record;
    credit.firstChild.textContent = selected.dataset.title + " ";
    const date = selected.dataset.date;
    for (const time of dates) {
      time.dateTime = date;
      time.textContent = formatDate.format(new Date(date));
    }
    if (viewer.open) showInViewer();
  }

  function step(direction) {
    const index = (frames.indexOf(selected) + direction + frames.length) % frames.length;
    select(frames[index]);
  }

  for (const button of buttons) {
    button.addEventListener("click", () => select(frames.find(frame => frame.dataset.frame === button.dataset.photo)));
  }
  function openPhoto() {
    showInViewer();
    viewer.showModal();
  }
  opener.addEventListener("click", openPhoto);
  cover.querySelector(".lunar-stage").addEventListener("click", event => {
    if (event.target.closest(".cover-copy, .cover-rail")) return;
    opener.focus({preventScroll: true});
    openPhoto();
  });
  viewer.querySelector("#photo-close").addEventListener("click", () => viewer.close());
  for (const button of viewer.querySelectorAll("[data-step]")) {
    button.addEventListener("click", () => step(Number(button.dataset.step)));
  }
  viewer.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      step(event.key === "ArrowLeft" ? -1 : 1);
    }
  });
  window.addEventListener("hashchange", () => { if (viewer.open) viewer.close(); });
})();
