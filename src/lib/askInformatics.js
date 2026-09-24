// src/lib/askInformatics.js
// ─────────────────────────────────────────────────────────────
// Client side of the Informatics page's AI answers. Folds the page's entries
// (one per check-off) into one row per distinct task — title, category,
// description, subtasks, times done, tracked minutes, first/last date — and
// sends them with the question to the ask-informatics Supabase Edge Function,
// which asks Gemini to answer from that data only. Returns
//   { answer, highlights: [{ label, detail, tasks: [title] }] }
// The AI key lives only on the server — never in this public bundle.
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ask-informatics` : ''

// The AI answer only shows when Supabase is configured (that's where the
// function lives). The keyword answer always works regardless.
export const informaticsAiAvailable = !!ENDPOINT

const MAX_TASKS = 300

// One row per distinct task. Repeats of the same task (same title, description
// and subtasks) collapse into a count; the most detailed and most recent come
// first so a long history is trimmed from the thin, old end.
export function groupEntriesForAi(entries = [], categories = []) {
  const catLabel = new Map((categories || []).map(c => [c.id, c.label]))
  const map = new Map()
  for (const e of entries || []) {
    const title = (e.title || '').trim() || 'Untitled'
    const desc = (e.desc || '').trim(), subs = (e.subs || '').trim()
    const key = `${title.toLowerCase()}\u0000${desc.toLowerCase()}\u0000${subs.toLowerCase()}`
    const row = map.get(key) || { title, cat: catLabel.get(e.cat) || e.cat || '', desc, subs, count: 0, mins: 0, first: e.date || '', last: e.date || '' }
    row.count += 1
    row.mins += e.mins || 0
    if (e.date && (!row.first || e.date < row.first)) row.first = e.date
    if (e.date && e.date > row.last) row.last = e.date
    map.set(key, row)
  }
  return [...map.values()]
    .sort((a, b) => (!!(b.desc || b.subs) - !!(a.desc || a.subs)) || (b.last || '').localeCompare(a.last || ''))
    .slice(0, MAX_TASKS)
}

export async function askInformatics(question, entries, { categories = [], rangeLabel = 'all time' } = {}) {
  if (!ENDPOINT) throw new Error('AI answers need your Supabase URL configured.')
  const q = (question || '').trim()
  if (!q) throw new Error('Ask a question first.')
  const headers = { 'Content-Type': 'application/json' }
  if (SUPABASE_KEY) { headers['apikey'] = SUPABASE_KEY; headers['Authorization'] = `Bearer ${SUPABASE_KEY}` }

  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        question: q,
        today: new Date().toISOString().slice(0, 10),
        range: rangeLabel,
        tasks: groupEntriesForAi(entries, categories),
      }),
    })
  } catch {
    throw new Error('Couldn’t reach the AI. Check your connection and that the ask-informatics function is deployed.')
  }

  let data = null
  try { data = await res.json() } catch { /* handled below */ }
  if (!res.ok) {
    if (res.status === 404) throw new Error('The ask-informatics function isn’t deployed yet (see AI_SETUP.md).')
    throw new Error((data && data.error) || `AI error (${res.status}).`)
  }
  if (!data || (data.error && !data.answer)) throw new Error((data && data.error) || 'The AI returned an unexpected response.')
  return {
    answer: data.answer || '',
    highlights: Array.isArray(data.highlights) ? data.highlights : [],
  }
}
