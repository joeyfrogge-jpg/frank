/* FRANK / FRANKGPT web app.
 * Talks ONLY to your FRANKGPT server (see docs/BACKEND.md). No third-party AI SDKs.
 * Auth: Google | Email | Phone | Guest.   Output: 10 / 20 / 30 s (real, measured server-side).
 */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const VERSION = "frankgpt-standalone-1.0";
const DEFAULT_PLANS = {
  guest: { per_day: 2, max_duration: 10, i2v: false },
  free: { per_day: 3, max_duration: 10, i2v: false }
};

/* ---------- storage ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} }
};
const dbp = new Promise((res, rej) => {
  const r = indexedDB.open("frank-iphone", 2);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("v")) r.result.createObjectStore("v", { keyPath: "id" }); };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => {
  const d = await dbp;
  return new Promise((res, rej) => {
    const t = d.transaction("v", mode);
    const q = fn(t.objectStore("v"));
    t.oncomplete = () => res(q && q.result);
    t.onerror = () => rej(t.error);
  });
};
const idbPut = o => tx("readwrite", s => s.put(o));
const idbAll = async () => ((await tx("readonly", s => s.getAll())) || []).sort((a, b) => b.ts - a.ts);
const idbDel = id => tx("readwrite", s => s.delete(id));
async function saveVid(meta, blob) {
  if (!blob?.size) throw new Error("Empty video");
  await idbPut({ ...meta, mime: blob.type || "video/mp4", data: await blob.arrayBuffer() });
}
const blobOf = rec => rec?.data ? new Blob([rec.data], { type: rec.mime || "video/mp4" }) : null;

/* ---------- API client ---------- */
const server = { online: false, features: {}, engine: null, plans: DEFAULT_PLANS, googleId: null, checked: false };
const apiBase = () => (LS.get("frank_api", "") || window.FRANK_CONFIG?.API_BASE || "").trim().replace(/\/+$/, "");
const guestId = () => { let g = LS.get("frank_gid", ""); if (!g) { g = Math.random().toString(36).slice(2) + Date.now().toString(36); LS.set("frank_gid", g); } return g; };
const token = () => LS.get("frank_token", "");

