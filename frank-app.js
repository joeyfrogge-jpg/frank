/* FRANK v1.1 timer-fix bootstrap */
(async function(){
  const files = ["./frank-core-0.js","./frank-core-1.js","./frank-core-2.js","./frank-core-3.js"];
  let code = "";
  for (const f of files) {
    const r = await fetch(f+"?v=fix1");
    if (!r.ok) throw new Error("Missing "+f+" ("+r.status+")");
    code += await r.text() + "\n";
  }
  (0, eval)(code);
})().catch(e=>{
  console.error(e);
  alert("FRANK failed to load: "+e.message);
});
