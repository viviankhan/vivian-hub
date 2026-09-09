// ── Day-local scratch storage ─────────────────────────────────
// The timeline keeps three per-day stores in localStorage, keyed by date: tasks
// added only to that day (`vivian_custom_<date>`), ids hidden only on that day
// (`vivian_deleted_<date>`), and per-day time nudges (`vivian_timeshift_<date>`).
//
// They're device-local by design — they describe how one day was rearranged on
// this device — but they used to be written straight through
// `localStorage.setItem` with no guard, and were never cleaned up:
//
//   * one key per store per day meant the key count grew forever. A couple of
//     years of use is a few thousand keys, against a ~5MB localStorage cap;
//   * once full — or in Safari private browsing, where setItem always throws —
//     an unguarded write throws *inside a click handler*, aborting it partway.
//     React state was updated but nothing persisted, and the statements after
//     the write never ran: the shift-the-day handler, for one, never reached
//     its result toast, so the day silently rearranged with no feedback.
//
// `writeDayStore` makes the write non-fatal (pruning and retrying once, since
// stale days are exactly what filled the quota), and `pruneDayStores` keeps the
// store bounded.

export const DAY_STORE_PREFIXES = ['vivian_custom_', 'vivian_deleted_', 'vivian_timeshift_']
export const DAY_STORE_RETENTION_DAYS = 60

// A YYYY-MM-DD key `days` before today, in local time.
function cutoffKey(days, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// Drop day-keyed scratch entries older than the retention window. Returns how
// many keys were removed. Never throws — a browser that denies storage entirely
// simply has nothing to prune.
export function pruneDayStores({ retentionDays = DAY_STORE_RETENTION_DAYS, now = new Date() } = {}) {
  try {
    const cutoff = cutoffKey(retentionDays, now)
    const doomed = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      const prefix = DAY_STORE_PREFIXES.find(p => k.startsWith(p))
      if (!prefix) continue
      const date = k.slice(prefix.length)
      // YYYY-MM-DD sorts lexicographically, so a string compare is a date compare.
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date < cutoff) doomed.push(k)
    }
    doomed.forEach(k => { try { localStorage.removeItem(k) } catch {} })
    return doomed.length
  } catch { return 0 }
}

// Persist one day-local store. Returns true if it landed, false if this device
// simply won't keep it — the caller's React state is still correct either way,
// so a false is a missing convenience, never a broken interaction.
export function writeDayStore(key, value) {
  const json = JSON.stringify(value)
  try {
    localStorage.setItem(key, json)
    return true
  } catch (e) {
    try {
      pruneDayStores()
      localStorage.setItem(key, json)
      return true
    } catch {
      console.warn('[Bloom] could not save this day’s local layout:', e)
      return false
    }
  }
}
