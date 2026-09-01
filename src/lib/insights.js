// src/lib/insights.js
// ─────────────────────────────────────────────────────────────
// The number-crunching behind the Informatics page — "how many hours did I
// spend on X?" It turns finished, timed work into a flat list of time entries
// (each with a date, minutes, category and title), then aggregates them by
// category and by task and answers a free-typed question by matching it against
// those categories and titles.
//
// Only work that actually has a duration is counted — a checked-off task with
// no time estimate can't be measured in hours. Time comes from two places:
//   • one-off commitments that are done and have a duration, and
//   • completed occurrences of a recurring task that has a duration
//     (one hit per date it was checked off).
// Time-block "containers" are skipped — they're windows of the day, not work.
// ─────────────────────────────────────────────────────────────

import { computeSkills, skillForTopic, entryText, inferSkills } from './skills.js'

const DATE_KEY_RE = /^(\d{4}-\d{2}-\d{2})_(.+)$/

// Join a task's subtasks into one searchable string ("Draft intro · Run assay").
// Subtasks describe what the work actually involved, so they're prime material
// for skill inference — included whether or not they were checked off.
function subtaskText(subs) {
  if (!Array.isArray(subs)) return ''
  return subs.map(s => (s && s.text ? String(s.text) : '')).filter(Boolean).join(' · ')
}

// Filler words stripped from a question so "how many hours did I spend on mcat
// studying?" reduces to the topic words ["mcat","studying"].
const QUERY_STOP = new Set((
  'how many hours much time did i do i spend spent on doing for the a an of my me this ' +
  'week month year today yesterday so far in during with and or to at get got have has ' +
  'been was were is are total overall about roughly around approximately number amount'
).split(/\s+/))

function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}
export function topicWords(q) {
  return (q || '').toLowerCase().match(/[a-z0-9]+/g)?.filter(w => w.length >= 2 && !QUERY_STOP.has(w)).map(stem) || []
}

// Strip a leading time prefix ("9:00 AM — ", "9:00 – ") off a task label so the
// same task on different days groups under one title.
export function cleanTitle(label) {
  return (label || '').replace(/^\s*\d{1,2}:\d{2}\s*(?:am|pm)?\s*[—–-]\s*/i, '').trim()
}

// The richer "activity" list, built from the completion log so it captures
// EVERYTHING you finished — not just work that had a duration. Each entry gets
// its minutes filled in when the task's duration is known (a one-off commitment
// or a recurring template), and 0 otherwise. This is what lets the page surface
// topics studied / projects done / skills used even with no hours attached.
//   log: [{ date, label, tag, storageKey, ts }]
export function computeActivity({ log = [], commitments = [], recurringTasks = [] }) {
  const cById = new Map((commitments || []).map(c => [c.id, c]))
  const rById = new Map((recurringTasks || []).map(t => [t.id, t]))
  const out = []
  for (const e of (log || [])) {
    const key = e.storageKey || ''
    const date = e.date || (e.ts ? String(e.ts).slice(0, 10) : '')
    if (!date) continue
    let mins = 0, cat = e.tag || '', title = cleanTitle(e.label || ''), desc = '', subs = ''
    const c = cById.get(key)
    if (c) {
      if (c.block) continue
      mins = c.durationMins || 0; cat = cat || c.cat || ''; if (!title) title = (c.text || '').trim()
      desc = c.description || ''; subs = subtaskText(c.subtasks)
    } else {
      const m = key.match(DATE_KEY_RE)
      if (m && rById.has(m[2])) {
        const t = rById.get(m[2])
        if (t.block) continue
        mins = t.durationMins || 0; cat = cat || t.cat || t.tag || ''
        if (!title) title = (t.title || t.text || '').trim()
        desc = t.note || t.description || ''; subs = subtaskText(t.subtasks)
      }
    }
    out.push({ date, mins, cat, title: title || 'Untitled', desc, subs, kind: 'log' })
  }
  return out
}

