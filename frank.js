
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const VERSION="frank-sora-2.0";
/** Single engine: OpenAI Sora 2 via Puter — no multi-model pipeline */
const FRANK_MODEL="openai/sora-2";

const dbp=new Promise((res,rej)=>{
  const r=indexedDB.open("frank-vid",4);
  r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("v"))d.createObjectStore("v",{keyPath:"id"})};
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);
});
const tx=async(m,f)=>{const d=await dbp;return new Promise((res,rej)=>{const t=d.transaction("v",m);const q=f(t.objectStore("v"));t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error)})};
const idbPut=o=>tx("readwrite",s=>s.put(o));
const idbAll=async()=>(await tx("readonly",s=>s.getAll())||[]).sort((a,b)=>b.ts-a.ts);
const idbDel=id=>tx("readwrite",s=>s.delete(id));

async function persistVideo(meta,blob){
  if(!blob||!blob.size)throw new Error("Empty video — nothing to save");
  const buf=await blob.arrayBuffer();
  if(!buf.byteLength)throw new Error("Empty video buffer");
  const rec={id:meta.id,prompt:meta.prompt,ts:meta.ts,totalSec:meta.totalSec,ar:meta.ar||"",model:meta.model||FRANK_MODEL,mime:blob.type||"video/mp4",data:buf};
  await idbPut(rec);
  const check=await tx("readonly",s=>s.get(meta.id));
  if(!check||!check.data)throw new Error("Save verification failed");
  return rec;
}
function recBlob(rec){if(rec?.data)return new Blob([rec.data],{type:rec.mime||"video/mp4"});return null}

const LS={
  get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch{return d}},
  set(k,v){localStorage.setItem(k,JSON.stringify(v))}
};

function loadSettings(){
  const dur=LS.get("frank_dur",10);
  $("#set-dur").value=String(dur);
  $("#set-ar").value=LS.get("frank_ar","9:16");
  $("#set-name").value=LS.get("frank_name","")||"";
  $("#set-sb-url").value=LS.get("frank_sb_url","")||"";
  $("#set-sb-key").value=LS.get("frank_sb_key","")||"";
  syncDurUI(dur);
}
function saveSettings(){
  LS.set("frank_dur",+$("#set-dur").value);
  LS.set("frank_ar",$("#set-ar").value);
  LS.set("frank_name",$("#set-name").value.trim());
  LS.set("frank_sb_url",$("#set-sb-url").value.trim());
  LS.set("frank_sb_key",$("#set-sb-key").value.trim());
  syncDurUI(+$("#set-dur").value);
}
["set-dur","set-ar","set-name","set-sb-url","set-sb-key"].forEach(id=>{
  const el=$("#"+id);if(el){el.addEventListener("change",saveSettings);el.addEventListener("blur",saveSettings)}
});

function syncDurUI(sec){
  $$(".dur-btn").forEach(b=>b.classList.toggle("on",+b.dataset.sec===+sec));
}
$$(".dur-btn").forEach(b=>{
  b.onclick=()=>{
    if(busy)return;
    const sec=+b.dataset.sec;
    LS.set("frank_dur",sec);
    $("#set-dur").value=String(sec);
    syncDurUI(sec);
  };
});

function nav(page){
  $$(".page").forEach(p=>p.classList.toggle("on",p.id==="p-"+page));
  $$("#bnav button").forEach(b=>b.classList.toggle("on",b.dataset.nav===page));
  if(page==="library")renderLibrary();
  if(page==="explore")renderExplore();
  if(page==="home")renderRecent();
  if(page==="settings")loadSettings();
}
$$("#bnav button").forEach(b=>b.onclick=()=>nav(b.dataset.nav));
$$("[data-nav]").forEach(b=>{if(!b.closest("#bnav"))b.onclick=()=>nav(b.dataset.nav)});

