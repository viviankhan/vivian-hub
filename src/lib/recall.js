// src/lib/recall.js
// ─────────────────────────────────────────────────────────────
// Answers questions about your own life from what Bloom already has:
//
//   • "How did jogging feel?"            → the notes, moods and photos you left
//                                          on jogging, with when/how long/where
//   • "Did I take my meds this week?"    → which days each med was skipped, and
//     "When did I run out of Lexapro?"     how you were doing on them
//   • "When did I last have a migraine?" → your condition log
//   • "How was my mood at work?"         → moods logged while you were there
//   • "How long was I at Roca?"          → the visit log (see visits.js)
//   • "What did I write at work today?"  → journal + notes from that place
//
// Everything is answered here on the device; nothing is sent to the AI. Every
// "moment" (a task note, a journal entry, a mood check-in, a condition, a
// skipped dose) carries a time, so it can be tied to the place you were at
// that time even if it was written without one.
//
// Pure: hand it the data (see gatherRecallData in AiAssistant) and `now`.
// ─────────────────────────────────────────────────────────────
import { recurringOccurrencesForDate } from './occurrences.js'
import { parsePlaceQuestion, answerPlaceQuestion, staysFor, nameScore, takeScope } from './visits.js'
import { medAlerts, isMedAlert } from './lifelogPure.js'

const MOOD_LABEL = { 1: 'Rough', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' }
const DAY = 86400000

// ── Question shape ─────────────────────────────────────────────

const COMMAND_START = /^(add|make|create|schedule|put|move|reschedule|remind|set|book|mark|check|uncheck|delete|remove|plan|log|record|track|please)\b/i
const QUESTION_START = /^(how|what|whats|what's|when|where|did|do|does|was|were|have|has|had|am|is|are|why|which|who|tell me|show me|list|any)\b/i
// Asking the assistant to *do* something, however it's phrased.
const REQUEST = /\b(can you|could you|would you|will you|please|help me|i want you to|i need you to|reflect|log|record|add|put|schedule|enter|fill in|backfill|make (?:a|an|the|some|these|them|it)|create)\b/i
// Is this a question about me (to answer), rather than something to plan?
// Only text that *starts* as a question counts: "I worked 10–7… can you
// reflect that?" ends in a question mark but is something to log.
export function isRecallQuestion(text) {
  const t = String(text || '').trim()
  if (!t || COMMAND_START.test(t) || REQUEST.test(t)) return false
  return QUESTION_START.test(t)
}

// Does the request describe things you already did ("I worked 10–9 Tuesday",
// "I pulled late nights last week")? Tasks planned from it that are already
// over are logged as done, so they count toward your hours.
const PAST_SELF = /\b(?:i|we)\s+(?:\w+\s+){0,2}?(?:(?!(?:need|feed|seed|speed|proceed|exceed|succeed|bleed|breed)\b)\w+ed|went|did|had|was|were|spent|ran|took|got|met|made|ate|slept|saw|left|came|drove|wrote|read|taught|pulled|kept|sat|stood|built|began|fought|felt|led|lost|paid|sent|thought|told|won|stayed)\b/i
export function isLogOfPast(text) { return PAST_SELF.test(String(text || '')) }

// ── Words ──────────────────────────────────────────────────────

function norm(s) {
  return String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}
const STOP = new Set(('a an the my me i im ive id was were is are am be been being do did does done have has had how what whats when where why which who '
  + 'to of in on at for with about from by it its this that these those and or but so if then than just really very much many '
  + 'feel feeling felt like go goes going went get got make made take took taking tell show say said know remember write wrote written '
  + 'time times long last first ever recently lately day days week weeks month months year today yesterday tonight morning evening night '
  + 'any anything something everything all some there here can could would should will you your yourself myself '
  + 'note notes notebook journal entry entries thought thoughts mood moods log logged '
  + 'happy sad anxious stressed upset emotion emotions overall generally been').split(' '))

// Light stemming so "jogging" finds "jog", "jogged", "jogs"; "ran" finds "run".
const IRREGULAR = { ran: 'run', running: 'run', swam: 'swim', swimming: 'swim', went: 'go', felt: 'feel', slept: 'sleep', ate: 'eat' }
export function stem(w) {
  w = norm(w)
  if (IRREGULAR[w]) return IRREGULAR[w]
  let s = w
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3)
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2)
  else if (s.length > 3 && s.endsWith('es') && !s.endsWith('ses')) s = s.slice(0, -2)
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1)
  if (s.length > 3 && s[s.length - 1] === s[s.length - 2] && !/[aeiou]/.test(s[s.length - 1])) s = s.slice(0, -1)   // jogg → jog
  return s
}
function stems(text) { return norm(text).split(' ').filter(Boolean).map(stem) }
// The words in a question worth searching for.
export function topicWords(q) {
  return [...new Set(norm(q).split(' ').filter(w => w && !STOP.has(w) && w.length > 2).map(stem))]
}
function mentions(text, words) {
  if (!words.length) return false
  const have = new Set(stems(text))
  return words.some(w => have.has(w) || [...have].some(h => h.length >= 4 && w.length >= 4 && (h.startsWith(w) || w.startsWith(h))))
}

