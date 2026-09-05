// src/lib/storage.js
import { createClient } from '@supabase/supabase-js'
import {
  ready as offlineReady, cacheRead, cacheWrite, cacheClear,
  enqueue, hasPending, isOnline, noteFailure, noteSuccess,
  registerReplay, setActiveUid, flush as flushOutbox,
} from './offline.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY)

// Force every request to bypass HTTP caching — a cached GET response for a
// kv_store row would silently show stale (pre-delete) data after a real write
// already succeeded, which looks exactly like "my delete didn't stick".
const noCacheFetch = (url, options) => fetch(url, { ...options, cache: 'no-store' })

export const supabase = USE_SUPABASE
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { fetch: noCacheFetch },
      // Stay signed in across app restarts: keep the session in localStorage and
      // refresh the token automatically. These are the library defaults, pinned
      // here so a re-login is never a config accident. (No custom storageKey —
      // changing it would log everyone out once, and the default key is already
      // stable per project.)
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
export const isUsingSupabase = USE_SUPABASE

// ── localStorage helpers ───────────────────────────────────────
async function lsGet(key) {
  try { const r = localStorage.getItem('vivian_'+key); return r ? JSON.parse(r) : null } catch { return null }
}
async function lsSet(key, value) {
  try { localStorage.setItem('vivian_'+key, JSON.stringify(value)) } catch {}
}

// ── Value fingerprinting ────────────────────────────────────────
// A fast, low-collision 53-bit string hash (cyrb53). We fingerprint a value's
// serialized form so callers can cheaply tell whether a write would actually
// change anything — storing the tiny signature instead of a full copy of a
// (possibly multi-MB) blob. Prefixed with the length to make an accidental
// collision astronomically unlikely.
export function stableSignature(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return str.length + ':' + hash.toString(36)
}

// Signature of the value we last *successfully* wrote for each kv_store key,
// persisted so it survives reloads. This is what lets dbSet skip re-uploading a
// blob that hasn't actually changed since the last write — including the
// once-per-load pref re-push, which was writing the identical ui_prefs blob on
// every single app open. See dbSet.
// Namespaced by the signed-in user's id (below), so one account's "already
// wrote this" signatures never make another account skip a needed write when
// two people use the same browser.
const WSIG_PREFIX = 'vivian_wsig_'
const wsigGet = (k) => { try { return localStorage.getItem(WSIG_PREFIX + kvNs() + k) } catch { return null } }
const wsigSet = (k, v) => { try { localStorage.setItem(WSIG_PREFIX + kvNs() + k, v) } catch {} }

// ── Current account (set by src/lib/auth.js) ────────────────────
// kv_store is keyed per (user_id, key), so a write must carry the owner and its
// upsert must resolve conflicts on the composite key. auth.js calls
// setStorageUser() whenever the session changes; storage.js never imports auth
// (that would be a cycle). 'local' is the implicit single user without Supabase.
let kvUid = USE_SUPABASE ? null : 'local'
const kvNs = () => (kvUid ? kvUid + ':' : '')
export function setStorageUser(uid) {
  kvUid = uid || (USE_SUPABASE ? null : 'local')
  // The outbox is shared by every account that has used this device, so it has
  // to know whose writes it may replay — sending A's queued edits while B is
  // signed in would file them under the wrong owner.
  setActiveUid(kvUid)
}

// ── Offline mirror & write queue ────────────────────────────────
// Bloom is local-first: reads are mirrored into IndexedDB as they come back
// from the cloud, and writes are applied to that mirror before they are sent.
// With no network the app therefore opens on real data and stays fully
// editable — every change lands in a durable outbox that is replayed, in
// order, the moment the connection returns. See src/lib/offline.js.
//
// Mirror keys are namespaced per account so two people sharing a browser never
// see each other's offline copy.
const mirrorKey = name => kvNs() + name
const kvMirrorKey = key => kvNs() + 'kv:' + key

// Read from the cloud, keeping the mirror fresh; fall back to the mirror when
// the network is gone, when a request fails, or when this key still has an
// unsent local edit (which must beat whatever the cloud is still showing).
async function cloudRead({ mirror, table, id, run, fallback, label }) {
  await offlineReady()
  const cached = await cacheRead(mirrorKey(mirror))
  const local = cached === undefined ? fallback : cached
  if (!isOnline() || (table && hasPending(table, id))) return local
  try {
    const value = await run()
    noteSuccess()
    await cacheWrite(mirrorKey(mirror), value)
    return value
  } catch (e) {
    // A dropped connection is not an error worth shouting about — that is
    // exactly the case the mirror exists for. Anything else still gets logged.
    if (!noteFailure(e)) console.error(`[storage] ${label} failed:`, (e && e.message) || e)
    return local
  }
}

// Send a write, or park it in the outbox when there's no network. A rejection
// that is NOT a transport failure (bad data, a permission problem) is rethrown
// so the app can tell the user, exactly as it did before offline support.
async function cloudWrite(op, run) {
  await offlineReady()
  if (isOnline()) {
    try {
      const result = await run()
      noteSuccess()
      return { queued: false, result }
    } catch (e) {
      if (!noteFailure(e)) throw e
    }
  }
  await enqueue({ ...op, uid: kvUid })
  return { queued: true, result: undefined }
}

// Mirror maintenance for the row-backed tables. Every mutation updates the
// mirror whether or not it reached the cloud, so the next offline read shows
// the state the user actually left the app in.
async function mirrorList(name) {
  const v = await cacheRead(mirrorKey(name))
  return Array.isArray(v) ? v : []
}
async function mirrorPut(name, rows) { await cacheWrite(mirrorKey(name), rows) }
async function mirrorUpsert(name, row, pk = 'id', prepend = false) {
  const rows = await mirrorList(name)
  const i = rows.findIndex(r => r && r[pk] === row[pk])
  if (i >= 0) rows[i] = { ...rows[i], ...row }
  else if (prepend) rows.unshift(row)
  else rows.push(row)
  await mirrorPut(name, rows)
  return rows[i >= 0 ? i : (prepend ? 0 : rows.length - 1)]
}
async function mirrorPatch(name, id, changes, pk = 'id') {
  const rows = await mirrorList(name)
  const i = rows.findIndex(r => r && r[pk] === id)
  if (i < 0) return null
  rows[i] = { ...rows[i], ...changes }
  await mirrorPut(name, rows)
  return rows[i]
}
async function mirrorRemove(name, id, pk = 'id') {
  const rows = await mirrorList(name)
  await mirrorPut(name, rows.filter(r => !r || r[pk] !== id))
}

// Client-side id for a row created while offline. The row tables all use text
// primary keys the app already generates itself, so an offline insert needs no
// round trip; log_entries takes a uuid, which we mint the same way.
const localId = prefix => prefix + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
function newUuid() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID() } catch {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// Ask the outbox to drain now (used by the UI's "sync now" affordance).
export const syncNow = () => flushOutbox()

// Forget this device's offline mirror for one account — called on sign-out so
// the next person to open Bloom on this browser can't read the previous
// account's data straight out of IndexedDB. Queued writes are deliberately
// left alone: they are still that account's unsaved work.
export async function clearOfflineMirror(uid) {
  await cacheClear(uid ? uid + ':' : '')
}

// ── In-flight write tracking ────────────────────────────────────
// Cloud writes are async — refreshing or closing the tab right after an edit
// can cancel the request mid-flight, which looks exactly like "my delete
// didn't save". Warn before the tab closes/reloads while any dbSet is pending.
let pendingWrites = 0
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', e => {
    if (pendingWrites > 0) { e.preventDefault(); e.returnValue = '' }
  })
}

// ── KV store ───────────────────────────────────────────────────
export async function dbGet(key) {
  if (USE_SUPABASE) {
    return cloudRead({
      mirror: 'kv:' + key, table: 'kv_store', id: key, fallback: null, label: `dbGet('${key}')`,
      run: async () => {
        const { data, error } = await supabase.from('kv_store').select('value').eq('key', key).maybeSingle()
        if (error) throw error
        return data?.value ?? null
      },
    })
  }
  return lsGet(key)
}

