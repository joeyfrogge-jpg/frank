/* FRANK v1.1 timer-fix */
(async function(){
  const n = 8;
  let code = "";
  for (let i=0;i<n;i++){
    const r = await fetch("./frank-core-"+i+".js?v=fix2");
    if (!r.ok) throw new Error("Missing part "+i+" ("+r.status+")");
    code += await r.text() + "\n";
  }
  (0, eval)(code);
})().catch(e=>{console.error(e);alert("FRANK load failed: "+e.message);});
