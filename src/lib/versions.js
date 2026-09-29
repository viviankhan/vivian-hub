// src/lib/versions.js
// ─────────────────────────────────────────────────────────────────────────────
// Version history — Bloom's answer to Google Docs' "See version history".
//
// storage.js reports every write it makes (see observeWrites there) with the
// value or row as it stood just before. This module keeps those reports in an
// on-device journal, groups them into "versions" (bursts of editing), and can
// put the whole app back the way it was at the end of any of them: every
// value, task, event, label and check-off changed since then gets its earlier
// state written back through the ordinary storage calls — so a restore syncs
// to the cloud and to every device exactly like an edit made by hand.
//
// A restore is journaled like anything else (grouped under one "Restored"
// version), so restoring the wrong point is undone by restoring the version
// just before it.
//
// The journal lives in IndexedDB on this device (its own database, separate
// from the offline mirror). It records what was edited *here*: edits made on
// another device aren't in this device's list, though restoring still writes
// the recorded values over them. Entries older than KEEP_MS are dropped.
//
// Two stores, so opening the list never reads a multi-megabyte photo:
//   meta  seq → { seq, uid, ts, group, kind, key|table+id, label, quiet }
//   data  seq → the value/row as it was before that write
// ─────────────────────────────────────────────────────────────────────────────
import {
  observeWrites, currentStorageUser,
  restoreKv, restoreRow, restoreCompletion,
} from './storage.js'

const DB_NAME = 'bloom-versions'
const DB_VERSION = 1
const META = 'meta'
const DATA = 'data'

export const KEEP_MS = 7 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 4000
// A burst of edits separated by less than this is one version…
const BURST_GAP_MS = 2 * 60 * 1000
// …but a version never spans more than this, so an hour of steady editing
// still leaves points in between to go back to.
const BURST_SPAN_MS = 10 * 60 * 1000
// Rewriting the same thing again this soon (typing into Notes) folds into the
// previous entry — its "before" already covers the whole run.
const FOLD_MS = 60 * 1000

// kv keys that aren't the user's content, or that belong to something else:
// the per-change undo list, look-and-feel prefs (held in localStorage too, so
// a kv restore alone wouldn't take), live location presence, one-time markers.
const SKIP_KEYS = new Set([
  'change_history', 'ui_prefs', 'bloom_bg_custom', 'bloom_bg_custom_mobile', 'wellness_presence',
])
const skipKey = key => SKIP_KEYS.has(key) || /^migration_/.test(key)