// Read a kv_store row's value only when it has changed since `sinceISO`.
// The tiny `updated_at` column is fetched first; the (potentially large) `value`
// is read off disk only when it actually differs. This is what stops the big
// background-image blobs (and the prefs blob) from being re-read on every
// foreground — the repeated large-row reads Supabase flagged as Disk IO drain.
// Returns one of:
//   { status:'unchanged', updatedAt }        — row exists, same timestamp (no value read)
//   { status:'changed', value, updatedAt }    — row exists and is newer; value read
//   { status:'absent' }                       — no row for this key
// Without Supabase it just returns the local value (localStorage has no IO cost).
export async function dbGetChanged(key, sinceISO) {
  if (!USE_SUPABASE) return { status: 'changed', value: await lsGet(key), updatedAt: null }
  await offlineReady()
  // Offline, or this key is still sitting in the outbox: there is nothing newer
  // to pull down, and reporting a change would let a stale cloud copy overwrite
  // the edit that hasn't been uploaded yet. "Unchanged" is the safe answer —
  // the caller then keeps what it already has.
  if (!isOnline() || hasPending('kv_store', key)) return { status: 'unchanged', updatedAt: sinceISO ?? null }
  const { data: meta, error: metaErr } = await supabase
    .from('kv_store').select('updated_at').eq('key', key).maybeSingle()
  if (metaErr) {
    if (!noteFailure(metaErr)) console.error(`[storage] dbGetChanged('${key}') meta failed:`, metaErr.message)
    // On a metadata error, treat as unchanged so we never clobber good local data.
    return { status: 'unchanged', updatedAt: sinceISO ?? null }
  }
  noteSuccess()
  if (!meta) return { status: 'absent' }
  const updatedAt = meta.updated_at ?? null
  if (sinceISO && updatedAt && updatedAt === sinceISO) return { status: 'unchanged', updatedAt }
  const { data, error } = await supabase.from('kv_store').select('value').eq('key', key).maybeSingle()
  if (error) {
    if (!noteFailure(error)) console.error(`[storage] dbGetChanged('${key}') value failed:`, error.message)
    return { status: 'unchanged', updatedAt }
  }
  const value = data?.value ?? null
  // Keep the offline mirror in step with what we just pulled, so the next
  // launch without a network shows this value rather than an older one.
  await cacheWrite(kvMirrorKey(key), value)
  return { status: 'changed', value, updatedAt }
}
// Two writes to the same key can be in flight at once (e.g. checking a
// commitment off right as another edit is saving) with no guarantee the
// network responses land in the same order they were sent — whichever
// finishes last wins, even if its payload was built from older local state,
// silently clobbering a newer write (like a delete) with stale data. Chain
// writes per key so each one only starts once the previous one for that same
// key has actually finished, which keeps them landing in the order they were
// called in.
const writeQueues = new Map()

// The raw kv_store upsert. Shared by dbSet and by outbox replay, so a write
// that was queued offline lands exactly as it would have online.
//
// kv_store's primary key is (user_id, key) once accounts are on, so the owner
// is written explicitly and the upsert resolves on that composite key. Falls
// back to a bare row (single-key PK) when user_id is null — the pre-migration
// schema.
async function cloudKvSet(key, value) {
  const row = kvUid ? { user_id: kvUid, key, value, updated_at: new Date().toISOString() }
                    : { key, value, updated_at: new Date().toISOString() }
  const opts = kvUid ? { onConflict: 'user_id,key' } : undefined
  const { error } = await supabase.from('kv_store').upsert(row, opts)
  if (error) throw new Error(`Cloud save failed for "${key}": ${error.message}`)
}

export async function dbSet(key, value) {
  if (USE_SUPABASE) {
    // Skip the upsert entirely when this exact value is already what we last
    // wrote for this key. Re-uploading a byte-identical blob only burns Disk IO
    // (a WAL write) and bumps updated_at — which then makes *other* devices
    // re-read the unchanged blob on their next foreground too. The signature is
    // persisted, so the once-per-load pref/blob re-pushes that don't actually
    // change anything become no-ops across reloads.
    //
    // Recorded only after a write succeeds, so a failed (offline) write is
    // retried next time; a different value always writes; flipping back to a
    // prior value still writes (only the immediately previous identical value is
    // skipped). Safe under last-write-wins: if the row was changed remotely, not
    // re-asserting our identical-to-before value is exactly right — the newer
    // remote value should win, and the next foreground read reconciles it.
    const sig = stableSignature(JSON.stringify(value))
    if (wsigGet(key) === sig) return
    // The local mirror is updated first and unconditionally. Whatever the
    // network then does, reopening Bloom offline shows the value the user just
    // set — not the one the cloud last confirmed.
    await cacheWrite(kvMirrorKey(key), value)
    const prevWrite = writeQueues.get(key) || Promise.resolve()
    const thisWrite = prevWrite.then(async () => {
      pendingWrites++
      try {
        const { queued } = await cloudWrite(
          { table: 'kv_store', op: 'set', id: key, row: { key, value } },
          () => cloudKvSet(key, value),
        )
        // Only a *confirmed* cloud write may record the signature. A queued
        // write hasn't landed yet, so leaving the signature unset is what makes
        // the value eligible to be sent again.
        if (!queued) wsigSet(key, sig)
      } finally {
        pendingWrites--
      }
    })
    // Swallow errors here only so the queue keeps moving for the next write —
    // the real error is still thrown to whoever called this dbSet, below.
    writeQueues.set(key, thisWrite.catch(() => {}))
    return thisWrite
  }
  lsSet(key, value)
}

// ── Task completion state ───────────────────────────────────────
// Real per-row table — replaces the old "todos" + "week_state" blobs,
// which were confirmed duplicate mirrors of the exact same data (every
// write put the same value in both under the same key; every read was
// todos[k] || weekState[k]). A row existing means done; toggling one
// item's checkbox is one row write, never a whole-map overwrite.
// The raw completion write — shared by setCompletion and by outbox replay.
async function cloudCompletionSet(storageKey, done) {
  if (done) {
    const { error } = await supabase.from('task_completions')
      .upsert({ storage_key: storageKey, done: true, updated_at: new Date().toISOString() })
    if (error) throw new Error(`Failed to save completion for "${storageKey}": ${error.message}`)
  } else {
    const { error } = await supabase.from('task_completions').delete().eq('storage_key', storageKey)
    if (error) throw new Error(`Failed to clear completion for "${storageKey}": ${error.message}`)
  }
}

export async function getCompletions() {
  if (USE_SUPABASE) {
    return cloudRead({
      mirror: 'completions', table: 'task_completions', fallback: {}, label: 'getCompletions',
      run: async () => {
        const { data, error } = await supabase.from('task_completions').select('storage_key, done')
        if (error) throw error
        const out = {}
        ;(data || []).forEach(r => { if (r.done) out[r.storage_key] = true })
        return out
      },
    })
  }
  return (await lsGet('completions')) ?? {}
}
export async function setCompletion(storageKey, done) {
  if (USE_SUPABASE) {
    // Checking a task off is the single most common thing done without a
    // network (on a bus, in a basement), so the tick has to stick locally
    // whether or not the write lands.
    const cur = await cacheRead(mirrorKey('completions'))
    const map = (cur && typeof cur === 'object') ? { ...cur } : {}
    if (done) map[storageKey] = true; else delete map[storageKey]
    await cacheWrite(mirrorKey('completions'), map)
    await cloudWrite(
      { table: 'task_completions', op: 'set', id: storageKey, row: { storageKey, done: !!done } },
      () => cloudCompletionSet(storageKey, done),
    )
    return
  }
  const all = (await lsGet('completions')) ?? {}
  if (done) all[storageKey] = true; else delete all[storageKey]
  await lsSet('completions', all)
}

