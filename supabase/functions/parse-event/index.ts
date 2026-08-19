// supabase/functions/parse-event/index.ts
// ─────────────────────────────────────────────────────────────
// The planner's AI assistant. The app posts a natural-language command plus a
// snapshot of the user's current tasks; this asks Google Gemini to return a
// PLAN of actions (create a task, add/check subtasks on an existing one, mark a
// task done, reschedule). The app shows the plan for confirmation, then applies
// it — nothing here ever writes to the database.
//
// Free to run on Gemini's free tier. Supply your own key as a secret (never in
// the app's public code):
//     supabase secrets set GEMINI_API_KEY=your_key_here
//     supabase functions deploy parse-event
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

// 2.0-flash first — it's the steadiest free model; 2.5-flash is popular and
// more often overloaded. We fall through the list on any transient error.
const MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-1.5-flash']
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') || ''

// The last model name that actually worked, remembered across invocations on a
// warm instance. Without it, a key that doesn't have any of the hardcoded names
// pays 4 failed 404 probes + a ListModels lookup on EVERY request; with it, we
// jump straight to the known-good model and it's fast. Reset only on a cold start.
let cachedModel = ''

// One flat action shape covers every kind (the app reads `kind` and uses the
// fields that apply). Structured output keeps Gemini honest about the format.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One short sentence describing the whole plan in plain language.' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind:         { type: 'string', enum: ['create', 'event', 'addSubtasks', 'setDone', 'reschedule'], description: 'Which action.' },
          taskId:       { type: 'string', description: 'For addSubtasks/setDone/reschedule: the id of an existing task from the provided list. Never invent one.' },
          title:        { type: 'string', description: 'For create/event: the new task or event name.' },
          date:         { type: 'string', description: 'YYYY-MM-DD (create/reschedule), or for an event the START date, or "".' },
          time:         { type: 'string', description: 'HH:MM 24h (create/reschedule), or "".' },
          endDate:      { type: 'string', description: 'For event: the END date YYYY-MM-DD (same as start for a single all-day event), or "".' },
          allDay:       { type: 'boolean', description: 'For event: true when it spans whole days (a trip, an absence). Almost always true.' },
          startTime:    { type: 'string', description: 'For a timed event: HH:MM 24h start, or "".' },
          endTime:      { type: 'string', description: 'For a timed event: HH:MM 24h end, or "".' },
          durationMins: { type: 'integer', description: 'Minutes for a create/reschedule, or 0.' },
          categoryIds:  { type: 'array', items: { type: 'string' }, description: 'For create: matching category ids from the list.' },
          description:  { type: 'string', description: 'For create: a tidy write-up. Else "".' },
          subtasks: {
            type: 'array',
            description: 'For create/addSubtasks: the subtask items.',
            items: { type: 'object', properties: { text: { type: 'string' }, done: { type: 'boolean' } }, required: ['text'] },
          },
          reminders:    { type: 'array', items: { type: 'integer' }, description: 'For create: reminder lead minutes before start.' },
          done:         { type: 'boolean', description: 'For setDone: true to complete, false to un-complete.' },
        },
        required: ['kind'],
      },
    },
  },
  required: ['summary', 'actions'],
}

