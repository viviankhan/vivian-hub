// src/lib/inbox.js
// ─────────────────────────────────────────────────────────────
// The inbox: tasks that still need doing but didn't happen when planned —
// Bloom saw you somewhere else during a task that has to happen at a place,
// or you told it "no, I didn't" when it asked. Each entry remembers what the
// task was, when and where it should have happened, and where you were.
//
// One synced kv blob, { items: [...], decided: { 'date_id': outcome } }.
// `decided` remembers every located task Bloom has already dealt with
// ('inbox' | 'done' | 'kept'), so nothing is moved or asked about twice.
// ─────────────────────────────────────────────────────────────
import { dbGet, dbSet } from './storage.js'

export const INBOX_EVENT = 'bloom-inbox'
const KEY = 'missed_inbox'

let state = null
let loading = null
const emit = () => { try { window.dispatchEvent(new Event(INBOX_EVENT)) } catch {} }
const clean = (v) => ({
  items: Array.isArray(v?.items) ? v.items : [],
  decided: v?.decided && typeof v.decided === 'object' ? v.decided : {},
})

export async function loadInbox() {
  if (state) return state
  if (!loading) loading = dbGet(KEY).then(v => { state = clean(v); emit(); return state })
    .catch(() => (state = clean(null))).finally(() => { loading = null })
  return loading
}
export function inboxSnapshot() { return state || clean(null) }

async function save(next) {
  state = next
  emit()
  await dbSet(KEY, next)
  return next
}

// Keep `decided` from growing forever: a fortnight is plenty to never re-ask.
function prune(decided, now = Date.now()) {
  const cutoff = new Date(now - 14 * 86400000).toISOString().slice(0, 10)
  return Object.fromEntries(Object.entries(decided).filter(([k]) => k.slice(0, 10) >= cutoff))
}

// Every change goes through one queue, so two at once (several tasks moved
// together) can't each read the old inbox and overwrite the other.
let chain = Promise.resolve()
function mutate(fn) {
  const run = chain.then(async () => save(fn(await loadInbox())))
  chain = run.catch(() => {})
  return run
}

export function decide(keys, outcome) {
  const list = Array.isArray(keys) ? keys : [keys]
  return mutate(cur => ({ ...cur, decided: prune({ ...cur.decided, ...Object.fromEntries(list.map(k => [k, outcome])) }) }))
}

// entry: { key, kind: 'recurring' | 'commitment', taskId, date, time, title,
//          cat, place: { name, lat, lng, radius }, seen: { name } | null, reason }
export function addToInbox(entry) {
  return mutate(cur => {
    if (cur.items.some(i => i.key === entry.key)) return cur
    const item = { id: 'ib-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: new Date().toISOString(), ...entry }
    return { items: [...cur.items, item], decided: prune({ ...cur.decided, [entry.key]: 'inbox' }) }
  })
}

export function removeFromInbox(id, outcome = null) {
  return mutate(cur => {
    const item = cur.items.find(i => i.id === id)
    const decided = item && outcome ? { ...cur.decided, [item.key]: outcome } : cur.decided
    return { items: cur.items.filter(i => i.id !== id), decided }
  })
}
