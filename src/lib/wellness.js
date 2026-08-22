// src/lib/wellness.js
// ─────────────────────────────────────────────────────────────
// The brain behind Bloom's wellness tab — a Finch/Quabble-style companion you
// grow by checking in, a DnD-style set of "status effects" you can toggle on and
// off (each toggle records a real time span), and the pattern analysis that ties
// mood, energy, conditions and finished tasks back together.
//
// Everything here is pure — no React, no storage — so it can be reasoned about
// (and unit-tested) on its own. The component wires it to the synced kv_store
// blobs (see storage.js: wellness_checkins / wellness_effects / wellness_episodes
// / wellness_game) and to the app's existing task/log data.
// ─────────────────────────────────────────────────────────────

// ── Dates ──────────────────────────────────────────────────────
// The app keys every day as local YYYY-MM-DD; we match that exactly so a
// wellness day lines up with the same day on the calendar and the task log.
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
// The last `n` day-keys ending today, oldest first (…, yesterday, today).
export function recentDayKeys(n) {
  const out = []
  const base = new Date(); base.setHours(0, 0, 0, 0)
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base); d.setDate(base.getDate() - i)
    out.push(dayKey(d))
  }
  return out
}
export function daysBetween(aKey, bKey) {
  const a = keyToDate(aKey), b = keyToDate(bKey)
  return Math.round((b - a) / 86400000)
}

// ── Mood & energy scales ───────────────────────────────────────
// Five steps each, warm and legible — the faces double as the reward's flavor.
export const MOODS = [
  { v: 1, emoji: '😞', label: 'Rough',   color: '#B5838D' },
  { v: 2, emoji: '😕', label: 'Low',     color: '#C99AA0' },
  { v: 3, emoji: '😐', label: 'Okay',    color: '#D9B48F' },
  { v: 4, emoji: '🙂', label: 'Good',    color: '#89B0AE' },
  { v: 5, emoji: '😄', label: 'Great',   color: '#6F9F8B' },
]
export const ENERGY = [
  { v: 1, label: 'Drained' },
  { v: 2, label: 'Tired' },
  { v: 3, label: 'Steady' },
  { v: 4, label: 'Lively' },
  { v: 5, label: 'Buzzing' },
]
export function moodMeta(v) { return MOODS.find(m => m.v === v) || MOODS[2] }

// A rotating set of gentle reflection prompts — the "story"/therapist nudge that
// gives a check-in something to answer beyond a number. Seeded by day so the
// prompt is stable within a day but moves on tomorrow.
export const REFLECTION_PROMPTS = [
  'What is one thing that went okay today?',
  'What is taking up the most space in your head right now?',
  'What would make tomorrow 1% easier?',
  'What is your body asking for right now?',
  'Who or what are you grateful for today?',
  'What is one thing you can let go of tonight?',
  'When did you feel most like yourself today?',
  'What drained you today, and what refilled you?',
  'What is a small win worth naming?',
  'What do you need more of this week?',
]
export function promptForDay(key = dayKey()) {
  // Sum the digits of the date for a cheap, stable per-day index.
  const n = key.replace(/\D/g, '').split('').reduce((a, c) => a + (+c), 0)
  return REFLECTION_PROMPTS[n % REFLECTION_PROMPTS.length]
}

// ── The companion (gamified growth) ────────────────────────────
// A little plant that grows as you tend to it. Each stage is unlocked by level;
// the emoji is the reward you watch change. Kept deliberately plant-themed to
// match Bloom's whole metaphor.
export const COMPANION_STAGES = [
  { level: 1,  emoji: '🌱', name: 'Seedling' },
  { level: 3,  emoji: '🌿', name: 'Sprout' },
  { level: 6,  emoji: '☘️', name: 'Growing' },
  { level: 10, emoji: '🪴', name: 'Potted' },
  { level: 15, emoji: '🌷', name: 'Budding' },
  { level: 22, emoji: '🌸', name: 'Blooming' },
  { level: 30, emoji: '🌻', name: 'Radiant' },
  { level: 42, emoji: '🌳', name: 'Flourishing' },
]
export function stageForLevel(level) {
  let s = COMPANION_STAGES[0]
  for (const st of COMPANION_STAGES) if (level >= st.level) s = st
  return s
}
// The next growth milestone (for "3 levels to 🌷"), or null once fully grown.
export function nextStage(level) {
  return COMPANION_STAGES.find(s => s.level > level) || null
}

