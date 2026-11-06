// src/lib/locationCheck.js
// ─────────────────────────────────────────────────────────────
// Does where you were line up with what you planned?
//
// A task with a place (Weyand lab meeting → Mayo Clinic) has a window: its
// time to its time + duration. Once the window is over and the task isn't
// ticked, Bloom looks at what it knows about where you were:
//
//   • there     — a check-in, a stop, or the open app put you at the place
//                 at some point in the window. Nothing to do.
//   • elsewhere — Bloom saw you somewhere else during it: a check-in or app
//                 sighting away from the place, or a stop at another named
//                 place (Home) that covers the whole window. The task goes to
//                 the inbox.
//   • unknown   — no sighting either way (phone off, a place with no
//                 automation). Bloom asks "Did you do it?" instead of guessing.
//
// It also spots tasks that keep happening at the same named place, so it can
// offer to give them that place (you confirm first).
//
// Pure: tested in tests/locationCheck.test.mjs.
// ─────────────────────────────────────────────────────────────
import { distanceMeters, DEFAULT_RADIUS_M } from './geofence.js'

// A check-in carries no accuracy and indoor GPS wanders; allow for it.
export const PLACE_SLACK_M = 50
// A task with a time but no duration is given this long to happen.
export const DEFAULT_TASK_MINS = 30
// Only the last couple of days are reviewed: older misses are history.
export const REVIEW_DAYS = 2

const ok = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
export function atPlace(pt, place) {
  if (!ok(pt) || !ok(place)) return false
  return distanceMeters(pt, place) <= (place.radius || DEFAULT_RADIUS_M) + PLACE_SLACK_M
}

// Where you were during [a, b).
//   stops:  [{ lat, lng, start, end, key, name }]  check-in stops (end null = ongoing)
//   points: [{ lat, lng, at, name? }]               single sightings: check-ins, app fixes
//   stays:  [{ lat, lng, start, end, name }]        what the open app saw
// → { status: 'there' | 'elsewhere' | 'unknown', seen: { name, at } | null }
export function whereDuring(place, a, b, { stops = [], points = [], stays = [] } = {}, now = Date.now()) {
  const spans = [...stops, ...stays].map(s => ({ ...s, end: s.end ?? now }))
  const overlapping = spans.filter(s => s.start < b && s.end > a)
  const inWindow = points.filter(p => p.at >= a && p.at < b)
  const seenThere = overlapping.find(s => atPlace(s, place)) || inWindow.find(p => atPlace(p, place))
  if (seenThere) return { status: 'there', seen: { name: seenThere.name || place.name || '', at: seenThere.at ?? seenThere.start } }
  // A sighting during the window, away from the place: a check-in, or the open
  // app (a stay is a run of sightings, so any overlap is one).
  const away = inWindow.find(p => !atPlace(p, place))
    || stays.map(s => ({ ...s, end: s.end ?? now })).find(s => s.start < b && s.end > a)
  if (away) return { status: 'elsewhere', seen: { name: away.name || '', at: away.at ?? Math.max(away.start, a), lat: away.lat, lng: away.lng } }
  // Or you'd checked in at another named place and didn't leave it for the
  // whole window (its Leave automation would have said so).
  const stayedPut = stops.find(s => s.key && s.start <= a && (s.end ?? now) >= b && !atPlace(s, place))
  if (stayedPut) return { status: 'elsewhere', seen: { name: stayedPut.name || '', at: a, lat: stayedPut.lat, lng: stayedPut.lng } }
  return { status: 'unknown', seen: null }
}

// tasks: [{ key, id, date, title, startMs, endMs, place, done }] — located tasks.
// decided(key) → true once moved, answered or kept.
// → [{ ...task, status, seen, action: 'inbox' | 'ask' }] for tasks whose
//   window is over, not done, not decided, from the last REVIEW_DAYS days.
export function reviewLocatedTasks(tasks, evidence, { now = Date.now(), decided = () => false } = {}) {
  const oldest = now - REVIEW_DAYS * 86400000
  const out = []
  for (const t of tasks || []) {
    if (!t || t.done || !ok(t.place) || !Number.isFinite(t.startMs)) continue
    const end = t.endMs ?? t.startMs + DEFAULT_TASK_MINS * 60000
    if (end > now || end < oldest || decided(t.key)) continue
    const w = whereDuring(t.place, t.startMs, end, evidence, now)
    if (w.status === 'there') continue
    out.push({ ...t, endMs: end, status: w.status, seen: w.seen, action: w.status === 'elsewhere' ? 'inbox' : 'ask' })
  }
  return out.sort((x, y) => x.startMs - y.startMs)
}

// Today's located tasks, each with how it lines up so far:
// 'there' | 'elsewhere' | 'unknown' | 'upcoming' | 'now'.
export function lineUp(tasks, evidence, now = Date.now()) {
  return (tasks || []).filter(t => ok(t.place) && Number.isFinite(t.startMs)).map(t => {
    const end = t.endMs ?? t.startMs + DEFAULT_TASK_MINS * 60000
    if (t.startMs > now) return { ...t, endMs: end, status: 'upcoming', seen: null }
    const w = whereDuring(t.place, t.startMs, Math.min(end, now), evidence, now)
    if (end > now && w.status !== 'there') return { ...t, endMs: end, status: 'now', seen: w.seen }
    return { ...t, endMs: end, ...w }
  }).sort((a, b) => a.startMs - b.startMs)
}

// Tasks that keep happening at one of your named places.
//   occurrences: [{ taskId, title, startMs, endMs }] past windows of tasks
//                with no place.
//   places:      [{ name, lat, lng, radius? }] your named places.
// A task is suggested when it was seen at the same place at least `min` times
// and at least 80% of the times Bloom saw it anywhere — or when its title
// names one of your places ("Gym" → Gym).
export function suggestTaskPlaces(occurrences, places, evidence, { now = Date.now(), min = 2 } = {}) {
  const named = (places || []).filter(p => ok(p) && (p.name || '').trim())
  const byTask = new Map()
  for (const o of occurrences || []) {
    const cur = byTask.get(o.taskId) || { taskId: o.taskId, title: o.title, seen: 0, at: new Map() }
    const end = o.endMs ?? o.startMs + DEFAULT_TASK_MINS * 60000
    let seenHere = false, seenAnywhere = false
    for (const p of named) {
      const w = whereDuring(p, o.startMs, end, evidence, now).status
      if (w === 'there') { seenHere = true; cur.at.set(p.name, { place: p, n: (cur.at.get(p.name)?.n || 0) + 1 }) }
      if (w !== 'unknown') seenAnywhere = true
    }
    if (seenHere || seenAnywhere) cur.seen++
    byTask.set(o.taskId, cur)
  }
  const out = []
  for (const t of byTask.values()) {
    const best = [...t.at.values()].sort((a, b) => b.n - a.n)[0]
    if (best && best.n >= min && best.n / Math.max(1, t.seen) >= 0.8) {
      out.push({ taskId: t.taskId, title: t.title, place: best.place, times: best.n, why: 'history' })
      continue
    }
    const words = ` ${(t.title || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')} `
    const hit = named.find(p => {
      const n = p.name.split(',')[0].trim().toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim()
      return n.length >= 3 && words.includes(` ${n} `)
    })
    if (hit) out.push({ taskId: t.taskId, title: t.title, place: hit, times: 0, why: 'name' })
  }
  return out
}
