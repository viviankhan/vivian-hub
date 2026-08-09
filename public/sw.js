// Bloom service worker.
// Two jobs:
//   1. A tiny offline app-shell cache so the app opens without a network.
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
const SHELL = [BASE, BASE + 'index.html', BASE + 'manifest.webmanifest', BASE + 'icon-192.png', BASE + 'apple-touch-icon.png']

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Network-first for navigations (so the app updates), falling back to cache
// when offline. Other requests: try network, fall back to cache.
self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return

  // Only ever handle our OWN same-origin requests. A cross-origin call — a
  // Supabase Edge Function, a published iCloud .ics feed, any external API —
  // must reach the network untouched. Intercepting one and then falling back to
  // an empty cache match hands respondWith an undefined value, which the browser
  // surfaces as "FetchEvent.respondWith received an unexpected error" and breaks
  // the request. Returning here leaves those to the browser's normal fetch.
  let url
  try { url = new URL(req.url) } catch { return }
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(BASE + 'index.html').then(r => r || caches.match(BASE)))
    )
    return
  }
  // Same-origin asset: network first, then cache. Never resolve respondWith with
  // undefined — fall back to a proper network-error Response so a cache miss
  // can't reproduce the "respondWith received an unexpected error" failure.
  event.respondWith(
    fetch(req).catch(() => caches.match(req).then(r => r || Response.error()))
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
