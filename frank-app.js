/* FRANK bootstrap - timer fix */
(async function(){
  const files = ["./frank-b64-0.txt", "./frank-b64-1.txt", "./frank-b64-2.txt"];
  let b64 = "";
  for (const f of files) {
    const r = await fetch(f + "?v=" + Date.now());
    if (!r.ok) throw new Error("Missing " + f);
    b64 += await r.text();
  }
  const bin = Uint8Array.from(atob(b64.trim()), c => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  const code = await new Response(stream).text();
  (0, eval)(code);
})().catch(e => { console.error(e); alert("FRANK load error: " + e.message); });
