// src/lib/medCheck.js
// ─────────────────────────────────────────────────────────────
// A dose you haven't checked off isn't assumed taken. Once its time has gone
// by (plus a little grace), Bloom asks: did you take it? Yes ticks it; no
// offers "take it now" (ticked, with the time you took it) or "skip" (marked
// skipped). Yesterday's unanswered doses are asked about too, so a night you
// forgot doesn't quietly count either way; older days are left alone.
//
// Pure: tested in tests/medCheck.test.mjs.
// ─────────────────────────────────────────────────────────────

// How long after a dose's time Bloom waits before asking (and when the
// "Did you take it?" push goes out).
export const MED_CHECK_GRACE_MIN = 30

const pad = (n) => String(n).padStart(2, '0')
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const toMs = (date, time) => {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time ? time.split(':').map(Number) : [23, 59]
  return new Date(y, m - 1, d, h, min).getTime()
}

// doses: [{ id, title, date, time ('HH:MM' or null) }] — med occurrences for
//        yesterday and today.
// answered(date, id) → true when the dose has a taken/skipped record.
// snoozed: { 'date_id': untilMs } — "ask me later".
// Returns the doses to ask about, oldest first.
export function pendingMedChecks({ doses = [], answered = () => false, snoozed = {}, now = Date.now(), graceMin = MED_CHECK_GRACE_MIN }) {
  const today = dayKey(now)
  const yesterday = dayKey(new Date(now).setHours(12) - 86400000)
  return doses
    .filter(d => d && d.id && (d.date === today || d.date === yesterday))
    .filter(d => !answered(d.date, d.id))
    .filter(d => !(snoozed[`${d.date}_${d.id}`] > now))
    // Today: once its time + grace has passed. An untimed dose is asked
    // about the next day, as yesterday's.
    .filter(d => d.date === yesterday || (d.time && now >= toMs(d.date, d.time) + graceMin * 60000))
    .map(d => ({ ...d, dueMs: toMs(d.date, d.time), yesterday: d.date === yesterday }))
    .sort((a, b) => a.dueMs - b.dueMs)
}
