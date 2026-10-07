// src/lib/assistantQueue.js
// ─────────────────────────────────────────────────────────────
// The AI assistant's queue. Reading a screenshot takes a while, and nobody
// should have to sit and watch it: tapping "Plan it" files the request here and
// you're free to close the sheet, switch apps, or add three more. Each request
// is worked on in the background and lands back in the queue as a set of
// suggestions to edit, accept, or delete whenever you get to it.
//
// The queue is kept in IndexedDB (the photos are too big for localStorage), so
// it survives a closed tab or an app the phone put to sleep mid-request. Any
// request that hadn't finished when the app went away is simply asked again the
// next time Bloom opens — nothing you uploaded is lost.
//
// No React in here: a tiny store you subscribe to, plus the runner. The
// assistant sheet and the ✨ button both read it; Today starts the runner.
// ─────────────────────────────────────────────────────────────

const DB_NAME = 'bloom-assistant-queue'
const STORE = 'items'
// Past this many finished requests the oldest are let go — a queue is for
// what's waiting on you, not an archive.
const MAX_ITEMS = 30

// ── Pure helpers (unit-tested) ─────────────────────────────────
export const STATUS = { PENDING: 'pending', RUNNING: 'running', READY: 'ready', ERROR: 'error' }

export function newItem({ command = '', photos = [], docs = [], today, now = Date.now() } = {}) {
  return {
    id: 'aq-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    createdAt: now,
    // The day it was asked on, so "tomorrow" means the same thing even if the
    // request only gets answered after midnight.
    today: today || dayStr(now),
    command: String(command || ''),
    photos: (photos || []).map(p => ({ id: p.id, url: p.url, mimeType: p.mimeType || 'image/jpeg' })),
    docs: (docs || []).map(d => ({ ...d })),
    status: STATUS.PENDING,
    plan: null,
    error: '',
    seen: false,
  }
}

// A request the app was in the middle of when it closed is just pending again.
export function reviveItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter(it => it && it.id)
    .map(it => (it.status === STATUS.RUNNING ? { ...it, status: STATUS.PENDING } : it))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}

// Newest at the bottom, oldest finished ones trimmed first. Anything still
// waiting to be read is never trimmed.
export function trimItems(items, max = MAX_ITEMS) {
  if (items.length <= max) return items
  let drop = items.length - max
  return items.filter(it => {
    if (drop > 0 && (it.status === STATUS.READY || it.status === STATUS.ERROR)) { drop--; return false }
    return true
  })
}

export function readyCount(items) { return (items || []).filter(it => it.status === STATUS.READY).length }
export function unseenCount(items) { return (items || []).filter(it => it.status === STATUS.READY && !it.seen).length }
export function workingCount(items) { return (items || []).filter(it => it.status === STATUS.PENDING || it.status === STATUS.RUNNING).length }

// A short name for a request: what you typed, else what you attached.
export function itemLabel(it) {
  const text = String(it?.command || '').trim().replace(/\s+/g, ' ')
  if (text) return text.length > 70 ? text.slice(0, 67) + '…' : text
  const p = (it?.photos || []).length, d = (it?.docs || []).length
  const parts = []
  if (p) parts.push(`${p} screenshot${p > 1 ? 's' : ''}`)
  if (d) parts.push((it.docs.length === 1 && it.docs[0].name) ? it.docs[0].name : `${d} file${d > 1 ? 's' : ''}`)
  return parts.join(' + ') || 'Request'
}