type Task = { id: string; title: string; date?: string; time?: string; done?: boolean; subtasks?: { text: string; done: boolean }[] }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!GEMINI_KEY) return json({ error: 'The AI key is not set up. Add a GEMINI_API_KEY secret, then redeploy.' }, 503)

  let body: { command?: string; text?: string; today?: string; categories?: { id: string; label: string }[]; tasks?: Task[] }
  try { body = await req.json() } catch { return json({ error: 'Bad JSON body' }, 400) }

  // `command` is the field; `text` is accepted for backward-compat.
  const command = (body.command || body.text || '').trim()
  if (!command) return json({ error: 'Nothing to do — type an instruction or paste an event.' }, 400)
  if (command.length > 12000) return json({ error: 'That’s a lot of text — trim it down a bit.' }, 400)

  const today = (body.today || new Date().toISOString().slice(0, 10)).slice(0, 10)
  const cats = Array.isArray(body.categories) ? body.categories.slice(0, 40) : []
  const tasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 150) : []

  const catList = cats.length ? cats.map(c => `- id "${c.id}": ${c.label}`).join('\n') : '(none)'
  const taskList = tasks.length
    ? tasks.map(t => {
        const subs = (t.subtasks || []).map(s => `${s.done ? '[x]' : '[ ]'} ${s.text}`).join('; ')
        return `- id "${t.id}": "${t.title}"${t.date ? ` (${t.date}${t.time ? ' ' + t.time : ''})` : ''}${t.done ? ' [DONE]' : ''}${subs ? ` — subtasks: ${subs}` : ''}`
      }).join('\n')
    : '(the user has no existing tasks)'

  const prompt =