// ── Formatting ─────────────────────────────────────────────────

function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
function keyOf(t) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function dateOfKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime() }
function fmtDay(t, now) {
  const diff = Math.round((startOfDay(now) - startOfDay(t)) / DAY)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff > 1 && diff < 7) return new Date(t).toLocaleDateString('en-US', { weekday: 'long' })
  return new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(t) { return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }
function fmtHHMM(hhmm) {
  if (!hhmm) return ''
  const [h, m] = String(hhmm).split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function fmtMins(m) {
  m = Math.round(m || 0)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  if (h < 24) return r ? `${h}h ${r}m` : `${h}h`
  const d = Math.floor(h / 24), rh = h % 24
  return rh ? `${d}d ${rh}h` : `${d}d`
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s }
function clip(s, n = 220) { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s }
const stripTime = (label) => String(label || '').replace(/^\d{1,2}:\d{2}\s*[AP]M\s*—\s*/i, '').trim()

// ── Moments: everything with a time ────────────────────────────

// Where were you at time t? (by the visit log)
function placeAt(stays, t) {
  for (let i = (stays || []).length - 1; i >= 0; i--) {
    const s = stays[i]
    if (t >= s.start - 5 * 60000 && t <= s.end + 5 * 60000) return (s.name || '').split(',')[0].trim()
    if (s.end < t - DAY) break
  }
  return ''
}

// Flatten every record into moments: { kind, at, date, title, text, mood, photos, place, mins?, time?, taskId?, skipped? }
export function buildMoments(data) {
  const { dayNotes = {}, journal = [], checkins = [], episodes = [], effects = [], commitments = [], stays = [] } = data
  const out = []
  const fxName = (id) => (effects || []).find(e => e.id === id)?.name || 'Condition'
  for (const n of Object.values(dayNotes || {})) {
    if (!n || !n.date) continue
    const at = n.time ? dateOfKey(n.date) + (+n.time.slice(0, 2) * 60 + +n.time.slice(3, 5)) * 60000 : Date.parse(n.at || '') || dateOfKey(n.date) + 12 * 3600000
    out.push({ kind: n.skipped ? 'skip' : 'note', at, date: n.date, title: n.title || '', text: n.text || '', mood: n.mood || null, photos: n.photos || [], place: n.place || placeAt(stays, at), mins: n.durationMins || null, time: n.time || '', taskId: n.taskId, skipped: !!n.skipped })
  }
  // A one-off's own notes are part of what happened too.
  for (const c of commitments || []) {
    if (!c || !c.date || !(c.description || '').trim()) continue
    const at = c.time ? dateOfKey(c.date) + (+c.time.slice(0, 2) * 60 + +c.time.slice(3, 5)) * 60000 : dateOfKey(c.date) + 12 * 3600000
    out.push({ kind: 'task', at, date: c.date, title: c.text || '', text: c.description, mood: null, photos: [], place: (c.location && c.location.name) || placeAt(stays, at), mins: c.durationMins || null, time: c.time || '', taskId: c.id })
  }
  for (const j of journal || []) {
    const at = Date.parse(j.at); if (!Number.isFinite(at)) continue
    out.push({ kind: 'journal', at, date: keyOf(at), title: 'Journal', text: j.text || '', mood: j.mood || null, photos: j.photos || [], place: j.place || placeAt(stays, at) })
  }
  for (const c of checkins || []) {
    const at = Date.parse(c.ts || '') || (c.date ? dateOfKey(c.date) + 12 * 3600000 : NaN); if (!Number.isFinite(at)) continue
    out.push({ kind: 'checkin', at, date: c.date || keyOf(at), title: 'Mood check-in', text: c.note || '', mood: c.mood || null, photos: c.photos || [], place: placeAt(stays, at) })
  }
  for (const e of episodes || []) {
    const at = Date.parse(e.start); if (!Number.isFinite(at)) continue
    const end = e.end ? Date.parse(e.end) : null
    out.push({ kind: 'episode', at, end, date: keyOf(at), title: fxName(e.effectId), effectId: e.effectId, text: e.note || '', mood: null, photos: e.photos || [], place: placeAt(stays, at), intensity: e.intensity ?? null, mins: end ? (end - at) / 60000 : null })
  }
  return out.sort((a, b) => b.at - a.at)
}

function itemOf(m, now) {
  const bits = []
  if (m.time) bits.push(m.mins ? `${fmtHHMM(m.time)} · ${fmtMins(m.mins)}` : fmtHHMM(m.time))
  else if (m.kind === 'journal' || m.kind === 'checkin') bits.push(fmtTime(m.at))
  else if (m.kind === 'episode') bits.push(m.end ? fmtMins(m.mins) : `since ${fmtTime(m.at)}, still going`)
  if (m.place) bits.push(m.place)
  if (m.mood) bits.push(MOOD_LABEL[m.mood] || '')
  if (m.intensity) bits.push(`intensity ${m.intensity}/10`)
  if (m.skipped) bits.push('skipped')
  return { when: cap(fmtDay(m.at, now)), title: m.title, meta: bits.filter(Boolean).join(' · '), text: m.text, photos: m.photos || [] }
}

// ── Medications ────────────────────────────────────────────────

function medTasks(data) {
  const ids = data.medIds || {}
  const out = []
  for (const r of data.recurring || []) if (ids[r.id]) out.push({ id: r.id, title: stripTime(r.title || r.label || r.text), rec: r })
  for (const c of data.commitments || []) if (ids[c.id]) out.push({ id: c.id, title: c.text || 'Medication', date: c.date })
  return out
}

// Per med: { title, due, skipped: [{date, mood, text}] } over [from, to) (ms).
export function medAdherence(data, from, to, now) {
  const todayKey = keyOf(now)
  return medTasks(data).map(m => {
    const skipped = [], dueDays = []
    for (let t = startOfDay(from); t < to; t += DAY) {
      const k = keyOf(t)
      if (k > todayKey) break
      const due = m.rec ? recurringOccurrencesForDate([m.rec], k, data.exceptions || {}).length > 0 : m.date === k
      if (!due) continue
      dueDays.push(k)
      const key = `${k}_${m.id}`
      const note = (data.dayNotes || {})[key]
      if ((data.completions || {})[key] === false || note?.skipped) skipped.push({ date: k, mood: note?.mood || null, text: note?.text || '' })
    }
    return { id: m.id, title: m.title, due: dueDays.length, skipped }
  })
}

function answerMeds(q, data, now) {
  const meds = medTasks(data)
  const nq = norm(q)
  const named = meds.filter(m => mentions(m.title, topicWords(q)))
  const pick = named.length ? named : meds
  // Ran out / refill questions → the problems you noted, cleared or not.
  if (/\b(ran out|run out|running out|out of|refill|pharmacy|prescription|problem|issue|side effect)/.test(nq)) {
    const alerts = medAlerts({ dayNotes: data.dayNotes, journal: data.journal, medIds: data.medIds, cleared: {} })
      .filter(a => !named.length || named.some(m => mentions(a.text + ' ' + a.title, topicWords(m.title))))
    if (!alerts.length) return { text: named.length ? `I don’t see any notes about running out of ${named.map(m => m.title).join(' or ')}.` : 'I don’t see any medication problems in your notes.' }
    const last = alerts[0]
    return {
      text: `The last time you noted a med problem was ${fmtDay(Date.parse(last.at), now)}: “${clip(last.text, 140)}”.${alerts.length > 1 ? ` There ${alerts.length - 1 === 1 ? 'is 1 earlier note' : `are ${alerts.length - 1} earlier notes`} too.` : ''}`,
      items: alerts.slice(0, 8).map(a => ({ when: cap(fmtDay(Date.parse(a.at), now)), title: a.title, meta: (data.cleared || {})[a.id] ? 'handled' : 'not marked handled yet', text: a.text, photos: [] })),
    }
  }
  if (!meds.length) return { text: 'You don’t have any medications set up yet. Open your med’s daily task, go to More options, and turn on “Medication”. After that I’ll keep track of it.' }
  const { scope } = takeScope(nq, now)
  const range = scope || { from: startOfDay(now) - 6 * DAY, to: startOfDay(now) + DAY, label: 'in the last 7 days' }
  const rows = medAdherence({ ...data, medIds: Object.fromEntries(pick.map(m => [m.id, true])) }, range.from, range.to, now)
  const lines = rows.map(r => {
    if (!r.due) return `${r.title}: not scheduled ${range.label}.`
    if (!r.skipped.length) return `${r.title}: taken every day ${range.label} (${r.due} of ${r.due}).`
    return `${r.title}: taken ${r.due - r.skipped.length} of ${r.due} day${r.due === 1 ? '' : 's'} ${range.label}; skipped ${r.skipped.map(s => fmtDay(dateOfKey(s.date), now)).join(', ')}.`
  })
  const items = rows.flatMap(r => r.skipped.map(s => ({ when: cap(fmtDay(dateOfKey(s.date), now)), title: `Skipped ${r.title}`, meta: s.mood ? `mood: ${MOOD_LABEL[s.mood]}` : 'no mood noted', text: s.text, photos: [] })))
  return { text: lines.join(' '), items, note: 'A med counts as taken unless you un-ticked it that day.' }
}

// ── Conditions ─────────────────────────────────────────────────

function answerConditions(q, data, moments, now, effects) {
  const { scope } = takeScope(norm(q), now)
  const out = []
  const items = []
  for (const fx of effects) {
    let eps = moments.filter(m => m.kind === 'episode' && m.effectId === fx.id)
    if (scope) eps = eps.filter(m => m.at >= scope.from && m.at < scope.to)
    if (!eps.length) { out.push(`No ${fx.name.toLowerCase()} logged${scope ? ' ' + scope.label : ''}.`); continue }
    const done = eps.filter(e => e.end)
    const avg = done.length ? done.reduce((n, e) => n + e.mins, 0) / done.length : 0
    const last = eps[0]
    out.push(`${fx.name}: ${eps.length} time${eps.length > 1 ? 's' : ''}${scope ? ' ' + scope.label : ' logged'}; the last one started ${fmtDay(last.at, now)} at ${fmtTime(last.at)}${last.end ? ` and lasted ${fmtMins(last.mins)}` : ' and is still going'}${done.length > 1 ? ` (they usually last about ${fmtMins(avg)})` : ''}.`)
    items.push(...eps.slice(0, 6).map(m => itemOf(m, now)))
  }
  return { text: out.join(' '), items }
}

// ── Mood ───────────────────────────────────────────────────────

function avgMood(ms) {
  const v = ms.filter(m => m.mood).map(m => m.mood)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
function moodWord(avg) { return MOOD_LABEL[Math.round(avg)] || 'Okay' }

function answerMood(q, data, moments, now) {
  const nq = norm(q)
  const { scope, rest } = takeScope(nq, now)
  let pool = moments.filter(m => m.mood)
  let where = ''
  const at = rest.match(/\b(?:at|in)\s+(.+)$/)
  if (at) {
    const target = at[1].replace(/^(?:the|my)\s+/, '').trim()
    const r = staysFor(data.stays || [], data.places || [], target)
    const name = r.name || target
    pool = pool.filter(m => (m.place && nameScore(m.place, target) > 0)
      || r.stays.some(s => m.at >= s.start - 5 * 60000 && m.at <= s.end + 5 * 60000))
    where = ` at ${cap(name)}`
  }
  if (scope) pool = pool.filter(m => m.at >= scope.from && m.at < scope.to)
  if (!pool.length) return { text: `I don’t have any moods logged${where}${scope ? ' ' + scope.label : ''} yet. Mood check-ins, task notes, and journal entries all count.` }
  const avg = avgMood(pool)
  const low = pool.filter(m => m.mood <= 2)
  return {
    text: `Your mood${where}${scope ? ' ' + scope.label : ''} averaged ${moodWord(avg)} (${avg.toFixed(1)} out of 5) across ${pool.length} log${pool.length > 1 ? 's' : ''}.${low.length ? ` ${low.length} of them ${low.length > 1 ? 'were' : 'was'} Low or Rough.` : ''}`,
    items: pool.slice(0, 8).map(m => itemOf(m, now)),
  }
}

// ── What happened at a place ───────────────────────────────────

function answerAtPlace(q, data, moments, now) {
  const nq = norm(q)
  const { scope, rest } = takeScope(nq, now)
  const at = rest.match(/\b(?:at|in)\s+(.+)$/)
  if (!at) return null
  const target = at[1].replace(/^(?:the|my)\s+/, '').trim()
  const r = staysFor(data.stays || [], data.places || [], target)
  if (!r.stays.length && !moments.some(m => m.place && nameScore(m.place, target) > 0)) return null
  let pool = moments.filter(m => (m.place && nameScore(m.place, target) > 0) || r.stays.some(s => m.at >= s.start - 5 * 60000 && m.at <= s.end + 5 * 60000))
  if (scope) pool = pool.filter(m => m.at >= scope.from && m.at < scope.to)
  const name = cap(r.name || target)
  if (!pool.length) return { text: `Nothing written down at ${name}${scope ? ' ' + scope.label : ''}.` }
  return { text: `Here’s what you wrote at ${name}${scope ? ' ' + scope.label : ''}:`, items: pool.slice(0, 10).map(m => itemOf(m, now)) }
}

// ── A topic: "how did jogging feel?" ───────────────────────────

function answerTopic(q, data, moments, now) {
  const words = topicWords(takeScope(norm(q), now).rest)
  const { scope } = takeScope(norm(q), now)
  if (!words.length) return null
  let hits = moments.filter(m => mentions(m.title, words) || mentions(m.text, words))
  if (scope) hits = hits.filter(m => m.at >= scope.from && m.at < scope.to)
  // Notes that actually say something come first; bare check-ins after.
  hits = hits.filter(m => (m.text || '').trim() || m.mood || (m.photos || []).length)
  if (!hits.length) return null
  // Say it the way you did ("jogging"), not the trimmed search form ("jog").
  const topic = norm(takeScope(norm(q), now).rest).split(' ').filter(w => w && !STOP.has(w) && w.length > 2).join(' ') || words.join(' ')
  const withMood = hits.filter(m => m.mood)
  const avg = avgMood(withMood)
  const timed = hits.filter(m => m.mins)
  const first = hits[0]
  let text = `You’ve written about ${topic} ${hits.length} time${hits.length > 1 ? 's' : ''}${scope ? ' ' + scope.label : ''}.`
  if (avg) text += ` Your mood around it averaged ${moodWord(avg)}.`
  if (timed.length > 1) text += ` A session usually ran about ${fmtMins(timed.reduce((n, m) => n + m.mins, 0) / timed.length)}.`
  if (first.text) text += ` Most recently (${fmtDay(first.at, now)}): “${clip(first.text, 160)}”`
  return { text, items: hits.slice(0, 8).map(m => itemOf(m, now)) }
}

// ── The router ─────────────────────────────────────────────────

const MED_WORDS = /\b(med|meds|medication|medications|medicine|pill|pills|dose|doses|prescription|refill)\b/
const MOOD_WORDS = /\b(mood|moods|feel|feeling|felt|emotion|emotions|happy|sad|anxious|stressed|how was i|how have i been)\b/

// → { text, items?, note?, needsTracking? } — always an answer for a recall
// question, so the assistant never hands a question to the task planner.
export function answerRecall(question, data, now = Date.now()) {
  const q = String(question || '').trim()
  const nq = norm(q)
  const moments = buildMoments(data)

  // Time at a place ("how long was I at work?").
  if (parsePlaceQuestion(q, now)) {
    const a = answerPlaceQuestion(q, { stays: data.stays || [], places: data.places || [], now, tracking: data.tracking !== false })
    if (a) return a
  }
  // Medications — by the word, or by a med's own name.
  const meds = medTasks(data)
  if (MED_WORDS.test(nq) || (meds.length && meds.some(m => mentions(m.title, topicWords(q)))) || (isMedAlert(nq) && /\bran out|run out\b/.test(nq))) {
    return answerMeds(q, data, now)
  }
  // Physical / mental conditions you track ("migraine", "brain fog").
  const effects = (data.effects || []).filter(e => e && e.name && norm(nq).includes(norm(e.name)))
  if (effects.length) return answerConditions(q, data, moments, now, effects)

  // "How did jogging feel?" — a topic you wrote about wins over plain mood.
  const topic = answerTopic(q, data, moments, now)
  const rest = takeScope(nq, now).rest
  const hasPlace = /\b(?:at|in)\s+\w/.test(rest)
  if (topic && !hasPlace) return topic
  // A specific thing you never wrote about shouldn't turn into a mood summary.
  const asksAboutThing = topicWords(rest).length > 0 && !hasPlace
  if (MOOD_WORDS.test(nq) && !asksAboutThing) return answerMood(q, data, moments, now)
  const atPlace = answerAtPlace(q, data, moments, now)
  if (atPlace) return atPlace
  if (topic) return topic
  const words = topicWords(takeScope(nq, now).rest)
  return {
    text: words.length
      ? `I couldn’t find anything about “${words.join(' ')}” in your notes, journal, meds, moods, or places.`
      : 'I’m not sure what to look up. Try “How did jogging feel?”, “Did I take my meds this week?”, or “How long was I at work?”.',
    note: 'The more you write in a task’s “How did it go?” note or the 💭 journal, the more I can answer.',
  }
}

// ── For Informatics ────────────────────────────────────────────

// Time at each place in [from, to): [{ name, mins, visits }] most first.
export function placeTotals(stays, from, to, now = Date.now()) {
  const by = new Map()
  for (const s of stays || []) {
    const a = Math.max(s.start, from), b = Math.min(s.end, to, now)
    if (b <= a) continue
    const name = (s.name || '').split(',')[0].trim() || 'Unnamed spot'
    const cur = by.get(name) || { name, mins: 0, visits: 0 }
    cur.mins += (b - a) / 60000; cur.visits += 1
    by.set(name, cur)
  }
  return [...by.values()].sort((x, y) => y.mins - x.mins)
}
