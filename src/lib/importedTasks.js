// src/lib/importedTasks.js
// ─────────────────────────────────────────────────────────────
// Turn the read-only events from a subscribed ("imported") calendar into the
// "unscheduled tasks with recommended times" the Today and Week views show.
//
// The recommendation depends on what the event already pins down:
//   • it already has a start time  → keep that time (nothing to recommend),
//     using its own start→end length, or a short default when it has no end;
//   • it's all-day / has no time    → recommend a start time by dropping it into
//     the first open gap of the day (within working hours), around the tasks
//     you've already scheduled.
//
// The events themselves are never edited — that stays one-way and read-only.
// Instead each occurrence has a stable identity (importedKey) so you can tick it
// off (a normal completion record) or ADOPT it into your own schedule, which
// copies it to a real commitment you own and can move around freely.
// ─────────────────────────────────────────────────────────────

const DEFAULT_ALLDAY_MINS = 60   // assumed length for an all-day / untimed import
const DEFAULT_TIMED_MINS  = 30   // assumed length for a timed import with no end
const WORK_START = 8 * 60        // recommend within 8:00 AM …
const WORK_END   = 22 * 60       // … 10:00 PM

export function hhmmToMins(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
export function minsToHHMM(m) {
  const h = Math.floor(m / 60), mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
export function fmt12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// Stable identity for one imported occurrence — used both for its completion
// record and for the adoption map, so a tick or an "added to my schedule" mark
// survives re-parsing the feed (which reshuffles array indices) and syncs across
// devices. Built from the calendar + the event's UID + its start day.
export function importedKey(span) {
  return `imp:${span.calendarId}:${span.uid || span.label || 'e'}:${span.startDate}`
}

// The event's own length in minutes, when it exposes both a start and end time.
export function derivedDuration(span) {
  const s = hhmmToMins(span.startTime), e = hhmmToMins(span.endTime)
  if (s != null && e != null && e > s) return e - s
  return null
}

// The length we treat the import as taking: its real duration if it has one,
// else a short default for a timed event or a longer one for an all-day block.
export function assumedDuration(span) {
  return derivedDuration(span) || (span.startTime ? DEFAULT_TIMED_MINS : DEFAULT_ALLDAY_MINS)
}

// Whether the event already pins down its own clock time (a timed event does;
// an all-day one doesn't).
export function isTimed(span) {
  return !span.allDay && !!span.startTime
}

// The imported spans covering a given day, from an already visibility-filtered
// set of spans (App only hands over spans from enabled calendars).
export function importedOn(spans, dateStr) {
  return (spans || []).filter(ev => dateStr >= ev.startDate && dateStr <= ev.endDate)
}

// Recommend a start time on a day: the first open gap of at least
// `durationMins`, inside working hours, that clears the day's already-timed
// items. `occupied` is a list of { start, end } minute ranges. Returns start
// minutes, or null when the day has no gap big enough.
export function recommendStart(durationMins, occupied, fromMins = WORK_START) {
  const ranges = (occupied || [])
    .filter(r => r && r.start != null && r.end != null)
    .slice().sort((a, b) => a.start - b.start)
  let cursor = Math.max(WORK_START, fromMins)
  for (let i = 0; i <= ranges.length; i++) {
    const gapEnd = i < ranges.length ? ranges[i].start : WORK_END
    if (gapEnd - cursor >= durationMins) return cursor
    if (i < ranges.length) cursor = Math.max(cursor, ranges[i].end)
  }
  return null
}

// Build the render-ready rows for a day's imported events. For each span it
// resolves the shown/recommended time and duration, given the ranges already
// occupied by that day's scheduled work (so recommendations don't collide).
//   occupied : [{ start, end }] minutes — the day's own timed tasks + timed imports
//   nowMins  : current clock minutes when the day is today (recommend after now)
// Each row: { span, key, dur, timed, startMins, timeHHMM, recommended }
export function buildImportedRows(spans, dateStr, occupied = [], nowMins = null) {
  const placed = occupied.slice()
  return (spans || []).map(span => {
    const dur = assumedDuration(span)
    const timed = isTimed(span)
    if (timed) {
      const startMins = hhmmToMins(span.startTime)
      return { span, key: importedKey(span), dur, timed: true, startMins, timeHHMM: span.startTime, recommended: false }
    }
    // Untimed → recommend a slot, then reserve it so the next untimed import
    // lands after it rather than on top of it.
    const from = nowMins != null ? Math.max(WORK_START, Math.ceil(nowMins / 15) * 15) : WORK_START
    const startMins = recommendStart(dur, placed, from)
    if (startMins != null) placed.push({ start: startMins, end: startMins + dur })
    return {
      span, key: importedKey(span), dur, timed: false,
      startMins, timeHHMM: startMins != null ? minsToHHMM(startMins) : null,
      recommended: startMins != null,
    }
  })
}
