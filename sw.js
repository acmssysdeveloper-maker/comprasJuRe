const CACHE="compras-jure-v2.6.4-shell";
const SHELL=["./","./index.html","./styles.css","./app.js","./manifest.json","./modules/receipt-engine.js","./updates/manifest.json","./test-fixtures/comprovante-alvorada-2026-09-10.jpg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method==='GET'&&u.origin===location.origin)e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return resp})));});