let refFiles=[];
function renderRefs(){
  const box=$("#refs");
  if(!refFiles.length){box.classList.remove("on");box.innerHTML="";return}
  box.classList.add("on");box.innerHTML="";
  refFiles.forEach((r,i)=>{
    const d=document.createElement("div");d.className="ref-thumb";
    d.innerHTML=`<img src="${r.url}" alt=""><button type="button">×</button>`;
    d.querySelector("button").onclick=()=>{URL.revokeObjectURL(r.url);refFiles.splice(i,1);renderRefs()};
    box.append(d);
  });
}
$("#btn-ref").onclick=()=>$("#ref-input").click();
$("#ref-input").onchange=async e=>{
  const files=[...e.target.files||[]].filter(f=>/^image\/(jpeg|png|webp|gif)$/i.test(f.type));
  e.target.value="";
  for(const f of files){
    if(f.size>8*1024*1024){stat("Image too large (max 8MB)",true);continue}
    if(refFiles.length>=3){stat("Max 3 reference images",true);break}
    const url=URL.createObjectURL(f);
    const dataUrl=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)});
    refFiles.push({file:f,url,dataUrl});
  }
  renderRefs();
};

$$(".chip[data-p]").forEach(b=>b.onclick=()=>{
  const t=$("#prompt");const ins=b.dataset.p;
  if(!t.value.trim())t.value=ins;else if(!t.value.includes(ins))t.value=(t.value.trim()+"\n"+ins).trim();
  t.focus();
});
const MAGIC=[
  "A neon jellyfish orchestra under the aurora, cinematic lighting, smooth camera drift",
  "Tiny astronauts skateboarding Saturn's rings, whimsical, golden hour",
  "A library where books open as glowing particles, slow push-in, magical atmosphere",
  "Cyberpunk rainy night market, steam and neon reflections, handheld energy"
];
$$(".qc-card").forEach(b=>b.onclick=()=>{
  const m=b.dataset.mode;
  if(m==="photo"){$("#ref-input").click();$("#prompt").focus();stat("Add a reference photo, then describe the motion.",false)}
  else if(m==="video"){stat("From Video is not supported yet. Use From Text or From Photo.",true)}
  else if(m==="text"){$("#prompt").focus();$("#composer").scrollIntoView({behavior:"smooth",block:"center"})}
  else if(m==="magic"){$("#prompt").value=MAGIC[Math.floor(Math.random()*MAGIC.length)];$("#prompt").focus()}
});

let busy=false,lastBlob=null,lastMeta=null,tickTimer=null,abortGen=false;

const stat=(t,err,ok)=>{const s=$("#stat");s.className="status on"+(err?" err":ok?" ok":"");s.textContent=t};
const setMsg=(t,err,ok)=>{const s=$("#set-msg");s.className="status on"+(err?" err":ok?" ok":"");s.textContent=t};

function lockUI(on){
  $$(".dur-btn").forEach(b=>b.disabled=!!on);
  $("#set-dur").disabled=!!on;
  $("#set-ar").disabled=!!on;
  $("#lock-note").classList.toggle("on",!!on);
  $("#btn-cancel").style.display=on?"inline-flex":"none";
}

function withTimeout(p,ms,label){
  let to;
  const t=new Promise((_,rej)=>{to=setTimeout(()=>rej(new Error((label||"Request")+" timed out after "+Math.round(ms/1000)+"s")),ms)});
  return Promise.race([p,t]).finally(()=>clearTimeout(to));
}

async function ensurePuterAuth(){
  if(typeof puter==="undefined")throw new Error("Puter.js failed to load — check your connection and reload");
  try{if(puter.auth?.isSignedIn&&await puter.auth.isSignedIn())return}catch(_){}
  if(puter.auth?.signIn){
    stat("Opening Puter sign-in…\nAllow the popup, then generation continues.");
    await puter.auth.signIn({attempt_temp_user_creation:true});
  }
}

function sizeFor(ar){
  if(ar==="9:16")return "720x1280";
  if(ar==="1:1")return "720x720";
  return "1280x720";
}

function enhancePrompt(raw,hasRef){
  let p=(raw||"").trim();
  if(!p)p=hasRef?"Animate this image with natural motion, cinematic lighting, continuous camera":"";
  if(!p)return p;
  const lower=p.toLowerCase();
  const bits=[];
  if(!/cinematic|photoreal|realistic|film/i.test(lower))bits.push("photorealistic cinematic video");
  if(!/camera|drone|orbit|handheld|shot/i.test(lower))bits.push("coherent continuous camera motion");
  if(!/no text|watermark/i.test(lower))bits.push("no on-screen text, no watermark");
  if(bits.length)p=bits.join(", ")+". "+p;
  return p.slice(0,1200);
}

