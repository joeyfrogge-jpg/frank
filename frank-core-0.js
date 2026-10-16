/* FRANK / FRANKGPT web app.
 * Talks ONLY to your FRANKGPT server (see docs/BACKEND.md). No third-party AI SDKs.
 * Auth: Google | Email | Phone | Guest.   Output: 10 / 20 / 30 s (real, measured server-side).
 */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const VERSION = "frankgpt-standalone-1.1";
const DEFAULT_PLANS = {
  guest: { per_day: 2, max_duration: 10, i2v: false },
  free: { per_day: 3, max_duration: 10, i2v: false }
};

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
