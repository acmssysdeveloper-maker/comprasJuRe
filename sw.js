// Service worker intentionally disabled in v2.8.5 to prevent stale application code.
// Kept as a no-op so older installations can replace/unregister it safely.
self.addEventListener("install", event => { self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