async function resultToBlob(result){
  if(result instanceof HTMLVideoElement){
    const src=result.src||result.currentSrc;
    if(!src)throw new Error("Empty video element from Sora");
    const r=await fetch(src);const b=await r.blob();
    if(!b.size)throw new Error("Downloaded video was empty");
    return b.type?b:new Blob([b],{type:"video/mp4"});
  }
  if(result instanceof Blob){
    if(!result.size)throw new Error("Empty video blob");
    return result;
  }
  if(result&&typeof result==="object"){
    const url=result.src||result.url||result.video_url||result.href;
    if(typeof url==="string"){
      const r=await fetch(url);const b=await r.blob();
      if(!b.size)throw new Error("Empty video from URL");
      return b.type?b:new Blob([b],{type:"video/mp4"});
    }
  }
  if(typeof result==="string"&&/^https?:/i.test(result)){
    const r=await fetch(result);const b=await r.blob();
    return b.type?b:new Blob([b],{type:"video/mp4"});
  }
  throw new Error("Unexpected Sora response — no video returned");
}

async function frankGenerate(prompt,ar,seconds,refDataUrl,onTick){
  const sec=Math.min(Math.max(Number(seconds)||10,4),20);
  const opts={
    prompt,
    model:FRANK_MODEL,
    seconds:sec,
    size:sizeFor(ar)
  };
  if(refDataUrl)opts.input_reference=refDataUrl;
  const started=Date.now();
  if(onTick){
    onTick(0);
    clearInterval(tickTimer);
    tickTimer=setInterval(()=>onTick(Math.round((Date.now()-started)/1000)),1000);
  }
  try{
    if(abortGen)throw new Error("Cancelled");
    const result=await withTimeout(puter.ai.txt2vid(opts),600000,"FRANK · Sora 2");
    if(abortGen)throw new Error("Cancelled");
    return await resultToBlob(result);
  }finally{
    clearInterval(tickTimer);
  }
}

function friendly(e){
  const m=String(e?.message||e||"");
  const code=e?.code||e?.errorCode||"";
  if(code==="insufficient_funds"||/insufficient/i.test(m))return "Not enough Puter credits for Sora 2.\nAdd credits at puter.com or try a shorter duration.";
  if(code==="popup_blocked")return "Popup blocked — allow popups for Puter sign-in.";
  if(code==="moderation_flagged")return "Prompt blocked by content filter. Try rewording.";
  if(code==="upstream_timeout"||/timed out/i.test(m))return "Sora took too long. Try again with 5–10s.";
  if(/model not found|not found|deprecated|sunset/i.test(m))return "Sora 2 is unavailable on Puter right now.\n"+m.slice(0,160);
  if(/cancelled/i.test(m))return "Cancelled.";
  return m.slice(0,280);
}

async function generate(){
  if(busy)return;
  const promptRaw=$("#prompt").value.trim();
  if(!promptRaw&&!refFiles.length){stat("Add a prompt or reference image first.",true);return}

  const lockedSec=LS.get("frank_dur",10);
  const lockedAr=LS.get("frank_ar","9:16");
  const lockedPrompt=enhancePrompt(promptRaw,!!refFiles.length);
  const refData=refFiles[0]?.dataUrl||null;

  busy=true;abortGen=false;
  $("#go").disabled=true;$("#go").classList.add("busy");
  $("#result").classList.remove("on");
  lockUI(true);

  try{
    await ensurePuterAuth();
    if(abortGen)throw new Error("Cancelled");
    stat("FRANK · Sora 2 · "+lockedSec+"s\nGenerating… 0s");
    const blob=await frankGenerate(lockedPrompt,lockedAr,lockedSec,refData,sec=>{
      if(!abortGen)stat("FRANK · Sora 2 · "+lockedSec+"s locked\nGenerating… "+sec+"s\nKeep this tab open.");
    });
    const id=Date.now()+"-"+Math.random().toString(36).slice(2,8);
    const meta={id,prompt:lockedPrompt,ts:Date.now(),totalSec:lockedSec,ar:lockedAr,model:FRANK_MODEL};
    await persistVideo(meta,blob);
    lastBlob=blob;lastMeta=meta;
    const v=$("#result-vid");
    v.src=URL.createObjectURL(blob);
    $("#result").classList.add("on");
    stat("Saved to Library · FRANK · Sora 2 · "+VERSION,false,true);
    renderRecent();
  }catch(e){
    stat("Generation failed.\n"+friendly(e),true);
  }finally{
    busy=false;abortGen=false;
    $("#go").disabled=false;$("#go").classList.remove("busy");
    lockUI(false);
  }
}
$("#go").onclick=()=>generate();
$("#btn-cancel").onclick=()=>{if(busy){abortGen=true;stat("Cancelling…",true)}};