// ── Activity log ─────────────────────────────────────────────────
// The raw log writes — shared by the online path and by outbox replay.
async function cloudLogInsert(entry) {
  const { error } = await supabase.from('log_entries').insert({
    id: entry.id, date: entry.date, date_label: entry.dateLabel, label: entry.label, tag: entry.tag,
    storage_key: entry.storageKey, ts: entry.ts || new Date().toISOString(),
  })
  if (error) throw new Error(`Failed to add log entry: ${error.message}`)
}
async function cloudLogDelete(id) {
  const { error } = await supabase.from('log_entries').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete log entry: ${error.message}`)
}

export async function getLogEntries() {
  if (USE_SUPABASE) {
    return cloudRead({
      mirror: 'log', table: 'log_entries', fallback: [], label: 'getLogEntries',
      run: async () => {
        const { data, error } = await supabase.from('log_entries').select('*').order('ts', { ascending: true })
        if (error) throw error
        return (data || []).map(r => ({ id:r.id, date:r.date, dateLabel:r.date_label, label:r.label, tag:r.tag, storageKey:r.storage_key, ts:r.ts }))
      },
    })
  }
  return (await lsGet('log')) ?? []
}
export async function addLogEntry(entry) {
  if (USE_SUPABASE) {
    // The id is minted here rather than by the database, so an entry logged
    // offline has a stable identity the moment it exists — which is what lets
    // it be un-logged again before it has ever reached the cloud.
    const row = { ...entry, id: entry.id || newUuid(), ts: entry.ts || new Date().toISOString() }
    await mirrorUpsert('log', row)
    await cloudWrite({ table: 'log_entries', op: 'insert', id: row.id, row }, () => cloudLogInsert(row))
    return
  }
  const all = (await lsGet('log')) ?? []
  await lsSet('log', [...all, entry])
}

// Apply the "which entries does un-checking this remove?" rule to the local
// mirror, and report the ids it removed. Same precedence as the cloud path:
// entries matching label + storageKey exactly, or failing that the single most
// recent entry carrying that label.
async function removeFromLogMirror(label, storageKey) {
  const rows = await mirrorList('log')
  const exact = rows.filter(r => r && r.label === label && r.storageKey === storageKey)
  let doomed = exact
  if (!doomed.length) {
    const byLabel = rows.filter(r => r && r.label === label)
    const latest = byLabel.sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')))[byLabel.length - 1]
    doomed = latest ? [latest] : []
  }
  if (!doomed.length) return []
  const gone = new Set(doomed.map(r => r.id))
  await mirrorPut('log', rows.filter(r => !gone.has(r && r.id)))
  return [...gone].filter(id => id != null)
}
// Removes the most recent log entry matching label+storageKey; falls back to
// the most recent entry matching label alone (entries saved without a
// storageKey) — mirrors the exact matching logic the old uncheck handler used.
export async function deleteLogEntry(label, storageKey) {
  if (USE_SUPABASE) {
    await offlineReady()
    // With a network and nothing queued, the cloud is the authority on which
    // rows match — resolve there, exactly as before.
    if (isOnline() && !hasPending('log_entries')) {
      try {
        const { data: exact, error: e1 } = await supabase.from('log_entries')
          .select('id').eq('label', label).eq('storage_key', storageKey)
        if (e1) throw new Error(`Failed to look up log entry: ${e1.message}`)
        if (exact && exact.length > 0) {
          const { error: e2 } = await supabase.from('log_entries').delete().in('id', exact.map(r => r.id))
          if (e2) throw new Error(`Failed to delete log entry: ${e2.message}`)
        } else {
          const { data: latest, error: e3 } = await supabase.from('log_entries')
            .select('id').eq('label', label).order('ts', { ascending:false }).limit(1).maybeSingle()
          if (e3) throw new Error(`Failed to look up log entry: ${e3.message}`)
          if (latest) {
            const { error: e4 } = await supabase.from('log_entries').delete().eq('id', latest.id)
            if (e4) throw new Error(`Failed to delete log entry: ${e4.message}`)
          }
        }
        noteSuccess()
        await removeFromLogMirror(label, storageKey)
        return
      } catch (e) { if (!noteFailure(e)) throw e }
    }
    // No network: the mirror decides which entries go, and each removal is
    // queued by id. Queueing by id (rather than re-running the label lookup on
    // replay) is what makes un-logging an entry that was itself created offline
    // cancel out cleanly — the outbox drops both halves.
    const ids = await removeFromLogMirror(label, storageKey)
    for (const id of ids) await enqueue({ uid: kvUid, table: 'log_entries', op: 'delete', id })
    return
  }
  const all = (await lsGet('log')) ?? []
  const next = all.filter(e => !(e.label === label && e.storageKey === storageKey))
  const next2 = next.length < all.length ? next : all.filter((e, i) => {
    if (e.label !== label) return true
    const laterIdx = all.findIndex((e2, i2) => i2 > i && e2.label === label)
    return laterIdx !== -1
  })
  await lsSet('log', next2)
}

export const getNotes          = () => dbGet('notes').then(v => v ?? '')
export const setNotes          = v  => dbSet('notes', v)
export const getFcProgress     = () => dbGet('fc_progress').then(v => v ?? {})
export const setFcProgress     = v  => dbSet('fc_progress', v)
export const getFcStudied      = () => dbGet('fc_studied').then(v => v ?? {})
export const setFcStudied      = v  => dbSet('fc_studied', v)
export const getScheduledTasks = () => dbGet('scheduled_tasks').then(v => v ?? [])
export const setScheduledTasks = v  => dbSet('scheduled_tasks', v)

// UI preferences (theme, season, background, fonts, view filters, saved colors,
// duration presets…) so a device's look & settings follow you across devices.
// One synced kv_store blob; see src/lib/prefs.js for the localStorage bridge.
export const getUiPrefs = () => dbGet('ui_prefs').then(v => (v && typeof v === 'object') ? v : null)
export const setUiPrefs = v  => dbSet('ui_prefs', v)

// Rich per-commitment content (description + sub-checkboxes), stored as one
// map keyed by commitment id. Kept in kv_store (which every install already
// has) rather than new columns on the commitments table, so it needs no
// schema migration and can't break the core add/edit path. Still cloud-synced.
export const getCommitmentMeta = () => dbGet('commitment_meta').then(v => v ?? {})
export const setCommitmentMeta = v  => dbSet('commitment_meta', v)

// Thoughts board — a pool of sticky-note thoughts. One kv_store blob (array),
// so no new table. Each note: { id, text, createdAt, x, y, rot, color, scheduled }.
export const getThoughts = () => dbGet('thoughts').then(v => v ?? [])
export const setThoughts = v  => dbSet('thoughts', v)

// Classic sticky-note pastels (kept in sync with ThoughtsBoard's own palette).
const THOUGHT_COLORS = ['#FEF3B0', '#FBD1DE', '#C9E7F7', '#D2F0CE', '#F7DDB0', '#E7D6F5', '#FBC9A8']
// Build a fresh sticky note in the exact shape the Thoughts board renders —
// randomly placed + tilted, stamped now, unscheduled. Shared so a note pinned
// from elsewhere (e.g. "Move to Thoughts" on a task) looks native on the board.
export function makeThought(text) {
  return {
    id: 'th-' + Date.now(),
    text: (text || '').trim(),
    createdAt: new Date().toISOString(),
    x: 3 + Math.random() * 66,
    y: 3 + Math.random() * 80,
    rot: -7 + Math.random() * 14,
    color: THOUGHT_COLORS[Math.floor(Math.random() * THOUGHT_COLORS.length)],
    scheduled: false,
  }
}
// Pin a new thought to the board and persist it. Returns the created note.
export async function addThought(text) {
  const note = makeThought(text)
  const cur = await getThoughts()
  await setThoughts([note, ...(cur || [])])
  return note
}

// Recurring occurrence exceptions — one shared, cloud-synced map marking which
// individual instances of a recurring task have been skipped/removed on a given
// date. Key: "<recurringId>@<YYYY-MM-DD>" → true. Replaces the old per-device,
// per-view localStorage deletion lists (vivian_deleted_*, vivian_week_deleted),
// so hiding one occurrence on Today/Week/Calendar hides it on all three, on
// every device. Kept in kv_store (a blob) so it needs no schema migration.
export const getRecurringExceptions = () => dbGet('recurring_exceptions').then(v => v ?? {})
export const setRecurringExceptions = v  => dbSet('recurring_exceptions', v)

// Recurrence rule extras (frequency, interval, monthly day) keyed by recurring
// task id. Kept in a kv_store blob rather than new recurring_tasks columns, so
// richer repeat rules (daily / weekly-every-N / monthly) need no schema
// migration — mirrors how commitment_meta carries extra commitment fields.
// Shape: { [recurringId]: { freq:'daily'|'weekly'|'monthly', interval:N, monthDay:D } }.
export const getRecurringMeta = () => dbGet('recurring_meta').then(v => v ?? {})
export const setRecurringMeta = v  => dbSet('recurring_meta', v)

// ── Routine groups ─────────────────────────────────────────────
// User-defined groups (Morning routine, Night routine, …) that recurring tasks
// can be filed under. Each: { id, name, tint }. A synced kv_store blob (like
// the meta above) so grouping needs no schema migration. Stored under its own
// key — separate from the legacy `routines` item-list blob. `null` → seed.
export const getRoutineGroups = () => dbGet('routine_groups').then(v => Array.isArray(v) ? v : null)
export const setRoutineGroups = v  => dbSet('routine_groups', v)

// ── Subscribed (external) calendars ─────────────────────────────
// Read-only calendar feeds the user subscribes to by ICS URL — e.g. a published
// Apple Family / iCloud calendar. Just the subscription config lives here (one
// synced kv_store blob, no schema migration); the fetched events themselves are
// cached device-local (see src/lib/calendars.js). Each entry:
//   { id, name, url, color, enabled, createdAt }
export const getExternalCalendars = () => dbGet('external_calendars').then(v => Array.isArray(v) ? v : [])
export const setExternalCalendars = v  => dbSet('external_calendars', v)

// Imported-event adoptions: a map of importedKey → the id of the commitment it
// was copied into when you tapped "Add to my schedule". Kept as its own synced
// blob so an event you adopt on one device reads as adopted on the others (and
// isn't offered for adoption twice).
export const getImportedAdoptions = () => dbGet('imported_adoptions').then(v => (v && typeof v === 'object') ? v : {})
export const setImportedAdoptions = v  => dbSet('imported_adoptions', v)

// ── Manual time logs (Informatics) ─────────────────────────────
// Time the user records by hand for something that didn't run as a timed task —
// "3h on MCAT on Tuesday." Lets the Informatics page answer "how many hours did
// I spend on X" even when nothing had a duration attached. One synced kv_store
// blob (array), no schema migration. Each: { id, date, mins, cat, title, createdAt }.
export const getTimeLogs = () => dbGet('time_logs').then(v => Array.isArray(v) ? v : [])
export const setTimeLogs = v  => dbSet('time_logs', v)

// ── Change history (reversible "recent edits" list, shown in Settings) ──────
// A running list of the user's own add/edit/delete actions on tasks and events,
// each carrying a serializable inverse so a single edit can be undone later —
// long after the transient Ctrl+Z stack is gone. One synced kv_store blob
// (array, newest-first, capped in the app). Each: { id, ts, kind, entity,
// label, undone, inverse }.
export const getChangeHistory = () => dbGet('change_history').then(v => Array.isArray(v) ? v : [])
export const setChangeHistory = v  => dbSet('change_history', v)

// ── Task Menu templates ─────────────────────────────────────────
// Reusable, date-less task presets — a "task menu" you pick from when creating
// a task so all the preset details (duration, tags, color/icon, description,
// subtasks) auto-fill and you only have to set a start time. One synced
// kv_store blob (array), no schema migration. Each entry:
//   { id, text, durationMins, cat, cats, color, icon, description, subtasks, person, createdAt }
export const getTaskTemplates = () => dbGet('task_templates').then(v => Array.isArray(v) ? v : [])
export const setTaskTemplates = v  => dbSet('task_templates', v)

// ── Label meta (record-folder links + custom task fields) ───────
// The extras that turn a plain label into a record label: which tracker
// folders it files into, and the fields it adds to the add-task sheet. Keyed by
// label (category) id, in one synced kv_store blob so it needs no migration of
// the categories table. See src/lib/labels.js for the shape and helpers.
export const getLabelMeta = () => dbGet('label_meta').then(v => (v && typeof v === 'object') ? v : {})
export const setLabelMeta = v  => dbSet('label_meta', v)

// ── Trackers (custom folders in the Insights tab) ───────────────
// User-created record folders — a B&B, a rental, freelance work, mileage… Each
// folder holds hours worked and money spent, attributed to people, so it can be
// summarized and exported (PDF / CSV) for tax records. Stored as per-user
// kv_store blobs (arrays) — low-volume, edited a few entries at a time, so a
// whole-array write per change is fine (same pattern as time_logs / thoughts)
// and it needs no new tables beyond the accounts migration. Shapes:
// The user defines each folder's OWN fields (a driving trip can carry a money-out
// for gas, a time value, and a mileage number all in one entry), and can set a
// money + time budget so the summary shows profit, spend, and what's left.
//   folder: { id, name, icon, color, createdAt, fields:[{id,type,name}], budgetMoney, budgetHours }
//   person: { id, folderId, name, role, color, createdAt }
//   entry:  { id, folderId, date, values:{ [fieldId]: value }, createdAt }
// A `receipt`-type field's value is a small downscaled JPEG data URL (see
// lib/trackers.js compressImage). Field types: moneyIn, moneyOut, hours, number,
// category, text, person, receipt (see lib/trackers.js FIELD_TYPES).
export const getTrackerFolders = () => dbGet('tracker_folders').then(v => Array.isArray(v) ? v : [])
export const setTrackerFolders = v  => dbSet('tracker_folders', v)
export const getTrackerPeople  = () => dbGet('tracker_people').then(v => Array.isArray(v) ? v : [])
export const setTrackerPeople  = v  => dbSet('tracker_people', v)
export const getTrackerEntries = () => dbGet('tracker_entries').then(v => Array.isArray(v) ? v : [])
export const setTrackerEntries = v  => dbSet('tracker_entries', v)
// Remembered field values the user has typed, so text/category inputs can offer
// them again. Shape: { [folderId]: { [fieldId]: string[] } }
export const getTrackerCats = () => dbGet('tracker_cats').then(v => (v && typeof v === 'object') ? v : {})
export const setTrackerCats = v  => dbSet('tracker_cats', v)

// ── Wellness (mood check-ins, status effects, companion game) ───
// The gamified mental-health + physical-condition tab. Four synced kv_store
// blobs, so the whole feature needs no schema migration and rides the same
// cross-device sync as everything else:
//   • wellness_checkins — [{ date:'YYYY-MM-DD', mood:1..5, energy:1..5, note, ts }]
//   • wellness_effects  — the user's DnD-style condition definitions (null → seed)
//   • wellness_episodes — [{ id, effectId, start:ISO, end:ISO|null }] on/off spans
//   • wellness_game     — { xp, petals, streak, best, lastCheckIn, companionName, … }
export const getWellnessCheckins = () => dbGet('wellness_checkins').then(v => Array.isArray(v) ? v : [])
export const setWellnessCheckins = v  => dbSet('wellness_checkins', v)
export const getWellnessEffects  = () => dbGet('wellness_effects').then(v => Array.isArray(v) ? v : null)
export const setWellnessEffects  = v  => dbSet('wellness_effects', v)
export const getWellnessEpisodes = () => dbGet('wellness_episodes').then(v => Array.isArray(v) ? v : [])
export const setWellnessEpisodes = v  => dbSet('wellness_episodes', v)
export const getWellnessGame     = () => dbGet('wellness_game').then(v => (v && typeof v === 'object') ? v : null)
export const setWellnessGame     = v  => dbSet('wellness_game', v)
// The user's emotion palette customisations: { custom:[{id,name,color}], hidden:[id] }.
// `custom` are emotions they've added; `hidden` are ids removed from the picker
// (built-in or custom) — kept as a list so tagged clouds still resolve them.
export const getWellnessEmotions = () => dbGet('wellness_emotions').then(v => ({
  custom: (v && Array.isArray(v.custom)) ? v.custom : [],
  hidden: (v && Array.isArray(v.hidden)) ? v.hidden : [],
}))
export const setWellnessEmotions = v  => dbSet('wellness_emotions', v)
// "Treasures" — a keepsake photo + description the user pins to a day, shown
// with that day's cloud. One synced kv_store blob (array); images are stored
// downscaled as data URLs. Each: { id, date, image, desc, ts }.
export const getWellnessTreasures = () => dbGet('wellness_treasures').then(v => Array.isArray(v) ? v : [])
export const setWellnessTreasures = v  => dbSet('wellness_treasures', v)
// The Voyage meta-game state (unlocked planets, collected specimens, ship). One
// synced kv_store blob; see src/lib/space.js. `null` → seed a fresh voyage.
export const getWellnessSpace = () => dbGet('wellness_space').then(v => (v && typeof v === 'object') ? v : null)
export const setWellnessSpace = v  => dbSet('wellness_space', v)
// Custom-art overrides — { assetId: dataURL } uploaded by the owner (see
// src/lib/art.js). One synced kv_store blob.
export const getArtOverrides = () => dbGet('art_overrides').then(v => (v && typeof v === 'object') ? v : {})
export const setArtOverrides = v  => dbSet('art_overrides', v)

// ── Classes ────────────────────────────────────────────────────
// The study tables (classes / weeks / flashcards / files) let the database
// generate their ids. A row created offline can't wait for that, so it mints a
// uuid instead — valid for a uuid column and valid text for a text one, which
// keeps the offline path correct without assuming which the install uses.
async function cloudClassInsert(cls) {
  const { data, error } = await supabase.from('classes').insert(cls).select().single()
  if (error) throw new Error(`Failed to add class: ${error.message}`)
  return data
}
async function cloudClassDelete(id) {
  const { error } = await supabase.from('classes').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete class: ${error.message}`)
}

