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

// Does this template recur every single day? True for a daily rule (interval 1)
// and for a weekly rule that has all seven weekdays selected — both land on
// every date. Used to keep everyday habits out of the month calendar, where
// they'd land on every cell and drown the things you actually plan around.
export function recursDaily(task) {
  if (!task) return false
  const interval = Math.max(1, Number(task.interval) || 1)
  if (interval !== 1) return false
  const freq = task.freq || 'weekly'
  if (freq === 'daily') return true
  if (freq === 'weekly' && Array.isArray(task.days) && task.days.length === 7) return true
  return false
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
    // A repeating time block (container) — draws a labeled film band, not a task.
    block: !!task.block,
    // An arrival location carried from the template, so a repeating task can
    // auto-start on arrival just like a one-off.
    location: task.location || null,
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

// How far along a task is, rendered as one or more shaded bands on its pill —
// the pause-aware version of taskProgress. Focus mode records the wall-clock
// spans a task was paused (`pauses` = [{from,to}] epochs; `pausedAt` = an open
// pause). Those spans stay *unshaded*: the pill shades the time you were
// actually working and leaves gaps where you'd stepped away, so by the end the
// pill reads as a record of worked-vs-paused time. With no pauses this collapses
// to a single band from the top — identical to the old single-fill progress.
//
// The axis is the task's own window: [start, start+duration] (from a startedAt
// timestamp if it has one, else today's scheduled time). Returns
// { show, segments:[{top,height}], frac, remaining, paused } with fractions in
// 0–1 measured down from the top.
export function taskSegments({ date, time, durationMins, subDone = 0, subCount = 0, startedAt = null, pauses = [], pausedAt = null }) {
  const subFrac = subCount > 0 ? Math.max(0, Math.min(1, subDone / subCount)) : null

  // Resolve the window [A, B] in epoch ms, or null if there's no timed window.
  let A = null, B = null
  if (startedAt && durationMins) {
    A = startedAt; B = startedAt + durationMins * 60000
  } else if (date && time && durationMins) {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    if (date === today) {
      const [h, m] = String(time).split(':').map(Number)
      const s = new Date(); s.setHours(h, m, 0, 0)
      A = s.getTime(); B = A + durationMins * 60000
    }
  }

  // No timed window → fall back to a single subtask-driven band (or nothing).
  if (A == null) {
    if (subFrac && subFrac > 0) return { show: true, segments: [{ top: 0, height: subFrac }], frac: subFrac, remaining: null, paused: !!pausedAt }
    return { show: false, segments: [], frac: 0, remaining: null, paused: !!pausedAt }
  }

  const total = B - A
  const nowMs = Date.now()
  const paused = pausedAt != null
  // Shade up to now — or up to the moment you paused, so an open pause reads as
  // a gap from there to the live now-line.
  const workedEnd = Math.min(B, paused ? pausedAt : nowMs)
  const remaining = nowMs < B ? Math.round((B - nowMs) / 60000) : 0

  if (workedEnd <= A) {
    // Not started yet on the clock — show subtasks progress if any.
    if (subFrac && subFrac > 0) return { show: true, segments: [{ top: 0, height: subFrac }], frac: subFrac, remaining, paused }
    return { show: false, segments: [], frac: 0, remaining, paused }
  }

  // Worked intervals = [A, workedEnd] with each pause span cut out.
  let intervals = [[A, workedEnd]]
  for (const p of (pauses || [])) {
    const pf = Math.max(A, Math.min(B, p.from)), pt = Math.max(A, Math.min(B, p.to))
    if (pt <= pf) continue
    const next = []
    for (const [a, b] of intervals) {
      if (pt <= a || pf >= b) { next.push([a, b]); continue }   // no overlap
      if (pf > a) next.push([a, pf])                            // keep the part before the pause
      if (pt < b) next.push([pt, b])                            // keep the part after the pause
    }
    intervals = next
  }

  const segments = intervals
    .map(([a, b]) => ({ top: (a - A) / total, height: (b - a) / total }))
    .filter(s => s.height > 0.002)
  const frac = Math.max(0, Math.min(1, (workedEnd - A) / total))
  return { show: segments.length > 0 || (subFrac && subFrac > 0), segments, frac, remaining, paused }
}

// Convenience: does this date have any scheduled item at all (used by Calendar
// for its busyness shading and day dots)?
export function recurringCountForDate(rows, dateStr, exceptions = {}) {
  return recurringOccurrencesForDate(rows, dateStr, exceptions).length
}
