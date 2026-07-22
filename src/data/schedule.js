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
const DAY_NAMES   = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
const DAY_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function toDayLabel(d) {
  return `${DAY_SHORT[d.getDay()]} ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`
}

// ── Fixed daily blocks — empty (no pre-determined schedule) ────
export const FIXED_BLOCKS = {}

export function getFixedBlocksForDate(date) {
  const dayName = DAY_NAMES[date.getDay()]
  return FIXED_BLOCKS[dayName] || []
}

// ── Recurring weekly tasks — empty defaults ───────────────────
export const DEFAULT_RECURRING_TASKS = {}

// ── Week plan — a full Sun→Sat calendar week ──────────────────
// weekOffset shifts by whole weeks: 0 = the current week, -1 = last week,
// +1 = next week, etc. Aligning to Sunday makes each week a fixed unit you
// can page through and jump back to.
export function buildWeekPlanFromTasks(recurringTasks, weekOffset = 0) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(today.getDate() - today.getDay() + weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const dayName = DAY_NAMES[d.getDay()]
    return {
      date:     toDateStr(d),
      dayLabel: toDayLabel(d),
      tasks:    (recurringTasks[dayName] || []),
    }
  })
}

export const WEEK_PLAN = buildWeekPlanFromTasks(DEFAULT_RECURRING_TASKS)

// ── Recurring daily to-dos — empty defaults ───────────────────
export const DEFAULT_DAILY_TODOS = {}

// Pass dailyTodosOverride (from the user's recurring tasks) to use live
// data; falls back to the empty defaults above before anything loads.
export function getDailyTodos(dateStr, dailyTodosOverride) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  const dayName = DAY_NAMES[d.getDay()]
  const source = dailyTodosOverride || DEFAULT_DAILY_TODOS
  return source[dayName] || []
}

// ── Calendar events — empty (add one-offs via Commitments) ────
export const CALENDAR_EVENTS = []

// ── Morning / night routines — empty defaults ─────────────────
// Build your own in Settings → Routines.
export const MORNING_ROUTINE = []
export const NIGHT_ROUTINE = []
