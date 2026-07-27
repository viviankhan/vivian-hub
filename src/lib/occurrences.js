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

// Is this recurring template active on the given date — within its optional
// start/end range and repeating on that weekday?
export function recurringActiveOn(task, dateStr) {
  if (task.startDate && dateStr < task.startDate) return false
  if (task.endDate && dateStr > task.endDate) return false
  return (task.days || []).includes(dowName(dateStr))
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
    _time: time,
    _dur: null,
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

// Convenience: does this date have any scheduled item at all (used by Calendar
// for its busyness shading and day dots)?
export function recurringCountForDate(rows, dateStr, exceptions = {}) {
  return recurringOccurrencesForDate(rows, dateStr, exceptions).length
}
