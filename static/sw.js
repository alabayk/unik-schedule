const CACHE='unik-v2',ASSETS=['/','/style.css','/app.js','/manifest.webmanifest','/exec-e0a9f7d8-6df4-47a5-816d-71bf2db2147a.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if(e.request.url.includes('/api/'))return;e.respondWith(caches.match(e.request).then(x=>x||fetch(e.request))) });
