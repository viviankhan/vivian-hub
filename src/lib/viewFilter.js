// src/lib/viewFilter.js
// ─────────────────────────────────────────────────────────────
// Which repeating tasks show on the Calendar and Week views. The user can
// toggle everyday (daily) habits on or off — those are hidden by default so
// they don't blanket the month/week, but can be brought back.
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
      showDaily: !!v.showDaily,   // default: everyday habits hidden on these views
    }
  } catch { return { showDaily: false } }
}
export function setRecurringFilter(next) {
  const clean = {
    showDaily: !!next.showDaily,
  }
  try { localStorage.setItem(KEY, JSON.stringify(clean)) } catch {}
  try { window.dispatchEvent(new Event(RECURRING_FILTER_EVENT)) } catch {}
  return clean
}

export function hasDailyRepeats(rows) {
  return (rows || []).some(recursDaily)
}

// Filter recurring templates for a view: drop everyday habits unless showDaily.
export function visibleRecurring(rows, filter) {
  return (rows || []).filter(t => filter.showDaily || !recursDaily(t))
}