export async function getClasses() {
  if (USE_SUPABASE) {
    return cloudRead({
      mirror: 'classes', table: 'classes', fallback: [], label: 'getClasses',
      run: async () => {
        const { data, error } = await supabase.from('classes').select('*').order('sort_order')
        if (error) throw error
        return data ?? []
      },
    })
  }
  return (await lsGet('classes')) ?? []
}
export async function addClass(cls) {
  if (USE_SUPABASE) {
    const row = { ...cls, id: cls.id || newUuid(), created_at: cls.created_at || new Date().toISOString() }
    const { queued, result } = await cloudWrite(
      { table: 'classes', op: 'insert', id: row.id, row },
      () => cloudClassInsert(row),
    )
    const created = queued ? row : result
    await mirrorUpsert('classes', created)
    return created
  }
  const all = (await lsGet('classes')) ?? []
  const created = { ...cls, id: 'cls-' + Date.now(), created_at: new Date().toISOString() }
  await lsSet('classes', [...all, created])
  return created
}
export async function deleteClass(id) {
  if (USE_SUPABASE) {
    await cloudWrite({ table: 'classes', op: 'delete', id }, () => cloudClassDelete(id))
    await mirrorRemove('classes', id)
    return
  }
  const all = (await lsGet('classes')) ?? []
  await lsSet('classes', all.filter(c => c.id !== id))
}

