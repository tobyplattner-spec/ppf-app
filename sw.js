/* The shell, kept on the device so the app opens with no signal and no waiting.
   Only the shell: the records themselves never pass through here — they are asked for
   over the wire and kept by the app itself, which knows what is owed and what is not.
   Requests to GitHub are left strictly alone.

   One face now, at the root. m.html is a redirect kept for home-screen icons added when
   the app lived there; it is in the shell so those still open with no signal. */
/* Bumped for the receipt viewer taking the whole height: both faces moved, and a shell
   still holding yesterday's copy would go on serving them. A new name empties the old
   one on activate rather than trusting network-first to catch every file past.

   Everything named here has to exist: addAll is all-or-nothing, and one missing file
   fails the install and leaves the device with no shell at all rather than an old one. */
const CACHE = "ppf-v23";
const SHELL = [
  "./", "./index.html", "./m.html", "./store.js",
  "./manifest.webmanifest",
  "./icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);

  /* Anything to do with the records goes straight out and is never kept here. */
  if(url.hostname.endsWith("github.com") || url.hostname.endsWith("githubusercontent.com")) return;

  /* Fonts: taken from the shelf first, since they never change. */
  if(url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com")){
    e.respondWith(caches.match(req).then(hit => {
      if(hit) return hit;
      return fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return r;
      });
    }));
    return;
  }

  if(url.origin !== location.origin) return;

  /* The app itself: newest wins when there is a signal, the shelf when there is not. */
  e.respondWith(fetch(req).then(r => {
    if(r && r.ok){
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return r;
  }).catch(() => caches.match(req).then(hit => hit || caches.match("./"))));
});