$("#btn-dl").onclick=()=>{
  if(!lastBlob)return;
  const a=document.createElement("a");
  a.href=URL.createObjectURL(lastBlob);
  a.download="frank-sora-"+Date.now()+".mp4";
  a.click();
};

async function renderRecent(){
  const box=$("#recent");
  let items=[];try{items=await idbAll()}catch(_){}
  if(!items.length){
    box.innerHTML=`<div class="empty-box"><strong>No creations yet.</strong><p>Your next idea starts here.</p><button class="btn-link" type="button" id="empty-go">Start creating</button></div>`;
    $("#empty-go")?.addEventListener("click",()=>$("#prompt").focus());
    return;
  }
  const row=document.createElement("div");row.className="recent-row";
  for(const it of items.slice(0,12)){
    const blob=recBlob(it);if(!blob)continue;
    const u=URL.createObjectURL(blob);
    const c=document.createElement("div");c.className="recent-card";
    c.innerHTML=`<video src="${u}" muted playsinline></video><div class="meta"></div>`;
    c.querySelector(".meta").textContent=it.prompt||"Untitled";
    c.onclick=()=>nav("library");
    row.append(c);
  }
  box.replaceChildren(row);
}

async function renderLibrary(){
  const box=$("#library");
  let items=[];try{items=await idbAll()}catch(e){box.innerHTML=`<div class="empty-box"><strong>Error</strong><p>${e.message}</p></div>`;return}
  if(!items.length){box.innerHTML=`<div class="empty-box"><strong>No creations yet.</strong><p>Your next idea starts here.</p></div>`;return}
  box.innerHTML="";
  for(const it of items){
    const blob=recBlob(it);if(!blob)continue;
    const u=URL.createObjectURL(blob);
    const d=document.createElement("div");d.className="lib-item";
    d.innerHTML=`<video src="${u}" controls playsinline></video><div class="row"><p></p><div style="display:flex;gap:6px"><button class="btn-soft" type="button" data-a="pub">Publish</button><button class="btn-soft danger" type="button" data-a="del">Delete</button></div></div>`;
    d.querySelector("p").textContent=(it.prompt||"")+(it.totalSec?" · "+it.totalSec+"s":"")+(it.model?" · Sora 2":"");
    d.querySelector('[data-a="del"]').onclick=async()=>{await idbDel(it.id);renderLibrary();renderRecent()};
    d.querySelector('[data-a="pub"]').onclick=()=>{lastBlob=blob;lastMeta=it;openPublish()};
    box.append(d);
  }
}

function sbConfig(){
  const url=($("#set-sb-url")?.value||LS.get("frank_sb_url","")||"").trim().replace(/\/$/,"");
  const key=($("#set-sb-key")?.value||LS.get("frank_sb_key","")||"").trim();
  return url&&key?{url,key}:null;
}
async function sbFetch(path,opts={}){
  const cfg=sbConfig();if(!cfg)throw new Error("NO_SB");
  const r=await fetch(cfg.url+"/rest/v1/"+path,{...opts,headers:{apikey:cfg.key,Authorization:"Bearer "+cfg.key,"Content-Type":"application/json",Prefer:opts.prefer||"return=representation",...(opts.headers||{})}});
  if(!r.ok){const t=await r.text();throw new Error(t.slice(0,160)||r.status)}
  if(r.status===204)return null;return r.json();
}

