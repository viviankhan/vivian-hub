// src/lib/advisor.js
// ─────────────────────────────────────────────────────────────
// The guide's counsel. A small, deterministic advice engine that reads the
// day's signals — mood, physical conditions, and the task load — and speaks a
// few gentle, specific tips through three lenses: mind (therapist), body
// (doctor), and work (career advisor). No network, no model — just the user's
// own data, reflected back kindly.
// ─────────────────────────────────────────────────────────────
import { fmtDuration, POSITIVE_EFFECTS } from './wellness.js'

export const LENSES = {
  mind: { label: 'Mind',  glyph: 'brain',  tint: '#8FB0D8' },
  body: { label: 'Body',  glyph: 'heart',  tint: '#7BB0A6' },
  work: { label: 'Work',  glyph: 'target', tint: '#D0956B' },
}

// Least-squares slope of a mood series (ignoring blank days). Positive = rising.
function trendSlope(trend) {
  const pts = (trend || []).map((d, i) => [i, d.mood]).filter(p => p[1] != null)
  if (pts.length < 4) return null
  const n = pts.length
  const mx = pts.reduce((s, p) => s + p[0], 0) / n
  const my = pts.reduce((s, p) => s + p[1], 0) / n
  let num = 0, den = 0
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2 }
  return den === 0 ? null : num / den
}

// ctx: { hasCheckinToday, moodToday, emotionsToday, moodTrend, activeEffects
//        (each {id,name,kind,mins,good}), everTracked, insights, tasksDone, tasksTotal }
// Returns [{ lens, text }] — always at least one tip per lens, most-relevant first.
export function advise(ctx = {}) {
  const {
    hasCheckinToday = false, moodToday = null, moodTrend = [],
    activeEffects = [], everTracked = false, insights = [],
    tasksDone = 0, tasksTotal = 0,
  } = ctx
  const slope = trendSlope(moodTrend)
  const out = []

  // ── Mind (therapist) ──────────────────────────────────────
  if (!hasCheckinToday) {
    out.push({ lens: 'mind', text: 'How are you arriving today? A quick check-in below helps me learn your rhythms — there\'s no wrong answer.' })
  } else if (moodToday != null && moodToday <= 2) {
    out.push({ lens: 'mind', text: 'Today feels heavy, and that\'s allowed. You don\'t have to fix it — one small kindness toward yourself is enough right now.' })
  } else if (moodToday != null && moodToday >= 4) {
    out.push({ lens: 'mind', text: 'You\'re shining today. Worth noticing what\'s feeding that — it\'s a map back here on the harder days.' })
  } else {
    out.push({ lens: 'mind', text: 'A steady middle day. Steady is underrated — it\'s the ground the good days grow from.' })
  }
  if (slope != null && slope <= -0.06) {
    out.push({ lens: 'mind', text: 'Your last stretch has been trending down. Be gentle with what you expect of yourself this week.' })
  } else if (slope != null && slope >= 0.06) {
    out.push({ lens: 'mind', text: 'Your mood has been climbing lately — something\'s working. Keep doing more of it.' })
  }

  // ── Body (doctor) ─────────────────────────────────────────
  const lingering = activeEffects.filter(e => !e.good && e.mins >= 180).sort((a, b) => b.mins - a.mins)[0]
  const goodNow = activeEffects.find(e => e.good)
  if (lingering) {
    out.push({ lens: 'body', text: `${lingering.name} has been with you for ${fmtDuration(lingering.mins)}. If it lingers, rest or water may do more than willpower.` })
  } else if (goodNow) {
    out.push({ lens: 'body', text: `You\'re ${goodNow.name.toLowerCase()} right now — a good window to spend energy on what actually matters to you.` })
  } else if (!everTracked) {
    out.push({ lens: 'body', text: 'If something physical is off — tired, achy, wired — mark it below. Patterns only surface once we start tracking them.' })
  } else {
    out.push({ lens: 'body', text: 'Nothing flagged in your body signals today. Keep listening — you know your baseline better than anyone.' })
  }
  const bodyInsight = insights.find(i => i.effectId && (i.metric === 'mood' || i.metric === 'energy') && !i.good)
  if (bodyInsight) out.push({ lens: 'body', text: bodyInsight.text })

  // ── Work (career advisor) ─────────────────────────────────
  if (tasksTotal === 0) {
    out.push({ lens: 'work', text: 'Nothing scheduled today. A blank day is a chance to choose one thing that moves you forward — not ten that drain you.' })
  } else if (tasksDone >= tasksTotal) {
    out.push({ lens: 'work', text: 'Everything\'s checked off — genuinely done. Rest is part of the work; let today close.' })
  } else if (moodToday != null && moodToday <= 2 && tasksTotal >= 6) {
    out.push({ lens: 'work', text: `Heavy day, full plate — ${tasksTotal} things on. Protect your energy: it\'s fine to defer what can wait.` })
  } else if (tasksTotal >= 8) {
    out.push({ lens: 'work', text: `${tasksTotal} things on today — a lot to hold. Pick the two that truly matter and let the rest be optional.` })
  } else {
    out.push({ lens: 'work', text: `${tasksDone} of ${tasksTotal} done. Momentum beats intensity — the next small step is enough.` })
  }
  const taskInsight = insights.find(i => i.metric === 'tasks' && i.effectId)
  if (taskInsight) out.push({ lens: 'work', text: taskInsight.text })

  return out
}
