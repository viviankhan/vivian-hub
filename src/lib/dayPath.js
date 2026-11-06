// src/lib/dayPath.js
// ─────────────────────────────────────────────────────────────
// A day's check-in stops as a person would tell it:
//
//   Heritage Manor Apartments   until 8:06 AM        8h 6m
//   On the way                  8:06 – 8:30 AM        24m   (via 2 stops)
//   Guggenheim Building         8:30 AM – now          55m
//
// • Stops are cut to the day.
// • Back-to-back stops with the same name are one stay.
// • A short stop at no place you've named (under TRAVEL_MINS) is travel:
//   runs of them become one "On the way" row that remembers what it passed.
//   A long one stays a row of its own, under its looked-up name.
//
// Pure: tested in tests/dayPath.test.mjs.
// ─────────────────────────────────────────────────────────────

export const TRAVEL_MINS = 15

// stops:  checkinStops() output [{ key, name, lat, lng, start, end }]
// nameOf: (lat, lng) → looked-up name or ''
export function dayPath(stops, { from, to, now = Date.now(), nameOf = () => '' } = {}) {
  const rows = []
  for (const s of stops || []) {
    const a = Math.max(s.start, from)
    const end = s.end ?? now
    const b = Math.min(end, to, now)
    if (b <= a && !(s.end == null && s.start < to && a <= now)) continue
    const named = !!s.key
    const label = named ? String(s.name || '').split(',')[0].trim() : (nameOf(s.lat, s.lng) || '')
    const mins = Math.max(0, Math.round((b - a) / 60000))
    rows.push({
      kind: !named && mins < TRAVEL_MINS ? 'travel' : 'stay',
      label: label || 'Unnamed spot', named, auto: !named && !!label,
      lat: s.lat, lng: s.lng,
      start: a, end: b, mins,
      fromBefore: s.start < from,
      ongoing: s.end == null && to > now,
      via: [],
    })
  }
  // The last stop is where you are: never travel, however short so far.
  if (rows.length && rows.at(-1).ongoing) rows.at(-1).kind = 'stay'

  const out = []
  for (const r of rows) {
    const prev = out.at(-1)
    if (prev && r.kind === 'stay' && prev.kind === 'stay' && prev.label === r.label) {
      Object.assign(prev, { end: r.end, mins: prev.mins + r.mins, ongoing: r.ongoing })
      continue
    }
    if (r.kind === 'travel') {
      const passed = r.label !== 'Unnamed spot' ? [r.label] : []
      if (prev?.kind === 'travel') {
        prev.end = r.end; prev.mins += r.mins
        for (const p of passed) if (!prev.via.includes(p)) prev.via.push(p)
        prev.stops++
        continue
      }
      out.push({ ...r, label: 'On the way', via: passed, stops: 1 })
      continue
    }
    out.push(r)
  }
  return out
}
