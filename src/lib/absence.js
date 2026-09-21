// src/lib/absence.js
// ─────────────────────────────────────────────────────────────
// The rule that lets the blob notice you were gone.
//
// Mood trackers only ever hear from the days you felt well enough to open them,
// which is exactly backwards: the stretches worth recording are the ones you
// disappear into. So Bloom watches the clock between visits. When you come back
// after being away longer than your rule allows, the blob doesn't pretend the
// silence didn't happen — it asks what that stretch was like and writes it onto
// the rail where it belongs, in the past, at the hours you actually lived.
//
// Two things make that honest rather than annoying:
//
//   • Sleep isn't absence. Eight hours away is a normal night, so a rule that
//     counted plain elapsed time would fire every single morning and train you
//     to swipe it away. Only *waking* hours count — the ones outside the night
//     window you set — so "8 hours" means eight hours you were awake and not
//     here, which is the thing actually worth asking about.
//   • A long gap is offered, never demanded. Declining files it away for good
//     rather than asking again tomorrow; the rewind clock on any past day is
//     still there if you change your mind.
//
// Everything here is pure — no React, no storage, no clock of its own beyond
// the `now` you hand it — so the rule can be reasoned about and unit-tested.
// (See presence.js for the heartbeat that records when you were last here,
// and DayRail for the blob that does the asking.)
// ─────────────────────────────────────────────────────────────
import { dayKey, fmtDuration } from './wellness.js'

// ── The rule ───────────────────────────────────────────────────
// One object, synced like every other wellness blob (storage.js:
// wellness_rules). `hours` is in *waking* hours; the night window is what makes
// that phrase mean anything.
export const DEFAULT_ABSENCE_RULE = {
  enabled: true,
  hours: 8,              // waking hours away before the blob asks
  skipSleep: true,       // don't count the night against you
  sleepStart: '22:00',   // the night window, in local clock time
  sleepEnd: '08:00',
  askConditions: true,   // offer the condition picker in the catch-up too
  maxDays: 14,           // never offer to fill in a stretch older than this
}
// The hours a rule can be set to. Below ~3 waking hours it fires over a long
// afternoon out, which is noise; past a few days it stops being a nudge. Whole
// days past 24h, so the row reads in one unit rather than two.
export const HOUR_CHOICES = [3, 4, 6, 8, 12, 18, 24, 48, 72]

