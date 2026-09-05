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
  return { summary: data.summary || '', actions: Array.isArray(data.actions) ? data.actions : [] }
}