function dayStr(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Persistence (IndexedDB, or memory when there is none) ──────
const hasIDB = typeof indexedDB !== 'undefined'
let dbPromise = null
function openDb() {
  if (!hasIDB) return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise(resolve => {
    let settled = false
    const done = v => { if (!settled) { settled = true; resolve(v) } }
    setTimeout(() => done(null), 3000)
    let req
    try { req = indexedDB.open(DB_NAME, 1) } catch { done(null); return }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => done(req.result)
    req.onerror = () => done(null)
    req.onblocked = () => done(null)
  })
  return dbPromise
}
function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    let t
    try { t = db.transaction(STORE, mode) } catch (e) { reject(e); return }
    const out = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(out && out.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}
async function readAll() {
  const db = await openDb()
  if (!db) return []
  try { return (await tx(db, 'readonly', s => s.getAll())) || [] } catch { return [] }
}
async function writeItem(it) {
  const db = await openDb()
  if (!db) return
  try { await tx(db, 'readwrite', s => s.put(it)) } catch {}
}
async function deleteIds(ids) {
  const db = await openDb()
  if (!db || !ids.length) return
  try { await tx(db, 'readwrite', s => { ids.forEach(id => s.delete(id)) }) } catch {}
}

// ── The store ──────────────────────────────────────────────────
let items = []
let loaded = false
let loadPromise = null
const listeners = new Set()

function emit() { listeners.forEach(fn => { try { fn(items) } catch {} }) }
function setItems(next) { items = next; emit() }
function patch(id, changes) {
  let updated = null
  setItems(items.map(it => (it.id === id ? (updated = { ...it, ...changes }) : it)))
  if (updated) writeItem(updated)
  return updated
}

export function getQueue() { return items }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }

export function loadQueue() {
  if (loadPromise) return loadPromise
  loadPromise = readAll().then(rows => {
    // Anything enqueued before the read finished is kept alongside what's saved.
    const saved = reviveItems(rows)
    const ids = new Set(saved.map(it => it.id))
    setItems([...saved, ...items.filter(it => !ids.has(it.id))])
    loaded = true
    return items
  })
  return loadPromise
}

export function enqueue(input) {
  const it = newItem(input)
  const next = trimItems([...items, it])
  const dropped = items.filter(x => !next.includes(x)).map(x => x.id)
  setItems(next)
  writeItem(it)
  deleteIds(dropped)
  pump()
  return it
}

export function updatePlan(id, plan) { return patch(id, { plan }) }
export function markSeen(id) { const it = items.find(x => x.id === id); if (it && !it.seen) patch(id, { seen: true }) }
export function markAllSeen() { items.filter(it => it.status === STATUS.READY && !it.seen).forEach(it => patch(it.id, { seen: true })) }
export function retry(id) { patch(id, { status: STATUS.PENDING, error: '', plan: null, seen: false }); pump() }
export function removeItem(id) { setItems(items.filter(it => it.id !== id)); deleteIds([id]) }
// Empty the queue. Requests still being read go too — clearing means clearing.
export function clearQueue() { const ids = items.map(it => it.id); setItems([]); deleteIds(ids) }

// ── The runner ─────────────────────────────────────────────────
// One request at a time, oldest first. `ctx()` is asked for the current tasks
// and labels right before each request goes out, so a plan is made against
// your tasks as they are when it runs rather than when you queued it.
let runner = null   // { run, ctx, decorate, onReady }
let busy = false

export function startQueue({ run, ctx, decorate, onReady }) {
  runner = { run, ctx, decorate, onReady }
  loadQueue().then(pump)
  return () => { if (runner && runner.run === run) runner = null }
}

async function pump() {
  if (busy || !runner || !loaded) return
  const next = items.find(it => it.status === STATUS.PENDING)
  if (!next) return
  busy = true
  const r = runner
  patch(next.id, { status: STATUS.RUNNING, error: '' })
  try {
    const plan = await r.run(next, r.ctx ? r.ctx() : {})
    // Deleted while it was being read: let the answer go.
    if (!items.some(it => it.id === next.id)) return
    const decorated = r.decorate ? r.decorate(plan) : plan
    const done = patch(next.id, { status: STATUS.READY, plan: decorated, seen: false })
    if (done && r.onReady) { try { r.onReady(done) } catch {} }
  } catch (e) {
    if (items.some(it => it.id === next.id)) patch(next.id, { status: STATUS.ERROR, error: (e && e.message) || 'Something went wrong.' })
  } finally {
    busy = false
    pump()
  }
}

// Test seam: reset module state between cases.
export function __resetForTests() { items = []; loaded = true; loadPromise = Promise.resolve(items); listeners.clear(); runner = null; busy = false }