// ── Weeks / Folders (supports parent_id for nesting) ───────────
async function cloudWeekInsert(week) {
  const { data, error } = await supabase.from('study_weeks').insert(week).select().single()
  if (error) throw new Error(`Failed to add folder: ${error.message}`)
  return data
}
async function cloudWeekDelete(id) {
  const { error } = await supabase.from('study_weeks').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete folder: ${error.message}`)
}

// Weeks are read per (class, parent), so each of those slices gets its own
// mirror key — the same split the localStorage fallback already uses.
const weekMirror = (classId, parentId) => parentId ? `subweeks:${parentId}` : `weeks:${classId}`

export async function getWeeks(classId, parentId = null) {
  if (USE_SUPABASE) {
    return cloudRead({
      mirror: weekMirror(classId, parentId), table: 'study_weeks', fallback: [], label: 'getWeeks',
      run: async () => {
        let q = supabase.from('study_weeks').select('*').eq('class_id', classId).order('sort_order')
        // parentId null = top-level, parentId = UUID = sub-folders
        if (parentId === null) {
          q = q.is('parent_id', null)
        } else {
          q = q.eq('parent_id', parentId)
        }
        const { data, error } = await q
        if (error) throw error
        return data ?? []
      },
    })
  }
  // localStorage: key encodes both classId and parentId
  const key = parentId ? `subweeks_${parentId}` : `weeks_${classId}`
  return (await lsGet(key)) ?? []
}
export async function addWeek(week) {
  if (USE_SUPABASE) {
    const row = { ...week, id: week.id || newUuid(), created_at: week.created_at || new Date().toISOString() }
    const { queued, result } = await cloudWrite(
      { table: 'study_weeks', op: 'insert', id: row.id, row },
      () => cloudWeekInsert(row),
    )
    const created = queued ? row : result
    await mirrorUpsert(weekMirror(week.class_id, week.parent_id ?? null), created)
    return created
  }
  const parentId = week.parent_id ?? null
  const key = parentId ? `subweeks_${parentId}` : `weeks_${week.class_id}`
  const all = (await lsGet(key)) ?? []
  const created = { ...week, id: 'wk-' + Date.now(), created_at: new Date().toISOString() }
  await lsSet(key, [...all, created])
  return created
}
export async function deleteWeek(id, classId, parentId = null) {
  if (USE_SUPABASE) {
    await cloudWrite({ table: 'study_weeks', op: 'delete', id }, () => cloudWeekDelete(id))
    await mirrorRemove(weekMirror(classId, parentId), id)
    return
  }
  const key = parentId ? `subweeks_${parentId}` : `weeks_${classId}`
  const all = (await lsGet(key)) ?? []
  await lsSet(key, all.filter(w => w.id !== id))
}

// ── Flashcards ─────────────────────────────────────────────────
async function cloudCardsUpsert(cards) {
  const { data, error } = await supabase.from('flashcards').upsert(cards, { onConflict: 'id' }).select()
  if (error) throw error
  return data
}
async function cloudCardDelete(id) {
  const { error } = await supabase.from('flashcards').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete card: ${error.message}`)
}

export async function getCards(weekId) {
  if (USE_SUPABASE) {
    return cloudRead({
      mirror: 'cards:' + weekId, table: 'flashcards', fallback: [], label: 'getCards',
      run: async () => {
        const { data, error } = await supabase.from('flashcards').select('*').eq('week_id', weekId).order('created_at')
        if (error) throw error
        return data ?? []
      },
    })
  }
  return (await lsGet('cards_'+weekId)) ?? []
}
export async function importCards(cards) {
  if (USE_SUPABASE) {
    const rows = cards.map(c => ({ ...c, id: c.id || newUuid() }))
    // Each card queues on its own id, so re-importing or editing the same card
    // offline collapses to one write instead of a growing pile.
    const { queued, result } = await cloudWrite(
      { table: 'flashcards', op: 'upsert-many', id: rows.map(r => r.id).join(','), row: { cards: rows } },
      () => cloudCardsUpsert(rows),
    )
    const saved = queued ? rows : result
    const byWeekMirror = {}
    ;(saved || []).forEach(c => { (byWeekMirror[c.week_id] ||= []).push(c) })
    for (const [wid, wCards] of Object.entries(byWeekMirror)) {
      for (const card of wCards) await mirrorUpsert('cards:' + wid, card)
    }
    return saved
  }
  const byWeek = {}
  cards.forEach(c => { if (!byWeek[c.week_id]) byWeek[c.week_id] = []; byWeek[c.week_id].push(c) })
  for (const [wid, wCards] of Object.entries(byWeek)) {
    const existing = (await lsGet('cards_'+wid)) ?? []
    const merged = [...existing.filter(e => !wCards.find(n => n.id === e.id)), ...wCards]
    await lsSet('cards_'+wid, merged)
  }
  return cards
}
export async function updateCard(card) {
  if (USE_SUPABASE) {
    const row = { ...card, id: card.id || newUuid() }
    const { queued, result } = await cloudWrite(
      { table: 'flashcards', op: 'upsert', id: row.id, row },
      async () => {
        const { data, error } = await supabase.from('flashcards').upsert(row, { onConflict: 'id' }).select().single()
        if (error) throw error
        return data
      },
    )
    const saved = queued ? row : result
    await mirrorUpsert('cards:' + saved.week_id, saved)
    return saved
  }
  const all = (await lsGet('cards_'+card.week_id)) ?? []
  const next = all.map(c => c.id === card.id ? card : c)
  await lsSet('cards_'+card.week_id, next)
  return card
}

// ── Quick Links (Google Drive shortcuts) ───────────────────────
export const getQuickLinks = () => dbGet('quick_links').then(v => v ?? [])
export const setQuickLinks = v  => dbSet('quick_links', v)

