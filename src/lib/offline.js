// src/lib/offline.js
// ─────────────────────────────────────────────────────────────────────────────
// Offline engine: a durable local mirror of everything Bloom reads, plus a
// durable queue ("outbox") of everything it writes while there's no network.
//
// The shape of the deal:
//   • Every successful cloud READ is mirrored into IndexedDB. When the network
//     is gone, storage.js serves that mirror instead — so the app opens and
//     works with real data, not an empty shell.
//   • Every WRITE is applied to the mirror immediately, then either sent to the
//     cloud (online) or appended to the outbox (offline). The outbox survives
//     reloads, app restarts and device reboots because it lives in IndexedDB.
//   • When the connection returns, the outbox is replayed in the order the
//     edits were actually made, so the cloud ends up in the state the user left
//     the app in.
//
// Why IndexedDB and not localStorage: Bloom stores background photos, tracker
// receipts and custom art as data URLs — multi-megabyte values that blow past
// localStorage's ~5MB budget. IndexedDB has room and stores structured values
// (including File/Blob, which is how a queued file upload survives a restart).
//
// This module knows nothing about Supabase or Bloom's tables. storage.js owns
// the schema and registers a replay handler; this file only owns durability,
// ordering and the online/offline state machine.
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'bloom-offline'
const DB_VERSION = 1
const CACHE_STORE = 'cache'      // key → last known value of a cloud read
const OUTBOX_STORE = 'outbox'    // seq → a write waiting to reach the cloud

const hasWindow = typeof window !== 'undefined'
const hasIDB = hasWindow && typeof indexedDB !== 'undefined'

// ── IndexedDB plumbing ───────────────────────────────────────────────────────
// Everything below degrades to an in-memory Map when IndexedDB is unavailable
// (some private-browsing modes, very old engines). The app still works; the
// mirror and the queue just don't outlive the tab, which is strictly better
// than failing to load.
let dbPromise = null
const memCache = new Map()
let memOutbox = []
let memSeq = 1

