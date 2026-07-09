// Service worker for offline use. The app is fully static — all liturgical text
// is bundled — so once the assets have been fetched once (install it at home,
// open it once), the missal works with no network in the pew.
//
// Strategy:
//   • navigations  → network-first, falling back to the cached app shell offline.
//     Because online loads always hit the network first, users auto-update to the
//     latest deploy on reload; there is no cache-first "stuck on an old version".
//   • other GETs   → stale-while-revalidate. Built assets are content-hashed and
//     immutable, so a cached hit is always correct while the network copy refreshes
//     the cache for next time.

const CACHE = "missal-v1";
const SHELL = new URL(self.registration.scope).pathname; // e.g. "/tridentine-missal/"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add(new Request(SHELL, { cache: "reload" })))
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(SHELL).then((r) => r || caches.match(req)),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
