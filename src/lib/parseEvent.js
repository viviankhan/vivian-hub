// src/lib/parseEvent.js
// ─────────────────────────────────────────────────────────────
// Client side of the AI assistant. Sends a natural-language command — and/or a
// photo/screenshot of an invitation, email or flyer — plus a snapshot of the
// user's current tasks to the parse-event Supabase Edge Function (which asks
// Gemini to read it and plan actions) and returns { summary, actions }.
// The app shows the plan for confirmation, then applies it. The AI key lives
// only on the server — never in this public bundle.
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

// The IANA zone the user is actually in, so a flyer listing several time zones
// ("10 a.m. CT / 8 a.m. MT") gets scheduled at the right clock time here.
function localZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { return '' }
}

// Ask the assistant to plan actions for `command` and/or `image` (a downscaled
// JPEG as base64, no data: prefix), given the user's categories and a snapshot
// of their current tasks (so it can act on existing ones). Either input alone is
// enough — a photo with no typed instruction is a valid request.
// Returns { summary, actions }. Throws an Error with a readable message on
// failure. A valid-but-empty plan comes back as { summary, actions: [], error }.
export async function runAssistant(command, { categories = [], tasks = [], image = '' } = {}) {
  if (!ENDPOINT) throw new Error('The AI assistant needs your Supabase URL configured.')
  if (!command && !image) throw new Error('Type an instruction or attach a photo first.')
  const headers = { 'Content-Type': 'application/json' }
  if (SUPABASE_KEY) { headers['apikey'] = SUPABASE_KEY; headers['Authorization'] = `Bearer ${SUPABASE_KEY}` }

  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        command,
        image: image || undefined,
        tz: localZone(),
        today: todayStr(),
        categories: (categories || []).map(c => ({ id: c.id, label: c.label })),
        tasks: (tasks || []).slice(0, 150),
      }),
    })
  } catch {
    throw new Error('Couldn’t reach the AI service. Check your connection and that the parse-event function is deployed.')
  }

  let data = null
  try { data = await res.json() } catch { /* handled below */ }
  if (!res.ok) {
    if (res.status === 404) throw new Error('The parse-event function isn’t deployed yet (see AI_SETUP.md).')
    if (res.status === 413) throw new Error('That photo is too large — try a smaller one.')
    throw new Error((data && data.error) || `AI service error (${res.status}).`)
  }
  if (!data) throw new Error('The AI service returned an unexpected response.')
  // A 200 with an error field + no actions = the model couldn't form a plan.
  if ((!Array.isArray(data.actions) || data.actions.length === 0) && data.error) throw new Error(data.error)
  return { summary: data.summary || '', actions: Array.isArray(data.actions) ? data.actions : [] }
}