// Leveling curve: gently rising XP cost so early levels come fast and later ones
// feel earned. Level n needs this much XP banked to reach n+1.
export function xpForLevel(level) {
  return 40 + (level - 1) * 20
}
// Turn a running XP total into { level, into, need, pct } for the progress ring.
export function levelFromXp(totalXp) {
  let level = 1, xp = Math.max(0, Math.floor(totalXp || 0))
  while (xp >= xpForLevel(level)) { xp -= xpForLevel(level); level++ }
  const need = xpForLevel(level)
  return { level, into: xp, need, pct: Math.round((xp / need) * 100) }
}

// Reward sizes (petals == XP == the single soft currency, kept simple).
export const REWARDS = {
  checkIn: 12,       // a daily mood check-in
  reflection: 6,     // …with a written reflection
  streakBonus: 3,    // per consecutive day, capped
  streakBonusCap: 21,
  logEffect: 2,      // toggling a status effect on (self-awareness nudge)
}

// The default, freshly-seeded game state.
export function freshGame() {
  return { xp: 0, petals: 0, streak: 0, best: 0, lastCheckIn: null, companionName: 'Sprout', totalCheckIns: 0 }
}

// Apply a daily check-in to the game state and return { game, earned, leveledTo }.
// Streak counts consecutive calendar days; a same-day re-check never double-pays.
export function applyCheckIn(game, { key = dayKey(), hasReflection = false } = {}) {
  const g = { ...freshGame(), ...(game || {}) }
  const beforeLevel = levelFromXp(g.xp).level
  if (g.lastCheckIn === key) {
    // Already checked in today — editing doesn't re-award, just returns state.
    return { game: g, earned: 0, leveledTo: null }
  }
  const gap = g.lastCheckIn ? daysBetween(g.lastCheckIn, key) : null
  g.streak = gap === 1 ? (g.streak || 0) + 1 : 1
  g.best = Math.max(g.best || 0, g.streak)
  const streakBonus = Math.min(REWARDS.streakBonusCap, (g.streak - 1) * REWARDS.streakBonus)
  const earned = REWARDS.checkIn + (hasReflection ? REWARDS.reflection : 0) + streakBonus
  g.xp = (g.xp || 0) + earned
  g.petals = (g.petals || 0) + earned
  g.lastCheckIn = key
  g.totalCheckIns = (g.totalCheckIns || 0) + 1
  const afterLevel = levelFromXp(g.xp).level
  return { game: g, earned, leveledTo: afterLevel > beforeLevel ? afterLevel : null }
}
// Award a small amount for any other tended action (e.g. logging an effect).
export function awardPetals(game, amount) {
  const g = { ...freshGame(), ...(game || {}) }
  g.xp = (g.xp || 0) + amount
  g.petals = (g.petals || 0) + amount
  return g
}
// If today has passed with no check-in for 2+ days, the visible streak is stale;
// this reports the streak the user actually still holds (0 once it's broken).
export function liveStreak(game, todayKey = dayKey()) {
  if (!game || !game.lastCheckIn) return 0
  const gap = daysBetween(game.lastCheckIn, todayKey)
  return gap <= 1 ? (game.streak || 0) : 0
}