function openDb() {
  if (!hasIDB) return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise(resolve => {
    let req
    try { req = indexedDB.open(DB_NAME, DB_VERSION) } catch { resolve(null); return }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE)
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE, { keyPath: 'seq' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { console.warn('[offline] IndexedDB unavailable — falling back to memory'); resolve(null) }
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    let t
    try { t = db.transaction(store, mode) } catch (e) { reject(e); return }
    const os = t.objectStore(store)
    let out
    try { out = fn(os) } catch (e) { reject(e); return }
    // An IDBRequest only has its `result` once the transaction completes, and a
    // miss legitimately resolves to `undefined` — so unwrap by type, not by
    // whether the value is defined.
    t.oncomplete = () => resolve(out && typeof IDBRequest !== 'undefined' && out instanceof IDBRequest ? out.result : out)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

// ── Read mirror ──────────────────────────────────────────────────────────────
// `key` is namespaced by the signed-in account (storage.js builds it), so two
// accounts on one device never read each other's mirror.

export async function cacheRead(key) {
  const db = await openDb()
  if (!db) return memCache.has(key) ? memCache.get(key) : undefined
  try {
    const v = await tx(db, CACHE_STORE, 'readonly', os => os.get(key))
    return v && v.__bloom ? v.value : undefined
  } catch { return undefined }
}

export async function cacheWrite(key, value) {
  memCache.set(key, value)
  const db = await openDb()
  if (!db) return
  // Wrapped so a legitimately-stored `undefined`/`null` is still distinguishable
  // from "nothing cached for this key".
  try { await tx(db, CACHE_STORE, 'readwrite', os => os.put({ __bloom: 1, value }, key)) }
  catch (e) { console.warn('[offline] cache write failed for', key, e && e.message) }
}

// Drop everything mirrored for one account — used on sign-out so the next
// person to use this device can't read the previous account's data offline.
export async function cacheClear(prefix) {
  for (const k of [...memCache.keys()]) if (!prefix || k.startsWith(prefix)) memCache.delete(k)
  const db = await openDb()
  if (!db) return
  try {
    const keys = await tx(db, CACHE_STORE, 'readonly', os => os.getAllKeys())
    const doomed = (keys || []).filter(k => !prefix || String(k).startsWith(prefix))
    if (doomed.length) await tx(db, CACHE_STORE, 'readwrite', os => { doomed.forEach(k => os.delete(k)) })
  } catch {}
}

// ── The outbox ───────────────────────────────────────────────────────────────
// Held in memory so callers can ask "is there a pending write for this key?"
// synchronously (storage.js needs that on every read — see preferLocal), and
// mirrored into IndexedDB so nothing is lost when the app closes.
//
// An op is: { seq, uid, ts, table, op, id, row?, changes?, meta? }
//   table  — logical table name ('kv_store', 'commitments', …)
//   op     — 'set' | 'insert' | 'update' | 'delete' | 'clear'
//   id     — the row's primary key, used for coalescing
let queue = []
let readyPromise = null
let seqCounter = 0

export function ready() {
  if (readyPromise) return readyPromise
  readyPromise = (async () => {
    const db = await openDb()
    if (!db) { queue = memOutbox; return }
    try {
      const rows = await tx(db, OUTBOX_STORE, 'readonly', os => os.getAll())
      queue = (rows || []).sort((a, b) => a.seq - b.seq)
      seqCounter = queue.length ? queue[queue.length - 1].seq : 0
    } catch { queue = [] }
    notify()
  })()
  return readyPromise
}

async function persistOp(op) {
  const db = await openDb()
  if (!db) { memOutbox = queue; return }
  try { await tx(db, OUTBOX_STORE, 'readwrite', os => os.put(op)) }
  catch (e) { console.warn('[offline] could not persist queued write', e && e.message) }
}

async function forgetOps(seqs) {
  const db = await openDb()
  if (!db) { memOutbox = queue; return }
  try { await tx(db, OUTBOX_STORE, 'readwrite', os => { seqs.forEach(s => os.delete(s)) }) }
  catch {}
}

// Fold a new write into the ones already waiting, so a long offline session
// doesn't replay every intermediate state. The rules mirror what the user
// actually means:
//   • two writes to the same key → only the last one matters
//   • edit-then-edit on one row  → one update carrying the merged changes
//   • edit of a row that hasn't reached the cloud yet → fold into its insert
//   • delete of a row that hasn't reached the cloud yet → both sides vanish
// Returns the ops that must be removed from storage (already spliced out of
// `queue`), and whether the incoming op should itself be queued.
function coalesce(op) {
  const dropped = []
  if (op.op === 'clear') {
    // A "delete everything in this table" supersedes every pending write to it.
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].uid === op.uid && queue[i].table === op.table) dropped.push(...queue.splice(i, 1))
    }
    return { dropped, queueIt: true }
  }
  const same = i => queue[i].uid === op.uid && queue[i].table === op.table && queue[i].id === op.id
  if (op.op === 'set') {
    for (let i = queue.length - 1; i >= 0; i--) if (same(i)) dropped.push(...queue.splice(i, 1))
    return { dropped, queueIt: true }
  }
  if (op.op === 'update') {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (!same(i)) continue
      const prev = queue[i]
      if (prev.op === 'insert') {
        // Never synced — the insert should just carry the new values.
        prev.row = { ...prev.row, ...op.changes }
        persistOp(prev)
        return { dropped, queueIt: false }
      }
      if (prev.op === 'update') {
        prev.changes = { ...prev.changes, ...op.changes }
        persistOp(prev)
        return { dropped, queueIt: false }
      }
    }
    return { dropped, queueIt: true }
  }
  if (op.op === 'delete') {
    let hadPendingInsert = false
    for (let i = queue.length - 1; i >= 0; i--) {
      if (!same(i)) continue
      if (queue[i].op === 'insert') hadPendingInsert = true
      dropped.push(...queue.splice(i, 1))
    }
    // The row was created offline and deleted before ever reaching the cloud,
    // so there is nothing to delete up there. Drop the whole story.
    return { dropped, queueIt: !hadPendingInsert }
  }
  return { dropped, queueIt: true }
}

export async function enqueue(op) {
  await ready()
  const full = { ...op, seq: ++seqCounter, ts: Date.now() }
  const { dropped, queueIt } = coalesce(full)
  if (dropped.length) await forgetOps(dropped.map(d => d.seq))
  if (queueIt) {
    queue.push(full)
    await persistOp(full)
  }
  notify()
  // Coming back online can be silent (a captive portal that starts working, a
  // VPN reconnect) — so try right away rather than waiting for an 'online' event.
  if (isOnline()) scheduleFlush(400)
  return full
}

// Synchronous: does an unsent write exist for this table (optionally this row)?
// storage.js uses this to keep a cloud read from overwriting an edit that is
// still sitting in the queue.
export function hasPending(table, id) {
  for (const op of queue) {
    if (op.table !== table) continue
    if (id == null || op.op === 'clear' || op.id === id) return true
  }
  return false
}

export function pendingCount() { return queue.length }

// ── Network state ────────────────────────────────────────────────────────────
// `navigator.onLine` only tells you the device has *a* network — it's true on a
// captive-portal wifi that drops every request. So the real signal is what our
// own requests do: one transport-level failure marks us down until something
// succeeds again.
let suspectedDown = false
let syncing = false
let lastSyncAt = null
let lastError = null

const NETWORK_HINTS = /failed to fetch|networkerror|network request failed|load failed|fetch failed|network error|connection|offline|timed? ?out|aborted|err_internet|err_network|err_connection|socket hang up/i

// Is this error the network dropping, or the server saying no? Only the former
// should park a write in the outbox — a real rejection (bad data, a permission
// problem) must surface to the user instead of being retried forever.
export function isNetworkError(e) {
  if (!e) return false
  if (hasWindow && navigator.onLine === false) return true
  if (typeof e === 'object') {
    // Supabase surfaces a transport failure as a PostgrestError with an empty
    // code and the underlying TypeError text in `message`.
    if (e.status === 0 || e.status === 408 || e.status === 429 || (e.status >= 500 && e.status <= 599)) return true
    if (e.name === 'TypeError' || e.name === 'AbortError' || e.name === 'NetworkError') return true
  }
  return NETWORK_HINTS.test(String((e && e.message) || e || ''))
}

