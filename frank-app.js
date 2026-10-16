/* FRANK app v1.1 — loads fixed core (timer timeout + server checks) */
(async function () {
  const files = ["./frank-b64-0.txt", "./frank-b64-1.txt", "./frank-b64-2.txt", "./frank-b64-3.txt"];
  let b64 = "";
  for (const f of files) {
    const r = await fetch(f + "?v=20261016b");
    if (!r.ok) throw new Error("Missing " + f + " (" + r.status + ")");
    b64 += (await r.text()).trim();
  }
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  const code = await new Response(stream).text();
  (0, eval)(code);
})().catch(e => {
  console.error(e);
  const el = document.querySelector("#stat") || document.body;
  if (el && el !== document.body) {
    el.className = "status on err";
    el.style.display = "block";
    el.textContent = "FRANK failed to load: " + e.message;
  } else {
    alert("FRANK failed to load: " + e.message);
  }
});