async function renderExplore(){
  const box=$("#explore");
  const cfg=sbConfig();
  if(!cfg){
    box.innerHTML=`<div class="empty-box"><strong>It's quiet in here.</strong><p>Connect Supabase in Settings for a shared public feed. No fake posts.</p><button class="btn-link" type="button" data-nav="settings">Open Settings</button></div>`;
    box.querySelector("[data-nav]")?.addEventListener("click",()=>nav("settings"));
    return;
  }
  box.innerHTML=`<div class="empty-box"><p>Loading…</p></div>`;
  try{
    const rows=await sbFetch("frank_explore?select=*&order=created_at.desc&limit=50");
    if(!rows||!rows.length){box.innerHTML=`<div class="empty-box"><strong>It's quiet in here.</strong><p>Be the first to drop a creation.</p></div>`;return}
    const grid=document.createElement("div");grid.className="explore-grid";
    for(const row of rows){
      const c=document.createElement("div");c.className="ex-card";
      c.innerHTML=`<video src="${row.video_url}" controls playsinline preload="metadata"></video><div class="body"><div class="who"></div><div class="cap"></div></div>`;
      c.querySelector(".who").textContent=row.creator||"FRANK creator";
      c.querySelector(".cap").textContent=row.caption||row.prompt||"";
      grid.append(c);
    }
    box.replaceChildren(grid);
  }catch(e){box.innerHTML=`<div class="empty-box"><strong>Feed unavailable</strong><p>${friendly(e)}</p></div>`}
}

function openPublish(){
  if(!lastBlob||!lastMeta){stat("Generate a video first.",true);return}
  $("#pub-caption").value=lastMeta.prompt||"";
  $("#pub-modal").classList.add("on");
}
$("#btn-publish").onclick=openPublish;
$("#pub-cancel").onclick=()=>$("#pub-modal").classList.remove("on");
$("#pub-ok").onclick=async()=>{
  const cfg=sbConfig();
  if(!cfg){stat("Add Supabase in Settings to publish.",true);$("#pub-modal").classList.remove("on");nav("settings");return}
  try{
    $("#pub-ok").disabled=true;
    let videoUrl="";
    if(typeof puter!=="undefined"&&puter.fs){
      const path=`frank-public/frank-pub-${Date.now()}.webm`;
      await puter.fs.mkdir("frank-public").catch(()=>{});
      await puter.fs.write(path,lastBlob);
      videoUrl=await puter.fs.getReadURL(path);
    }else throw new Error("Puter filesystem needed for public video URL");
    const creator=($("#set-name").value||LS.get("frank_name","")||"Anonymous").trim()||"Anonymous";
    await sbFetch("frank_explore",{method:"POST",body:JSON.stringify({id:lastMeta.id||String(Date.now()),prompt:lastMeta.prompt||"",caption:$("#pub-caption").value.trim(),video_url:videoUrl,creator})});
    $("#pub-modal").classList.remove("on");
    stat("Published to Explore.",false,true);
    nav("explore");
  }catch(e){stat("Publish failed.\n"+friendly(e),true)}
  finally{$("#pub-ok").disabled=false}
};

$("#btn-pro").onclick=()=>stat("Pro not configured. Puter User-Pays covers Sora 2 credits.",false);
$("#btn-account").onclick=()=>nav("settings");
$("#btn-signin").onclick=async()=>{try{await ensurePuterAuth();setMsg("Signed in to Puter.",false,true)}catch(e){setMsg(friendly(e),true)}};
$("#btn-test").onclick=async()=>{
  try{
    setMsg("Loading free sample clip…");
    const v=await withTimeout(puter.ai.txt2vid("A single orange on a black table",true),45000,"Test");
    setMsg("Sample OK · UI works · "+VERSION+"\nReal generates use FRANK · Sora 2 (uses credits).",false,true);
    if(v instanceof HTMLVideoElement){v.controls=true;v.style.width="100%";v.style.marginTop="8px";$("#set-msg").after(v)}
  }catch(e){setMsg(friendly(e),true)}
};
$("#btn-wipe").onclick=async()=>{
  if(!confirm("Erase all private videos?"))return;
  for(const i of await idbAll())await idbDel(i.id);
  renderLibrary();renderRecent();setMsg("Cleared.",false,true);
};

loadSettings();
renderRecent();
