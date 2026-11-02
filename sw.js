// Increment the version whenever any shipped resource changes.
const CACHE = 'concreto-abstrato-v11';
const ROOT = new URL('./', self.location.href);
const FILES = ['./','./index.html','./styles.css','./aplicativo.js','./regras.js','./palavras.js','./manifest.webmanifest','./assets/fonts/RubikDirt-Regular.ttf','./assets/fonts/OFL.txt','./assets/icons/icon.svg','./assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/icons/maskable-512.png'];
self.addEventListener('install',event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(file => new URL(file,ROOT).href))));
  // No skipWaiting: updates cannot replace the version running a round.
});
self.addEventListener('activate',event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('concreto-abstrato-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') return (await cache.match(new URL('./index.html',ROOT).href)) || fetch(event.request);
    const cached = await cache.match(event.request);
    return cached || fetch(event.request);
  })());
});
