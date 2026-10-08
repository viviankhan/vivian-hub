// supabase/functions/parse-event/index.ts
// ─────────────────────────────────────────────────────────────
// The planner's AI assistant. The app posts a natural-language command and/or
// photos (a screenshot of an email, a syllabus page, a flyer, a handwritten
// list) and/or documents (a syllabus or event agenda as a PDF or Word file)
// plus a snapshot of the user's current tasks; this asks Google Gemini to
// return a PLAN of actions (create a task, add/check subtasks on an existing
// one, mark a task done, reschedule). The app shows the plan for confirmation,
// then applies it — nothing here ever writes to the database.
//
// The flash models are multimodal, so the same call reads the pictures: photos
// ride along as inline_data parts next to the prompt. Either a command or at
// least one photo is required; with a photo alone, the instruction is simply
// "schedule what this describes". A PDF rides along the same way (Gemini reads
// PDFs natively, scans and tables included); a Word file arrives as text the
// app already pulled out of it, and goes into the prompt.
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
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || ''

// Photo limits. The app downscales to a ~2000px JPEG (a few hundred KB of
// base64 each). Ten covers someone scrolling a long appointment list and
// screenshotting as they go; the byte cap keeps a full-res upload from
// stalling the request.
const MAX_IMAGES = 10
const MAX_IMAGE_BYTES = 12_000_000
const MONTHS = [
  ['jan'], ['feb'], ['mar'], ['apr'], ['may'], ['jun'], ['jul'], ['aug'], ['sep'], ['oct'], ['nov'], ['dec'],
]
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
// Documents: up to three, a PDF sent whole or any document as its text. PDFs
// and photos share one base64 budget, under Gemini's 20 MB inline limit.
const MAX_DOCS = 3
const MAX_FILE_BYTES = 14_000_000
const MAX_DOC_TEXT = 200_000

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
          kind:         { type: 'string', enum: ['create', 'event', 'addSubtasks', 'setDone', 'reschedule', 'repeat'], description: 'Which action.' },
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
          icon:         { type: 'string', description: 'For create: one or two plain words naming a simple pictogram that fits it ("tooth", "dumbbell", "book", "flask", "plane", "cake"). Else "".' },
          subtasks: {
            type: 'array',
            description: 'For create/addSubtasks: the subtask items.',
            items: { type: 'object', properties: { text: { type: 'string' }, done: { type: 'boolean' } }, required: ['text'] },
          },
          reminders:    { type: 'array', items: { type: 'integer' }, description: 'For create: reminder lead minutes before start, ONLY when the user asked for specific reminders; else [] (their own defaults apply).' },
          done:         { type: 'boolean', description: 'For setDone: true to complete, false to un-complete.' },
          repeat: {
            type: 'object',
            description: 'For create (or kind repeat): how it recurs, or omit for a one-off.',
            properties: {
              freq:     { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'] },
              interval: { type: 'integer' },
              days:     { type: 'array', items: { type: 'string' } },
              endDate:  { type: 'string' },
            },
          },
        },
        required: ['kind'],
      },
    },
  },
  required: ['summary', 'actions'],
}

type Task = { id: string; title: string; date?: string; time?: string; done?: boolean; subtasks?: { text: string; done: boolean }[] }