// ── Status effects (DnD-style conditions) ──────────────────────
// A toggleable condition — physical or mental — you can flip on when it starts
// and off when it lifts. Each is a definition; the on/off spans live as episodes.
// `kind` sorts them into the two columns; `icon` is a glyph id (see glyphs.jsx).
export const DEFAULT_EFFECTS = [
  { id: 'fx-migraine',  name: 'Migraine',    icon: 'brain',   color: '#B5838D', kind: 'physical' },
  { id: 'fx-nausea',    name: 'Nauseous',    icon: 'droplet', color: '#89B0AE', kind: 'physical' },
  { id: 'fx-fatigue',   name: 'Fatigued',    icon: 'battery', color: '#9A8FB0', kind: 'physical' },
  { id: 'fx-pain',      name: 'In pain',     icon: 'flame',   color: '#C97A6D', kind: 'physical' },
  { id: 'fx-sick',      name: 'Under weather',icon: 'cloud',  color: '#8FA9C0', kind: 'physical' },
  { id: 'fx-rested',    name: 'Well-rested', icon: 'sun',     color: '#6F9F8B', kind: 'physical' },
  { id: 'fx-anxious',   name: 'Anxious',     icon: 'storm',   color: '#8896B0', kind: 'mental' },
  { id: 'fx-low',       name: 'Low mood',    icon: 'rain',    color: '#7E92A6', kind: 'mental' },
  { id: 'fx-foggy',     name: 'Brain fog',   icon: 'cloud',   color: '#A79CB5', kind: 'mental' },
  { id: 'fx-wired',     name: 'Overstimulated', icon: 'flame',color: '#D0956B', kind: 'mental' },
  { id: 'fx-calm',      name: 'Calm',        icon: 'meditation', color: '#7BB0A6', kind: 'mental' },
  { id: 'fx-focused',   name: 'Focused',     icon: 'target',  color: '#6F9F8B', kind: 'mental' },
]
// A couple of effects read as "good" — used only to phrase insights kindly and
// to tint the chip; it never changes the math.
export const POSITIVE_EFFECTS = new Set(['fx-rested', 'fx-calm', 'fx-focused'])

export function makeEffect({ name, icon, color, kind }) {
  return {
    id: 'fx-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: (name || 'New condition').trim(),
    icon: icon || 'sparkle',
    color: color || '#89B0AE',
    kind: kind === 'mental' ? 'mental' : 'physical',
  }
}