export function normalizeRule(rule) {
  const r = { ...DEFAULT_ABSENCE_RULE, ...(rule || {}) }
  return {
    enabled: r.enabled !== false,
    hours: clampNum(r.hours, 1, 168, DEFAULT_ABSENCE_RULE.hours),
    skipSleep: r.skipSleep !== false,
    sleepStart: hhmmOk(r.sleepStart) ? r.sleepStart : DEFAULT_ABSENCE_RULE.sleepStart,
    sleepEnd: hhmmOk(r.sleepEnd) ? r.sleepEnd : DEFAULT_ABSENCE_RULE.sleepEnd,
    askConditions: r.askConditions !== false,
    maxDays: clampNum(r.maxDays, 1, 90, DEFAULT_ABSENCE_RULE.maxDays),
  }
}
function clampNum(v, lo, hi, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}
function hhmmOk(t) { return /^\d{1,2}:\d{2}$/.test(String(t || '')) }
export function hhmmMins(t) {
  const [h, m] = String(t || '').split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

// ── Waking minutes ─────────────────────────────────────────────
// A local-midnight-anchored minute offset, so a window that crosses a clock
// change lands on the right wall-clock hour rather than an hour either side.
function atMinsOn(dayMs, mins) {
  const d = new Date(dayMs)
  d.setHours(0, 0, 0, 0)
  d.setMinutes(mins)          // 1440 rolls cleanly into the next day
  return d.getTime()
}
// The night's stretches on one local day. A window that wraps midnight
// (22:00 → 08:00, the normal shape of a night) is two pieces: the small hours
// at the head of the day and the late evening at its tail.
export function sleepIntervalsOn(dayMs, rule) {
  const r = normalizeRule(rule)
  if (!r.skipSleep) return []
  const s = hhmmMins(r.sleepStart), e = hhmmMins(r.sleepEnd)
  if (s === e) return []                                   // no night set
  if (s < e) return [[atMinsOn(dayMs, s), atMinsOn(dayMs, e)]]
  return [[atMinsOn(dayMs, 0), atMinsOn(dayMs, e)], [atMinsOn(dayMs, s), atMinsOn(dayMs, 1440)]]
}
function overlapMs(a, b, c, d) { return Math.max(0, Math.min(b, d) - Math.max(a, c)) }

// How much of a span you were awake for: elapsed time, minus every night it
// crossed. This — not the raw gap — is what a rule's `hours` is measured in.
export function wakingMinutes(startMs, endMs, rule) {
  const total = Math.max(0, Math.round((endMs - startMs) / 60000))
  const r = normalizeRule(rule)
  if (!r.skipSleep || total === 0) return total
  let asleepMs = 0
  // Walk from the day before the span (a night that began yesterday evening
  // reaches into this morning) to the day it ends on.
  const cur = new Date(startMs); cur.setHours(0, 0, 0, 0); cur.setDate(cur.getDate() - 1)
  const last = new Date(endMs); last.setHours(0, 0, 0, 0)
  for (let guard = 0; cur.getTime() <= last.getTime() && guard < 400; guard++) {
    for (const [a, b] of sleepIntervalsOn(cur.getTime(), r)) asleepMs += overlapMs(a, b, startMs, endMs)
    cur.setDate(cur.getDate() + 1)
  }
  return Math.max(0, total - Math.round(asleepMs / 60000))
}

// ── Splitting a span across the days it covers ─────────────────
// Check-ins are filed per calendar day (that is what every chart, streak and
// insight reads), so a stretch that ran from Thursday afternoon to Saturday
// morning has to land as three of them — one per day, each covering only its
// own hours. Cut at local midnight.
export function splitByDay(startMs, endMs) {
  const out = []
  let cur = startMs
  for (let guard = 0; cur < endMs && guard < 400; guard++) {
    const mid = new Date(cur); mid.setHours(24, 0, 0, 0)
    const stop = Math.min(mid.getTime(), endMs)
    out.push({ key: dayKey(new Date(cur)), startMs: cur, endMs: stop })
    cur = stop
  }
  return out
}

// A stable name for one absence, keyed on when it *started* — so answering or
// declining it is remembered even though its far end keeps moving with "now".
export function absenceId(startMs) { return 'gap-' + Math.floor(startMs / 60000) }

// ── The question: were you away long enough to be asked? ───────
// Returns the gap worth asking about, or null. `handledId` is the last absence
// you already answered or declined, so neither is ever asked twice.
export function evaluateAbsence({ lastSeenMs, nowMs = Date.now(), rule, handledId = null } = {}) {
  const r = normalizeRule(rule)
  if (!r.enabled) return null
  const seen = Number(lastSeenMs)
  if (!Number.isFinite(seen) || seen <= 0 || seen >= nowMs) return null
  // A gap of months isn't a form to fill in, it's a fresh start — offer only
  // the recent end of it.
  const from = Math.max(seen, nowMs - r.maxDays * 86400000)
  const wakingMins = wakingMinutes(from, nowMs, r)
  if (wakingMins < r.hours * 60) return null
  const id = absenceId(seen)                  // the true start names it, clipped or not
  if (handledId && handledId === id) return null
  return {
    id,
    startMs: from,
    endMs: nowMs,
    awayMins: Math.round((nowMs - from) / 60000),
    wakingMins,
    clipped: from > seen,
    days: splitByDay(from, nowMs),
  }
}

// ── A stretch you're logging on purpose ────────────────────────
// The blob notices the absences it can, but plenty go unrecorded: a stretch
// you came back from before it counted, one on a device this app wasn't on, or
// a week you only recognise as a week once it's over. So the same sheet can be
// opened by hand, with the span chosen rather than measured. Shaped exactly
// like a found absence so everything downstream treats them identically.
export function makeStretch(startMs, endMs = Date.now(), rule) {
  // Ordered, not assumed: a span handed over the wrong way round is the same
  // span, and silently keeping it backwards would make it cover no days at all.
  const from = Math.min(startMs, endMs), to = Math.max(startMs, endMs)
  return {
    id: absenceId(from),
    startMs: from,
    endMs: to,
    awayMins: Math.round((to - from) / 60000),
    wakingMins: wakingMinutes(from, to, rule),
    clipped: false,
    manual: true,
    days: splitByDay(from, to),
  }
}
// How far back a hand-logged stretch can be said to start, in days back from
// this morning. 0 is "it started today".
export const STRETCH_CHOICES = [
  { days: 0, label: 'today' },
  { days: 1, label: 'yesterday' },
  { days: 2, label: '3 days' },
  { days: 4, label: '5 days' },
  { days: 6, label: 'a week' },
  { days: 13, label: '2 weeks' },
]
// Local midnight `back` days ago — where a hand-logged stretch begins.
export function daysAgoStart(back, now = Date.now()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - Math.max(0, back))
  return d.getTime()
}

