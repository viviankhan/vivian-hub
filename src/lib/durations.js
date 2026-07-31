// src/lib/durations.js
// ─────────────────────────────────────────────────────────────
// The quick-duration presets shown when picking how long a task is, plus a
// forgiving parser for a manually-typed duration.
//
// The presets are user-editable (add / remove / reset in the add sheet) and
// stored per-device in localStorage — the same treatment as the per-item
// reminder sounds and overrides, so it needs no database column and can't
// break the core add/edit path.
// ─────────────────────────────────────────────────────────────

const PRESETS_KEY = 'vivian_duration_presets'

// The out-of-the-box set (minutes). Mirrors what the sheet used to hardcode.
export const DEFAULT_DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180]

// A friendly label for a minute count: "15m", "1h", "1.5h", "2h 15m".
export function durationLabel(mins) {
  if (!mins || mins <= 0) return ''
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (m === 0) return `${h}h`
  if (m % 30 === 0) return `${(mins / 60).toString().replace(/\.0$/, '')}h`
  return `${h}h ${m}m`
}

// Parse a manually-typed duration into minutes, or null when it isn't one yet.
// Accepts: "90", "90m", "1h", "1.5h", "1h30", "1h 30m", "1:30", "2 hours".
export function parseDuration(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return null

  // "1:30" → 1h30m
  const colon = s.match(/^(\d{1,2}):(\d{2})$/)
  if (colon) {
    const mins = parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10)
    return mins > 0 ? mins : null
  }

  let total = 0
  let matched = false
  // hours (with optional decimal): "1.5h", "2 hrs", "1 hour"
  const hm = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/)
  if (hm) { total += Math.round(parseFloat(hm[1]) * 60); matched = true }
  // minutes: "30m", "45 min", "20 minutes"
  const mm = s.match(/(\d+)\s*(?:m|min|mins|minute|minutes)/)
  if (mm) { total += parseInt(mm[1], 10); matched = true }
  // "1h30" — a bare number of minutes trailing an hours token
  if (hm && !mm) {
    const trailing = s.slice(s.indexOf(hm[0]) + hm[0].length).match(/(\d+)/)
    if (trailing) total += parseInt(trailing[1], 10)
  }
  if (matched) return total > 0 ? total : null

  // A plain number with no unit → minutes.
  const bare = s.match(/^(\d+(?:\.\d+)?)$/)
  if (bare) {
    const n = parseFloat(bare[1])
    return n > 0 ? Math.round(n) : null
  }
  return null
}

// ── Persisted presets (device-local) ───────────────────────────
export function getDurationPresets() {
  try {
    const raw = JSON.parse(localStorage.getItem(PRESETS_KEY) || 'null')
    if (Array.isArray(raw) && raw.length) {
      // Keep only valid, de-duplicated, sorted minute counts.
      return [...new Set(raw.filter(n => Number.isFinite(n) && n > 0))].sort((a, b) => a - b)
    }
  } catch {}
  return [...DEFAULT_DURATION_PRESETS]
}
export function setDurationPresets(mins) {
  try {
    const clean = [...new Set((mins || []).filter(n => Number.isFinite(n) && n > 0))].sort((a, b) => a - b)
    localStorage.setItem(PRESETS_KEY, JSON.stringify(clean))
    return clean
  } catch { return getDurationPresets() }
}
export function resetDurationPresets() {
  try { localStorage.removeItem(PRESETS_KEY) } catch {}
  return [...DEFAULT_DURATION_PRESETS]
}