// ── Friendly names ───────────────────────────────────────────────────────────
const KEY_NAMES = {
  notes: 'Notes',
  thoughts: 'Thoughts board',
  scheduled_tasks: 'Scheduled tasks',
  commitment_meta: 'Task details',
  recurring_exceptions: 'Recurring task changes',
  recurring_meta: 'Recurring task settings',
  routine_groups: 'Routines',
  routine_log: 'Routine log',
  time_logs: 'Time logs',
  task_templates: 'Task templates',
  label_meta: 'Label settings',
  tracker_folders: 'Trackers',
  tracker_people: 'Tracker people',
  tracker_entries: 'Tracker entries',
  tracker_cats: 'Tracker categories',
  external_calendars: 'Calendar subscriptions',
  imported_adoptions: 'Imported calendar tasks',
  quick_links: 'Quick links',
  fc_progress: 'Flashcard progress',
  fc_studied: 'Flashcard progress',
  art_overrides: 'Custom art',
  wellness_checkins: 'Wellness check-ins',
  wellness_effects: 'Wellness effects',
  wellness_episodes: 'Wellness episodes',
  wellness_game: 'Wellness garden',
  wellness_emotions: 'Emotions',
  wellness_treasures: 'Treasures',
  wellness_rules: 'Wellness rules',
  wellness_space: 'Wellness space',
}
const TABLE_NOUNS = {
  commitments: 'task', events: 'event', vacations: 'time off',
  recurring_tasks: 'recurring task', categories: 'label', log: 'log entry',
}
export function keyName(key) {
  if (KEY_NAMES[key]) return KEY_NAMES[key]
  if (/^wellness_photo_/.test(key)) return 'Wellness photo'
  const s = String(key).replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const quote = s => {
  const t = String(s || '').trim()
  if (!t) return ''
  return ` “${t.length > 48 ? t.slice(0, 47) + '…' : t}”`
}
// A one-line description of one write, e.g. `Edited task “Dentist”`.
export function describe(e) {
  if (e.kind === 'kv') return `Edited ${keyName(e.key)}`
  if (e.kind === 'done') return e.after ? 'Checked off a task' : 'Unchecked a task'
  if (e.kind === 'row') {
    const row = e.after || e.before || {}
    const name = quote(row.text || row.label)
    const noun = TABLE_NOUNS[e.table] || 'item'
    if (!e.before) return `Added ${noun}${name}`
    if (!e.after) return `Deleted ${noun}${name}`
    if (e.table === 'commitments' && !!e.before.done !== !!e.after.done) {
      const rest = { ...e.after, done: e.before.done }
      if (JSON.stringify(rest) === JSON.stringify({ ...e.before, ...rest })) {
        return `${e.after.done ? 'Checked off' : 'Unchecked'} task${name}`
      }
    }
    return `Edited ${noun}${name}`
  }
  return 'Edited'
}
const targetOf = e => e.kind === 'row' ? `row:${e.table}:${e.id}` : `${e.kind}:${e.key}`

// ── Storage (IndexedDB, or memory when there is none) ────────────────────────
const hasIDB = typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
let dbPromise = null
const mem = { meta: new Map(), data: new Map(), seq: 1 }

function openDb() {
  if (!hasIDB) return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise(resolve => {
    let settled = false
    const done = v => { if (!settled) { settled = true; resolve(v) } }
    // Same ceiling as the offline mirror: a database that never answers costs
    // this session its history, never the app.
    setTimeout(() => done(null), 3000)
    let req
    try { req = indexedDB.open(DB_NAME, DB_VERSION) } catch { done(null); return }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'seq', autoIncrement: true })
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA)
    }
    req.onsuccess = () => done(req.result)
    req.onerror = () => done(null)
    req.onblocked = () => done(null)
  })
  return dbPromise
}

