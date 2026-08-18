// src/lib/parseEvent.js
// ─────────────────────────────────────────────────────────────
// Client side of the AI assistant. Sends a natural-language command plus a
// snapshot of the user's current tasks to the parse-event Supabase Edge
// Function (which asks Gemini to plan actions) and returns { summary, actions }.
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

// Ask the assistant to plan actions for `command`, given the user's categories
// and a snapshot of their current tasks (so it can act on existing ones).
// Returns { summary, actions }. Throws an Error with a readable message on
// failure. A valid-but-empty plan comes back as { summary, actions: [], error }.
export async function runAssistant(command, { categories = [], tasks = [] } = {}) {
  if (!ENDPOINT) throw new Error('The AI assistant needs your Supabase URL configured.')
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
      }),
    })
  } catch {
    throw new Error('Couldn’t reach the AI service. Check your connection and that the parse-event function is deployed.')
  }

  let data = null
  try { data = await res.json() } catch { /* handled below */ }
  if (!res.ok) {
    if (res.status === 404) throw new Error('The parse-event function isn’t deployed yet (see AI_SETUP.md).')
    throw new Error((data && data.error) || `AI service error (${res.status}).`)
  }
  if (!data) throw new Error('The AI service returned an unexpected response.')
  // A 200 with an error field + no actions = the model couldn't form a plan.
  if ((!Array.isArray(data.actions) || data.actions.length === 0) && data.error) throw new Error(data.error)
  return { summary: data.summary || '', actions: Array.isArray(data.actions) ? data.actions : [] }
}