export async function deleteCard(id, weekId) {
  if (USE_SUPABASE) {
    await cloudWrite({ table: 'flashcards', op: 'delete', id }, () => cloudCardDelete(id))
    await mirrorRemove('cards:' + weekId, id)
    return
  }
  const all = (await lsGet('cards_'+weekId)) ?? []
  await lsSet('cards_'+weekId, all.filter(c => c.id !== id))
}

// ── Files ──────────────────────────────────────────────────────
// Upload a file's bytes and record it. Shared by the online path and by outbox
// replay — a file picked with no network is held in IndexedDB (which stores
// File objects natively) and uploaded for real when the connection returns.
async function cloudFileUpload({ id, weekId, file, path, addedDate }) {
  const { error: upErr } = await supabase.storage.from('study-files').upload(path, file, { upsert: true })
  if (upErr) throw upErr
  const { data: urlData } = supabase.storage.from('study-files').getPublicUrl(path)
  const record = {
    id, week_id: weekId, file_name: file.name, storage_path: path,
    file_url: urlData.publicUrl, file_size: Math.round(file.size/1024), added_date: addedDate,
  }
  const { data, error } = await supabase.from('study_files').insert(record).select().single()
  if (error) throw new Error(`Failed to record file: ${error.message}`)
  return data
}
async function cloudFileDelete(id, storagePath) {
  if (storagePath) await supabase.storage.from('study-files').remove([storagePath])
  const { error } = await supabase.from('study_files').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete file: ${error.message}`)
}

export async function getFiles(weekId) {
  if (USE_SUPABASE) {
    return cloudRead({
      mirror: 'files:' + weekId, table: 'study_files', fallback: [], label: 'getFiles',
      run: async () => {
        const { data, error } = await supabase.from('study_files').select('*').eq('week_id', weekId).order('created_at')
        if (error) throw error
        return data ?? []
      },
    })
  }
  return (await lsGet('files_'+weekId)) ?? []
}
export async function uploadFile(weekId, file) {
  const addedDate = new Date().toISOString().split('T')[0]
  if (USE_SUPABASE) {
    const id = newUuid()
    const path = `${weekId}/${Date.now()}_${file.name}`
    const { queued, result } = await cloudWrite(
      { table: 'study_files', op: 'upload', id, row: { id, weekId, file, path, addedDate } },
      () => cloudFileUpload({ id, weekId, file, path, addedDate }),
    )
    // Queued: the row exists locally right away, just without a public URL —
    // the file isn't downloadable until it has actually been uploaded. The next
    // read after the outbox drains picks up the real URL.
    const record = queued
      ? { id, week_id: weekId, file_name: file.name, storage_path: path, file_url: null,
          file_size: Math.round(file.size/1024), added_date: addedDate, pending_upload: true }
      : result
    await mirrorUpsert('files:' + weekId, record)
    return record
  }
  // localStorage fallback: store metadata only (no file contents — too large)
  // File won't be downloadable but will persist across reloads
  const record = {
    id: 'f-'+Date.now(), week_id: weekId, file_name: file.name,
    file_url: null, file_size: Math.round(file.size/1024), added_date: addedDate,
  }
  const all = (await lsGet('files_'+weekId)) ?? []
  await lsSet('files_'+weekId, [...all, record])
  return record
}
export const getRoutineLog    = () => dbGet('routine_log').then(v => v ?? {})
export const setRoutineLog    = v  => dbSet('routine_log', v)

export async function deleteStudyFile(id, weekId, storagePath) {
  if (USE_SUPABASE) {
    await cloudWrite(
      { table: 'study_files', op: 'delete', id, row: { storagePath } },
      () => cloudFileDelete(id, storagePath),
    )
    await mirrorRemove('files:' + weekId, id)
    return
  }
  const all = (await lsGet('files_'+weekId)) ?? []
  await lsSet('files_'+weekId, all.filter(f => f.id !== id))
}

// ── Commitments ──────────────────────────────────────────────────
function commitmentFromDb(row) {
  return {
    id: row.id, text: row.text, date: row.date, time: row.time,
    prepMin: row.prep_min, durationMins: row.duration_mins,
    cat: row.cat, person: row.person, done: row.done, createdAt: row.created_at,
  }
}
const COMMITMENT_FIELD_MAP = { prepMin:'prep_min', durationMins:'duration_mins', createdAt:'created_at' }
export function commitmentChangesToDb(changes) {
  const out = {}
  for (const [k, v] of Object.entries(changes)) {
    // `cat` is NOT NULL in the DB — an uncategorized task stores '' instead.
    out[COMMITMENT_FIELD_MAP[k] || k] = (k === 'cat' && v == null) ? '' : v
  }
  return out
}
// The raw commitment writes — shared by the online path and by outbox replay.
async function cloudCommitmentInsert(row) {
  const { data, error } = await supabase.from('commitments')
    .insert(commitmentChangesToDb(row)).select().single()
  if (error) throw new Error(`Failed to add commitment: ${error.message}`)
  return commitmentFromDb(data)
}
async function cloudCommitmentUpdate(id, changes) {
  const { data, error } = await supabase.from('commitments')
    .update(commitmentChangesToDb(changes)).eq('id', id).select().single()
  if (error) throw new Error(`Failed to update commitment: ${error.message}`)
  return commitmentFromDb(data)
}
async function cloudCommitmentDelete(id) {
  const { error } = await supabase.from('commitments').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete commitment: ${error.message}`)
}

export async function getCommitments() {
  if (USE_SUPABASE) {
    return cloudRead({
      mirror: 'commitments', table: 'commitments', fallback: [], label: 'getCommitments',
      run: async () => {
        const { data, error } = await supabase.from('commitments').select('*')
        if (error) throw error
        return (data || []).map(commitmentFromDb)
      },
    })
  }
  return (await lsGet('commitments')) ?? []
}
export async function addCommitment(c) {
  if (USE_SUPABASE) {
    // `cat` is NOT NULL in the DB, but a task can legitimately have no category
    // (we don't force a label anymore). Store '' — the UI reads that as "no
    // category" — so an uncategorized task still saves.
    // The id is generated here when the caller didn't supply one: commitments
    // use a text primary key, so a task created offline gets its final identity
    // immediately and never has to be re-keyed after it syncs.
    const row = {
      ...c,
      id: c.id || localId('c-'),
      cat: c.cat || '',
      createdAt: c.createdAt || new Date().toISOString(),
    }
    const { queued, result } = await cloudWrite(
      { table: 'commitments', op: 'insert', id: row.id, row },
      () => cloudCommitmentInsert(row),
    )
    const created = queued ? row : result
    await mirrorUpsert('commitments', created, 'id', true)
    return created
  }
  const all = (await lsGet('commitments')) ?? []
  await lsSet('commitments', [...all, c])
  return c
}
export async function updateCommitment(id, changes) {
  if (USE_SUPABASE) {
    const { queued, result } = await cloudWrite(
      { table: 'commitments', op: 'update', id, changes },
      () => cloudCommitmentUpdate(id, changes),
    )
    const updated = queued ? (await mirrorPatch('commitments', id, changes)) || { id, ...changes } : result
    if (!queued) await mirrorUpsert('commitments', updated)
    return updated
  }
  const all = (await lsGet('commitments')) ?? []
  const next = all.map(c => c.id===id ? { ...c, ...changes } : c)
  await lsSet('commitments', next)
  return next.find(c => c.id===id)
}
export async function deleteCommitment(id) {
  if (USE_SUPABASE) {
    await cloudWrite(
      { table: 'commitments', op: 'delete', id },
      () => cloudCommitmentDelete(id),
    )
    await mirrorRemove('commitments', id)
    return
  }
  const all = (await lsGet('commitments')) ?? []
  await lsSet('commitments', all.filter(c => c.id !== id))
}

