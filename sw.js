/* FRANK service worker: caches the app shell so it installs and opens offline.
   Never caches /api/ (generation, auth, feed, video all stay live). */
const CACHE = "frankgpt-standalone-1.0";
const SHELL = ["./", "./index.html", "./frank-app.js", "./config.js", "./manifest.json",
  "./terms.html", "./privacy.html", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.pathname.startsWith("/api/") || url.origin !== location.origin) return;
  // network first (so updates ship), fall back to cache when offline
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(r => r || caches.match("./index.html"))));
});