async function api(path, { method = "GET", body, raw = false, signal } = {}) {
  const headers = { "X-Frank-Guest": guestId() };
  if (token()) headers.Authorization = "Bearer " + token();
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let r;
  try {
    r = await fetch(apiBase() + "/api/v1" + path, { method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    const err = new Error("Can't reach the FRANKGPT server. Check the server address in Settings.");
    err.code = "offline"; throw err;
  }
  if (raw && r.ok) return r;
  let j = null;
  try { j = await r.json(); } catch (_) {}
  if (!r.ok) {
    const err = new Error(j?.error || ("Server error " + r.status));
    err.code = j?.code || ("http_" + r.status); err.status = r.status; throw err;
  }
  return j;
}
const mediaUrl = p => apiBase() + p;

async function checkServer() {
  try {
    const h = await api("/health");
    Object.assign(server, { online: true, features: h.features || {}, engine: h.engine || null, plans: { ...DEFAULT_PLANS, ...(h.plans || {}) }, googleId: h.google_client_id || null, ready: !!h.ready });
  } catch (_) {
    Object.assign(server, { online: false, features: {}, engine: null, ready: false });
  }
  server.checked = true;
  renderServerState();
}

/* ---------- user ---------- */
const getUser = () => LS.get("frank_user", null);
function setSession(res) { LS.set("frank_token", res.token); LS.set("frank_user", res.user); LS.set("frank_guest", false); }
function clearSession() { LS.del("frank_token"); LS.del("frank_user"); }
const limits = () => getUser()?.limits || server.plans.guest || DEFAULT_PLANS.guest;

function updateUserUI() {
  const u = getUser();
  const label = u ? (u.name || u.email || u.phone || "User") : "Guest";
  $("#user-pill").textContent = label;
  $("#set-acct").textContent = u ? label + " · " + u.plan + " plan" : "Guest mode — sign in to share and upgrade";
  $("#btn-signout").style.display = u ? "block" : "none";
  $("#btn-delacct").style.display = u ? "block" : "none";
  $("#btn-portal").style.display = u && u.plan !== "free" && server.features.billing ? "block" : "none";
  $$(".plan").forEach(p => p.classList.toggle("pop", p.dataset.plan === (u?.plan || "free") && !!u));
  $$(".plan-btn").forEach(b => {
    const plan = b.dataset.up;
    b.textContent = u?.plan === plan ? "Current plan" : "Choose " + plan[0].toUpperCase() + plan.slice(1);
    b.disabled = u?.plan === plan || !server.features.billing;
    b.title = server.features.billing ? "" : "Billing is not enabled on this server";
  });
  syncDur(+LS.get("fd", 10));
}

function renderServerState() {
  const f = server.features;
  $("#btn-email").style.display = server.online ? "" : "none";
  $("#btn-phone").style.display = server.online && f.phone ? "" : "none";
  const showGoogle = server.online && f.google && server.googleId;
  $("#btn-google").style.display = "none";
  $("#google-slot").style.display = showGoogle ? "flex" : "none";
  if (showGoogle) initGoogle();
  const off = $("#gate-offline");
  off.style.display = server.online ? "none" : "";
  off.textContent = server.online ? "" : "The FRANK engine is offline right now. You can still look around as a guest.";
  $("#gate-or").style.display = server.online ? "" : "none";
  $("#gate-signin").style.display = server.online ? "" : "none";
  // engine badge + settings status
  const b = $("#engine-badge");
  let status;
  if (!server.online) { status = "FRANK engine: offline.\nVideos can't be generated until the FRANK server is reachable."; b.style.display = "none"; }
  else if (server.ready) {
    status = "Server: connected · engine ready" + (server.engine?.synthetic ? " (SYNTHETIC test engine — not AI)" : "");
    b.style.display = ""; b.textContent = server.engine?.synthetic ? "TEST ENGINE" : "ENGINE READY";
  } else {
    status = "Server: connected · engine NOT ready\n" + (server.engine?.reason || "No model configured.");
    b.style.display = ""; b.textContent = "ENGINE OFFLINE";
  }
  $("#api-status").textContent = status + (server.online ? "" : "");
  updateUserUI();
}

async function refreshMe() {
  if (!token()) return;
  try { const r = await api("/auth/me"); LS.set("frank_user", r.user); }
  catch (e) { if (e.status === 401) clearSession(); }
  updateUserUI();
}

function enterApp() { $("#gate").classList.add("off"); $("#app").style.display = "flex"; updateUserUI(); loadSet(); renderRecent(); }
function showGate() {
  $("#gate").classList.remove("off"); $("#app").style.display = "none";
  $("#gate-btns").style.display = "flex"; $("#form-email").classList.remove("on"); $("#form-phone").classList.remove("on");
  $("#gate-legal").style.display = ""; $("#gate-skip").style.display = "";
  renderServerState();
}
const hideGateButtons = () => { ["#gate-btns", "#gate-or", "#gate-legal", "#gate-signin", "#gate-skip", "#gate-offline"].forEach(s => $(s).style.display = "none"); };

(async function boot() {
  if (getUser() || LS.get("frank_guest", false)) enterApp();
  await checkServer();
  await refreshMe();
})();

$("#gate-skip").onclick = () => { LS.set("frank_guest", true); enterApp(); };
$("#btn-signout").onclick = async () => { try { await api("/auth/logout", { method: "POST" }); } catch (_) {} clearSession(); LS.set("frank_guest", false); showGate(); };
$("#btn-delacct").onclick = async () => {
  if (!confirm("Delete your account and all of your videos on the server? This cannot be undone.")) return;
  try { await api("/auth/me", { method: "DELETE" }); clearSession(); LS.set("frank_guest", false); showGate(); }
  catch (e) { setMsg(e.message, true); }
};

/* ---------- Google (verified server-side) ---------- */
let googleReady = false;
function initGoogle() {
  if (googleReady) return;
  googleReady = true;
  const s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
  s.onload = () => {
    google.accounts.id.initialize({
      client_id: server.googleId,
      callback: async resp => {
        try { setSession(await api("/auth/google", { method: "POST", body: { credential: resp.credential } })); enterApp(); refreshMe(); }
        catch (e) { alert("Google sign-in failed: " + e.message); }
      }
    });
    google.accounts.id.renderButton($("#google-slot"), { theme: "filled_black", size: "large", text: "continue_with", shape: "pill", width: 320 });
  };
  s.onerror = () => { googleReady = false; $("#btn-google").style.display = "none"; };
  document.head.appendChild(s);
}
$("#btn-google").onclick = () => alert("Google sign-in is not available on this server.");

/* ---------- Email ---------- */
$("#btn-email").onclick = () => { hideGateButtons(); $("#form-email").classList.add("on"); $("#form-phone").classList.remove("on"); };
$("#gate-signin").onclick = () => $("#btn-email").click();
$("#email-back").onclick = showGate;
$("#email-submit").onclick = async () => {
  const email = $("#email-addr").value.trim().toLowerCase(), password = $("#email-pass").value, name = ($("#email-name").value || "Creator").trim();
  if (!email.includes("@")) return alert("Enter a valid email");
  if (password.length < 8) return alert("Password must be at least 8 characters");
  const btn = $("#email-submit"); btn.disabled = true;
  try {
    let res;
    try { res = await api("/auth/register", { method: "POST", body: { email, password, name } }); }
    catch (e) {
      if (e.code !== "exists") throw e;
      res = await api("/auth/login", { method: "POST", body: { email, password } });
    }
    setSession(res); enterApp();
  } catch (e) { alert(e.message); } finally { btn.disabled = false; }
};

/* ---------- Phone (real SMS via your server's Twilio Verify) ---------- */
let phonePending = null;
$("#btn-phone").onclick = () => { hideGateButtons(); $("#form-phone").classList.add("on"); $("#form-email").classList.remove("on"); };
$("#phone-back").onclick = () => { phonePending = null; $("#phone-code").style.display = "none"; showGate(); };
$("#phone-submit").onclick = async () => {
  const btn = $("#phone-submit"); btn.disabled = true;
  try {
    if (!phonePending) {
      const phone = $("#phone-num").value.trim();
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Use international format, e.g. +15551234567");
      await api("/auth/phone/start", { method: "POST", body: { phone } });
      phonePending = phone; $("#phone-code").style.display = "block"; $("#phone-code").placeholder = "Code from your text message";
      btn.textContent = "Verify & continue";
    } else {
      const code = $("#phone-code").value.trim();
      if (code.length < 4) throw new Error("Enter the code we texted you");
      setSession(await api("/auth/phone/verify", { method: "POST", body: { phone: phonePending, code, name: ($("#phone-name").value || "Creator").trim() } }));
      phonePending = null; btn.textContent = "Send code / Continue"; enterApp();
    }
  } catch (e) { alert(e.message); } finally { btn.disabled = false; }
};

/* ---------- settings ---------- */
function loadSet() {
  const d = LS.get("fd", 10);
  $("#set-dur").value = String([10, 20, 30].includes(d) ? d : 10);
  $("#set-ar").value = LS.get("fa", "9:16");
  $("#set-name").value = LS.get("fn", "") || getUser()?.name || "";
  $("#set-api").value = LS.get("frank_api", "") || "";
  syncDur(+$("#set-dur").value);
}
async function saveSet() {
  LS.set("fd", +$("#set-dur").value); LS.set("fa", $("#set-ar").value);
  LS.set("fn", ($("#set-name").value || "").trim());
  const api0 = apiBase();
  LS.set("frank_api", ($("#set-api").value || "").trim().replace(/\/+$/, ""));
  syncDur(+$("#set-dur").value);
  if (apiBase() !== api0) { clearSession(); await checkServer(); }
  setMsg("Saved.", false, true);
}
$("#btn-save").onclick = saveSet;
function syncDur(s) {
  const max = limits().max_duration;
  $$(".dur").forEach(b => { b.classList.toggle("on", +b.dataset.s === +s); b.dataset.locked = +b.dataset.s > max ? "1" : ""; b.style.opacity = +b.dataset.s > max ? ".5" : ""; });
}
$$(".dur").forEach(b => {
  b.onclick = () => {
    if (busy) return;
    const s = +b.dataset.s;
    if (s > limits().max_duration) { stat("Your plan allows up to " + limits().max_duration + "s clips. Upgrade in More → Pick your power.", true); return; }
    LS.set("fd", s); $("#set-dur").value = String(s); syncDur(s);
  };
});
function nav(n) {
  $$(".page").forEach(p => p.classList.toggle("on", p.id === "p-" + n));
  $$("#nav button").forEach(b => b.classList.toggle("on", b.dataset.n === n));
  if (n === "lib") renderLib(); if (n === "home") renderRecent(); if (n === "explore") renderExplore(); if (n === "set") { loadSet(); checkServer().then(refreshMe); }
}
$$("#nav button").forEach(b => b.onclick = () => nav(b.dataset.n));

/* ---------- billing ---------- */
$$(".plan-btn").forEach(b => b.onclick = async () => {
  if (!getUser()) { setMsg("Create an account first (More → sign in), then pick a plan.", true); return; }
  try { const r = await api("/billing/checkout", { method: "POST", body: { plan: b.dataset.up } }); location.href = r.url; }
  catch (e) { setMsg(e.message, true); }
});
$("#btn-portal").onclick = async () => {
  try { const r = await api("/billing/portal", { method: "POST", body: {} }); location.href = r.url; }
  catch (e) { setMsg(e.message, true); }
};

/* ---------- create ---------- */
let ref = null, busy = false, lastBlob = null, lastMeta = null, abort = null;
function renderRefs() {
  const box = $("#refs");
  if (!ref) { box.classList.remove("on"); box.innerHTML = ""; return; }
  box.classList.add("on");
  box.innerHTML = `<div class="thumb"><img src="${ref.url}" alt=""><button type="button">×</button></div>`;
  box.querySelector("button").onclick = () => { URL.revokeObjectURL(ref.url); ref = null; renderRefs(); };
}
$("#btn-ref").onclick = () => $("#ref-in").click();
$("#ref-in").onchange = async e => {
  const f = e.target.files?.[0]; e.target.value = "";
  if (!f || !/^image\//i.test(f.type)) return;
  if (f.size > 8e6) { stat("Image max 8MB", true); return; }
  if (ref) URL.revokeObjectURL(ref.url);
  const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  ref = { url: URL.createObjectURL(f), dataUrl };
  renderRefs();
};
$$(".chip[data-p]").forEach(b => b.onclick = () => { $("#prompt").value = b.dataset.p; $("#prompt").focus(); });
$("#chip-surprise").onclick = () => {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  $("#prompt").value = `${pick(["a raccoon in a black suit", "a golden retriever with sunglasses", "a skeleton with headphones", "a cat in round glasses", "a fox in a trench coat"])} ${pick(["walking toward the camera", "dancing under rain", "looking into the distance", "skateboarding"])} in ${pick(["neon Tokyo streets in the rain", "a golden-hour beach", "a purple neon bedroom", "a cyberpunk alley"])}, ${pick(["slow cinematic dolly", "smooth tracking shot", "dramatic low angle"])}, ${pick(["cinematic lighting, 24fps", "moody neon, film grain", "warm golden hour"])}`;
};
const stat = (t, err, ok) => { const s = $("#stat"); s.className = "status on" + (err ? " err" : ok ? " ok" : ""); s.textContent = t; };
const setMsg = (t, err, ok) => { const s = $("#set-msg"); s.className = "status on" + (err ? " err" : ok ? " ok" : ""); s.textContent = t; };
function lockUI(on) { $$(".dur").forEach(b => b.disabled = !!on); $("#set-dur").disabled = !!on; $("#lock").classList.toggle("on", !!on); $("#btn-cancel").style.display = on ? "inline-flex" : "none"; }

function enhance(raw, hasImg) {
  let p = (raw || "").trim();
  if (!p) p = hasImg ? "Animate this image with natural continuous motion, cinematic lighting" : "";
  if (!p) return p;
  const bits = [];
  if (!/cinematic|photoreal|film|realistic/i.test(p)) bits.push("photorealistic cinematic video");
  if (!/camera|drone|orbit|handheld|shot|pan/i.test(p)) bits.push("smooth continuous camera motion");
  if (!/no text|watermark/i.test(p)) bits.push("no on-screen text, no watermark");
  if (bits.length) p = bits.join(", ") + ". " + p;
  return p.slice(0, 1200);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function friendly(e) {
  if (e?.name === "AbortError" || /cancel/i.test(e?.message || "")) return "Cancelled.";
  return String(e?.message || e || "Something went wrong").slice(0, 300);
}

async function generate() {
  if (busy) return;
  const raw = $("#prompt").value.trim();
  if (!raw && !ref) { stat("Add a prompt or photo first.", true); return; }
  const seconds = LS.get("fd", 10), aspect = LS.get("fa", "9:16"), prompt = enhance(raw, !!ref);
  busy = true; abort = new AbortController(); let jobId = null;
  $("#go").disabled = true; $("#go").classList.add("busy"); $("#result").classList.remove("on"); lockUI(true);
  try {
    stat("FRANKGPT · " + seconds + "s\nSubmitting job…");
    let job = await api("/generations", { method: "POST", signal: abort.signal, body: { prompt, duration: seconds, aspect, mode: ref ? "i2v" : "t2v", reference_image: ref?.dataUrl } });
    jobId = job.id;
    const t0 = Date.now();
    while (job.status === "queued" || job.status === "running") {
      const seg = job.segment_total > 1 ? "\nSegment " + Math.min(job.segment_done + (job.status === "running" ? 1 : 0), job.segment_total) + "/" + job.segment_total : "";
      stat("FRANKGPT · " + seconds + "s · " + job.status + seg + "\n" + (job.message || "") + "\n" + Math.round((Date.now() - t0) / 1000) + "s — keep this open.");
      await sleep(2000);
      job = await api("/generations/" + jobId, { signal: abort.signal });
    }
    if (job.status === "blocked") { stat(job.message, true); return; }
    if (job.status !== "succeeded") throw new Error(job.message || "Generation failed.");
    stat("Downloading video…");
    const blob = await (await api(job.video_url.replace("/api/v1", ""), { raw: true, signal: abort.signal })).blob();
    const meta = { id: job.id, job_id: job.id, prompt: job.prompt, ts: Date.now(), totalSec: job.duration, measuredSec: job.measured_duration, ar: aspect };
    await saveVid(meta, blob);
    lastBlob = blob; lastMeta = meta;
    const v = $("#vid"); v.src = URL.createObjectURL(blob); v.setAttribute("playsinline", "");
    $("#result").classList.add("on");
    try { await v.play(); } catch (_) {}
    stat("Saved · " + Math.round(job.measured_duration) + "s video" + (job.watermark ? " · watermarked (free plan)" : ""), false, true);
    renderRecent();
  } catch (e) {
    if (e?.name === "AbortError" && jobId) api("/generations/" + jobId, { method: "DELETE" }).catch(() => {});
    stat((e?.name === "AbortError" ? "" : "Failed.\n") + friendly(e), e?.name !== "AbortError");
  } finally {
    busy = false; abort = null; $("#go").disabled = false; $("#go").classList.remove("busy"); lockUI(false);
  }
}
$("#go").onclick = generate;
$("#btn-cancel").onclick = () => { if (busy && abort) { stat("Cancelling…", true); abort.abort(); } };
$("#btn-dl").onclick = () => { if (!lastBlob) return; const a = document.createElement("a"); a.href = URL.createObjectURL(lastBlob); a.download = "frank-" + Date.now() + ".mp4"; a.click(); };

/* ---------- Explore (your feed) ---------- */
$("#btn-pub").onclick = () => openPublish();
function openPublish() {
  if (!lastBlob || !lastMeta) { stat("Generate a video first.", true); return; }
  if (!getUser()) { stat("Sign in to share to Explore (More → Continue with email).", true); return; }
  if (!lastMeta.job_id) { stat("This older video isn't on the server, so it can't be shared. Generate a new one.", true); return; }
  $("#pub-name").value = LS.get("fn", "") || getUser()?.name || "";
  $("#pub-cap").value = lastMeta.prompt || "";
  $("#pub-modal").classList.add("on");
}
$("#pub-cancel").onclick = () => $("#pub-modal").classList.remove("on");
$("#pub-ok").onclick = async () => {
  try {
    $("#pub-ok").disabled = true;
    const creator = ($("#pub-name").value || LS.get("fn", "") || getUser()?.name || "Creator").trim();
    LS.set("fn", creator);
    await api("/feed", { method: "POST", body: { generation_id: lastMeta.job_id, caption: ($("#pub-cap").value || "").trim(), creator } });
    $("#pub-modal").classList.remove("on"); stat("Published to Explore.", false, true); nav("explore");
  } catch (e) {
    $("#pub-modal").classList.remove("on");
    stat("Publish failed.\n" + (e.status === 404 ? "That video is no longer on the server. Generate a new one to share." : e.status === 409 ? "Already shared." : friendly(e)), true);
  } finally { $("#pub-ok").disabled = false; }
};
async function renderExplore() {
  const box = $("#explore");
  const empty = (t, p) => { box.innerHTML = ""; const d = document.createElement("div"); d.className = "empty"; const s = document.createElement("strong"); s.textContent = t; const q = document.createElement("p"); q.textContent = p || ""; d.append(s, q); box.append(d); };
  empty("Loading…");
  try {
    const { posts } = await api("/feed");
    if (!posts.length) return empty("NO UPLOADS YET!", "Be the 1st to share a creation!");
    const grid = document.createElement("div"); grid.className = "explore-grid";
    for (const row of posts) {
      const c = document.createElement("div"); c.className = "ex";
      const v = document.createElement("video"); v.src = mediaUrl(row.video_url); v.controls = true; v.preload = "metadata"; v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", "");
      const body = document.createElement("div"); body.className = "body";
      const who = document.createElement("div"); who.className = "who"; who.textContent = "@" + (row.creator || "creator");
      const cap = document.createElement("div"); cap.className = "cap"; cap.textContent = row.caption || "";
      body.append(who, cap);
      if (row.mine) {
        const del = document.createElement("button"); del.className = "soft danger"; del.type = "button"; del.textContent = "Remove"; del.style.marginTop = "8px";
        del.onclick = async () => { try { await api("/feed/" + row.id, { method: "DELETE" }); renderExplore(); } catch (e) { stat(friendly(e), true); } };
        body.append(del);
      }
      c.append(v, body); grid.append(c);
    }
    box.replaceChildren(grid);
  } catch (e) { empty("Feed unavailable", e.code === "offline" ? "FRANKGPT server not connected." : friendly(e)); }
}

/* ---------- library (on this device) ---------- */
async function renderRecent() {
  const box = $("#recent"); let items = [];
  try { items = await idbAll(); } catch (_) {}
  if (!items.length) { box.innerHTML = `<div class="empty"><strong>No videos yet</strong>Your next idea starts here.</div>`; return; }
  const row = document.createElement("div"); row.className = "recent";
  for (const it of items.slice(0, 10)) {
    const b = blobOf(it); if (!b) continue;
    const c = document.createElement("div"); c.className = "rc";
    c.innerHTML = `<video src="${URL.createObjectURL(b)}" muted playsinline></video><div class="m"></div>`;
    c.querySelector(".m").textContent = it.prompt || "Untitled";
    c.onclick = () => nav("lib"); row.append(c);
  }
  box.replaceChildren(row);
}
async function renderLib() {
  const box = $("#library"); let items = [];
  try { items = await idbAll(); } catch (e) { box.textContent = e.message; return; }
  if (!items.length) { box.innerHTML = `<div class="empty"><strong>Empty</strong></div>`; return; }
  box.innerHTML = "";
  for (const it of items) {
    const b = blobOf(it); if (!b) continue;
    const d = document.createElement("div"); d.className = "li";
    d.innerHTML = `<video src="${URL.createObjectURL(b)}" controls playsinline></video><div class="r"><p></p><button class="soft primary" type="button" data-a="pub">Share</button><button class="soft danger" type="button" data-a="del">Delete</button></div>`;
    d.querySelector("p").textContent = (it.prompt || "") + (it.totalSec ? " · " + (it.measuredSec ? Math.round(it.measuredSec) : it.totalSec) + "s" : "");
    d.querySelector('[data-a="del"]').onclick = async () => { await idbDel(it.id); if (it.job_id) api("/generations/" + it.job_id, { method: "DELETE" }).catch(() => {}); renderLib(); renderRecent(); };
    d.querySelector('[data-a="pub"]').onclick = () => { lastBlob = b; lastMeta = it; openPublish(); };
    box.append(d);
  }
}
$("#btn-wipe").onclick = async () => {
  if (!confirm("Erase local library?")) return;
  for (const i of await idbAll()) await idbDel(i.id);
  renderLib(); renderRecent(); setMsg("Cleared.", false, true);
};

if (window.Capacitor || /^(capacitor|ionic):/.test(location.protocol) || location.hostname === "localhost" && location.protocol === "https:") { $("#install-card")?.remove(); $("#gate-apk")?.remove(); }
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
