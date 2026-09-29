// src/lib/parseEvent.js
// ─────────────────────────────────────────────────────────────
// Client side of the AI assistant. Sends a natural-language command and/or
// photos of a task (a screenshot of an email, a syllabus page, a flyer, a
// handwritten list) plus a snapshot of the user's current tasks to the
// parse-event Supabase Edge Function (which asks Gemini to plan actions) and
// returns { summary, actions }. The app shows the plan for confirmation, then
// applies it. The AI key lives only on the server — never in this public bundle.
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/parse-event` : ''

// The feature only makes sense once Supabase is configured (that's where the
// function lives). The UI hides its entry point when this is false.
export const aiScheduleAvailable = !!ENDPOINT

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// Does the text the AI quoted for a date actually point at `today`?
// ("today", "tonight", or that calendar day in numbers or with its month name.)
const MONTH_NAMES = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
export function saysToday(from, today) {
  const f = String(from || '').toLowerCase()
  if (!f) return false
  if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(f)) return true
  const [, tm, td] = String(today).split('-').map(Number)
  const nums = (f.match(/\d+/g) || []).map(Number)
  return nums.includes(td) && (nums.includes(tm) || f.includes(MONTH_NAMES[tm - 1]))
}

// When photos are read, an item the AI couldn't find a date for used to come
// back dated TODAY — its silent fallback. Two related photos (a flyer with the
// date, an agenda without one) made it worse: everything on the agenda landed
// on the current day. So with photos, a date of today has to be backed by what
// the photo or instruction actually said; otherwise the action is flagged
// `needsDate` and the review screen asks for the date before anything applies.
// The parse-event function does the same check; this repeats it so an older
// deployment of that function (which doesn't send `dateFrom`) is covered too.
export function flagGuessedDates(actions, { today, command = '' } = {}) {
  const commandSaysToday = /\b(today|tonight)\b/i.test(command)
  return (actions || []).map(a => {
    if (!a || (a.kind !== 'create' && a.kind !== 'event')) return a
    if (a.needsDate) return a
    const date = a.kind === 'event' ? a.startDate : a.date
    if (a.kind === 'create' && !date) return { ...a, needsDate: true }
    if (date === today && !commandSaysToday && !saysToday(a.dateFrom, today)) return { ...a, needsDate: true, guessedToday: true }
    return a
  })
}

// ── Repeating tasks ──────────────────────────────────────────
// The assistant can make a task recur ({ freq, interval, days, endDate } on a
// create, or a `repeat` action for an existing task). Birthdays and
// anniversaries recur every year whether or not the model remembered to say
// so — you can still switch one back to Once on the review screen.
export const REPEAT_FREQS = ['daily', 'weekly', 'monthly', 'yearly']
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const YEARLY_WORDS = /\b(birthday|bday|b-day|anniversary)\b/i

export function weekdayOf(dateStr) {
  if (!dateStr) return null
  return WEEKDAY_NAMES[new Date(dateStr + 'T12:00:00').getDay()]
}

export function normalizeRepeat(r, date) {
  if (!r || typeof r !== 'object' || !REPEAT_FREQS.includes(r.freq)) return null
  const interval = Math.max(1, Math.min(99, Math.round(Number(r.interval) || 1)))
  let days = Array.isArray(r.days) ? r.days.filter(d => WEEKDAY_NAMES.includes(d)) : []
  if (r.freq === 'weekly' && !days.length) days = date ? [weekdayOf(date)] : []
  return { freq: r.freq, interval, days: r.freq === 'weekly' ? days : [], endDate: r.endDate || '' }
}

export function applyRepeatDefaults(actions) {
  return (actions || []).map(a => {
    if (!a || a.kind !== 'create') return a
    const repeat = normalizeRepeat(a.repeat, a.date)
      || (YEARLY_WORDS.test(a.title || '') ? { freq: 'yearly', interval: 1, days: [], endDate: '' } : null)
    // A birthday with no date would otherwise repeat on today's date forever.
    const needsDate = a.needsDate || (!a.date && !!repeat && (repeat.freq === 'yearly' || repeat.freq === 'monthly'))
    return needsDate ? { ...a, repeat, needsDate } : { ...a, repeat }
  })
}

// "Yearly", "Every 2 weeks · Mon, Thu", "Monthly".
export function describeRepeat(r) {
  if (!r) return ''
  const n = r.interval > 1 ? r.interval : 0
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.freq]
  const base = n ? `Every ${n} ${unit}s` : ({ daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }[r.freq])
  const days = r.freq === 'weekly' && r.days && r.days.length
    ? ' · ' + r.days.map(d => d.slice(0, 1).toUpperCase() + d.slice(1, 3)).join(', ') : ''
  return `Repeats: ${base}${days}${r.endDate ? ` · until ${r.endDate}` : ''}`
}

function fmt12(t) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// A recurring-task template (the Recurring tab's shape — same as the add
// sheet's Repeat option builds) from a planned task and its repeat rule.
// Subtasks have no home on a template, so they're kept as lines in its note.
export function recurringFromTask(t, repeat, { id, today }) {
  const r = normalizeRepeat(repeat, t.date) || { freq: 'weekly', interval: 1, days: [], endDate: '' }
  const startDate = t.date || today
  const title = String(t.title || t.text || '').trim()
  const subs = (t.subtasks || []).map(s => s && s.text).filter(Boolean)
  const note = [String(t.description || '').trim(), ...subs.map(x => `• ${x}`)].filter(Boolean).join('\n')
  const cat = (t.categoryIds && t.categoryIds[0]) || t.cat || null
  return {
    id,
    freq: r.freq,
    interval: r.interval,
    days: r.freq === 'weekly' ? (r.days.length ? r.days : [weekdayOf(startDate)]) : [],
    monthDay: (r.freq === 'monthly' || r.freq === 'yearly') ? parseInt(startDate.slice(8, 10), 10) : null,
    cat, tag: cat,
    label: t.time ? `${fmt12(t.time)} — ${title}` : title,
    note,
    durationMins: t.durationMins || null,
    startDate,
    endDate: r.endDate || null,
  }
}

// How many photos one request may carry, matching the function's own cap.
export const MAX_ASSISTANT_IMAGES = 4

// Ask the assistant to plan actions for `command`, given the user's categories
// and a snapshot of their current tasks (so it can act on existing ones).
// `images` are downscaled photos as { data (base64, no data: prefix), mimeType }
// — the command is optional when at least one photo is attached.
// Returns { summary, actions }. Throws an Error with a readable message on
// failure. A valid-but-empty plan comes back as { summary, actions: [], error }.
export async function runAssistant(command, { categories = [], tasks = [], images = [] } = {}) {
  if (!ENDPOINT) throw new Error('The AI assistant needs your Supabase URL configured.')
  const photos = (images || [])
    .map(im => (typeof im === 'string' ? { data: im, mimeType: 'image/jpeg' } : { data: im?.data || '', mimeType: im?.mimeType || 'image/jpeg' }))
    .filter(im => im.data)
    .slice(0, MAX_ASSISTANT_IMAGES)
  if (!String(command || '').trim() && !photos.length) throw new Error('Type an instruction or add a photo first.')
  const headers = { 'Content-Type': 'application/json' }
  if (SUPABASE_KEY) { headers['apikey'] = SUPABASE_KEY; headers['Authorization'] = `Bearer ${SUPABASE_KEY}` }

  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        command,
        today: todayStr(),
        categories: (categories || []).map(c => ({ id: c.id, label: c.label })),
        tasks: (tasks || []).slice(0, 150),
        images: photos,
      }),
    })
  } catch {
    throw new Error('Couldn’t reach the AI service. Check your connection and that the parse-event function is deployed.')
  }

  let data = null
  try { data = await res.json() } catch { /* handled below */ }
  if (!res.ok) {
    if (res.status === 404) throw new Error('The parse-event function isn’t deployed yet (see AI_SETUP.md).')
    // A photo the gateway rejected before the function saw it has no JSON body.
    if (res.status === 413 && !(data && data.error)) throw new Error('That photo is too big — try a smaller one, or fewer at once.')
    throw new Error((data && data.error) || `AI service error (${res.status}).`)
  }
  if (!data) throw new Error('The AI service returned an unexpected response.')
  // A 200 with an error field + no actions = the model couldn't form a plan.
  if ((!Array.isArray(data.actions) || data.actions.length === 0) && data.error) throw new Error(data.error)
  let actions = applyRepeatDefaults(Array.isArray(data.actions) ? data.actions : [])
  if (photos.length) actions = flagGuessedDates(actions, { today: todayStr(), command })
  return { summary: data.summary || '', actions }
}