function run(db, stores, mode, fn) {
  return new Promise((resolve, reject) => {
    let t
    try { t = db.transaction(stores, mode) } catch (e) { reject(e); return }
    let out
    try { out = fn(t) } catch (e) { reject(e); return }
    t.oncomplete = () => resolve(out && typeof IDBRequest !== 'undefined' && out instanceof IDBRequest ? out.result : out)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

async function putEntry(meta, before) {
  const db = await openDb()
  if (!db) {
    const seq = meta.seq ?? mem.seq++
    mem.meta.set(seq, { ...meta, seq })
    if (before !== NO_CHANGE) mem.data.set(seq, before)
    return seq
  }
  return run(db, [META, DATA], 'readwrite', t => {
    const req = t.objectStore(META).put(meta)
    if (before !== NO_CHANGE) req.onsuccess = () => { t.objectStore(DATA).put(before, req.result) }
    return req
  })
}

async function allMeta() {
  const db = await openDb()
  if (!db) return [...mem.meta.values()]
  try { return (await run(db, META, 'readonly', t => t.objectStore(META).getAll())) || [] } catch { return [] }
}

async function readBefore(seq) {
  const db = await openDb()
  if (!db) return mem.data.get(seq)
  return run(db, DATA, 'readonly', t => t.objectStore(DATA).get(seq))
}

async function deleteSeqs(seqs) {
  if (!seqs.length) return
  const db = await openDb()
  if (!db) { for (const s of seqs) { mem.meta.delete(s); mem.data.delete(s) } return }
  await run(db, [META, DATA], 'readwrite', t => {
    for (const s of seqs) { t.objectStore(META).delete(s); t.objectStore(DATA).delete(s) }
  })
}

// ── Recording ────────────────────────────────────────────────────────────────
const NO_CHANGE = Symbol('keep-before')
let activeGroup = null        // set while a restore is writing
let last = null               // the most recent entry, for folding repeats
let chain = Promise.resolve() // journal writes land in the order they happened
let sinceprune = 0

function record(e) {
  if (!e || !e.uid) return
  if (e.kind === 'kv' && skipKey(e.key)) return
  let same = false
  try { same = JSON.stringify(e.before) === JSON.stringify(e.after) } catch {}
  if (same) return

  const target = targetOf(e)
  const meta = {
    uid: e.uid, ts: e.ts || Date.now(), group: activeGroup,
    kind: e.kind, key: e.key, table: e.table, id: e.id,
    label: describe(e),
    // Log entries ride along with check-offs; they restore but aren't listed.
    quiet: e.kind === 'row' && e.table === 'log',
  }
  chain = chain.then(async () => {
    // Folding: the previous entry was this same thing, moments ago, in the same
    // group — keep its "before" and just move its time forward.
    if (last && last.target === target && last.uid === meta.uid && last.group === meta.group
        && meta.ts - last.ts < FOLD_MS && (!last.firstTs || meta.ts - last.firstTs < BURST_SPAN_MS)) {
      const folded = { ...last.meta, ts: meta.ts, label: foldLabel(last.meta, meta) }
      await putEntry(folded, NO_CHANGE)
      last = { ...last, ts: meta.ts, meta: folded }
      return
    }
    const seq = await putEntry(meta, e.before === undefined ? null : e.before)
    last = { target, uid: meta.uid, group: meta.group, ts: meta.ts, firstTs: meta.ts, meta: { ...meta, seq } }
    if (++sinceprune >= 50) { sinceprune = 0; await prune() }
  }).catch(err => console.warn('[versions] could not record an edit:', err && (err.message || err)))
}
// "Added task X" followed by edits to X is still, overall, "Added task X".
function foldLabel(prev, next) {
  return /^Added /.test(prev.label) ? prev.label : next.label
}

export async function prune(now = Date.now()) {
  const metas = await allMeta()
  const old = metas.filter(m => now - m.ts > KEEP_MS).map(m => m.seq)
  const keep = metas.filter(m => now - m.ts <= KEEP_MS).sort((a, b) => a.seq - b.seq)
  const over = keep.length > MAX_ENTRIES ? keep.slice(0, keep.length - MAX_ENTRIES).map(m => m.seq) : []
  await deleteSeqs([...old, ...over])
}

// Wait for every edit reported so far to be written to the journal.
export const settled = () => chain

observeWrites(record)
if (typeof window !== 'undefined') setTimeout(() => { prune().catch(() => {}) }, 5000)

// ── Reading: versions ────────────────────────────────────────────────────────
// Newest first. Each version is a burst of edits; `seq` is its last entry, and
// restoring it means undoing every entry after that.
export async function listVersions(uid = currentStorageUser()) {
  await chain
  const metas = (await allMeta()).filter(m => m.uid === uid).sort((a, b) => a.seq - b.seq)
  const versions = []
  let cur = null
  for (const m of metas) {
    const split = !cur || m.group !== cur.group
      || m.ts - cur.end > BURST_GAP_MS || m.ts - cur.start > BURST_SPAN_MS
    if (split) {
      cur = { start: m.ts, end: m.ts, group: m.group, seq: m.seq, firstSeq: m.seq, entries: [] }
      versions.push(cur)
    }
    cur.end = Math.max(cur.end, m.ts)
    cur.seq = m.seq
    cur.entries.push(m)
  }
  for (const v of versions) {
    v.restore = !!(v.group && /^restore:/.test(v.group))
    v.restoredTo = v.restore ? Number(v.group.split(':')[2]) || null : null
    v.items = summarize(v.entries)
  }
  return versions.reverse()
}

// The distinct visible changes in a version, in the order they were made.
function summarize(entries) {
  const seen = new Map()
  for (const m of entries) {
    if (m.quiet) continue
    const t = targetOf(m)
    const prev = seen.get(t)
    // Keep the first description ("Added…"), unless it's been deleted since.
    if (!prev) seen.set(t, m.label)
    else if (/^Deleted /.test(m.label)) seen.set(t, /^Added /.test(prev) ? null : m.label)
  }
  return [...seen.values()].filter(Boolean)
}

// How many distinct things a restore to `seq` would put back.
export async function changesSince(seq, uid = currentStorageUser()) {
  await chain
  const metas = (await allMeta()).filter(m => m.uid === uid && m.seq > seq)
  return new Set(metas.filter(m => !m.quiet).map(targetOf)).size
}

// How many distinct things a restore to moment `ts` would put back.
export async function changesSinceTime(ts, uid = currentStorageUser()) {
  await chain
  const metas = (await allMeta()).filter(m => m.uid === uid)
  const seq = metas.filter(m => m.ts <= ts).reduce((mx, m) => Math.max(mx, m.seq), 0)
  return new Set(metas.filter(m => m.seq > seq && !m.quiet).map(targetOf)).size
}

// ── Restoring ────────────────────────────────────────────────────────────────
let restoring = false
export const isRestoring = () => restoring

// Put everything back the way it was right after journal entry `seq` (0 = the
// start of the history). Returns how many values/rows were written back.
export async function restoreTo(seq, { targetTs } = {}) {
  if (restoring) throw new Error('A restore is already running')
  const uid = currentStorageUser()
  if (!uid) throw new Error('Not signed in')
  restoring = true
  try {
    await chain
    const later = (await allMeta()).filter(m => m.uid === uid && m.seq > seq).sort((a, b) => a.seq - b.seq)
    // For each thing touched since, its state at that point is the "before" of
    // the first write to it afterwards.
    const firsts = new Map()
    for (const m of later) if (!firsts.has(targetOf(m))) firsts.set(targetOf(m), m)
    const targets = [...firsts.values()]
    // Labels first (tasks point at them), check-offs and log entries last.
    const rank = m => m.kind === 'row' && m.table === 'categories' ? 0 : m.kind === 'kv' ? 1
      : m.kind === 'row' && m.table !== 'log' ? 2 : 3
    targets.sort((a, b) => rank(a) - rank(b) || a.seq - b.seq)

    const all = await allMeta()
    const target = targetTs ?? (all.find(m => m.seq === seq) || {}).ts ?? 0
    activeGroup = `restore:${Date.now()}:${target}`
    let n = 0
    const failures = []
    for (const m of targets) {
      try {
        const before = await readBefore(m.seq)
        if (m.kind === 'kv') await restoreKv(m.key, before === undefined ? null : before)
        else if (m.kind === 'done') await restoreCompletion(m.key, !!before)
        else if (m.kind === 'row') await restoreRow(m.table, m.id, before || null)
        n++
      } catch (e) {
        failures.push(`${m.label}: ${(e && e.message) || e}`)
      }
    }
    await chain
    if (failures.length) console.warn('[versions] some changes could not be restored:', failures)
    return { restored: n, failed: failures }
  } finally {
    activeGroup = null
    last = null
    restoring = false
  }
}

// Restore to how things stood at a moment in time — e.g. an hour ago.
export async function restoreToTime(ts, uid = currentStorageUser()) {
  await chain
  const metas = (await allMeta()).filter(m => m.uid === uid && m.ts <= ts)
  const seq = metas.reduce((mx, m) => Math.max(mx, m.seq), 0)
  return restoreTo(seq, { targetTs: ts })
}

// Test hook: forget everything (memory fallback only).
export function _resetForTests() { mem.meta.clear(); mem.data.clear(); mem.seq = 1; last = null; chain = Promise.resolve() }
