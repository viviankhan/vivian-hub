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

const CACHE = 'bloom-shell-v1'
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
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(BASE + 'index.html').then(r => r || caches.match(BASE)))
    )
    return
  }
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  )
})

// The page asks the SW to show a notification via postMessage. Going through
// the SW (instead of `new Notification()` in the page) means the reminder can
// still appear when the page is backgrounded, and the tap handler below works.
self.addEventListener('message', event => {
  const data = event.data || {}
  if (data.type === 'show-notification') {
    const { title, options } = data
    self.registration.showNotification(title, {
      icon: BASE + 'icon-192.png',
      badge: BASE + 'icon-192.png',
      ...options,
    })
  }
})

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
