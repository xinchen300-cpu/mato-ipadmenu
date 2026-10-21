// Houdt het scherm werkend als de wifi even wegvalt (alleen over https of localhost).
var CACHE = 'automaat-menu-v2';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  var url = new URL(req.url);
  var fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  var onlineMedia = /\.supabase\.co$/.test(url.hostname) && url.pathname.indexOf('/storage/v1/object/public/') === 0;
  if (url.origin !== self.location.origin && !fonts && !onlineMedia) return;
  if (url.pathname.indexOf('/admin') === 0 || url.pathname === '/api/events') return;

  // Foto's hebben unieke namen en lettertypes veranderen niet: eerst uit de cache.
  if (fonts || onlineMedia || url.pathname.indexOf('/uploads/') === 0) {
    e.respondWith(caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
          return res;
        });
      });
    }));
    return;
  }

  // Al het andere (pagina, scripts, menu): eerst het netwerk, cache als terugval.
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req);
  }));
});
