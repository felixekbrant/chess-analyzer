/**
 * Generates the service worker script. Built at deploy time with the exact list of files to
 * precache, so the installed app opens instantly and works offline, and each deploy gets its own
 * cache (old ones are deleted when the new version takes over).
 *
 * Strategy:
 *  - app files (hashed assets, engine, icons): cache first, they never change under the same name
 *  - the page itself: network first, falling back to the cached copy when offline
 *  - other origins (chess.com API): not intercepted
 */
export function buildServiceWorker(files: string[], version: string): string {
  const precache = ['./index.html', ...files.filter((f) => f !== 'index.html')].map((f) => (f.startsWith('./') ? f : `./${f}`));
  return `// Generated at build time. Do not edit.
const CACHE = 'chess-analyzer-${version}';
const PRECACHE = ${JSON.stringify(precache, null, 0)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('chess-analyzer-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page asks a waiting worker to take over when the user taps "Reload" on the update notice.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
`;
}
