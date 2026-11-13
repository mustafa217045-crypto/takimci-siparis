// Uygulama kabuğunu önbellekte tutar (önce ağ, ağ yoksa önbellek). Firestore/ntfy isteklerine dokunmaz.
const CACHE = 'takimci-v1';
const KABUK = ['./', 'index.html', 'css/stil.css', 'js/baslat.js', 'js/firebase-ayar.js', 'js/veri.js', 'js/mantik.js',
  'js/ortak.js', 'js/musteri.js', 'js/yonetici.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(KABUK))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const ayniKaynak = u.origin === location.origin;
  const sdk = u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/');
  if (!ayniKaynak && !sdk) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const k = r.clone(); caches.open(CACHE).then(c => c.put(e.request, k)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
