// Bloom service worker.
// Two jobs:
//   1. Keep a full copy of the app — index.html, the hashed JS/CSS bundles, the
//      icons and the web fonts — so Bloom opens and runs with no network at all.
//      (The app's *data* is handled separately, by src/lib/offline.js.)
//   2. Show notifications (posted from the page) and handle taps on them.
//
// Notifications are *scheduled by the page* (see src/lib/notifications.js).
// The service worker is what actually displays them, which is what lets the
// reminder still pop after you've navigated away from the tab, and what lets a
// tap re-open Bloom. It does not by itself fire reminders while fully closed —
// that needs a push server; see SETUP.md.

// The app is served from a sub-path on GitHub Pages (e.g. /vivian-hub/).
// Derive that base from the service worker's own URL so every path below
// resolves correctly whether the base is "/" or "/vivian-hub/".
const BASE = new URL('./', self.location).pathname // e.g. "/vivian-hub/"

// The cache name carries the build id (stamped in at build time — see
// vite.config.js). A new deploy changes this file's bytes, so the browser
// detects a new service worker, activates it, and the page reloads onto the
// fresh bundle. The activate handler below purges every older cache.
const CACHE = 'bloom-shell-__BUILD_ID__'

// The hand-written part of the shell. The hashed JS/CSS bundles are added to
// this list at build time (see stampServiceWorker in vite.config.js) — without
// them the cache holds an index.html that immediately fails to load its own
// script, which is the difference between "opens on the plane" and a blank page.
// The placeholder below is swapped for the real list at build time. It is
// written as a one-element array of a string so the worker still PARSES in dev
// (where public/ files are served untransformed) — the filter then throws the
// placeholder away, leaving an empty precache list.
const BUILT = ['__PRECACHE__'].filter(f => f.indexOf('__') !== 0)
const SHELL = [
  BASE, BASE + 'index.html', BASE + 'manifest.webmanifest',
  BASE + 'icon-192.png', BASE + 'icon-512.png', BASE + 'apple-touch-icon.png', BASE + 'favicon-32.png',
  ...BUILT.map(f => BASE + f.replace(/^\//, '')),
]

// Web fonts live on Google's CDN, so they're cross-origin and get their own
// cache — kept separate from the versioned shell so a new deploy doesn't
// re-download every font file. Without this the app renders in a fallback
// system font the first time it opens offline.
const FONT_CACHE = 'bloom-fonts-v1'
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('install', event => {
  self.skipWaiting()
  // Added one at a time: addAll() is all-or-nothing, so a single 404 (a stale
  // entry in the built list, a missing icon) would leave the app with NO cached
  // shell at all and silently break offline launch.
  event.waitUntil(
    caches.open(CACHE).then(c => Promise.all(
      SHELL.map(url => c.add(new Request(url, { cache: 'reload' })).catch(() => {}))
    )).catch(() => {})
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      // The font cache is deliberately long-lived; only old shell caches go.
      Promise.all(keys.filter(k => k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Store a response for next time. Only complete, cacheable responses are kept —
// a partial (206) or opaque error would poison the cache.
function keep(cacheName, req, res) {
  if (!res || !res.ok || res.status !== 200 || res.type === 'opaque') return res
  const copy = res.clone()
  caches.open(cacheName).then(c => c.put(req, copy)).catch(() => {})
  return res
}

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try { url = new URL(req.url) } catch { return }

  // Web fonts: cache-first, since a font file at a given URL never changes.
  // This is the one cross-origin exception, and it's opt-in by host.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => keep(FONT_CACHE, req, res)).catch(() => hit || Response.error()))
    )
    return
  }

  // Every OTHER cross-origin call — a Supabase query, an Edge Function, a
  // published iCloud .ics feed — must reach the network untouched. Intercepting
  // one and then falling back to an empty cache match hands respondWith an
  // undefined value, which the browser surfaces as "FetchEvent.respondWith
  // received an unexpected error" and breaks the request. Returning here leaves
  // those to the browser's normal fetch. It also matters for offline detection:
  // storage.js decides it is offline from a real failed request, so the worker
  // must never answer a Supabase call from a cache.
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    // Network-first so a deploy is picked up, but the response is cached on the
    // way past — that cached copy is what serves the app with no network.
    event.respondWith(
      fetch(req)
        .then(res => keep(CACHE, req, res))
        .catch(() => caches.match(req)
          .then(r => r || caches.match(BASE + 'index.html'))
          .then(r => r || caches.match(BASE))
          .then(r => r || Response.error()))
    )
    return
  }

  // Everything Vite emits into /assets/ carries a content hash in its filename,
  // so a given URL's bytes never change. Serve those from the cache immediately
  // (instant launch, and it works with no network) and only reach for the
  // network on a miss. A new deploy asks for new filenames, so this can't go
  // stale — and the old cache is dropped wholesale on activate.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => keep(CACHE, req, res)).catch(() => Response.error()))
    )
    return
  }

  // Everything else same-origin: network first (so it stays fresh), falling
  // back to whatever was cached last. Successful responses are cached as they
  // go past, which is what populates the shell for the next offline launch.
  // Never resolve respondWith with undefined — a cache miss returns a proper
  // network-error Response instead.
  event.respondWith(
    fetch(req)
      .then(res => keep(CACHE, req, res))
      .catch(() => caches.match(req).then(r => r || Response.error()))
  )
})

// The page asks the SW to show a notification via postMessage. Going through
// the SW (instead of `new Notification()` in the page) means the reminder can
// still appear when the page is backgrounded, and the tap handler below works.
self.addEventListener('message', event => {
  const data = event.data || {}
  // The page found a newer worker waiting and asked it to take over now, so a
  // deploy applies without waiting for all tabs to close.
  if (data.type === 'skip-waiting') { self.skipWaiting(); return }
  if (data.type === 'show-notification') {
    const { title, options } = data
    self.registration.showNotification(title, {
      icon: BASE + 'icon-192.png',
      badge: BASE + 'icon-192.png',
      ...options,
    })
  }
})

// A real push arrived from the send-reminders Edge Function — show it. This is
// what lets a reminder appear when Bloom has been fully closed (no open tab,
// no live timer). Payload is the JSON the function sent.
self.addEventListener('push', event => {
  let p = {}
  try { p = event.data ? event.data.json() : {} }
  catch { p = { title: '🌸 Bloom', body: event.data ? event.data.text() : '' } }
  const title = p.title || '🌸 Bloom'
  event.waitUntil(self.registration.showNotification(title, {
    body: p.body || '',
    tag: p.tag,                       // collapse duplicates with the same tag
    data: { url: p.url || BASE },
    icon: BASE + 'icon-192.png',
    badge: BASE + 'icon-192.png',
    requireInteraction: false,
  }))
})

// If the browser rotates our push subscription, drop the stale flag; the page
// re-subscribes and re-stores the new one via ensureBackgroundPush() on its
// next open. (Re-subscribing here would need the VAPID key in the worker.)
self.addEventListener('pushsubscriptionchange', () => {})

// Tapping a reminder focuses an open Bloom tab, or opens a fresh one.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || BASE
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) { client.focus(); return }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
