// src/lib/ical.js
// ─────────────────────────────────────────────────────────────
// A small, dependency-free iCalendar (.ics) parser — just enough to turn a
// published Apple Family / iCloud calendar feed into events Bloom can show.
//
// It reads VEVENTs (summary, start/end, all-day vs timed) and expands the
// common recurrence rules (daily / weekly / monthly / yearly, with INTERVAL,
// COUNT, UNTIL and weekly BYDAY) across a bounded window so repeating family
// events — practices, birthdays, weekly dinners — show up too. EXDATE'd
// occurrences are dropped.
//
// Times are read as wall-clock: a value tagged with a TZID (or a floating time)
// is taken at face value, and only an explicit UTC "Z" time is converted to the
// viewer's local zone. That's exact when you and the calendar's owner share a
// timezone (the family case) and off by the offset otherwise — a deliberate
// trade to avoid shipping a full timezone database.
// ─────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0')
const dateStr = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

// Unfold folded lines (a CRLF followed by a space or tab continues the line),
// then split into logical lines.
function unfold(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')   // continuation → join
    .split('\n')
}

// "DTSTART;TZID=America/New_York:20260815T090000" →
//   { name:'DTSTART', params:{ TZID:'America/New_York' }, value:'20260815T090000' }
function parseLine(line) {
  const colon = line.indexOf(':')
  if (colon === -1) return null
  const head = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const parts = head.split(';')
  const name = parts[0].toUpperCase()
  const params = {}
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=')
    if (eq === -1) continue
    params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1)
  }
  return { name, params, value }
}

function unescapeText(v) {
  return (v || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

// Parse a DATE or DATE-TIME value into a normalized shape.
//   "20260815"            → { y,m,d, allDay:true }
//   "20260815T090000"     → { y,m,d, hh,mm } (wall-clock / TZID — taken as-is)
//   "20260815T130000Z"    → converted from UTC to the viewer's local time
function parseDt(value, params = {}) {
  const v = (value || '').trim()
  const isDateOnly = (params.VALUE === 'DATE') || /^\d{8}$/.test(v)
  if (isDateOnly) {
    return { y: +v.slice(0, 4), m: +v.slice(4, 6), d: +v.slice(6, 8), allDay: true }
  }
  const mo = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/)
  if (!mo) return null
  let [, Y, M, D, h, mi, , z] = mo
  Y = +Y; M = +M; D = +D; h = +h; mi = +mi
  if (z) {
    // UTC → local wall time via the device's timezone.
    const dt = new Date(Date.UTC(Y, M - 1, D, h, mi, 0))
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(), hh: dt.getHours(), mm: dt.getMinutes() }
  }
  return { y: Y, m: M, d: D, hh: h, mm: mi }
}

// A day-count since an epoch for cheap date stepping (no DST worries — we only
// ever move by whole days and re-derive Y/M/D from a noon Date).
function toDate(y, m, d) { return new Date(y, m - 1, d, 12, 0, 0) }
function ymd(dt) { return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() } }

const WEEKDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

// Parse an RRULE value string into a small object.
function parseRRule(v) {
  const out = {}
  for (const kv of (v || '').split(';')) {
    const [k, val] = kv.split('=')
    if (!k || val == null) continue
    out[k.toUpperCase()] = val
  }
  return out
}

// Expand a recurring event's start dates within [winStart, winEnd] (Date
// objects). Returns an array of {y,m,d} start days. Bounded hard so a malformed
// or endless rule can't run away.
function expandStarts(anchor, rrule, winStart, winEnd) {
  const rule = parseRRule(rrule)
  const freq = (rule.FREQ || '').toUpperCase()
  const interval = Math.max(1, parseInt(rule.INTERVAL || '1', 10) || 1)
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : null
  let until = null
  if (rule.UNTIL) {
    const u = parseDt(rule.UNTIL)
    if (u) until = toDate(u.y, u.m, u.d)
  }
  const byDay = rule.BYDAY ? rule.BYDAY.split(',').map(s => WEEKDAY[s.slice(-2).toUpperCase()]).filter(n => n != null) : null

  const out = []
  const MAX = 1000               // absolute safety cap on generated occurrences
  let produced = 0
  const start = toDate(anchor.y, anchor.m, anchor.d)

  const push = (dt) => {
    if (until && dt > until) return false
    if (dt >= winStart && dt <= winEnd) out.push(ymd(dt))
    return true
  }

  if (freq === 'WEEKLY' && byDay && byDay.length) {
    // Walk week by week from the anchor's week; emit each selected weekday.
    const weekStart = new Date(start); weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    let w = 0
    for (let guard = 0; guard < 520 && produced < MAX; guard++, w++) {
      const base = new Date(weekStart); base.setDate(base.getDate() + w * 7 * interval)
      if (base > winEnd && (!until || base > until)) break
      for (const wd of byDay) {
        const dt = new Date(base); dt.setDate(dt.getDate() + wd)
        if (dt < start) continue
        if (count != null && produced >= count) break
        if (until && dt > until) { guard = 999; break }
        produced++
        push(dt)
      }
      if (count != null && produced >= count) break
    }
    return out
  }

  // Simple stepped frequencies (and weekly without BYDAY).
  const stepDays = { DAILY: 1, WEEKLY: 7 }[freq]
  let cur = new Date(start)
  for (let guard = 0; guard < 3000 && produced < MAX; guard++) {
    if (count != null && produced >= count) break
    if (until && cur > until) break
    if (cur > winEnd) break
    produced++
    push(cur)
    if (stepDays) cur.setDate(cur.getDate() + stepDays * interval)
    else if (freq === 'MONTHLY') cur.setMonth(cur.getMonth() + interval)
    else if (freq === 'YEARLY') cur.setFullYear(cur.getFullYear() + interval)
    else break   // unknown/unsupported freq → treat as single
  }
  return out
}