// ── Vacations / time-off blocks ──────────────────────────────────
function vacationFromDb(row) {
  return { id: row.id, label: row.label, startDate: row.start_date, endDate: row.end_date }
}
async function cloudVacationInsert(v) {
  const { data, error } = await supabase.from('vacations')
    .insert({ id: v.id, label: v.label, start_date: v.startDate, end_date: v.endDate }).select().single()
  if (error) throw new Error(`Failed to add vacation: ${error.message}`)
  return vacationFromDb(data)
}
async function cloudVacationDelete(id) {
  const { error } = await supabase.from('vacations').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete vacation: ${error.message}`)
}

export async function getVacations() {
  if (USE_SUPABASE) {
    return cloudRead({
      mirror: 'vacations', table: 'vacations', fallback: [], label: 'getVacations',
      run: async () => {
        const { data, error } = await supabase.from('vacations').select('*')
        if (error) throw error
        return (data || []).map(vacationFromDb)
      },
    })
  }
  return (await lsGet('vacations')) ?? []
}
export async function addVacation(v) {
  if (USE_SUPABASE) {
    const row = { ...v, id: v.id || localId('vac-') }
    const { queued, result } = await cloudWrite(
      { table: 'vacations', op: 'insert', id: row.id, row },
      () => cloudVacationInsert(row),
    )
    const created = queued ? row : result
    await mirrorUpsert('vacations', created)
    return created
  }
  const all = (await lsGet('vacations')) ?? []
  await lsSet('vacations', [...all, v])
  return v
}
export async function deleteVacation(id) {
  if (USE_SUPABASE) {
    await cloudWrite({ table: 'vacations', op: 'delete', id }, () => cloudVacationDelete(id))
    await mirrorRemove('vacations', id)
    return
  }
  const all = (await lsGet('vacations')) ?? []
  await lsSet('vacations', all.filter(v => v.id !== id))
}

// ── Multi-day events (colored spans that don't block tasks) ──────
function eventFromDb(row) {
  return {
    id: row.id, label: row.label, startDate: row.start_date, endDate: row.end_date,
    allDay: row.all_day, startTime: row.start_time, endTime: row.end_time,
    color: row.color || '#7C9CBF', icon: row.icon || '',
  }
}
async function cloudEventInsert(e) {
  const { data, error } = await supabase.from('events').insert({
    id: e.id, label: e.label, start_date: e.startDate, end_date: e.endDate,
    all_day: e.allDay !== false, start_time: e.allDay === false ? (e.startTime || null) : null,
    end_time: e.allDay === false ? (e.endTime || null) : null,
    color: e.color || '#7C9CBF', icon: e.icon || null,
  }).select().single()
  if (error) throw new Error(`Failed to add event: ${error.message}`)
  return eventFromDb(data)
}
async function cloudEventDelete(id) {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete event: ${error.message}`)
}

export async function getEvents() {
  if (USE_SUPABASE) {
    return cloudRead({
      mirror: 'events', table: 'events', fallback: [], label: 'getEvents',
      run: async () => {
        const { data, error } = await supabase.from('events').select('*')
        if (error) throw error
        return (data || []).map(eventFromDb)
      },
    })
  }
  return (await lsGet('events')) ?? []
}
export async function addEvent(e) {
  if (USE_SUPABASE) {
    const row = { ...e, id: e.id || localId('ev-') }
    const { queued, result } = await cloudWrite(
      { table: 'events', op: 'insert', id: row.id, row },
      () => cloudEventInsert(row),
    )
    // The queued shape is normalized the same way eventFromDb would, so a
    // calendar band drawn offline looks identical once it syncs.
    const created = queued
      ? { ...row, allDay: row.allDay !== false, color: row.color || '#7C9CBF', icon: row.icon || '' }
      : result
    await mirrorUpsert('events', created)
    return created
  }
  const all = (await lsGet('events')) ?? []
  await lsSet('events', [...all, e])
  return e
}
export async function deleteEvent(id) {
  if (USE_SUPABASE) {
    await cloudWrite({ table: 'events', op: 'delete', id }, () => cloudEventDelete(id))
    await mirrorRemove('events', id)
    return
  }
  const all = (await lsGet('events')) ?? []
  await lsSet('events', all.filter(e => e.id !== id))
}

// ── Recurring Tasks (editable schedule templates) ───────────────
// One row per task. Every task is a plain "label"+"note" pair; "tag" is kept
// as an alias of "cat" on the returned object since some UI code reads either
// name. The table's `type` and `carry` columns are leftovers from the old
// Week-tab split (a week task kept its text in `text`, with a carry-forward
// flag) — the app no longer distinguishes the two, so reads ignore both and
// writes always send the one surviving shape. Rows still tagged 'week' from
// before read back as ordinary tasks: their text is already in `label`.
function recurringTaskFromDb(row) {
  return {
    id: row.id, days: row.days || [], cat: row.cat, tag: row.cat,
    startDate: row.start_date, endDate: row.end_date,
    label: row.label, note: row.note || '',
  }
}
export function recurringTaskToDb(task) {
  return {
    id: task.id, type: 'today', cat: task.cat || task.tag || 'lab',
    days: task.days || [], start_date: task.startDate || null, end_date: task.endDate || null,
    // `text` covers legacy week-shaped items still coming from the one-time
    // localStorage migration; everything in the app writes `label`.
    label: task.label != null ? task.label : (task.text || ''),
    note: task.note || null,
    carry: false,
  }
}
async function cloudRecurringInsert(task) {
  const { data, error } = await supabase.from('recurring_tasks').insert(recurringTaskToDb(task)).select().single()
  if (error) throw new Error(`Failed to add recurring task: ${error.message}`)
  return recurringTaskFromDb(data)
}
async function cloudRecurringUpdate(id, task) {
  const { data, error } = await supabase.from('recurring_tasks').update(recurringTaskToDb(task)).eq('id', id).select().single()
  if (error) throw new Error(`Failed to update recurring task: ${error.message}`)
  return recurringTaskFromDb(data)
}
async function cloudRecurringDelete(id) {
  const { error } = await supabase.from('recurring_tasks').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete recurring task: ${error.message}`)
}
async function cloudRecurringClear() {
  const { error } = await supabase.from('recurring_tasks').delete().not('id', 'is', null)
  if (error) throw new Error(`Failed to clear recurring tasks: ${error.message}`)
}

// A recurring row round-tripped through the DB shape, so a template created
// offline carries exactly the fields the rest of the app expects (notably the
// `tag` alias of `cat`, and normalized day/date defaults).
const recurringLocalShape = task => recurringTaskFromDb({ ...recurringTaskToDb(task), created_at: new Date().toISOString() })

export async function getRecurringTasks() {
  if (USE_SUPABASE) {
    return cloudRead({
      mirror: 'recurring_tasks', table: 'recurring_tasks', fallback: [], label: 'getRecurringTasks',
      run: async () => {
        const { data, error } = await supabase.from('recurring_tasks').select('*')
        if (error) throw error
        return (data || []).map(recurringTaskFromDb)
      },
    })
  }
  return (await lsGet('recurring_tasks_v2')) ?? []
}
export async function addRecurringTask(task) {
  if (USE_SUPABASE) {
    const row = { ...task, id: task.id || localId('r-') }
    const { queued, result } = await cloudWrite(
      { table: 'recurring_tasks', op: 'insert', id: row.id, row },
      () => cloudRecurringInsert(row),
    )
    const created = queued ? recurringLocalShape(row) : result
    await mirrorUpsert('recurring_tasks', created)
    return created
  }
  const all = (await lsGet('recurring_tasks_v2')) ?? []
  await lsSet('recurring_tasks_v2', [...all, task])
  return task
}
export async function updateRecurringTask(id, task) {
  if (USE_SUPABASE) {
    // A recurring update replaces the whole template rather than patching
    // fields, so it queues as an insert-shaped op keyed on the same id — the
    // coalescer then folds repeated edits of one template into a single write.
    const row = { ...task, id }
    const { queued, result } = await cloudWrite(
      { table: 'recurring_tasks', op: 'update', id, changes: row },
      () => cloudRecurringUpdate(id, row),
    )
    const updated = queued ? recurringLocalShape(row) : result
    await mirrorUpsert('recurring_tasks', updated)
    return updated
  }
  const all = (await lsGet('recurring_tasks_v2')) ?? []
  const next = all.map(t => t.id===id ? task : t)
  await lsSet('recurring_tasks_v2', next)
  return task
}
export async function deleteRecurringTask(id) {
  if (USE_SUPABASE) {
    await cloudWrite({ table: 'recurring_tasks', op: 'delete', id }, () => cloudRecurringDelete(id))
    await mirrorRemove('recurring_tasks', id)
    return
  }
  const all = (await lsGet('recurring_tasks_v2')) ?? []
  await lsSet('recurring_tasks_v2', all.filter(t => t.id !== id))
}
export async function clearRecurringTasks() {
  if (USE_SUPABASE) {
    await cloudWrite({ table: 'recurring_tasks', op: 'clear', id: '*' }, () => cloudRecurringClear())
    await mirrorPut('recurring_tasks', [])
    return
  }
  await lsSet('recurring_tasks_v2', [])
}

// ── Categories (shared task categories — user-editable) ─────────
// Real per-row table. Commitments and recurring tasks both reference a
// category by id, so making these first-class rows means adding/renaming/
// recoloring one is a single atomic operation and shows up everywhere.
function categoryFromDb(row) {
  return { id: row.id, label: row.label, color: row.color, icon: row.icon || '', sortOrder: row.sort_order }
}
// Category changes map to explicit column names, so the mapping is shared by
// the online path and by outbox replay rather than being rebuilt in each.
function categoryChangesToDb(changes) {
  const out = {}
  if ('label' in changes)     out.label = changes.label
  if ('color' in changes)     out.color = changes.color
  if ('icon' in changes)      out.icon = changes.icon || null
  if ('sortOrder' in changes) out.sort_order = changes.sortOrder
  return out
}
async function cloudCategoryInsert(cat) {
  const { data, error } = await supabase.from('categories')
    .insert({ id: cat.id, label: cat.label, color: cat.color, icon: cat.icon || null, sort_order: cat.sortOrder ?? 0 }).select().single()
  if (error) throw new Error(`Failed to add category: ${error.message}`)
  return categoryFromDb(data)
}
async function cloudCategoryUpdate(id, changes) {
  const { data, error } = await supabase.from('categories').update(categoryChangesToDb(changes)).eq('id', id).select().single()
  if (error) throw new Error(`Failed to update category: ${error.message}`)
  return categoryFromDb(data)
}
async function cloudCategoryDelete(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete category: ${error.message}`)
}

