// src/lib/presence.js
// ─────────────────────────────────────────────────────────────
// The heartbeat that knows when you were last here.
//
// It is one number — the moment the app last had your attention — kept in
// localStorage (instant, works offline, survives a refresh) and mirrored to a
// synced kv_store row so it follows you between devices. That mirroring is the
// whole reason the cloud copy exists: an evening spent in the app on a laptop
// must not read as ten hours of absence when the phone is opened next morning.
//
// The heartbeat only beats while the tab is visible AND you have touched it
// recently. Both halves matter: a beat that ticked on in a background tab —
// or in a window left open on a desk for three days — would quietly erase
// exactly the absence it exists to notice, which is the one case this whole
// feature is for.
//
// Alongside it rides `handled`: the id of the last absence you answered or
// declined, so neither is ever asked about twice — and `visits`, a short
// history of when you were here ([start, end] pairs, newest last), so logging a
// stretch by hand can show you a calendar of when you were last around.
// ─────────────────────────────────────────────────────────────
import { getWellnessPresence, setWellnessPresence } from './storage.js'

const KEY = 'bloom_presence'
// How often a visible tab writes the beat. Frequent enough that a crash loses
// only a few minutes of "I was here", rare enough to be free.
const BEAT_MS = 3 * 60 * 1000
// The cloud row is written at most this often (and on the way out), so a long
// session isn't a stream of network writes.
const PUSH_MS = 10 * 60 * 1000
// How long an untouched window still counts as you being here. Past this, an
// open tab is furniture, not attention, and the beat stops.
const IDLE_MS = 30 * 60 * 1000

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    return (v && typeof v === 'object') ? v : null
  } catch { return null }
}
function writeLocal(v) { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch {} }

// ── Visit history ──────────────────────────────────────────────
// Beats closer together than this are one visit. Just past the idle cut-off,
// so a visit only ends when the heartbeat itself stopped.
const VISIT_JOIN_MS = IDLE_MS + 5 * 60 * 1000
// Kept for as far back as a stretch can be logged, and no further.
const VISIT_KEEP_MS = 90 * 86400000
const VISIT_MAX = 600

function cleanVisits(v) {
  return (Array.isArray(v) ? v : [])
    .filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] >= p[0])
    .map(p => [p[0], p[1]])
}
// One beat at `now`: stretches the visit it belongs to, or starts a new one.
export function addVisitBeat(visits, now) {
  const v = cleanVisits(visits)
  const last = v[v.length - 1]
  if (last && now >= last[0] && now - last[1] <= VISIT_JOIN_MS) last[1] = Math.max(last[1], now)
  else v.push([now, now])
  return pruneVisits(v, now)
}
function pruneVisits(v, now) {
  const keep = v.filter(p => p[1] >= now - VISIT_KEEP_MS)
  return keep.length > VISIT_MAX ? keep.slice(keep.length - VISIT_MAX) : keep
}
// Two devices' histories, as one: every visit from both, overlapping ones
// (or ones close enough to be the same sitting) joined.
export function mergeVisits(a, b, now = Date.now()) {
  const all = [...cleanVisits(a), ...cleanVisits(b)].sort((x, y) => x[0] - y[0])
  const out = []
  for (const p of all) {
    const last = out[out.length - 1]
    if (last && p[0] - last[1] <= VISIT_JOIN_MS) last[1] = Math.max(last[1], p[1])
    else out.push([p[0], p[1]])
  }
  return pruneVisits(out, now)
}

// The newer of two presence records, field by field: whichever device was here
// last wins the beat, and an absence answered anywhere counts as answered.
export function mergePresence(a, b) {
  const x = a || {}, y = b || {}
  const seen = Math.max(Number(x.seen) || 0, Number(y.seen) || 0)
  const at = (Number(x.handledAt) || 0) >= (Number(y.handledAt) || 0) ? x : y
  return { seen, handled: at.handled || null, handledAt: Number(at.handledAt) || 0, visits: mergeVisits(x.visits, y.visits) }
}

let state = { seen: 0, handled: null, handledAt: 0, visits: [] }
let lastPush = 0
let lastTouch = 0
let timer = null

// Pull the local record, then fold in the cloud one. Returns the record as it
// stood when the app opened — the only witness to how long you were gone, so
// read it BEFORE startPresence() writes this visit over it.
export async function loadPresence() {
  state = mergePresence(readLocal(), null)
  try {
    const cloud = await getWellnessPresence()
    if (cloud) {
      state = mergePresence(state, cloud)
      writeLocal(state)
    }
  } catch {}
  return { ...state }
}

function push(force = false) {
  const now = Date.now()
  if (!force && now - lastPush < PUSH_MS) return
  lastPush = now
  Promise.resolve(setWellnessPresence(state)).catch(() => {})
}

// "I'm here." Called on load, on a beat, and on every sign of life — so it is
// throttled: a pointer-down per second doesn't need a pointer-down per second
// of localStorage writes, and a few seconds' resolution is far finer than any
// rule measured in hours.
const TOUCH_MS = 30 * 1000
export function touchPresence(force = false) {
  const now = Date.now()
  if (!force && now - (state.seen || 0) < TOUCH_MS) return
  state = { ...state, seen: now, visits: addVisitBeat(state.visits, now) }
  writeLocal(state)
  push(force)
}

// When you've been here lately, as [start, end] pairs (newest last).
export function getVisits() { return cleanVisits(state.visits) }

// Remember that an absence was answered — or declined — and start the clock
// again from now, so neither answer leaves the blob asking twice.
export function markAbsenceHandled(id) {
  state = { ...state, handled: id || null, handledAt: Date.now(), seen: Date.now() }
  writeLocal(state)
  push(true)
}

// Start beating. Returns a stop function (the effect's cleanup).
export function startPresence() {
  stopPresence()
  lastTouch = Date.now()
  touchPresence(true)
  const onHere = () => { if (!isHidden()) here() }
  const onLeave = () => push(true)
  timer = setInterval(() => { if (!isHidden() && Date.now() - lastTouch < IDLE_MS) touchPresence() }, BEAT_MS)
  document.addEventListener('visibilitychange', onHere)
  window.addEventListener('focus', onHere)
  window.addEventListener('pointerdown', onHere, { passive: true })
  window.addEventListener('keydown', onHere, { passive: true })
  window.addEventListener('pagehide', onLeave)
  return () => {
    stopPresence()
    document.removeEventListener('visibilitychange', onHere)
    window.removeEventListener('focus', onHere)
    window.removeEventListener('pointerdown', onHere)
    window.removeEventListener('keydown', onHere)
    window.removeEventListener('pagehide', onLeave)
  }
}
// You did something — that is the beat that counts.
function here() { lastTouch = Date.now(); touchPresence() }
// The very first beat of a visit is written whatever the throttle says — it is
// the one that closes the gap the arrival check just measured.

function stopPresence() { if (timer) { clearInterval(timer); timer = null } }
function isHidden() { try { return document.hidden } catch { return false } }