// Time the user recorded by hand (see storage.getTimeLogs) → entries. This is
// how work with no duration attached still counts as real hours.
export function timeLogEntries(timeLogs = []) {
  return (timeLogs || [])
    .filter(t => t && t.date && t.mins > 0)
    .map(t => ({ date: t.date, mins: t.mins, cat: t.cat || '', title: (t.title || '').trim() || 'Logged time', kind: 'manual', id: t.id }))
}

// The full entry list the page runs on: everything you checked off (with hours
// filled in where a task had a duration) plus any time you logged by hand.
export function computeEntries(data) {
  const activity = computeActivity(data)
  const spine = activity.length ? activity : computeTimeEntries(data)
  return [...spine, ...timeLogEntries(data.timeLogs)]
}

// Build the flat time-entry list from the app's data.
//   commitments:     enriched commitment rows (durationMins, cat, text, done, date, block)
//   recurringTasks:  rule-enriched recurring rows (durationMins, cat/tag, title/text, block)
//   completions:     { storageKey: true } — commitment ids, and "<date>_<id>" for recurring
export function computeTimeEntries({ commitments = [], recurringTasks = [], completions = {} }) {
  const entries = []

  // One-off commitments that are finished and timed.
  for (const c of commitments) {
    if (c.block) continue
    if (!c.done || !c.durationMins || !c.date) continue
    entries.push({ date: c.date, mins: c.durationMins, cat: c.cat || '', title: (c.text || '').trim(), desc: c.description || '', subs: subtaskText(c.subtasks), kind: 'task' })
  }

  // Recurring occurrences: one entry per date the task was checked off.
  const recById = new Map((recurringTasks || []).map(t => [t.id, t]))
  for (const [key, val] of Object.entries(completions || {})) {
    if (!val) continue
    const m = key.match(DATE_KEY_RE)
    if (!m) continue                                  // a plain commitment id — handled above
    const t = recById.get(m[2])
    if (!t || t.block || !t.durationMins) continue
    entries.push({ date: m[1], mins: t.durationMins, cat: t.cat || t.tag || '', title: (t.title || t.text || '').trim(), desc: t.note || t.description || '', subs: subtaskText(t.subtasks), kind: 'recurring' })
  }

  return entries
}

// Restrict entries to a range: 'week' (last 7 days), 'month' (last 30), 'all'.
export function filterByRange(entries, range) {
  if (range === 'all' || !range) return entries
  const days = range === 'week' ? 7 : range === 'month' ? 30 : range === 'year' ? 365 : 0
  if (!days) return entries
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (days - 1))
  const cut = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  return entries.filter(e => e.date >= cut)
}

function catMeta(catId, categories) {
  const c = (categories || []).find(x => x.id === catId)
  return { id: catId || '', label: c?.label || (catId ? catId : 'Uncategorized'), color: c?.color || '#9AA6B2', icon: c?.icon || '' }
}

// Roll entries up by category and by task title.
export function aggregate(entries, categories) {
  const byCat = new Map(), byTask = new Map()
  let totalMins = 0
  const dayset = new Set()
  for (const e of entries) {
    totalMins += e.mins
    dayset.add(e.date)
    const cm = catMeta(e.cat, categories)
    const cRow = byCat.get(cm.id) || { ...cm, mins: 0, count: 0 }
    cRow.mins += e.mins; cRow.count += 1; byCat.set(cm.id, cRow)
    const tkey = (e.title || 'Untitled').toLowerCase()
    const tRow = byTask.get(tkey) || { title: e.title || 'Untitled', cat: e.cat, mins: 0, count: 0 }
    tRow.mins += e.mins; tRow.count += 1; byTask.set(tkey, tRow)
  }
  return {
    totalMins,
    days: dayset.size,
    byCategory: [...byCat.values()].sort((a, b) => b.mins - a.mins || b.count - a.count),
    byTask: [...byTask.values()].sort((a, b) => b.mins - a.mins || b.count - a.count),
  }
}

