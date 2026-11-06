// src/lib/lifelog.js
// ─────────────────────────────────────────────────────────────
// The things you write down about your life, kept so they can be asked about
// later ("how did jogging feel?", "did I take my meds this week?", "when did I
// run out of Lexapro?").
//
//   • Day notes — what happened at one task on one day: how the jog felt, a
//     photo of the trail, your mood. Keyed `${date}_${taskId}` (the same key a
//     completion uses), so a daily task gets a fresh note every day instead of
//     one note shared by the whole series.
//   • Journal — loose thoughts, stamped with the time you wrote them and where
//     you were.
//   • Medications — which tasks are meds. A med auto-completes unless you
//     un-tick it; un-ticking asks how you're doing, and a note like "ran out
//     of X" is pinned to Today until you clear it.
//
// Each is one synced kv_store blob (like the wellness trackers), and photos
// are stored by id the same way (see photos.js), so a picture never bloats a
// blob. Every write also stamps where you were (from the visit log), so a
// thought or a skipped dose can later be tied to a place.
//
// The pure helpers at the top take everything as arguments for unit tests.
// ─────────────────────────────────────────────────────────────
import { dbGet, dbSet } from './storage.js'
import { getVisits, currentStay } from './visits.js'

export const LIFELOG_EVENT = 'bloom-lifelog'

// ── Pure ───────────────────────────────────────────────────────

export { noteKey, MED_ALERT_RE, isMedAlert, medAlerts } from './lifelogPure.js'
import { noteKey } from './lifelogPure.js'

// ── Synced blobs ───────────────────────────────────────────────

const state = { dayNotes: null, journal: null, medIds: null, cleared: null }
const loading = {}
const KEYS = { dayNotes: 'day_notes', journal: 'journal', medIds: 'med_tasks', cleared: 'med_alerts_cleared' }
const EMPTY = { dayNotes: () => ({}), journal: () => [], medIds: () => ({}), cleared: () => ({}) }

function emit() { try { window.dispatchEvent(new Event(LIFELOG_EVENT)) } catch {} }

async function load(name) {
  if (state[name]) return state[name]
  if (!loading[name]) {
    loading[name] = dbGet(KEYS[name]).then(v => {
      const ok = name === 'journal' ? Array.isArray(v) : (v && typeof v === 'object' && !Array.isArray(v))
      state[name] = ok ? v : EMPTY[name]()
      emit()   // anything that read the empty default (which tasks are meds) re-reads
      return state[name]
    }).catch(() => (state[name] = EMPTY[name]())).finally(() => { loading[name] = null })
  }
  return loading[name]
}
async function save(name, value) {
  state[name] = value
  emit()
  await dbSet(KEYS[name], value)
  return value
}

// Load everything once (cheap: four kv reads, batched by storage.js).
export async function loadLifelog() {
  await Promise.all(Object.keys(KEYS).map(load))
  return snapshot()
}
export function snapshot() {
  return {
    dayNotes: state.dayNotes || {}, journal: state.journal || [],
    medIds: state.medIds || {}, cleared: state.cleared || {},
  }
}

// Where you are right now, by name ('' if unknown) — stamped on what you write.
export function placeNow(now = Date.now()) {
  try {
    const s = currentStay(getVisits(), now)
    return s && s.name ? s.name.split(',')[0].trim() : ''
  } catch { return '' }
}

// ── Day notes ──────────────────────────────────────────────────

export async function getDayNote(date, taskId) {
  const all = await load('dayNotes')
  return all[noteKey(date, taskId)] || null
}
// Merge `patch` ({ text?, photos?, mood?, skipped? }) into one day's note.
// `meta` ({ title, time, durationMins }) records what the task was that day, so
// the note still reads right if the task is renamed or deleted later.
export async function setDayNote(date, taskId, patch, meta = {}) {
  const all = await load('dayNotes')
  const key = noteKey(date, taskId)
  const prev = all[key] || {}
  const now = new Date().toISOString()
  const next = { ...prev, ...patch, taskId, date, updatedAt: now }
  if (!prev.at) { next.at = now; const p = placeNow(); if (p) next.place = p }
  for (const k of ['title', 'time', 'durationMins']) if (meta[k] != null && meta[k] !== '') next[k] = meta[k]
  const empty = !(next.text || '').trim() && !(next.photos || []).length && !next.mood && !next.skipped && !next.takenAt
  const copy = { ...all }
  if (empty) delete copy[key]; else copy[key] = next
  await save('dayNotes', copy)
  return empty ? null : next
}

// ── Journal ────────────────────────────────────────────────────

export async function getJournal() { return load('journal') }
export async function addJournalEntry({ text = '', photos = [], mood = null } = {}) {
  const all = await load('journal')
  const entry = { id: 'j-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: new Date().toISOString(), text: text.trim(), photos }
  if (mood) entry.mood = mood
  const p = placeNow(); if (p) entry.place = p
  await save('journal', [entry, ...all])
  return entry
}
export async function deleteJournalEntry(id) {
  const all = await load('journal')
  await save('journal', all.filter(j => j.id !== id))
}

// ── Medications ────────────────────────────────────────────────

export async function getMedIds() { return load('medIds') }
export function isMedSync(taskId) { return !!(state.medIds && state.medIds[taskId]) }
export async function setMedTask(taskId, on) {
  const all = await load('medIds')
  if (!!all[taskId] === !!on) return all
  const copy = { ...all }
  if (on) copy[taskId] = true; else delete copy[taskId]
  return save('medIds', copy)
}
export async function clearMedAlert(id) {
  const all = await load('cleared')
  return save('cleared', { ...all, [id]: new Date().toISOString() })
}
