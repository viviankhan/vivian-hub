// src/lib/parseEvent.js
// ─────────────────────────────────────────────────────────────
// Client side of "paste an event → scheduled task". Posts the pasted text to
// the parse-event Supabase Edge Function (which asks Gemini to structure it) and
// returns a draft the Add sheet can pre-fill. The AI key lives only on the
// server (see supabase/functions/parse-event) — never in this public bundle.
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

// Send `text` (plus the user's categories, so the model can pick a matching
// label by id) and get back a normalized draft:
//   { title, date, time, durationMins, categoryIds, description, subtasks, reminders }
// Throws an Error with a human-readable message on any failure.
export async function parseEventText(text, categories = []) {
  if (!ENDPOINT) throw new Error('AI scheduling needs your Supabase URL configured.')
  const headers = { 'Content-Type': 'application/json' }
  // Send the project key the way Supabase expects (apikey + Bearer for a JWT).
  if (SUPABASE_KEY) { headers['apikey'] = SUPABASE_KEY; headers['Authorization'] = `Bearer ${SUPABASE_KEY}` }

  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        today: todayStr(),
        categories: (categories || []).map(c => ({ id: c.id, label: c.label })),
      }),
    })
  } catch {
    throw new Error('Couldn’t reach the AI service. Check your connection and that the parse-event function is deployed.')
  }

  let data = null
  try { data = await res.json() } catch { /* fall through to status handling */ }
  if (!res.ok) {
    if (res.status === 404) throw new Error('The parse-event function isn’t deployed yet (see AI_SETUP.md).')
    throw new Error((data && data.error) || `AI service error (${res.status}).`)
  }
  if (!data || !data.title) throw new Error('The AI couldn’t find an event in that text.')
  return data
}