// ── Episodes (the recorded on/off spans) ───────────────────────
// Each episode is { id, effectId, start:ISO, end:ISO|null }. An open episode
// (end === null) is "active now". Toggling on opens one; toggling off closes the
// open one. Kept newest-relevant but never mutated in place by callers.
export function activeEpisode(episodes, effectId) {
  return (episodes || []).find(e => e.effectId === effectId && !e.end) || null
}
export function isActive(episodes, effectId) {
  return !!activeEpisode(episodes, effectId)
}
export function startEpisode(episodes, effectId, at = new Date()) {
  if (isActive(episodes, effectId)) return episodes || []
  return [{ id: 'ep-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), effectId, start: at.toISOString(), end: null }, ...(episodes || [])]
}
export function endEpisode(episodes, effectId, at = new Date()) {
  let done = false
  return (episodes || []).map(e => {
    if (!done && e.effectId === effectId && !e.end) { done = true; return { ...e, end: at.toISOString() } }
    return e
  })
}
export function toggleEpisode(episodes, effectId, at = new Date()) {
  return isActive(episodes, effectId) ? endEpisode(episodes, effectId, at) : startEpisode(episodes, effectId, at)
}
// Total open-ended or closed duration of an episode, in minutes.
export function episodeMinutes(ep, now = Date.now()) {
  const start = Date.parse(ep.start)
  const end = ep.end ? Date.parse(ep.end) : now
  return Math.max(0, Math.round((end - start) / 60000))
}
// "3h 20m" / "45m" / "2d 4h" — compact human duration from minutes.
export function fmtDuration(mins) {
  const m = Math.max(0, Math.round(mins || 0))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), rm = m % 60
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`
  const d = Math.floor(h / 24), rh = h % 24
  return rh ? `${d}d ${rh}h` : `${d}d`
}

// Does any episode of `effectId` overlap the calendar day `key`?
export function effectOnDay(episodes, effectId, key) {
  const dayStart = keyToDate(key).getTime()
  const dayEnd = dayStart + 86400000
  return (episodes || []).some(e => {
    if (e.effectId !== effectId) return false
    const s = Date.parse(e.start)
    const en = e.end ? Date.parse(e.end) : Date.now()
    return s < dayEnd && en >= dayStart
  })
}
// Roll episodes up per effect: count of spans + total tracked minutes.
export function effectTotals(episodes) {
  const by = new Map()
  for (const e of episodes || []) {
    const row = by.get(e.effectId) || { effectId: e.effectId, count: 0, mins: 0 }
    row.count += 1; row.mins += episodeMinutes(e)
    by.set(e.effectId, row)
  }
  return by
}

// ── Per-day records + pattern analysis ─────────────────────────
// Fold everything the app knows into one row per day over a window: the mood &
// energy from that day's check-in, which effects were active, and how many
// tasks were finished (from the completion log). This is the table every
// insight is computed from.
//   checkins: [{ date, mood, energy, note }]
//   log:      [{ date, ... }]  (one entry per finished task, from storage.getLogEntries)
export function buildDailyRecords({ checkins = [], episodes = [], log = [], effects = [], windowDays = 60 }) {
  const keys = recentDayKeys(windowDays)
  const ci = new Map((checkins || []).map(c => [c.date, c]))
  const tasksByDay = new Map()
  for (const e of log || []) {
    const d = e.date || (e.ts ? String(e.ts).slice(0, 10) : '')
    if (d) tasksByDay.set(d, (tasksByDay.get(d) || 0) + 1)
  }
  return keys.map(key => {
    const c = ci.get(key)
    const active = (effects || []).filter(fx => effectOnDay(episodes, fx.id, key)).map(fx => fx.id)
    return {
      date: key,
      mood: c ? c.mood : null,
      energy: c ? c.energy : null,
      note: c ? (c.note || '') : '',
      effects: active,
      tasks: tasksByDay.get(key) || 0,
    }
  })
}

function mean(nums) {
  const xs = nums.filter(n => typeof n === 'number' && !Number.isNaN(n))
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}
function round1(n) { return n == null ? null : Math.round(n * 10) / 10 }

// Compare days WITH an effect against days WITHOUT it, for a given metric.
// Returns null unless both groups have enough samples to be worth mentioning.
function compareOn(records, hasEffect, metric, minSamples = 3) {
  const withE = records.filter(r => r[metric] != null && hasEffect(r))
  const without = records.filter(r => r[metric] != null && !hasEffect(r))
  if (withE.length < minSamples || without.length < minSamples) return null
  const a = mean(withE.map(r => r[metric]))
  const b = mean(without.map(r => r[metric]))
  if (a == null || b == null) return null
  return { withMean: a, withoutMean: b, delta: a - b, nWith: withE.length, nWithout: without.length }
}

// The headline analysis: for each effect, how mood / energy / task-completion
// shifts on the days it's active, plus a couple of whole-history correlations.
// Every insight carries a plain-language sentence and a signed strength so the
// UI can sort and tint them. Only reasonably-supported findings are returned.
export function computeInsights({ records = [], effects = [] }) {
  const insights = []
  const named = new Map((effects || []).map(fx => [fx.id, fx]))
  const tracked = records.filter(r => r.mood != null).length

  for (const fx of effects) {
    const has = r => r.effects.includes(fx.id)
    const activeDays = records.filter(has).length
    if (activeDays < 3) continue
    const good = POSITIVE_EFFECTS.has(fx.id)

    const mood = compareOn(records, has, 'mood')
    if (mood && Math.abs(mood.delta) >= 0.4) {
      const dir = mood.delta < 0 ? 'lower' : 'higher'
      insights.push({
        id: fx.id + ':mood', effectId: fx.id, metric: 'mood',
        strength: mood.delta, samples: mood.nWith, good,
        text: `When ${lc(fx.name)} is active, your mood runs ${Math.abs(round1(mood.delta))} ${dir} on average (${round1(mood.withMean)} vs ${round1(mood.withoutMean)}, across ${mood.nWith} days).`,
      })
    }
    const energy = compareOn(records, has, 'energy')
    if (energy && Math.abs(energy.delta) >= 0.4) {
      const dir = energy.delta < 0 ? 'lower' : 'higher'
      insights.push({
        id: fx.id + ':energy', effectId: fx.id, metric: 'energy',
        strength: energy.delta, samples: energy.nWith, good,
        text: `Energy is ${Math.abs(round1(energy.delta))} ${dir} on ${lc(fx.name)} days (${round1(energy.withMean)} vs ${round1(energy.withoutMean)}).`,
      })
    }
    const tasks = compareOn(records, has, 'tasks')
    if (tasks && Math.abs(tasks.delta) >= 0.8) {
      const dir = tasks.delta < 0 ? 'fewer' : 'more'
      insights.push({
        id: fx.id + ':tasks', effectId: fx.id, metric: 'tasks',
        strength: tasks.delta, samples: tasks.nWith, good,
        text: `You finish ${Math.abs(round1(tasks.delta))} ${dir} tasks per day when ${lc(fx.name)} is active (${round1(tasks.withMean)} vs ${round1(tasks.withoutMean)}).`,
      })
    }
  }

  // Whole-history: does energy track with mood? Does getting things done?
  const both = records.filter(r => r.mood != null && r.energy != null)
  const rEnergy = pearson(both.map(r => r.mood), both.map(r => r.energy))
  if (both.length >= 6 && rEnergy != null && Math.abs(rEnergy) >= 0.35) {
    insights.push({
      id: 'corr:energy', effectId: null, metric: 'mood', strength: rEnergy * 2, samples: both.length, good: rEnergy > 0,
      text: `Your mood and energy move together${rEnergy > 0 ? '' : ' inversely'} (${rEnergy > 0 ? '+' : ''}${round1(rEnergy)} correlation over ${both.length} days).`,
    })
  }
  const md = records.filter(r => r.mood != null)
  const rTasks = pearson(md.map(r => r.mood), md.map(r => r.tasks))
  if (md.length >= 6 && rTasks != null && Math.abs(rTasks) >= 0.3) {
    insights.push({
      id: 'corr:tasks', effectId: null, metric: 'tasks', strength: rTasks * 2, samples: md.length, good: rTasks > 0,
      text: rTasks > 0
        ? `Getting things done and feeling good tend to show up together (+${round1(rTasks)} over ${md.length} days).`
        : `On your busiest days your mood dips — worth watching for overload (${round1(rTasks)} over ${md.length} days).`,
    })
  }

  // Co-occurring conditions: two effects that keep landing on the same days.
  for (let i = 0; i < effects.length; i++) {
    for (let j = i + 1; j < effects.length; j++) {
      const a = effects[i], b = effects[j]
      const both2 = records.filter(r => r.effects.includes(a.id) && r.effects.includes(b.id)).length
      const aOnly = records.filter(r => r.effects.includes(a.id)).length
      if (both2 >= 3 && aOnly > 0 && both2 / aOnly >= 0.6) {
        insights.push({
          id: `co:${a.id}:${b.id}`, effectId: a.id, metric: 'co', strength: both2 / aOnly, samples: both2, good: false,
          text: `${cap(a.name)} and ${lc(b.name)} tend to show up on the same days (${both2} of ${aOnly}).`,
        })
      }
    }
  }

  insights.sort((x, y) => Math.abs(y.strength) - Math.abs(x.strength))
  return { insights, tracked, named }
}

// Pearson correlation, or null when there isn't enough spread to mean anything.
function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  const mx = mean(xs), my = mean(ys)
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my
    num += a * b; dx += a * a; dy += b * b
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

function lc(s) { return (s || '').charAt(0).toLowerCase() + (s || '').slice(1) }
function cap(s) { return (s || '').charAt(0).toUpperCase() + (s || '').slice(1) }

// A tiny 14-day mood trend for the sparkline: [{ date, mood|null }].
export function moodTrend(checkins, n = 14) {
  const ci = new Map((checkins || []).map(c => [c.date, c]))
  return recentDayKeys(n).map(key => ({ date: key, mood: ci.get(key) ? ci.get(key).mood : null }))
}

// The shareable progress summary (plain text) — used by the Web Share sheet and
// the copy button, so "share with a friend" works with no social backend.
export function shareText({ game, tracked, stage }) {
  const lv = levelFromXp(game?.xp || 0)
  const streak = liveStreak(game)
  const lines = [
    `${stage.emoji} My Bloom companion is a level ${lv.level} ${stage.name}!`,
    `🔥 ${streak}-day check-in streak · 🌸 ${game?.petals || 0} petals`,
    `📈 ${tracked} days of mood tracked`,
    `Growing a calmer week, one check-in at a time.`,
  ]
  return lines.join('\n')
}
