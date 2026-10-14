// src/lib/timeframe.js
// ─────────────────────────────────────────────────────────────
// The one window every number on the Insights tab — and the windowed cards on
// the Wellness tab — is read over. Nothing here is cumulative: a preset is a
// number of days ending today, re-evaluated on every read so it keeps up with
// the calendar, and a custom range is two dates you set yourself. Remembered
// on this device like the last-open tab, and shared through a tiny store so
// every picker on screen agrees the moment one of them changes.
// ─────────────────────────────────────────────────────────────
import { dayKey, keyToDate, daysBetween } from './wellness.js'

export const PRESETS = [
  { id: 'week',      days: 7,  label: '7 days' },
  { id: 'fortnight', days: 14, label: '14 days' },
  { id: 'month',     days: 30, label: '30 days' },
  { id: 'quarter',   days: 90, label: '90 days' },
]
export const DEFAULT_TIMEFRAME = { id: 'week' }
// A custom range can reach back a year; past that the per-day tables stop
// being quick to build and the chart stops being readable.
export const MAX_DAYS = 366
const KEY = 'bloom_timeframe'

export function shiftKey(key, n) { const d = keyToDate(key); d.setDate(d.getDate() + n); return dayKey(d) }
function isKey(k) { return /^\d{4}-\d{2}-\d{2}$/.test(String(k || '')) }
function fmt(key) { try { return keyToDate(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } catch { return key } }

// Turn a stored choice into concrete dates:
//   { id, from, to, days, label, phrase }
// `label` names the window ("past 7 days", "Sep 1 – Oct 13"); `phrase` fits a
// sentence ("in the past 7 days", "between Sep 1 and Oct 13").
export function resolveTimeframe(tf, today = dayKey()) {
  const t = tf || DEFAULT_TIMEFRAME
  if (t.id === 'custom' && isKey(t.from) && isKey(t.to)) {
    let from = t.from, to = t.to
    if (to > today) to = today
    if (from > to) from = to
    if (daysBetween(from, to) + 1 > MAX_DAYS) from = shiftKey(to, -(MAX_DAYS - 1))
    const days = daysBetween(from, to) + 1
    const f = fmt(from), g = fmt(to)
    return from === to
      ? { id: 'custom', from, to, days, label: f, phrase: `on ${f}` }
      : { id: 'custom', from, to, days, label: `${f} – ${g}`, phrase: `between ${f} and ${g}` }
  }
  const p = PRESETS.find(x => x.id === t.id) || PRESETS[0]
  return { id: p.id, from: shiftKey(today, -(p.days - 1)), to: today, days: p.days, label: `past ${p.days} days`, phrase: `in the past ${p.days} days` }
}

// ── The store ──────────────────────────────────────────────────
let current = null
const listeners = new Set()
function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    return v && typeof v === 'object' && v.id ? v : DEFAULT_TIMEFRAME
  } catch { return DEFAULT_TIMEFRAME }
}
// The stored choice (not yet resolved). Stable between calls until it changes,
// which is what useSyncExternalStore needs.
export function getTimeframe() {
  if (!current) current = read()
  return current
}
export function setTimeframe(tf) {
  current = tf && tf.id ? tf : DEFAULT_TIMEFRAME
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch {}
  listeners.forEach(fn => { try { fn() } catch {} })
}
export function subscribeTimeframe(fn) { listeners.add(fn); return () => listeners.delete(fn) }
// Tests and a fresh sign-in can drop the cached choice.
export function resetTimeframe() { current = null }
