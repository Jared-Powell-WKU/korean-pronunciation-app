// Offline support: the app's own files are cached so it opens without a connection.
// Translation requests (other sites) always go to the network.
// tools/sync.mjs bumps VERSION whenever it copies new files, so phones pick up updates.
const VERSION = "368a1028f0";
const CACHE = "kpp-" + VERSION;
const SHELL = [
  "./", "index.html", "popup.css", "web.css", "platform.js", "conjugate.js", "srs.js",
  "translate.js", "cards.js", "app.js", "manifest.webmanifest", "icons/icon-192.png",
  "lib/tesseract.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Same-origin: serve from cache, refresh in the background. Big OCR files
// (lib/core, lib/lang) are cached the first time a photo is read.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = url.pathname.endsWith("/") ? "./" : e.request;
      const cached = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(e.request)
        .then((res) => { if (res.ok) cache.put(key, res.clone()); return res; })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