// Answer "how many hours did I spend on <topic>?" Matches the topic words
// against each entry's category label + title; an entry counts if it shares any
// topic word. Returns the total plus the matched category/task breakdown so the
// page can show what it counted.
export function answerQuery(entries, query, categories) {
  const words = topicWords(query)
  if (!words.length) return null
  // If the topic names a skill ("writing", "lab work"), fold that skill's own
  // keyword vocabulary into the match so entries that exercise the skill without
  // literally containing the word still count.
  const skillId = skillForTopic(words.join(' '))
  const matched = []
  for (const e of entries) {
    const hay = entryText(e, categories).toLowerCase()
    const hayWords = hay.match(/[a-z0-9]+/g)?.map(stem) || []
    let hit = words.some(w => hay.includes(w) || hayWords.some(hw => hw === w || (w.length >= 4 && hw.startsWith(w)) || (hw.length >= 4 && w.startsWith(hw))))
    if (!hit && skillId) hit = inferSkills(hay).includes(skillId)
    if (hit) matched.push(e)
  }
  const agg = aggregate(matched, categories)
  return {
    type: 'topic',
    topic: words.join(' '),
    totalMins: agg.totalMins,
    sessions: matched.length,
    days: agg.days,
    byCategory: agg.byCategory,
    byTask: agg.byTask.slice(0, 8),
    skills: computeSkills(matched, categories).slice(0, 6),
  }
}

// Intent cues for "questions about yourself" — the page can answer more than
// "how many hours on X".
const SKILL_INTENT = /\bskills?\b|good at|best at|strength|strong suit|abilities|what can i do|what am i building|practic(e|ing) most/i
const TIME_INTENT = /where (does|did|is).*(time|hours?|day)|spend (the )?most|most time|busiest|what do i (spend|do) most|how do i spend|time breakdown|where (do|did) i put/i
const SUMMARY_INTENT = /summar|overview|about (me|myself)|tell me about (me|myself)|how (am|have) i (doing|been)|what have i (been )?(doing|working|up to)|recap|what did i (do|get done)/i

// Answer a free-typed question about yourself. Detects a few intents and
// returns a typed result the Informatics page renders differently:
//   { type:'skills'  , skills, sessions, totalMins }
//   { type:'overview', byCategory, byTask, skills, totalMins, sessions, days }
//   { type:'topic'   , ...answerQuery(...) }   ← the classic "hours on X"
export function answerQuestion(entries, query, categories) {
  const q = (query || '').trim()
  if (!q) return null
  const topic = topicWords(q).join(' ')

  // "What skills am I using / good at?" — but only when it's a general skills
  // question, not "hours on <a specific skill>", which topic-mode handles better.
  if (SKILL_INTENT.test(q) && !skillForTopic(topic)) {
    const skills = computeSkills(entries, categories)
    const agg = aggregate(entries, categories)
    return { type: 'skills', topic: topic || 'your skills', skills: skills.slice(0, 12), sessions: entries.length, totalMins: agg.totalMins, days: agg.days }
  }

  // "Where does my time go? / What do I spend the most time on?"
  if (TIME_INTENT.test(q) || SUMMARY_INTENT.test(q)) {
    const agg = aggregate(entries, categories)
    return {
      type: 'overview',
      topic: topic || 'your time',
      totalMins: agg.totalMins,
      sessions: entries.length,
      days: agg.days,
      byCategory: agg.byCategory.slice(0, 8),
      byTask: agg.byTask.slice(0, 6),
      skills: computeSkills(entries, categories).slice(0, 6),
    }
  }

  return answerQuery(entries, q, categories)
}

// "7h 30m" — compact hours+minutes. Also exposes decimal hours for a subtitle.
export function fmtHours(mins) {
  const m = Math.max(0, Math.round(mins || 0))
  const h = Math.floor(m / 60), r = m % 60
  if (h === 0) return `${r}m`
  if (r === 0) return `${h}h`
  return `${h}h ${r}m`
}
export function decimalHours(mins) {
  return Math.round((mins || 0) / 6) / 10   // one decimal place
}
