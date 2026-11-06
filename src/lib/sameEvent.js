// src/lib/sameEvent.js
// ─────────────────────────────────────────────────────────────
// Is this new item the same thing as one already on the day?
//
// The assistant is handed screenshots and calendars that repeat what Bloom
// already has: your Family Calendar's "Vivian's appointment" at 8:30 on
// Nov 13 is the Rheumatology "Consultation" at 8:30 that came in with the
// Mayo schedule. Adding it again puts the same visit on the day twice.
//
// It's the same thing when it's on the same day, starts within a few minutes
// and runs about as long, AND the titles agree: they share a real word
// ("Consultation with Megan Weinhold" / "Weinhold visit"), or both are just a
// kind of appointment ("Vivian's appointment" / "Consultation"). Two different
// things at the same time — a lab meeting and a class you double-booked —
// share neither, so both stay and the clash stays visible.
//
// Pure: tested in tests/sameEvent.test.mjs.
// ─────────────────────────────────────────────────────────────

const NEAR_MINS = 10
const GENERIC = new Set([
  'appointment', 'appt', 'consultation', 'consult', 'visit', 'video', 'virtual', 'telehealth',
  'checkup', 'check', 'follow', 'followup', 'exam', 'doctor', 'doctors', 'dr', 'clinic', 'session',
  'meeting', 'event', 'busy', 'call', 'booked', 'reservation',
])
const STOP = new Set(['the', 'and', 'with', 'for', 'from', 'your', 'my', 'at', 'in', 'on', 'of', 'to', 'a', 'an', 'up', 's'])

const mins = (t) => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null }
// Words that say what it is: lower-case, no little words, and no names of
// whose it is (a possessive, or the owner's name passed in).
function words(title, owner = []) {
  // A possessive name says whose it is, not what it is: "Vivian's appointment".
  return String(title || '').toLowerCase().replace(/\b[a-z]+[’']s\b/g, ' ').split(/[^a-z0-9]+/)
    .filter(w => w && w.length > 1 && !STOP.has(w) && !owner.includes(w))
}

// a / existing: { text|title, date, time ('HH:MM' or 'HH:MM:SS'), durationMins }
// owner: first names to ignore in titles (["vivian"]).
export function isSameEvent(a, existing, { owner = [] } = {}) {
  if (!a || !existing || !a.date || a.date !== existing.date) return false
  const s1 = mins(a.time), s2 = mins(existing.time)
  if (s1 == null || s2 == null || Math.abs(s1 - s2) > NEAR_MINS) return false
  const d1 = a.durationMins || 0, d2 = existing.durationMins || 0
  if (d1 && d2 && Math.abs(d1 - d2) > NEAR_MINS) return false
  const own = owner.map(o => o.toLowerCase())
  const w1 = words(a.title ?? a.text, own), w2 = words(existing.title ?? existing.text, own)
  if (!w1.length || !w2.length) return false
  const real1 = w1.filter(w => !GENERIC.has(w)), real2 = w2.filter(w => !GENERIC.has(w))
  if (real1.some(w => w.length >= 4 && real2.includes(w))) return true
  // Both only say "an appointment of some kind".
  return real1.length === 0 && real2.length === 0
}

// The existing item a new one duplicates, if any.
export function findSameEvent(a, items, opts) {
  return (items || []).find(c => !c.block && isSameEvent(a, c, opts)) || null
}
