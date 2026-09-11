const CACHE='unik-v3',ASSETS=['/','/style.css','/sheet.css','/app.js','/manifest.webmanifest','/exec-5fe81217-9624-47c1-b7b3-39e57179c4a1.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if(e.request.url.includes('/api/'))return;e.respondWith(caches.match(e.request).then(x=>x||fetch(e.request))) });
