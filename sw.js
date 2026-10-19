// Offline cache for the app shell. Bump VERSION on every deploy so phones pick up the new files on the next launch.
const VERSION = "1.1.3";
const SHELL = `shell-${VERSION}`;
const FONTS = "fonts";
const FILES = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/date.js",
  "./js/model.js",
  "./js/store.js",
  "./js/export.js",
  "./js/xlsx.js",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.open(FONTS).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => (c.put(req, res.clone()), res))),
      ),
    );
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)),
  );
});
