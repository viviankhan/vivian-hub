// src/lib/viewFilter.js
// ─────────────────────────────────────────────────────────────
// Which repeating tasks show on the Calendar and Week views. The user can add
// or subtract whole repeating groups (routine groups, plus an "Ungrouped"
// bucket), and toggle everyday (daily) habits on or off — those are hidden by
// default so they don't blanket the month/week, but can be brought back.
//
// Device-local, and a change broadcasts an event so both views refresh at once.
// ─────────────────────────────────────────────────────────────
import { recursDaily } from './occurrences.js'

const KEY = 'bloom_recurring_view_filter'
export const RECURRING_FILTER_EVENT = 'bloom-recurring-filter'

export function getRecurringFilter() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      hiddenGroups: Array.isArray(v.hiddenGroups) ? v.hiddenGroups : [],
      showDaily: !!v.showDaily,   // default: everyday habits hidden on these views
    }
  } catch { return { hiddenGroups: [], showDaily: false } }
}
export function setRecurringFilter(next) {
  const clean = {
    hiddenGroups: [...new Set(next.hiddenGroups || [])],
    showDaily: !!next.showDaily,
  }
  try { localStorage.setItem(KEY, JSON.stringify(clean)) } catch {}
  try { window.dispatchEvent(new Event(RECURRING_FILTER_EVENT)) } catch {}
  return clean
}

// The set of group ids present in a batch of recurring templates ('none' for
// ungrouped) — used to only list groups that actually have tasks.
export function groupsInUse(rows) {
  const s = new Set()
  for (const t of rows || []) s.add(t.routine || 'none')
  return s
}
export function hasDailyRepeats(rows) {
  return (rows || []).some(recursDaily)
}

// Filter recurring templates for a view: drop everyday habits unless showDaily,
// and drop any group the user has hidden.
export function visibleRecurring(rows, filter) {
  const hidden = new Set(filter.hiddenGroups || [])
  return (rows || []).filter(t => {
    if (recursDaily(t) && !filter.showDaily) return false
    return !hidden.has(t.routine || 'none')
  })
}
