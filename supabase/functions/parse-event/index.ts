// supabase/functions/parse-event/index.ts
// ─────────────────────────────────────────────────────────────
// "Paste an event, get a scheduled task." The app posts a blob of text (an
// email, a flyer, a message — "Dentist Tue at 3, bring insurance card") and this
// function asks Google Gemini to turn it into a structured task: title, date,
// time, duration, a tidy write-up, subtasks, a matching label, and reminder
// leads. The app then opens its normal Add sheet pre-filled for you to review.
//
// Free to run: it uses the Gemini API's free tier. You supply your own key as a
// secret (never in the app's code, which is public):
//     supabase secrets set GEMINI_API_KEY=your_key_here
//     supabase functions deploy parse-event
// See AI_SETUP.md for the 2-minute walkthrough.
//
// Runs on Supabase Edge Functions (Deno). verify_jwt is off (see config.toml)
// so the browser's CORS preflight isn't rejected before the function runs.
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Gemini's free-tier flash model. Fast and free for this small structured task.
const MODEL = 'gemini-2.0-flash'
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') || ''

// The exact shape we want back — Gemini fills these deterministically via its
// structured-output mode, so the app never has to guess-parse free text.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title:        { type: 'string', description: 'Short task name, no date/time in it.' },
    date:         { type: 'string', description: 'YYYY-MM-DD, or "" if none can be determined.' },
    time:         { type: 'string', description: 'Start time as HH:MM 24-hour, or "" if none.' },
    durationMins: { type: 'integer', description: 'Length in minutes, or 0 if unknown.' },
    categoryIds:  { type: 'array', items: { type: 'string' }, description: 'Best-matching category ids from the provided list (may be empty).' },
    description:  { type: 'string', description: 'A clear, thorough write-up of every useful detail from the text.' },
    subtasks:     { type: 'array', items: { type: 'string' }, description: 'Concrete steps or things to bring/prepare.' },
    reminders:    { type: 'array', items: { type: 'integer' }, description: 'Reminder lead times in minutes before the start (e.g. 1440 = 1 day, 60 = 1 hour). Empty for none.' },
  },
  required: ['title'],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!GEMINI_KEY) return json({ error: 'The AI key is not set up. Run: supabase secrets set GEMINI_API_KEY=… then redeploy parse-event.' }, 503)

  let body: { text?: string; today?: string; categories?: { id: string; label: string }[] }
  try { body = await req.json() } catch { return json({ error: 'Bad JSON body' }, 400) }

  const text = (body.text || '').trim()
  if (!text) return json({ error: 'Nothing to read — paste an event description.' }, 400)
  if (text.length > 8000) return json({ error: 'That text is too long — trim it down a bit.' }, 400)

  // Today (the app sends its local date) anchors any relative dates like
  // "tomorrow" or "next Friday".
  const today = (body.today || new Date().toISOString().slice(0, 10)).slice(0, 10)
  const cats = Array.isArray(body.categories) ? body.categories.slice(0, 40) : []
  const catList = cats.length
    ? cats.map(c => `- id "${c.id}": ${c.label}`).join('\n')
    : '(no categories defined)'

  const prompt =
`You convert a pasted event/description into ONE scheduled to-do for a personal planner.
Today is ${today} (the user's local date). Resolve relative dates ("tomorrow", "next Tue") against it.

From the text below, produce:
- title: a short, clean name (no date or time inside it).
- date: YYYY-MM-DD if a specific day is stated or clearly implied, else "".
- time: HH:MM 24-hour start time if stated/implied, else "".
- durationMins: how long it runs if stated or reasonably implied, else 0.
- categoryIds: pick the closest-matching id(s) from this list (or none). Do NOT invent ids.
${catList}
- description: a thorough, well-organized write-up capturing every useful detail (who, where, what to know, links, confirmation numbers, dress code, costs — whatever is present). Keep it factual; don't pad.
- subtasks: concrete prep steps or things to bring, one per item. Empty if none apply.
- reminders: sensible lead times in minutes before the start (e.g. an important appointment → [1440, 60]). Empty if a simple task.

Only use information present or clearly implied by the text. Never fabricate specifics.

TEXT:
"""
${text}
"""`

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`
  let resp: Response
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    })
  } catch (e) {
    return json({ error: `Couldn't reach the AI service: ${(e as Error)?.message || e}` }, 502)
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '')
    // Surface the most common misconfig plainly.
    if (resp.status === 400 && /API key not valid/i.test(detail)) {
      return json({ error: 'The Gemini API key is invalid. Set a valid GEMINI_API_KEY secret and redeploy.' }, 502)
    }
    if (resp.status === 429) return json({ error: 'The AI free tier is rate-limited right now — wait a moment and try again.' }, 429)
    return json({ error: `AI service error (${resp.status}).`, detail: detail.slice(0, 400) }, 502)
  }

  let data: any
  try { data = await resp.json() } catch { return json({ error: 'AI returned a malformed response.' }, 502) }
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!raw) {
    const blocked = data?.promptFeedback?.blockReason
    return json({ error: blocked ? `The AI declined this text (${blocked}).` : 'The AI returned nothing usable.' }, 502)
  }

  let parsed: any
  try { parsed = JSON.parse(raw) } catch { return json({ error: 'AI returned unparseable JSON.' }, 502) }

  // Normalize + clamp to exactly what the app expects, and only keep category
  // ids that actually exist (the model is told not to invent, but trust nothing).
  const validCats = new Set(cats.map(c => c.id))
  const out = {
    title: String(parsed.title || '').trim().slice(0, 200),
    date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date || '') ? parsed.date : '',
    time: /^([01]?\d|2[0-3]):[0-5]\d$/.test(parsed.time || '') ? String(parsed.time).padStart(5, '0') : '',
    durationMins: Number.isFinite(parsed.durationMins) ? Math.max(0, Math.min(1440, Math.round(parsed.durationMins))) : 0,
    categoryIds: Array.isArray(parsed.categoryIds) ? parsed.categoryIds.filter((id: string) => validCats.has(id)).slice(0, 4) : [],
    description: String(parsed.description || '').trim().slice(0, 4000),
    subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 20) : [],
    reminders: Array.isArray(parsed.reminders) ? parsed.reminders.map((n: unknown) => Math.round(Number(n))).filter((n: number) => Number.isFinite(n) && n >= 0 && n <= 40320).slice(0, 6) : [],
  }
  if (!out.title) return json({ error: "Couldn't find a task in that text." }, 422)
  return json(out)
})