export async function getCategories() {
  if (USE_SUPABASE) {
    return cloudRead({
      mirror: 'categories', table: 'categories', fallback: [], label: 'getCategories',
      run: async () => {
        const { data, error } = await supabase.from('categories').select('*').order('sort_order')
        if (error) throw error
        return (data || []).map(categoryFromDb)
      },
    })
  }
  return (await lsGet('categories')) ?? []
}
export async function addCategory(cat) {
  if (USE_SUPABASE) {
    const row = { ...cat, id: cat.id || localId('cat-'), icon: cat.icon || '', sortOrder: cat.sortOrder ?? 0 }
    const { queued, result } = await cloudWrite(
      { table: 'categories', op: 'insert', id: row.id, row },
      () => cloudCategoryInsert(row),
    )
    const created = queued ? row : result
    await mirrorUpsert('categories', created)
    return created
  }
  const all = (await lsGet('categories')) ?? []
  await lsSet('categories', [...all, cat])
  return cat
}
export async function updateCategory(id, changes) {
  if (USE_SUPABASE) {
    const { queued, result } = await cloudWrite(
      { table: 'categories', op: 'update', id, changes },
      () => cloudCategoryUpdate(id, changes),
    )
    const updated = queued ? (await mirrorPatch('categories', id, changes)) || { id, ...changes } : result
    if (!queued) await mirrorUpsert('categories', updated)
    return updated
  }
  const all = (await lsGet('categories')) ?? []
  const next = all.map(c => c.id===id ? { ...c, ...changes } : c)
  await lsSet('categories', next)
  return next.find(c => c.id===id)
}
export async function deleteCategory(id) {
  if (USE_SUPABASE) {
    await cloudWrite({ table: 'categories', op: 'delete', id }, () => cloudCategoryDelete(id))
    await mirrorRemove('categories', id)
    return
  }
  const all = (await lsGet('categories')) ?? []
  await lsSet('categories', all.filter(c => c.id !== id))
}

// ── Outbox replay ───────────────────────────────────────────────
// The one function that knows how to send a queued write to the cloud. It runs
// once per op, oldest first, when the connection returns — see src/lib/offline.js.
//
// Every branch calls the same raw cloud helper the online path uses, so a write
// made offline lands exactly as it would have if the network had been there.
// Throwing a transport error keeps the op (and everything after it) queued;
// throwing anything else discards it, so the queue can never wedge behind one
// permanently-rejected write.

// Two rejections are not really failures when replaying an edit made minutes or
// days ago, and treating them as such would discard the user's work for nothing:
//   • PGRST116 — "no rows": the row was deleted elsewhere, so an update or a
//     delete of it has already achieved what it was asking for.
//   • 23505 — duplicate key: an insert that in fact reached the server before
//     the connection dropped. The row exists; that's the desired end state.
const MISSING_ROW = 'PGRST116'
const DUPLICATE_KEY = '23505'
async function tolerate(codes, run) {
  try { return await run() }
  catch (e) {
    const code = (e && (e.code || e.details?.code)) || ''
    const msg = String((e && e.message) || '')
    if (codes.includes(code) || codes.some(c => msg.includes(c))) return null
    if (codes.includes(MISSING_ROW) && /no rows|0 rows|results contain 0 rows/i.test(msg)) return null
    if (codes.includes(DUPLICATE_KEY) && /duplicate key|already exists/i.test(msg)) return null
    throw e
  }
}

if (USE_SUPABASE) registerReplay(async op => {
  switch (op.table) {
    case 'kv_store': {
      await cloudKvSet(op.row.key, op.row.value)
      // Now that the value really is in the cloud, record its signature so the
      // next identical save is correctly skipped.
      wsigSet(op.row.key, stableSignature(JSON.stringify(op.row.value)))
      return
    }
    case 'task_completions':
      return cloudCompletionSet(op.row.storageKey, op.row.done)

    case 'log_entries':
      if (op.op === 'insert') return tolerate([DUPLICATE_KEY], () => cloudLogInsert(op.row))
      return cloudLogDelete(op.id)

    case 'commitments':
      if (op.op === 'insert') return tolerate([DUPLICATE_KEY], () => cloudCommitmentInsert(op.row))
      if (op.op === 'update') return tolerate([MISSING_ROW], () => cloudCommitmentUpdate(op.id, op.changes))
      return cloudCommitmentDelete(op.id)

    case 'vacations':
      if (op.op === 'insert') return tolerate([DUPLICATE_KEY], () => cloudVacationInsert(op.row))
      return cloudVacationDelete(op.id)

    case 'events':
      if (op.op === 'insert') return tolerate([DUPLICATE_KEY], () => cloudEventInsert(op.row))
      return cloudEventDelete(op.id)

    case 'recurring_tasks':
      if (op.op === 'insert') return tolerate([DUPLICATE_KEY], () => cloudRecurringInsert(op.row))
      if (op.op === 'update') return tolerate([MISSING_ROW], () => cloudRecurringUpdate(op.id, op.changes))
      if (op.op === 'clear')  return cloudRecurringClear()
      return cloudRecurringDelete(op.id)

    case 'categories':
      if (op.op === 'insert') return tolerate([DUPLICATE_KEY], () => cloudCategoryInsert(op.row))
      if (op.op === 'update') return tolerate([MISSING_ROW], () => cloudCategoryUpdate(op.id, op.changes))
      return cloudCategoryDelete(op.id)

    case 'classes':
      if (op.op === 'insert') return tolerate([DUPLICATE_KEY], () => cloudClassInsert(op.row))
      return cloudClassDelete(op.id)

    case 'study_weeks':
      if (op.op === 'insert') return tolerate([DUPLICATE_KEY], () => cloudWeekInsert(op.row))
      return cloudWeekDelete(op.id)

    case 'flashcards':
      if (op.op === 'upsert-many') return cloudCardsUpsert(op.row.cards)
      if (op.op === 'upsert') {
        const { error } = await supabase.from('flashcards').upsert(op.row, { onConflict: 'id' })
        if (error) throw error
        return
      }
      return cloudCardDelete(op.id)

    case 'study_files':
      if (op.op === 'upload') return tolerate([DUPLICATE_KEY], () => cloudFileUpload(op.row))
      return cloudFileDelete(op.id, op.row && op.row.storagePath)

    default:
      // An op from a newer version of the app than this tab is running. Skipping
      // it is safer than guessing; the newer tab will replay it correctly.
      console.warn('[storage] unknown queued write, skipping:', op.table, op.op)
      return
  }
})
