(() => {
  const dock = document.querySelector(".cosmo-dock");
  if (!dock) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let finishTimer;
  let answerQueued = false;

  function reset() {
    clearTimeout(finishTimer);
    delete dock.dataset.reaction;
    dock.style.removeProperty("--cosmo-gesture-duration");
    answerQueued = false;
  }

  function play(gesture) {
    if (document.hidden || reducedMotion.matches) return;
    if (gesture === "answer" && dock.dataset.reaction === "point") {
      // A checked answer can arrive in the same frame as the selected point.
      answerQueued = true;
      return;
    }

    const replay = dock.dataset.reaction === gesture;
    reset();
    if (replay) void dock.offsetWidth; // Apply the resting pose before the same gesture restarts.
    const duration = gesture === "point" ? 640 : 480;
    dock.style.setProperty("--cosmo-gesture-duration", duration + "ms");
    dock.dataset.reaction = gesture;
    finishTimer = setTimeout(() => {
      const nextAnswer = answerQueued;
      reset();
      if (nextAnswer) play("answer");
    }, duration);
  }

  reducedMotion.addEventListener("change", reset);
  document.addEventListener("visibilitychange", reset);
  window.CosmoReactions = Object.freeze({
    receivePoint: () => play("point"),
    answer: () => play("answer")
  });
})();
