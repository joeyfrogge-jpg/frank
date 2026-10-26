(function () {
  const navButtons = [...document.querySelectorAll(".nav-btn")];
  const views = [...document.querySelectorAll(".view")];
  const statusText = document.getElementById("status-text");
  const notice = document.getElementById("notice");
  const promptEl = document.getElementById("prompt");
  const generateBtn = document.getElementById("generate");
  const statusLabels = {
    new: "Ready to create",
    projects: "Project library",
    edit: "Edit workspace",
    share: "Share / export",
  };
  function showView(name) {
    views.forEach((v) => v.classList.toggle("hidden", v.id !== `view-${name}`));
    navButtons.forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    statusText.textContent = statusLabels[name] || "Ready";
    notice.textContent = "";
  }
  navButtons.forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
  document.querySelectorAll("[data-go]").forEach((btn) =>
    btn.addEventListener("click", () => showView(btn.dataset.go))
  );
  generateBtn.addEventListener("click", () => {
    const prompt = promptEl.value.trim();
    if (!prompt) {
      notice.textContent = "Add a description first.";
      promptEl.focus();
      return;
    }
    notice.textContent =
      "Prototype only — connect the Frank API when text_to_video is available.";
    statusText.textContent = "Engine not connected";
  });
  promptEl.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") generateBtn.click();
  });
})();