Deno.serve(async (req) => {
 try {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!GEMINI_KEY) return json({ error: 'The AI key is not set up. Add a GEMINI_API_KEY secret, then redeploy.' }, 503)

  // verify_jwt is off (for the CORS preflight), and every call spends the
  // Gemini key, so only a signed-in Bloom user may make one.
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: req.headers.get('authorization') || '' } })
  if (!who.ok) return json({ error: 'Sign in first.' }, 401)

  let body: {
    command?: string; text?: string; today?: string
    categories?: { id: string; label: string }[]; tasks?: Task[]
    images?: (string | { data?: string; mimeType?: string })[]
    documents?: { name?: string; mimeType?: string; data?: string; text?: string }[]
  }
  try { body = await req.json() } catch { return json({ error: 'Bad JSON body' }, 400) }

  // `command` is the field; `text` is accepted for backward-compat.
  const command = (body.command || body.text || '').trim()
  if (command.length > 12000) return json({ error: 'That’s a lot of text — trim it down a bit.' }, 400)

  // Photos of a task: base64 bytes, either bare or as { data, mimeType }. The
  // app downscales before sending, so anything huge here is a mistake — reject
  // it with a readable message rather than letting Gemini time out.
  const images = (Array.isArray(body.images) ? body.images : [])
    .slice(0, MAX_IMAGES)
    .map(im => (typeof im === 'string' ? { data: im, mimeType: '' } : { data: String(im?.data || ''), mimeType: String(im?.mimeType || '') }))
    .map(im => ({
      // Tolerate a full data: URL — strip the prefix so we always send raw base64.
      data: im.data.replace(/^data:[^,]*,/, '').trim(),
      mimeType: ALLOWED_IMAGE_TYPES.includes(im.mimeType) ? im.mimeType : 'image/jpeg',
    }))
    .filter(im => im.data)

  // Documents: a PDF as base64 (sent to Gemini as the file), or any document
  // as text the app extracted (a Word file, or a PDF too big to send whole).
  const docs = (Array.isArray(body.documents) ? body.documents : [])
    .slice(0, MAX_DOCS)
    .map(d => ({
      name: String(d?.name || 'document').replace(/[\r\n"]/g, ' ').slice(0, 120),
      data: d?.mimeType === 'application/pdf' ? String(d?.data || '').replace(/^data:[^,]*,/, '').trim() : '',
      text: typeof d?.text === 'string' ? d.text : '',
    }))
    .filter(d => d.data || d.text.trim())
  const pdfDocs = docs.filter(d => d.data)
  const textDocs = docs.filter(d => !d.data)
  const docText = textDocs.reduce((n, d) => n + d.text.length, 0)
  if (docText > MAX_DOC_TEXT) return json({ error: 'Those documents are too long — try one at a time, or just the schedule pages.' }, 413)

  if (!command && !images.length && !docs.length) return json({ error: 'Nothing to do — type an instruction, paste an event, or add a photo or document.' }, 400)
  const imageBytes = images.reduce((n, im) => n + im.data.length, 0)
  if (imageBytes > MAX_IMAGE_BYTES) return json({ error: 'Those photos are too large — try fewer, or smaller ones.' }, 413)
  const fileBytes = imageBytes + pdfDocs.reduce((n, d) => n + d.data.length, 0)
  if (fileBytes > MAX_FILE_BYTES) return json({ error: 'Those files are too large together — try one document at a time.' }, 413)

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

  // Reading a photo needs its own rules — what to name the thing, which of the
  // times printed on it to believe, and what belongs in the description. Only
  // added when a photo is actually attached, so text-only commands are unchanged.
  const photoNote = images.length ? `
ATTACHED PHOTO${images.length > 1 ? `S (${images.length})` : ''}: the user photographed or screenshotted something they need on their planner — an email or message about a meeting, a syllabus or assignment sheet, a flyer, a poster, a whiteboard, a paper schedule, a handwritten list. Read ${images.length > 1 ? 'them' : 'it'} and schedule what ${images.length > 1 ? 'they describe' : 'it describes'}:
${images.length > 1 ? `- The ${images.length} photos were sent TOGETHER because they belong together — read them as ONE set before planning anything (a flyer and its agenda, an invitation and a schedule, two pages of one email, a screenshot and its follow-up). A date, event name, place, or year shown on one photo applies to the items on the others. An agenda or list of times with no date of its own takes its date from the photo that has one.
- Don't produce duplicates: when two photos show the same event, make one action that combines what each adds.
` : ''}- Title it after the thing itself ("Immunology WIP Seminar", "BIO 210 midterm") — not after the app, the sender, or the subject line's boilerplate. If the image names a specific talk, class, or appointment, that name is the title.
- Use the date and time printed in the image${images.length > 1 ? 's' : ''}. Look through ${images.length > 1 ? 'every photo' : 'the whole image'} for the date before deciding there isn't one. A weekday paired with a date ("Next Wednesday (9/9)") means that calendar date — trust the number over the weekday word. Resolve a bare weekday, "tomorrow", or "next week" against today's date. When only a month/day is shown, choose the year that puts it nearest today, upcoming if the wording points forward.
- NEVER fill in today's date as a fallback. Use today's date (${today}) only when the image or instruction actually says "today"/"tonight" or shows that date. If no date appears anywhere (and the instruction doesn't give one), leave "date" as "" — the user will pick it.
- If two time zones are given for the same moment, use the FIRST one listed unless the user says which is theirs.
- Put everything a person needs on the day into "description": room and building, addresses, joining links, meeting IDs and passcodes, dial-ins, the presenter and their topic, what to bring, costs. Copy links, IDs, and codes EXACTLY, character for character — never shorten or tidy them.
- A single-day meeting, class, or appointment is a create with its time and durationMins (default 60 minutes for a seminar or meeting when no end is shown). Use event only for something covering more than one day.
- Several separate items in one image (a list of assignments, a week of classes, a page of due dates) means one action for each. If the user names an existing task the items belong to, use addSubtasks on that task instead.
- Ignore phone status bars, app chrome, toolbars, buttons, and navigation — they are not the task.
- APPOINTMENT LISTS (a patient portal like MyChart or the Mayo Clinic app, a booking app, a list of upcoming visits): every appointment card is its own create action — never merge two cards, and never stop after the first few.
  - People scroll and screenshot as they go, so the screenshots OVERLAP: the same card appears on two or three of them, often cut off at the top or bottom, or blurred behind a floating header or tab bar. Make exactly ONE action per distinct appointment. The same date AND the same time is the same appointment, wherever it appears; combine what each copy shows.
  - Two cards on the same day at DIFFERENT times are two different appointments — keep both, even when their titles match. Example: "Wed, Oct 7 · Arrive by 1:45 PM · OBG Procedure" and "Wed, Oct 7 · Arrive by 2:15 PM · OBG Procedure" are TWO actions.
  - Before planning, fill "seen": go through every photo, top to bottom, and list every appointment card whose date and time you can read — {"date":"YYYY-MM-DD","time":"HH:MM","title":"what the card calls it"}. Repeats across overlapping photos are fine there. Then make one action for each distinct date + time in "seen".
  - A partly hidden card still counts when its date and time can be read; skip it only if its date or time can't be read on any screenshot.
  - "Arrive by", "Check in by", or "Arrival time" is when the user must be there: that is the task's time. Ignore countdowns like "PreCheck-In available in 28 days" when choosing the date.
  - Title it after the visit itself plus who or what it's with: "Ultrasound Pelvis Exam", "OB/GYN consult with Megan Weinhold, APRN", "Rheumatology consultation", "Video visit with Dr. Jissy Cyriac". Use the department when no provider is named.
  - description: department, building, floor, and desk exactly as written; the provider; whether it's a video visit; the PreCheck-In status. durationMins 60 unless a length is shown.
- A time-zone label printed beside a time (CST, CDT, EST, PT…) is just the clock reading — use the time exactly as printed and don't convert it.
${command ? "- The user's instruction below says what to do with the photo; where they disagree, the instruction wins." : '- The user sent the photo with no instruction: just schedule what it describes.'}
` : ''

  // Reading a document — a syllabus or an event agenda, usually — has rules of
  // its own: what counts as an item, how to title it, which year a bare
  // "Sep 15" means, and how to handle a class that meets every week.
  const docNames = docs.map(d => `"${d.name}"`).join(', ')
  const docNote = docs.length ? `
ATTACHED DOCUMENT${docs.length > 1 ? `S (${docs.length})` : ''}: ${docNames}. Usually a course syllabus or an event agenda/program; sometimes a schedule, itinerary, or assignment sheet. Read ${docs.length > 1 ? 'them' : 'it'} in full — tables included — and plan what belongs on the user's planner:
- SYLLABUS: make one create for each dated deliverable or assessment — assignments, problem sets, papers, projects, presentations, quizzes, labs due, midterms, finals, and any reading the syllabus says is DUE on a date. Title each with the course code or short name first ("BIO 210 — Quiz 1", "ENG 101 — Essay 2 draft due"). Put what it covers, its weight or points, and submission details in "description". Due-by times ("11:59 PM") go in "time" with durationMins 0. Exams take their stated time and length.
- Don't turn every lecture topic or weekly reading into a task — only things that are due or happen on a date. A regular class meeting ("Mon & Wed 10:00–11:15", a weekly lab or discussion section) is ONE create with a weekly "repeat" (those weekdays), its time and durationMins, date = the first meeting on or after the term start (or today, whichever is later), and repeat.endDate = the last day of classes when the syllabus gives it. Room and building go in its description. Office hours are not tasks unless the user asks.
- Holidays and no-class days are not tasks; skip them. A reading week or break that spans days is not a task either.
- A schedule given by week ("Week 3: Quiz 1") takes its date from the term's start date and the weekday the course meets, when the document gives them. When it can't be worked out, leave "date" as "" — never guess.
- A date with no year takes the academic year the document names (a Fall term's Sep–Dec dates are that year; a Spring term's Jan–May dates are the year that spring falls in), else the year that puts it nearest today.
- AGENDA or PROGRAM for an event: one create per session, talk, or activity the user would attend, with its own start time and durationMins (the gap to the next item when no end is given; skip breaks, coffee, and "lunch on your own" unless the user asks for them). Title it with the session's name; speaker, room, and track go in "description". Every session takes the event's date (each day's sessions take that day's date for a multi-day event). For a multi-day conference, also add one event for the whole span.
- If the user names an existing task the items belong to, use addSubtasks on that task instead of separate creates.
- On each create, "dateFrom" quotes the words in the document that gave the date ("Oct 20", "Week 8 Wednesday", "Day 2").
${command ? "- The user's instruction below says what to do with the document; where they disagree, the instruction wins (e.g. \"just the exams\")." : '- The user sent the document with no instruction: schedule what it describes, following the rules above.'}
` : ''
  const docTextBlock = textDocs.length ? '\n' + textDocs.map(d =>
    `DOCUMENT "${d.name}" (text extracted from the file; table rows read as cells separated by " | "):\n<<<\n${d.text}\n>>>`).join('\n\n') + '\n' : ''
  const attached = [images.length ? 'attached photo' + (images.length > 1 ? 's' : '') : '', docs.length ? 'attached document' + (docs.length > 1 ? 's' : '') : '']
    .filter(Boolean).join(' and ')
  const fallbackCommand = docs.length && !images.length ? 'Schedule what the attached document describes.'
    : docs.length ? 'Schedule what the attached document and photos describe.'
    : 'Schedule what the attached photo shows.'

  const prompt =
`You are the assistant for a personal planner. Turn the user's instruction${attached ? ' and ' + attached : ''} into a PLAN of concrete actions the app will carry out after they confirm.

Today is ${today} (the user's local date). Resolve relative dates against it.
${photoNote}${docNote}${docTextBlock}
CATEGORIES (use ids only where a category applies):
${catList}

THE USER'S CURRENT TASKS (only reference these ids; NEVER invent an id):
${taskList}

Respond with ONLY a JSON object (no prose, no markdown, no code fences) of this exact shape:
{"summary": "one sentence", ${images.length ? '"seen": [ ...every appointment card read off the photos, if they show a list of appointments, else [] ... ], ' : ''}"actions": [ ...action objects... ]}

Each action object is one of these shapes. COPY the shape and fill in EVERY field that applies — never leave out the dates on a create or event:
- create — a new single-day TASK (something to do on one day):
  {"kind":"create","title":"Dentist","date":"2026-08-25","dateFrom":"Tues Aug 25","time":"15:00","durationMins":60,"categoryIds":[],"description":"Bring insurance card","icon":"tooth","subtasks":[{"text":"call to confirm","done":false}],"reminders":[]}
- event — a multi-day calendar EVENT spanning a range of days (a trip, a vacation, someone away/out, a conference — anything covering more than one day or phrased as an absence/trip/period). date is the START day, endDate the END day:
  {"kind":"event","title":"Danya trip to Mexico","date":"2026-08-14","dateFrom":"14–18th","endDate":"2026-08-18","allDay":true}
- create that REPEATS — add a "repeat" object. Birthdays and anniversaries are ALWAYS yearly; "every Monday and Wednesday" is weekly with those days; "every day"/"daily" is daily; "on the 1st of every month" is monthly; "every other week" is interval 2. date is the FIRST occurrence on or after today (for a birthday, its next date). endDate only when an end is stated:
  {"kind":"create","title":"Mom's birthday","date":"2027-03-14","dateFrom":"March 14","time":"","durationMins":0,"categoryIds":[],"description":"","subtasks":[],"reminders":[],"repeat":{"freq":"yearly","interval":1,"days":[],"endDate":""}}
  {"kind":"create","title":"Gym","date":"2026-08-24","dateFrom":"Mondays","time":"07:00","durationMins":60,"categoryIds":[],"description":"","subtasks":[],"reminders":[],"repeat":{"freq":"weekly","interval":1,"days":["monday","thursday"],"endDate":""}}
- repeat — make an EXISTING one-off task recur (use a taskId from the list above):
  {"kind":"repeat","taskId":"<existing id>","repeat":{"freq":"yearly","interval":1,"days":[],"endDate":""}}
- addSubtasks — add subtasks to an EXISTING task (use a taskId from the list above):
  {"kind":"addSubtasks","taskId":"<existing id>","subtasks":[{"text":"read chapter 4","done":true}]}
- setDone — mark an existing task complete/incomplete:
  {"kind":"setDone","taskId":"<existing id>","done":true}
- reschedule — change an existing task's date/time:
  {"kind":"reschedule","taskId":"<existing id>","date":"2026-08-26","time":"09:00","durationMins":30}

Rules:
- ALWAYS return at least one action whenever the instruction describes anything to schedule, add, or change. Never return an empty "actions" array in that case — the summary alone is not enough; the app can only act on the actions.
- To act on an existing task, find the best match in the list by name and use its exact id. If nothing matches what the user names, prefer a create action or leave it out — do not guess a random id.
- Choosing create vs event: if it happens on ONE day, use create (a task). If it covers MORE THAN ONE day, or reads as a trip / vacation / absence / stretch of days, use event and set date=start, endDate=end. Resolve durations like "6 weeks" into an actual endDate from today. When only a start is given for a clearly multi-day thing and no end is stated, make a sensible endDate rather than collapsing it to one day.
- On every create and event, "dateFrom" is the exact words in the instruction or photo that gave you the date ("Sat Oct 12", "tomorrow", "9/9"). If nothing stated a date, dateFrom is "" and so is date.
- Every date MUST be a literal YYYY-MM-DD string (e.g. "2026-08-14"), never words like "August 14th".
- The instruction may describe SEVERAL things at once — produce one action for each. Two people/plans mentioned means (at least) two actions.
- Anything that recurs gets a "repeat" object — never create it as a one-off and never make separate copies for each date. Leave "repeat" out only for something that happens once.
- Only use information present or clearly implied. Never fabricate specifics.
- "reminders" is ALWAYS [] unless the user's instruction asks for specific reminders ("remind me 2 hours before"). An empty list means the user's own default reminders from their settings apply — never choose reminders for them.
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
${command || fallbackCommand}
"""`

  const reqBody = JSON.stringify({
    contents: [{ parts: [
      { text: prompt },
      // Photos ride alongside the prompt; the flash models read them directly.
      ...images.map(im => ({ inline_data: { mime_type: im.mimeType, data: im.data } })),
      // A PDF goes in whole; Gemini reads its pages (and its tables) itself.
      ...pdfDocs.map(d => ({ inline_data: { mime_type: 'application/pdf', data: d.data } })),
    ] }],
    // NB: no responseSchema. Gemini's structured-output mode reliably fills only
    // required fields and drops the rest on a schema this size — it was omitting
    // event dates entirely. Plain JSON mode + explicit per-kind templates in the
    // prompt gets complete objects out of the free flash models.
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
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
  // Photos go to 2.5-flash first: 2.0-flash skipped cards on a crowded
  // screenshot (two same-titled visits on one day came back as one).
  const order = images.length ? ['gemini-2.5-flash', ...MODELS.filter(m => m !== 'gemini-2.5-flash')] : MODELS
  const triedCached = !!cachedModel && (!images.length || cachedModel === order[0])
  if (triedCached) await tryModels([cachedModel])
  if (!resp && !hardStop) await tryModels(order.filter(m => !(triedCached && m === cachedModel)))
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
    const what = images.length ? (command ? 'this' : 'this photo') : docs.length ? (command ? 'this' : 'this document') : 'this text'
    return json({ error: blocked ? `The AI declined ${what} (${blocked}).` : 'The AI returned nothing usable.' }, 502)
  }

  // Without responseSchema the model almost always returns bare JSON, but strip
  // a stray ```json fence or leading prose just in case, and fall back to the
  // first {...} block, so a tidy plan isn't lost to a formatting quirk.
  let parsed: any
  const cleaned = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    try { parsed = m ? JSON.parse(m[0]) : null } catch { parsed = null }
    // A long syllabus can hold more items than one reply has room for; the
    // plan is then cut off mid-JSON. Say so, and how to get it in parts.
    if (!parsed && data?.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      return json({ error: 'That has more items than I can plan in one go. Ask for part of it — e.g. “just the exams and assignments”, or “September and October”.' }, 422)
    }
    if (!parsed) return json({ error: 'AI returned unparseable JSON.', detail: cleaned.slice(0, 300) }, 502)
  }

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
  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const cleanRepeat = (r: any) => {
    if (!r || typeof r !== 'object') return null
    const freq = String(r.freq || '').toLowerCase()
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) return null
    const interval = Math.max(1, Math.min(99, Math.round(Number(r.interval) || 1)))
    const days = Array.isArray(r.days)
      ? [...new Set(r.days.map((d: any) => String(d || '').toLowerCase().trim())
          .map((d: string) => WEEKDAYS.find(w => w.startsWith(d.slice(0, 3)) && d.length >= 2) || '')
          .filter(Boolean))]
      : []
    return { freq, interval, days: freq === 'weekly' ? days : [], endDate: clampDate(r.endDate) }
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
        date: clampDate(a.date), dateFrom: String(a.dateFrom || '').trim().slice(0, 120), time: clampTime(a.time),
        durationMins: Number.isFinite(a.durationMins) ? Math.max(0, Math.min(1440, Math.round(a.durationMins))) : 0,
        categoryIds: Array.isArray(a.categoryIds) ? a.categoryIds.filter((id: string) => validCats.has(id)).slice(0, 4) : [],
        description: String(a.description || '').trim().slice(0, 4000),
        icon: String(a.icon || '').trim().toLowerCase().slice(0, 40),
        subtasks: cleanSubs(a.subtasks),
        reminders: Array.isArray(a.reminders) ? a.reminders.map((n: any) => Math.round(Number(n))).filter((n: number) => Number.isFinite(n) && n >= 0 && n <= 40320).slice(0, 6) : [],
        repeat: cleanRepeat(a.repeat),
      })
    } else if (kind === 'event') {
      const title = String(a.title || '').trim().slice(0, 200)
      const start = clampDate(a.date)
      if (!title || !start) continue
      let end = clampDate(a.endDate) || start
      if (end < start) end = start            // never let the range invert
      const allDay = a.allDay !== false
      actions.push({
        kind, title, startDate: start, endDate: end, allDay, dateFrom: String(a.dateFrom || '').trim().slice(0, 120),
        startTime: allDay ? '' : clampTime(a.startTime),
        endTime:   allDay ? '' : clampTime(a.endTime),
      })
    } else if (kind === 'repeat') {
      const repeat = cleanRepeat(a.repeat)
      if (!validTaskIds.has(a.taskId) || !repeat) continue
      actions.push({ kind, taskId: a.taskId, repeat })
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

  // A photo with no readable date — or a date that lives on a different photo
  // than the item — used to come back as TODAY: the model's fallback, and a
  // silent one, so a whole event plan landed on the wrong day. With photos
  // attached, a date of today has to be backed by words that actually said so
  // ("today", "tonight", or that calendar date); otherwise it's cleared and the
  // action is flagged so the app asks the user for the date instead of guessing.
  if (images.length || docs.length) {
    const [, tm, td] = today.split('-').map(Number)
    const saysToday = (from: string) => {
      const f = from.toLowerCase()
      if (!f) return false
      if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(f)) return true
      const nums = (f.match(/\d+/g) || []).map(Number)
      return nums.includes(td) && (nums.includes(tm) || MONTHS[tm - 1].some(m => f.includes(m)))
    }
    for (const a of actions) {
      if (a.kind === 'create' && a.date === today && !saysToday(a.dateFrom)) { a.date = ''; a.needsDate = true }
      else if (a.kind === 'create' && !a.date) a.needsDate = true
      else if (a.kind === 'event' && a.startDate === today && !saysToday(a.dateFrom)) {
        a.needsDate = true
        a.startDate = ''
        a.endDate = a.endDate === today ? '' : a.endDate
      }
    }
  }

  // The cards the model read off an appointment list, passed through so the
  // app can add any it read but then left out of the plan.
  const seen = (images.length && Array.isArray(parsed.seen) ? parsed.seen : [])
    .map((c: any) => ({ date: clampDate(c?.date), time: clampTime(String(c?.time || '')), title: String(c?.title || '').trim().slice(0, 200) }))
    .filter((c: { date: string; time: string; title: string }) => c.date && c.time && c.title)
    .slice(0, 60)

  const summary = String(parsed.summary || '').trim().slice(0, 300)
  if (!actions.length && !seen.length) {
    // The model gave a summary but no action we could use. Echo what it actually
    // returned so the failure is diagnosable instead of a mystery empty plan.
    const rawActions = JSON.stringify(parsed.actions ?? parsed).slice(0, 600)
    return json({ summary, actions: [], error: `I understood it but couldn't turn it into an action. The AI returned: ${rawActions}` })
  }
  return json({ summary, actions, ...(seen.length ? { seen } : {}) })
 } catch (e) {
  // Anything we didn't foresee returns a readable message instead of an opaque
  // 500, so a failure is never invisible again.
  return json({ error: `The assistant hit an unexpected error: ${(e as Error)?.message || e}`, stack: String((e as Error)?.stack || '').slice(0, 600) }, 500)
 }
})
