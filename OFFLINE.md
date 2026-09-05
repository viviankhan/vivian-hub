# Offline & staying signed in

Bloom works with no internet. You can open it, read everything, and keep adding
and editing — and the moment you have a connection again, everything you did
goes up on its own. You also only ever sign in once per device.

This file explains how that works and how to check it.

---

## What you can do offline

Everything except signing in for the first time:

- Open the app (even after fully closing it, and on a phone in airplane mode).
- See all your tasks, events, routines, notes, trackers, wellness entries.
- Check things off, add tasks, edit them, delete them, log hours, write notes.
- Change your theme, background and settings.

While you're offline a small pill appears near the bottom of the screen:

> **Offline · 3 changes saved here**

That's the count of edits waiting to upload. When the connection returns it
becomes *"Syncing 3 changes…"* and then *"All changes synced"* before
disappearing. Tapping it forces an upload attempt, which is useful on a flaky
connection the browser insists is fine.

**The one thing that needs a connection is signing in the first time on a new
device or browser.** The login screen says so instead of letting you type a
password it can't submit.

---

## How it works

Three separate pieces, each solving a different half of the problem.

### 1. The app itself — `public/sw.js`

A service worker keeps a complete copy of the app: `index.html`, the hashed
JS/CSS bundles, the icons, and the web fonts. Without the bundles, a cached
`index.html` opens to a blank page, so the build stamps the real filenames into
the worker (`stampServiceWorker` in `vite.config.js`) and it precaches them on
install.

Caching rules:

| Request | Strategy | Why |
| --- | --- | --- |
| Page navigations | Network first, cache fallback | A deploy is picked up immediately; no network still opens the app |
| `/assets/*` | Cache first | Filenames are content-hashed, so the bytes never change |
| Other same-origin | Network first, cache fallback | Stays fresh, still works offline |
| Google Fonts | Cache first, separate cache | Correct typography offline; survives deploys |
| **Supabase, Edge Functions, `.ics` feeds** | **Never intercepted** | The app decides it's offline from a *real* failed request — answering one from a cache would hide that |

### 2. Your data — `src/lib/offline.js` + `src/lib/storage.js`

`storage.js` is the single door every read and write goes through, so offline
support is wired in there once rather than in fifty components.

**Reads** are mirrored into IndexedDB as they come back from Supabase. With no
network, the mirror is served instead. IndexedDB rather than `localStorage`
because background photos, receipts and custom art are multi-megabyte data
URLs that blow past `localStorage`'s ~5MB budget.

**Writes** are applied to the mirror first, then either sent or appended to a
durable outbox — a queue in IndexedDB that survives reloads, restarts and
reboots. When the connection returns the queue is replayed **in the order the
edits were actually made**.

The queue folds edits together, so a long offline session doesn't replay every
intermediate state:

| What you did | What gets sent |
| --- | --- |
| Edited your notes five times | One write, the final text |
| Renamed one task twice | One update with both changes |
| Created a task, then edited it | One insert, with the edits already in it |
| Created a task, then deleted it | Nothing — it never existed as far as the cloud knows |
| Cleared all recurring tasks | Just the clear; earlier writes to that table are dropped |

Two rules keep the data honest:

- **A cloud read never overwrites an unsent edit.** If a key still has something
  in the outbox, the local value wins until it's uploaded.
- **A rejection is not a network failure.** If the server actively refuses a
  write (bad data, a permission problem) you're told, exactly as before. Only
  transport failures queue. A write the server rejects on replay is dropped with
  a loud console error rather than wedging the queue behind it forever.

Once the outbox drains, the app re-reads from the cloud so you see the
reconciled result — including anything your other devices did while this one
was away.

### 3. Staying signed in — `src/lib/auth.js`

Three things used to be able to knock you back to the login screen. Each has an
answer:

1. **The browser cleared `localStorage`** (Safari's cap on script-writable
   storage, storage-pressure eviction). Every session is mirrored into
   IndexedDB and written back at startup if `localStorage` has come up empty.
   `navigator.storage.persist()` is also requested at launch to ask the browser
   not to evict us in the first place.
2. **You opened the app with no network.** Supabase can't refresh an expired
   token offline, and a null session would drop you on a login screen with all
   your data sitting right there. Instead the remembered account signs you in
   locally, and the session is re-verified as soon as there's a connection.
   Settings → Account says so while that's the case.
3. **A hiccup was mistaken for a revoked session.** Nothing signs you out
   except an explicit sign-out or the server actually rejecting the refresh
   token. Timeouts, dropped connections and 5xx all fail *open*.

Signing out clears the remembered account, the session mirror, and that
account's offline data — so the next person to open Bloom on that browser can't
read it out of IndexedDB. If changes are still waiting to upload, sign-out
refuses rather than throwing away your work, and tells you to reconnect first.

---

## Checking it yourself

**On your phone:** open Bloom, turn on airplane mode, force-quit it, reopen. It
should open normally with all your data. Add a task and check something off,
then turn airplane mode off — within a few seconds the pill should report the
sync and disappear. Open Bloom on another device: your changes are there.

**In a desktop browser:** DevTools → Network → *Offline*, then reload.

### Automated tests

The logic has three test suites. They need no database — they run against an
in-memory stand-in and a real headless browser:

```bash
npm test              # the queue's coalescing/ordering/failures, and the full
                      # read → queue → replay round trip against a mock database

npm run test:browser  # builds, serves dist, then loads it in a real headless
                      # browser, kills the server, and reloads — proving the app
                      # still opens. Needs `npm i -D playwright`.
```

- `tests/offline.test.mjs` — the outbox: coalescing rules, replay ordering,
  network vs. rejection handling, per-account scoping.
- `tests/storage.test.mjs` — the whole path through `storage.js` against
  `tests/mock-supabase.mjs`: reads falling back to the mirror, offline edits
  queueing, reconnect uploading them, and a pending edit beating a stale cloud
  read.
- `tests/browser.test.mjs` — a real Chromium session: checks the shell cache
  holds the JS and CSS bundles, then reloads with the server destroyed and the
  context offline, and asserts the app still renders.

---

## Notes and limits

- **Conflicts are last-write-wins**, unchanged from before. If you edit the same
  task on two devices while one is offline, the one that syncs last wins. Per
  row and per key, so edits to *different* things always both survive.
- **Files picked while offline** (study-file uploads) are held in IndexedDB and
  uploaded for real on reconnect. They aren't downloadable until then.
- **Subscribed calendar feeds** aren't refetched offline; the last fetched copy
  keeps showing and the feed refreshes when you reconnect.
- **The one-time v2 migration** (`src/lib/migrate.js`) waits for a connection.
  Offline it would read empty tables, trivially "succeed", and mark itself done
  without having migrated anything.
