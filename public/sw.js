// Service worker DrawAll (lot 7.2) : l'atelier s'ouvre hors ligne dès la première visite.
// - Installation : la page et les fichiers qu'elle charge (/assets/, noms à empreinte) sont mis en
//   cache ensemble ; l'installation échoue plutôt que de laisser une coquille incomplète.
// - Pages : réseau d'abord ; seule une réponse HTML réussie remplace la copie ; sans réseau, la copie.
// - Fichiers de l'application : cache d'abord, mis en cache au premier usage.
// - L'API (/api/) n'est jamais mise en cache.
const CACHE = 'drawall-v2';

/** Fichiers de l'application référencés par la page (scripts, feuilles de style, préchargements). */
const shellAssets = html => [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]))];

const isHtmlOk = res => res.ok && (res.headers.get('content-type') || '').includes('text/html');

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch('/', { cache: 'no-cache' });
    if (!isHtmlOk(res)) throw new Error('page indisponible');
    const html = await res.clone().text();
    await cache.addAll(shellAssets(html));
    await cache.put('/', res);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (isHtmlOk(res)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)); }
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && (url.pathname.startsWith('/assets/') || /\.(?:js|mjs|css)$/.test(url.pathname))) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    })),
  );
});