export function isOnline() {
  if (!hasWindow) return true
  if (navigator.onLine === false) return false
  return !suspectedDown
}

// Called by storage.js around every cloud call, so the banner reflects what the
// network is actually doing rather than what the OS claims.
export function noteFailure(e) {
  if (!isNetworkError(e)) return false
  if (!suspectedDown) { suspectedDown = true; notify() }
  scheduleFlush(5000)   // keep probing; the first success clears the flag
  return true
}
export function noteSuccess() {
  if (suspectedDown) { suspectedDown = false; notify(); scheduleFlush(200) }
}

// ── Subscribers (the status pill in the UI) ──────────────────────────────────
const listeners = new Set()
export function getStatus() {
  return {
    online: isOnline(),
    pending: queue.length,
    syncing,
    lastSyncAt,
    lastError,
  }
}
function notify() {
  const s = getStatus()
  for (const fn of listeners) { try { fn(s) } catch (e) { console.error('[offline] listener', e) } }
}
export function subscribe(fn) {
  listeners.add(fn)
  try { fn(getStatus()) } catch {}
  return () => listeners.delete(fn)
}

// ── Replay ───────────────────────────────────────────────────────────────────
// storage.js registers the one function that knows how to send an op to the
// cloud. It must throw on failure; a network failure keeps the op queued, any
// other failure discards it (retrying a rejected write forever would wedge the
// queue behind it and block every later edit).
let replayFn = null
export function registerReplay(fn) { replayFn = fn }

// Which account's ops we're allowed to send. Set by storage.js when the session
// changes: replaying account A's queued writes while B is signed in would file
// them under the wrong owner.
let activeUid = null
export function setActiveUid(uid) {
  const changed = activeUid !== uid
  activeUid = uid || null
  if (changed) { notify(); if (activeUid && isOnline()) scheduleFlush(300) }
}

let flushTimer = null
let flushing = null

export function scheduleFlush(delay = 0) {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => { flushTimer = null; flush() }, delay)
}

// Send everything waiting, oldest first. Serialized: a second caller joins the
// flush already in flight instead of racing it (two replays of the same op
// would double-insert).
export function flush() {
  if (flushing) return flushing
  flushing = (async () => {
    await ready()
    if (!replayFn || !activeUid) return { sent: 0 }
    const mine = queue.filter(op => op.uid === activeUid)
    if (!mine.length) { if (suspectedDown && !(hasWindow && navigator.onLine === false)) { suspectedDown = false; notify() } return { sent: 0 } }
    if (hasWindow && navigator.onLine === false) return { sent: 0 }

    syncing = true; lastError = null; notify()
    let sent = 0, stoppedOnNetwork = false
    const done = []
    try {
      for (const op of mine) {
        try {
          await replayFn(op)
          done.push(op.seq); sent++
          noteSuccess()
        } catch (e) {
          if (isNetworkError(e)) {
            // Still offline. Leave this op and everything after it queued — the
            // order of the remaining edits has to be preserved.
            suspectedDown = true
            stoppedOnNetwork = true
            break
          }
          // A real rejection. Drop it so the queue can drain, but say so loudly:
          // silently discarding someone's edit is the worst possible outcome.
          console.error('[offline] discarding a write the server rejected:', op, e)
          lastError = (e && e.message) || String(e)
          done.push(op.seq)
        }
      }
    } finally {
      if (done.length) {
        const gone = new Set(done)
        queue = queue.filter(op => !gone.has(op.seq))
        memOutbox = queue
        await forgetOps(done)
      }
      syncing = false
      if (sent > 0) lastSyncAt = Date.now()
      notify()
    }
    if (sent > 0 && hasWindow) {
      // Tell the app its local state may now be behind the cloud (the flush
      // just changed it, and other devices may have moved on too).
      try { window.dispatchEvent(new CustomEvent('bloom-sync-flushed', { detail: { sent } })) } catch {}
    }
    if (stoppedOnNetwork) scheduleFlush(15000)
    return { sent }
  })().finally(() => { flushing = null })
  return flushing
}

// ── Triggers ─────────────────────────────────────────────────────────────────
// Reconnects are unreliable to detect, so we listen to every signal we can get
// and also keep a slow heartbeat while anything is waiting.
if (hasWindow) {
  window.addEventListener('online', () => { suspectedDown = false; notify(); scheduleFlush(500) })
  window.addEventListener('offline', () => notify())
  document.addEventListener('visibilitychange', () => { if (!document.hidden && queue.length) scheduleFlush(300) })
  window.addEventListener('focus', () => { if (queue.length) scheduleFlush(300) })
  setInterval(() => { if (queue.length && isOnline()) scheduleFlush(0) }, 30 * 1000)
  ready()
}