// ── Saying it out loud ─────────────────────────────────────────
const clock = (ms) => { try { return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) } catch { return '' } }
// "yesterday 9:40 PM" / "Thursday 2:10 PM" / "Sep 3, 2:10 PM" — how far back a
// moment is, said the way a person would say it.
export function whenPhrase(ms, nowMs = Date.now()) {
  const d = new Date(ms)
  const day = new Date(d); day.setHours(0, 0, 0, 0)
  const today = new Date(nowMs); today.setHours(0, 0, 0, 0)
  const diff = Math.round((today - day) / 86400000)
  if (diff === 0) return `${clock(ms)} today`
  if (diff === 1) return `${clock(ms)} yesterday`
  if (diff < 7) return `${d.toLocaleDateString('en-US', { weekday: 'long' })} at ${clock(ms)}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${clock(ms)}`
}
// The one line the blob speaks when you come back.
export function absenceLine(gap, rule, nowMs = Date.now()) {
  if (!gap) return ''
  const r = normalizeRule(rule)
  const away = fmtDuration(gap.wakingMins)
  const since = whenPhrase(gap.startMs, nowMs)
  const waking = r.skipSleep && gap.awayMins - gap.wakingMins >= 60 ? ' awake' : ''
  return `I haven't seen you since ${since} — about ${away}${waking}. Want to tell me how that stretch was?`
}
// "3 days" / "19h awake" — the compact length, for a chip or a sheet heading.
export function absenceLength(gap, rule) {
  if (!gap) return ''
  const r = normalizeRule(rule)
  return r.skipSleep ? `${fmtDuration(gap.wakingMins)} awake` : fmtDuration(gap.awayMins)
}

// A stretch of days spent under one condition has a name, and the name matters:
// "a depressed streak" is a thing that happened to you and ended, which is a
// kinder and truer shape than a scatter of bad days. Used wherever the app
// reads a logged stretch back.
export function streakPhrase(names, dayCount) {
  const list = (names || []).filter(Boolean)
  if (!list.length) return ''
  const over = dayCount > 1 ? ` across ${dayCount} days` : ''
  if (list.length === 1) return `a ${list[0].toLowerCase()} streak${over}`
  const lc = list.map(n => n.toLowerCase())
  return `${lc.slice(0, -1).join(', ')} and ${lc[lc.length - 1]}${over}`
}

// ── Writing the absence down ───────────────────────────────────
// Turn an answered catch-up into the entries the trackers already understand.
//
// A mood becomes one check-in per calendar day the stretch touched, each
// covering that day's own hours — so the rail draws it as a trail and every
// chart, streak and insight counts it as if it had been logged at the time.
//
// A condition becomes as few episodes as it honestly can. Given the days it was
// actually present, its runs of consecutive days are each written as ONE span:
// "manic Saturday and Sunday, depressed Monday" is two spans, not five daily
// fragments, because that is what those days were. A condition given no days is
// taken to have run the whole stretch.
//
// Returns descriptors, not stored rows: the caller mints episodes through
// wellness.addEpisode so ids and open-span rules stay in one place.
export function buildCatchUp(gap, { mood = null, emotions = [], note = '', conditions = [], conditionIds = [], intensity = null, photos = [], now = Date.now() } = {}) {
  const days = (gap && gap.days && gap.days.length) ? gap.days : splitByDay(gap.startMs, gap.endMs)
  const text = (note || '').trim()
  const checkins = mood
    ? days.map((seg, i) => ({
        id: 'ci-' + now.toString(36) + '-' + i,
        date: seg.key,
        mood,
        energy: 3,
        emotions: [...(emotions || [])],
        // The words and any photo belong to the moment you wrote them, so they
        // ride the first day rather than being copied onto every one.
        note: i === 0 ? text : '',
        photos: i === 0 ? [...(photos || [])] : [],
        ts: new Date(seg.startMs).toISOString(),
        endTs: new Date(seg.endMs).toISOString(),
        via: 'absence',
      }))
    : []
  // `conditionIds` is the shorthand for "this one ran the whole stretch".
  const picked = [
    ...(conditions || []).filter(c => c && c.effectId),
    ...(conditionIds || []).map(effectId => ({ effectId, days: null })),
  ]
  const episodes = []
  for (const c of picked) {
    for (const run of dayRuns(days, c.days)) {
      episodes.push({
        effectId: c.effectId,
        start: new Date(run[0].startMs).toISOString(),
        end: new Date(run[run.length - 1].endMs).toISOString(),
        note: text,
        intensity: (c.intensity ?? intensity) || null,
        via: 'absence',
      })
    }
  }
  return { checkins, episodes }
}
// The day segments a condition covers, split into runs of consecutive days.
// No selection at all means the whole stretch, in one run.
function dayRuns(days, keys) {
  if (!keys || !keys.length) return days.length ? [days] : []
  const want = new Set(keys)
  const runs = []
  let run = null
  for (const seg of days) {
    if (!want.has(seg.key)) { run = null; continue }
    if (!run) { run = []; runs.push(run) }
    run.push(seg)
  }
  return runs
}