// Parse a whole .ics document into flat, Bloom-shaped events within a window
// around today. Each event: { uid, summary, startDate, endDate, allDay,
// startTime, endTime, location }. Multi-day all-day spans keep an inclusive
// endDate. Recurring events are expanded into one entry per occurrence.
export function parseICS(text, { pastDays = 60, futureDays = 400 } = {}) {
  const lines = unfold(text || '')
  const now = new Date()
  const winStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - pastDays, 12)
  const winEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + futureDays, 12)

  const events = []
  let cur = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { exdates: new Set() }; continue }
    if (line === 'END:VEVENT') {
      if (cur && cur.start) finalizeEvent(cur, events, winStart, winEnd)
      cur = null
      continue
    }
    if (!cur) continue
    const p = parseLine(line)
    if (!p) continue
    switch (p.name) {
      case 'SUMMARY':     cur.summary = unescapeText(p.value); break
      case 'LOCATION':    cur.location = unescapeText(p.value); break
      case 'UID':         cur.uid = p.value.trim(); break
      case 'DTSTART':     cur.start = parseDt(p.value, p.params); break
      case 'DTEND':       cur.end = parseDt(p.value, p.params); break
      case 'DURATION':    cur.duration = p.value.trim(); break
      case 'RRULE':       cur.rrule = p.value.trim(); break
      case 'STATUS':      cur.status = p.value.trim().toUpperCase(); break
      case 'EXDATE': {
        const d = parseDt(p.value.split(',')[0], p.params)
        for (const one of p.value.split(',')) {
          const dd = parseDt(one, p.params)
          if (dd) cur.exdates.add(dateStr(dd.y, dd.m, dd.d))
        }
        break
      }
      default: break
    }
  }
  return events
}

// Turn one parsed VEVENT into 1..N Bloom events (expanding a recurrence rule).
function finalizeEvent(ev, out, winStart, winEnd) {
  if (ev.status === 'CANCELLED') return
  const start = ev.start
  const allDay = !!start.allDay
  const startTime = allDay ? null : `${pad(start.hh)}:${pad(start.mm)}`

  // Span length in whole days (for multi-day all-day events) and the end time.
  let spanDays = 0
  let endTime = null
  if (ev.end) {
    if (allDay) {
      // All-day DTEND is exclusive → the last covered day is DTEND minus a day.
      const s = toDate(start.y, start.m, start.d)
      const e = toDate(ev.end.y, ev.end.m, ev.end.d)
      spanDays = Math.max(0, Math.round((e - s) / 86400000) - 1)
    } else {
      endTime = `${pad(ev.end.hh)}:${pad(ev.end.mm)}`
      // A timed event that ends on a later date still anchors to its start day.
      const s = toDate(start.y, start.m, start.d)
      const e = toDate(ev.end.y, ev.end.m, ev.end.d)
      spanDays = Math.max(0, Math.round((e - s) / 86400000))
    }
  }

  const emit = (day) => {
    const sDate = dateStr(day.y, day.m, day.d)
    if (ev.exdates.has(sDate)) return
    const endDt = toDate(day.y, day.m, day.d); endDt.setDate(endDt.getDate() + spanDays)
    const e = ymd(endDt)
    out.push({
      uid: ev.uid || `${sDate}-${ev.summary || 'event'}`,
      summary: ev.summary || 'Busy',
      startDate: sDate,
      endDate: dateStr(e.y, e.m, e.d),
      allDay,
      startTime,
      endTime,
      location: ev.location || '',
    })
  }

  if (ev.rrule) {
    const starts = expandStarts(start, ev.rrule, winStart, winEnd)
    for (const day of starts) emit(day)
  } else {
    // Only include a one-off if it lands in (or spans into) the window.
    const s = toDate(start.y, start.m, start.d)
    const eDt = new Date(s); eDt.setDate(eDt.getDate() + spanDays)
    if (eDt >= winStart && s <= winEnd) emit({ y: start.y, m: start.m, d: start.d })
  }
}
