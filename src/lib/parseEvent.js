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
  let actions = Array.isArray(data.actions) ? data.actions : []
  if (photos.length) actions = flagGuessedDates(actions, { today: todayStr(), command })
  return { summary: data.summary || '', actions }
}
