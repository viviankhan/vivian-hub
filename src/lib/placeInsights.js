// src/lib/placeInsights.js
// ─────────────────────────────────────────────────────────────
// Insights → Places: where your time went over a timeframe, from your stays
// (lib/visits.js getVisits — the iPhone check-ins at named places, plus what
// the open app saw) and the check-in stops at no named place ("Somewhere
// else": the bus, a walk, a place you haven't named yet).
//
// Pure: everything comes in as arguments, so it's tested on its own
// (tests/placeInsights.test.mjs).
// ─────────────────────────────────────────────────────────────

export const ELSEWHERE = 'Somewhere else'

const DAY = 86400000
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const keyOf = (t) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const keyStart = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime() }
const shortName = (n) => String(n || '').split(',')[0].trim()

// Split [a, b) at local midnights: [{ date, a, b }].
function byLocalDay(a, b) {
  const out = []
  for (let s = a; s < b;) {
    const next = startOfDay(s) + DAY + 3600000   // past any DST-length day…
    const e = Math.min(b, startOfDay(next))      // …then back to its midnight
    out.push({ date: keyOf(s), a: s, b: e })
    s = e
  }
  return out
}

// stays:     [{ name, start, end }]  (getVisits())
// elsewhere: [{ start, end }]         (check-in stops at no named place; end null = ongoing)
// checkins:  [{ ts, mood }]           (wellness mood check-ins)
// fromKey/toKey: YYYY-MM-DD, inclusive.
export function placeInsights({ stays = [], elsewhere = [], checkins = [], fromKey, toKey, now = Date.now() }) {
  const from = keyStart(fromKey), to = Math.min(keyStart(toKey) + DAY, now)
  const segs = []
  const add = (name, s, e) => {
    const a = Math.max(s, from), b = Math.min(e ?? now, to)
    if (b > a) segs.push({ name, start: s, a, b })
  }
  for (const s of stays) add(shortName(s.name) || ELSEWHERE, s.start, s.end)
  // Unnamed check-in stops only where no named stay already covers the time.
  const named = segs.slice()
  for (const s of elsewhere) {
    let pieces = [[Math.max(s.start, from), Math.min(s.end ?? now, to)]]
    for (const n of named) {
      pieces = pieces.flatMap(([a, b]) => (n.b <= a || n.a >= b) ? [[a, b]]
        : [[a, Math.min(b, n.a)], [Math.max(a, n.b), b]].filter(([x, y]) => y > x))
    }
    for (const [a, b] of pieces) segs.push({ name: ELSEWHERE, start: s.start, a, b })
  }
  segs.sort((x, y) => x.a - y.a)

  const places = new Map()
  const days = new Map()
  for (const g of segs) {
    const p = places.get(g.name) || { name: g.name, mins: 0, visits: new Set(), days: new Set(), moods: [] }
    p.mins += (g.b - g.a) / 60000
    p.visits.add(g.start)
    for (const d of byLocalDay(g.a, g.b)) {
      p.days.add(d.date)
      const day = days.get(d.date) || []
      day.push({ name: g.name, start: d.a, end: d.b, mins: (d.b - d.a) / 60000, ongoing: g.b >= now - 60000 && d.b === g.b })
      days.set(d.date, day)
    }
    places.set(g.name, p)
  }
  // Mood where you were when you logged it.
  for (const c of checkins) {
    const t = Date.parse(c.ts)
    if (c.mood == null || !Number.isFinite(t)) continue
    const g = segs.find(s => t >= s.a && t < s.b)
    if (g) places.get(g.name).moods.push(c.mood)
  }

  const list = [...places.values()].map(p => ({
    name: p.name,
    elsewhere: p.name === ELSEWHERE,
    mins: Math.round(p.mins),
    visits: p.visits.size,
    days: p.days.size,
    avgStayMins: Math.round(p.mins / Math.max(1, p.visits.size)),
    mood: p.moods.length ? Math.round(p.moods.reduce((a, b) => a + b, 0) / p.moods.length * 10) / 10 : null,
    moodCount: p.moods.length,
  })).sort((a, b) => b.mins - a.mins)

  const totalMins = list.reduce((a, p) => a + p.mins, 0)
  const top = list.find(p => !p.elsewhere) || null
  return {
    places: list,
    totalMins,
    namedMins: list.filter(p => !p.elsewhere).reduce((a, p) => a + p.mins, 0),
    top,
    byDay: [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, stops]) => ({ date, stops })),
  }
}
