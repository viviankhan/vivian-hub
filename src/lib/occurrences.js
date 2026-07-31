// src/lib/occurrences.js
// ─────────────────────────────────────────────────────────────
// ONE scheduling system for Today, Week, and Calendar.
//
// The schedule for any date is:
//     commitments dated that day
//   + active recurring-task instances for that day
//   − any per-occurrence skips (synced exceptions)
//
// Today (one day), Week (seven days) and Calendar (a whole month) all read
// their recurring instances from the helpers here, so the three views can
// never drift apart the way the old per-view logic did. Recurring templates
// are still created/edited in the Recurring tab (and now from any of the three
// screens via the add sheet's Repeat option).
// ─────────────────────────────────────────────────────────────

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// Weekday name ("monday"…) for a "YYYY-MM-DD" date. Noon avoids any DST edge.
export function dowName(dateStr) {
  return DAY_NAMES[new Date(dateStr + 'T12:00:00').getDay()]
}

// A recurring instance is identified everywhere by its template id + the date
// it lands on. Skips are stored under this key (synced), so a skip made on any
// view hides that one occurrence on every view and device.
export function occKey(recurringId, dateStr) {
  return `${recurringId}@${dateStr}`
}

// Pull a leading "9:50 AM — " time prefix out of a label. Returns
// { time:'HH:MM'|null, title } where title is the label without the prefix.
export function splitTimePrefix(label = '') {
  const m = (label || '').match(/^~?\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[—–-]\s*/i)
  if (!m) return { time: null, title: (label || '').trim() }
  let h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  const ap = (m[3] || '').toUpperCase()
  if (ap === 'PM' && h !== 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  const time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  return { time, title: label.slice(m[0].length).trim() }
}

// Noon Date for a "YYYY-MM-DD" string (DST-safe for day math).
function noon(dateStr) {
  return new Date(dateStr + 'T12:00:00')
}
// Sunday (noon) of the week containing d.
function weekStart(d) {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  x.setDate(x.getDate() - x.getDay())
  return x
}
function daysInMonth(year, monthIdx) {
  return new Date(year, monthIdx + 1, 0).getDate()
}

// Is this recurring template active on the given date? Handles the optional
// start/end range plus the frequency rule:
//   • daily   — every `interval` days from the start date
//   • weekly  — on the chosen weekdays, every `interval` weeks (default; also
//               the back-compat path for tasks with no freq set)
//   • monthly — on a day-of-month, every `interval` months
// interval defaults to 1 (every day/week/month); intervals > 1 anchor on the
// task's start date.
export function recurringActiveOn(task, dateStr) {
  if (task.startDate && dateStr < task.startDate) return false
  if (task.endDate && dateStr > task.endDate) return false

  const freq = task.freq || 'weekly'
  const interval = Math.max(1, Number(task.interval) || 1)
  const date = noon(dateStr)
  const anchor = task.startDate ? noon(task.startDate) : null

  if (freq === 'daily') {
    if (interval === 1 || !anchor) return true
    const diff = Math.round((date - anchor) / 86400000)
    return diff >= 0 && diff % interval === 0
  }

  if (freq === 'monthly') {
    const wantDay = Number(task.monthDay) || (anchor ? anchor.getDate() : date.getDate())
    const eff = Math.min(wantDay, daysInMonth(date.getFullYear(), date.getMonth()))
    if (date.getDate() !== eff) return false
    if (interval === 1 || !anchor) return true
    const diff = (date.getFullYear() * 12 + date.getMonth()) - (anchor.getFullYear() * 12 + anchor.getMonth())
    return diff >= 0 && diff % interval === 0
  }

  // weekly (default + legacy tasks)
  if (!(task.days || []).includes(dowName(dateStr))) return false
  if (interval === 1 || !anchor) return true
  const diff = Math.round((weekStart(date) - weekStart(anchor)) / (7 * 86400000))
  return diff >= 0 && diff % interval === 0
}

// Normalize one recurring template into a concrete occurrence on a date. The
// shape is a superset of what Today/Week/Calendar already read from their rows
// (label, text, title, tag, cat, note, _time), plus flags so each view can
// tell a recurring instance apart from a real commitment.
export function recurringOccurrence(task, dateStr) {
  const rawLabel = task.label != null ? task.label : (task.text || '')
  const { time, title } = splitTimePrefix(rawLabel)
  const cat = task.cat || task.tag || 'personal'
  return {
    id: task.id,
    recurringId: task.id,
    date: dateStr,
    isRecurring: true,
    isCommitment: false,
    type: task.type || 'today',
    cat,
    tag: cat,
    text: title,
    title,
    label: rawLabel,
    note: task.note || '',
    carry: !!task.carry,
    routine: task.routine || null,
    // Per-task icon/color live in the recurring_meta blob (merged onto the row
    // before this runs), so a recurring task keeps the glyph + color you chose.
    icon: task.icon || null,
    color: task.color || null,
    _time: time,
    _dur: task.durationMins || null,
  }
}

// All non-skipped recurring occurrences for one date, given the raw template
// rows and the synced exceptions map.
export function recurringOccurrencesForDate(rows, dateStr, exceptions = {}) {
  return (rows || [])
    .filter(t => recurringActiveOn(t, dateStr))
    .filter(t => !exceptions[occKey(t.id, dateStr)])
    .map(t => recurringOccurrence(t, dateStr))
}

// If a timed item on `dateStr` is happening right now (today, within its
// start→end window), returns { remaining, frac } for the live "Xm remaining"
// label and the elapsed shade. Returns null otherwise. Shared by the timeline
// pill, the task editor, and the Week/Calendar rows so they all agree.
//
// `startedAt` (an epoch-ms timestamp, e.g. set when you arrive at a location-
// tagged task) overrides the scheduled window: progress then runs from that
// moment over the task's duration, no matter what time or day it was set for.
export function nowProgress(dateStr, time, durationMins, startedAt = null) {
  if (startedAt && durationMins) {
    const elapsedMin = (Date.now() - startedAt) / 60000
    if (elapsedMin < 0 || elapsedMin >= durationMins) return null
    const remaining = Math.round(durationMins - elapsedMin)
    return { remaining, frac: Math.max(0, Math.min(1, elapsedMin / durationMins)) }
  }
  if (!dateStr || !time || !durationMins) return null
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  if (dateStr !== today) return null
  const [h, m] = String(time).split(':').map(Number)
  const startMin = h * 60 + m
  const endMin = startMin + durationMins
  const nowMin = d.getHours() * 60 + d.getMinutes()
  if (nowMin < startMin || nowMin >= endMin) return null
  return { remaining: endMin - nowMin, frac: Math.max(0, Math.min(1, (nowMin - startMin) / (endMin - startMin))) }
}

// How far along a task is, for its progress highlight — the furthest of two
// signals: (a) elapsed time within its window right now, and (b) how many of
// its subtasks are checked off. `show` is true when there's any progress to
// show; `remaining` is the minutes left when it's mid-window (for the "Xm left"
// label), else null.
export function taskProgress({ date, time, durationMins, subDone = 0, subCount = 0, startedAt = null }) {
  const timeP = nowProgress(date, time, durationMins, startedAt)
  const timeFrac = timeP ? timeP.frac : null
  const subFrac = subCount > 0 ? Math.max(0, Math.min(1, subDone / subCount)) : null
  const frac = Math.max(timeFrac ?? 0, subFrac ?? 0)
  const show = timeFrac != null || (subFrac != null && subFrac > 0)
  return { show, frac, remaining: timeP ? timeP.remaining : null }
}

// Convenience: does this date have any scheduled item at all (used by Calendar
// for its busyness shading and day dots)?
export function recurringCountForDate(rows, dateStr, exceptions = {}) {
  return recurringOccurrencesForDate(rows, dateStr, exceptions).length
}
