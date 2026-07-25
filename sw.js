/* ============ NOVA SERVICE WORKER ============
   Zuständig ausschließlich für App-Shell-Caching (HTML/Manifest/Icons/Fonts),
   damit NOVA offline startet und aussieht wie gewohnt. KEINE Datenlogik hier —
   Entities, Memory und Settings laufen weiterhin komplett über die
   Storage-Abstraktion (safeGet/safeSet/safeDelete) in nova.html selbst, dieser
   Worker rührt daran nicht an und weiß nichts von ihrer Existenz.

   Cache-Versionierung: CACHE_NAME hochzählen, wenn sich der App-Shell-Inhalt
   ändert (neue nova.html-Version) — alte Caches werden beim nächsten Start
   automatisch aufgeräumt (siehe 'activate'). */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `nova-shell-${CACHE_VERSION}`;

const APP_SHELL = [
  './nova.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.filter(n => n.startsWith('nova-shell-') && n !== CACHE_NAME)
             .map(n => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return; // nichts Schreibendes anfassen — keine Sync-Logik, kein Cachen von Mutationen

  const url = new URL(req.url);

  // Google Fonts: langlebig, ändert sich praktisch nie — Cache First mit
  // Hintergrund-Auffrischung (Stale-While-Revalidate).
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(req).then(cached => {
          const fetchPromise = fetch(req).then(res => {
            if(res && res.status===200) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // App-Shell (eigene Datei-Herkunft): Cache First, Netzwerk als Rückfall —
  // damit NOVA auch ganz ohne Verbindung startet.
  if(url.origin === self.location.origin){
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).catch(() => caches.match('./nova.html')))
    );
    return;
  }

  // Alles andere (z. B. zukünftige Drittanbieter-Aufrufe): normal durchreichen,
  // nicht cachen — dieser Worker trifft bewusst keine Annahmen über Dinge,
  // die er heute noch nicht kennt.
});
