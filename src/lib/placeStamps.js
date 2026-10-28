// src/lib/placeStamps.js
// Arrivals and departures (place_events rows, see lib/placeHooks.js) turned
// into each item's start and end for a day. Kept apart from placeHooks.js so it
// has no storage imports and can be tested on its own.

const localDay = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// Events → { 'id@YYYY-MM-DD': { start, end } } in epoch ms, by your local day.
// A day runs from its first arrival to its last departure, so stepping out for
// lunch doesn't end it; while the latest event is an arrival you're still
// there (end: null). A departure with no arrival before it that day is
// ignored — there's nothing for it to end.
export function placeStamps(events) {
  const out = {}
  for (const ev of events || []) {
    const at = Date.parse(ev.at)
    if (!Number.isFinite(at) || !ev.task_id) continue
    const key = `${ev.task_id}@${localDay(at)}`
    const cur = out[key]
    if (ev.kind === 'arrive') {
      if (!cur) out[key] = { start: at, end: null }
      else cur.end = null
    } else if (ev.kind === 'leave' && cur) {
      cur.end = at
    }
  }
  return out
}
