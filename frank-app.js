/* FRANK app bootstrap - loads part1+part2 (timer fix) */
(async function(){
  const parts = ["./frank-app.part1.js", "./frank-app.part2.js"];
  let code = "";
  for (const p of parts) {
    const r = await fetch(p + "?v=" + Date.now());
    if (!r.ok) throw new Error("Missing " + p + " (" + r.status + ")");
    code += await r.text() + "\n";
  }
  (0, eval)(code);
})().catch(e => {
  console.error(e);
  const el = document.querySelector("#stat");
  if (el) { el.className = "status on err"; el.style.display = "block"; el.textContent = String(e.message || e); }
  alert("FRANK failed to load: " + (e.message || e));
});