`You are the assistant for a personal planner. Turn the user's instruction into a PLAN of concrete actions the app will carry out after they confirm.

Today is ${today} (the user's local date). Resolve relative dates against it.

CATEGORIES (use ids only where a category applies):
${catList}

THE USER'S CURRENT TASKS (only reference these ids; NEVER invent an id):
${taskList}

Actions you can use:
- create: make a new single-day TASK (something to do on one day). Fields: title, date, time, durationMins, categoryIds, description, subtasks (each {text, done}), reminders.
- event: make a multi-day calendar EVENT spanning a range of days — a trip, a vacation, someone being away/out, a conference, anything that covers a stretch of dates rather than one to-do. Fields: title, date (START date), endDate (END date), allDay (almost always true), startTime, endTime (only for a timed event). Use this whenever the span covers more than one day, or is phrased as an absence/trip/period ("Aug 14–18", "out for 6 weeks", "in Mexico next week").
- addSubtasks: add subtasks to an EXISTING task. Fields: taskId, subtasks (each {text, done} — set done:true to add it already checked off).
- setDone: mark an existing task complete/incomplete. Fields: taskId, done.
- reschedule: change an existing task's date/time. Fields: taskId, date, time, durationMins.

Rules:
- ALWAYS return at least one action whenever the instruction describes anything to schedule, add, or change. Never return an empty "actions" array in that case — the summary alone is not enough; the app can only act on the actions.
- To act on an existing task, find the best match in the list by name and use its exact id. If nothing matches what the user names, prefer a create action or leave it out — do not guess a random id.
- Choosing create vs event: if it happens on ONE day, use create (a task). If it covers MORE THAN ONE day, or reads as a trip / vacation / absence / stretch of days, use event and set date=start, endDate=end. Resolve durations like "6 weeks" into an actual endDate from today. When only a start is given for a clearly multi-day thing and no end is stated, make a sensible endDate rather than collapsing it to one day.
- Every date MUST be a literal YYYY-MM-DD string (e.g. "2026-08-14"), never words like "August 14th".
- The instruction may describe SEVERAL things at once — produce one action for each. Two people/plans mentioned means (at least) two actions.
- Only use information present or clearly implied. Never fabricate specifics.
- Write "summary" as one plain-language sentence a person can confirm at a glance.

EXAMPLE (for a day where today is 2026-08-19):
Instruction: "Danya 14–18th has a trip to Mexico. Kay is out 23rd and 6 weeks after for a hip replacement."
Correct output:
{"summary":"Add Danya's Mexico trip (Aug 14–18) and Kay's hip-replacement absence (Aug 23 – Oct 4).","actions":[
  {"kind":"event","title":"Danya trip to Mexico","date":"2026-08-14","endDate":"2026-08-18","allDay":true},
  {"kind":"event","title":"Kay out for hip replacement","date":"2026-08-23","endDate":"2026-10-04","allDay":true}
]}

INSTRUCTION:
"""
${command}
"""`

  const reqBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  })

  let resp: Response | null = null
  let lastDetail = ''
  let lastStatus = 0
  let hardStop: Response | null = null

  // Try a generateContent call against each model in turn; stop at the first
  // that works. Records status/detail so the caller can decide what to do when
  // none work. Returns true on success (sets `resp`), false otherwise.
  const tryModels = async (models: string[]): Promise<boolean> => {
    for (const model of models) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`
      let r: Response
      try {
        r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody })
      } catch (e) {
        hardStop = json({ error: `Couldn't reach the AI service: ${(e as Error)?.message || e}` }, 502)
        return false
      }
      if (r.ok) { resp = r; cachedModel = model; return true }
      lastDetail = await r.text().catch(() => '')
      lastStatus = r.status
      // Hard stops — a different model won't help these:
      if (r.status === 400 && /API key not valid/i.test(lastDetail)) { hardStop = json({ error: 'The Gemini API key is invalid. Set a valid GEMINI_API_KEY secret and redeploy.' }, 502); return false }
      if (r.status === 403) { hardStop = json({ error: 'Gemini access is blocked for this key (403). Enable the Generative Language API for the key.', detail: lastDetail.slice(0, 300) }, 502); return false }
      // Everything else — 404 (model missing), 429 (rate limit), 500/502/503
      // (overloaded/transient) — just try the next model in the list.
    }
    return false
  }

  // Ask the key which models it can actually use, so we're not guessing at
  // names. Different keys/projects expose different model sets, and Google
  // retires names over time — a fixed list can go stale and 404 on everything.
  // Returns free-tier flash/pro models that support generateContent, best
  // first, or [] if the listing fails.
  const discoverModels = async (): Promise<string[]> => {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_KEY)}&pageSize=200`)
      if (!r.ok) return []
      const d: any = await r.json().catch(() => null)
      const all: any[] = Array.isArray(d?.models) ? d.models : []
      const usable = all
        .filter(m => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => String(m?.name || '').replace(/^models\//, ''))
        .filter(n => /gemini/i.test(n) && /flash|pro/i.test(n) && !/vision|embedding|aqa|thinking|exp|tts|image|audio/i.test(n))
      // Prefer flash (fast + free) and newer versions; skip anything we already tried.
      const rank = (n: string) => (/flash/i.test(n) ? 0 : 1) * 100 + (/2\.5/.test(n) ? 0 : /2\.0/.test(n) ? 1 : 2)
      return usable.sort((a, b) => rank(a) - rank(b)).filter(n => !MODELS.includes(n)).slice(0, 6)
    } catch { return [] }
  }

  // Fast path: on a warm instance we already know a model that works for this
  // key — go straight to it and skip the failed-probe tax.
  if (cachedModel) await tryModels([cachedModel])
  if (!resp && !hardStop) await tryModels(MODELS.filter(m => m !== cachedModel))
  // If the whole hardcoded list came back 404 (names the key doesn't recognize),
  // discover the key's real model set and try those before giving up.
  if (!resp && !hardStop && lastStatus === 404) {
    const discovered = await discoverModels()
    if (discovered.length) await tryModels(discovered)
  }
  if (hardStop) return hardStop
  if (!resp) {
    if ([429, 500, 502, 503].includes(lastStatus)) {
      return json({ error: 'The free AI models are busy right now — please try again in a few seconds.', detail: lastDetail.slice(0, 300) }, 503)
    }
    if (lastStatus === 404) {
      return json({ error: 'None of the Gemini models were available for your key. Make sure your key is from Google AI Studio with the Generative Language API enabled.', detail: lastDetail.slice(0, 300) }, 502)
    }
    return json({ error: `AI service error (${lastStatus}).`, detail: lastDetail.slice(0, 300) }, 502)
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

  const validCats = new Set(cats.map(c => c.id))
  const validTaskIds = new Set(tasks.map(t => t.id))
  const clampTime = (t: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t || '') ? String(t).padStart(5, '0') : ''
  // Accept a date the model wrote strictly (2026-08-14) OR loosely (single
  // digits, US M/D/Y, or plain "August 14, 2026") and normalize to YYYY-MM-DD.
  // Structured output pins the field's TYPE to string but not its FORMAT, so the
  // model sometimes hands back a human date — salvage it instead of dropping the
  // whole action.
  const clampDate = (d: any): string => {
    if (!d) return ''
    const s = String(d).trim()
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)          // US M/D/Y
    if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
    const t = Date.parse(s)                                  // "August 14, 2026"
    if (!Number.isNaN(t)) {
      const dt = new Date(t)
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
    }
    return ''
  }
  const cleanSubs = (arr: any): { text: string; done: boolean }[] =>
    Array.isArray(arr) ? arr.map((s: any) => ({ text: String(s?.text || '').trim(), done: !!s?.done })).filter(s => s.text).slice(0, 30) : []

  // Normalize + drop anything referencing an unknown task id (the model is told
  // never to invent ids, but we enforce it here so a bad guess can't act on a
  // real task).
  const actions: any[] = []
  for (const a of Array.isArray(parsed.actions) ? parsed.actions : []) {
    const kind = a?.kind
    if (kind === 'create') {
      const title = String(a.title || '').trim().slice(0, 200)
      if (!title) continue
      actions.push({
        kind, title,
        date: clampDate(a.date), time: clampTime(a.time),
        durationMins: Number.isFinite(a.durationMins) ? Math.max(0, Math.min(1440, Math.round(a.durationMins))) : 0,
        categoryIds: Array.isArray(a.categoryIds) ? a.categoryIds.filter((id: string) => validCats.has(id)).slice(0, 4) : [],
        description: String(a.description || '').trim().slice(0, 4000),
        subtasks: cleanSubs(a.subtasks),
        reminders: Array.isArray(a.reminders) ? a.reminders.map((n: any) => Math.round(Number(n))).filter((n: number) => Number.isFinite(n) && n >= 0 && n <= 40320).slice(0, 6) : [],
      })
    } else if (kind === 'event') {
      const title = String(a.title || '').trim().slice(0, 200)
      const start = clampDate(a.date)
      if (!title || !start) continue
      let end = clampDate(a.endDate) || start
      if (end < start) end = start            // never let the range invert
      const allDay = a.allDay !== false
      actions.push({
        kind, title, startDate: start, endDate: end, allDay,
        startTime: allDay ? '' : clampTime(a.startTime),
        endTime:   allDay ? '' : clampTime(a.endTime),
      })
    } else if (kind === 'addSubtasks') {
      const subs = cleanSubs(a.subtasks)
      if (!validTaskIds.has(a.taskId) || !subs.length) continue
      actions.push({ kind, taskId: a.taskId, subtasks: subs })
    } else if (kind === 'setDone') {
      if (!validTaskIds.has(a.taskId)) continue
      actions.push({ kind, taskId: a.taskId, done: a.done !== false })
    } else if (kind === 'reschedule') {
      if (!validTaskIds.has(a.taskId)) continue
      const date = clampDate(a.date), time = clampTime(a.time)
      if (!date && !time) continue
      actions.push({ kind, taskId: a.taskId, date, time, durationMins: Number.isFinite(a.durationMins) ? Math.max(0, Math.min(1440, Math.round(a.durationMins))) : 0 })
    }
  }

  const summary = String(parsed.summary || '').trim().slice(0, 300)
  if (!actions.length) {
    // The model gave a summary but no action we could use. Echo what it actually
    // returned so the failure is diagnosable instead of a mystery empty plan.
    const rawActions = JSON.stringify(parsed.actions ?? parsed).slice(0, 600)
    return json({ summary, actions: [], error: `I understood it but couldn't turn it into an action. The AI returned: ${rawActions}` })
  }
  return json({ summary, actions })
})
