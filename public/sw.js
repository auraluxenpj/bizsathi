/* BizSathi PWA shell cache. Never cache HTML, API, auth, POS or business records. */
const CACHE_NAME = "bizsathi-static-v3";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/bizsathi-icon.svg", "/brand/bizsathi-logo.svg"];
self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) =>
    (key.startsWith("bizsathi-static-") || key.startsWith("sutra-static-")) && key !== CACHE_NAME
  ).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request; if (request.method !== "GET") return;
  const url = new URL(request.url); if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate" || url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/") ||
      url.pathname.startsWith("/functions/") || url.pathname.startsWith("/storage/") || url.pathname.includes("/rpc/") || url.pathname.startsWith("/api/")) {
    if (request.mode === "navigate") event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  const isBuildAsset = url.pathname.startsWith("/assets/"); const isPwaAsset = PRECACHE.includes(url.pathname);
  if (!isBuildAsset && !isPwaAsset) return;
  event.respondWith(caches.match(request).then((cached) => {
    const network = fetch(request).then((response) => {
      if (response.ok && response.type === "basic") { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)); }
      return response;
    });
    return cached || network;
  }));
});
