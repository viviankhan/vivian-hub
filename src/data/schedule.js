// src/data/schedule.js
// ─────────────────────────────────────────────────────────────
// Schedule DEFAULTS — intentionally EMPTY.
//
// All schedule content (recurring tasks, daily to-dos, fixed blocks,
// calendar events, routines) is now created and edited by the user from
// the app itself and stored per-row in the database. The pre-determined
// Spring 2026 schedule that used to live here has been removed — nothing
// is hardcoded anymore. These empty structures only exist so the helper
// functions below have something to fall back to before any data loads.
// ─────────────────────────────────────────────────────────────

// ── date helpers ───────────────────────────────────────────────
const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

// ── Fixed daily blocks — empty (no pre-determined schedule) ────
export const FIXED_BLOCKS = {}

export function getFixedBlocksForDate(date) {
  const dayName = DAY_NAMES[date.getDay()]
  return FIXED_BLOCKS[dayName] || []
}

// ── Calendar events — empty (add one-offs via Commitments) ────
export const CALENDAR_EVENTS = []
