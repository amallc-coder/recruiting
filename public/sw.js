// Clinilytics service worker — minimal + safe for a hashed-asset SPA on GitHub
// Pages. Network-first so users are never served stale JS/CSS while online; the
// cache is only a fallback when offline. Only same-origin GETs are touched, so
// Supabase API calls pass straight through.
const VERSION = 'clinilytics-v1'
const BASE = new URL('./', self.location).pathname
const PRECACHE = [BASE, BASE + 'manifest.webmanifest', BASE + 'icon-192.png', BASE + 'icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => (k === VERSION ? null : caches.delete(k)))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  let sameOrigin = false
  try {
    sameOrigin = new URL(req.url).origin === self.location.origin
  } catch {
    return
  }
  if (!sameOrigin) return // let cross-origin (Supabase API, fonts) go to network untouched
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone()
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {})
        return res
      })
      .catch(() => caches.match(req).then((m) => m || caches.match(BASE))),
  )
})
