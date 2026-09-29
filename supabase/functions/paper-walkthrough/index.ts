// supabase/functions/paper-walkthrough/index.ts
// ─────────────────────────────────────────────────────────────
// PDF → listenable walkthrough, for the Papers tab (see PAPERS.md).
//
// The app posts the whole PDF (base64). Gemini reads PDFs natively — every page
// is seen as an image as well as text — so unlike the old artifact's text-only
// route this one sees the FIGURES. It writes the spoken walkthrough and, for
// each section, may point at one figure: which page it is on and a bounding box
// around it. The app crops that region out of the page itself (pdf.js) and
// shows it to you for review before anything is saved.
//
// Nothing here writes to the database.
//
// Reuses the same server-side key as parse-event:
//     supabase secrets set GEMINI_API_KEY=your_key_here
//     supabase functions deploy paper-walkthrough
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// 2.5 first: it is noticeably better at long PDFs and at placing boxes.
const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash']

// Google retires model names over time, and each key sees its own set. Ask
// the key which models it can actually use (best flash models first), and try
// those after the list above, so a retired name never breaks PDF reading.
let discovered: string[] | null = null
async function modelsToTry(): Promise<string[]> {
  if (!discovered) {
    discovered = []
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_KEY)}&pageSize=200`)
      const d: any = r.ok ? await r.json() : null
      const usable = (Array.isArray(d?.models) ? d.models : [])
        .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => String(m?.name || '').replace(/^models\//, ''))
        .filter((n: string) => /gemini/i.test(n) && /flash|pro/i.test(n) && !/embedding|aqa|tts|image|audio|live|lite/i.test(n))
      const version = (n: string) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0')
      const rank = (n: string) => (/flash/i.test(n) ? 0 : 1000) - version(n) * 10 + (/preview|exp/i.test(n) ? 5 : 0)
      discovered = usable.sort((a: string, b: string) => rank(a) - rank(b)).slice(0, 6)
    } catch { /* fall back to the fixed list */ }
  }
  const seen = new Set<string>()
  return [...(lastGood ? [lastGood] : []), ...MODELS, ...discovered].filter(m => !seen.has(m) && seen.add(m))
}
let lastGood = ''
// Models that turned down a thinking budget; asked without one from then on.
const noThinking = new Set<string>()
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || ''
// Background mode writes the result straight to the papers table.
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const GH_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN') || ''
const GH_REPO = Deno.env.get('GH_REPO') || 'viviankhan/vivian-hub'
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined
// Gemini's inline-data ceiling is ~20MB per request, and base64 adds a third.
const MAX_B64 = 19_000_000

// How a figure is talked through, shared by both prompts below.
const FIGURE_STYLE = `4 to 8 sentences in your own words. Start with what kind of figure it is and what it is about ("The figure shows a cell tree for haematopoietic stem cell differentiation."). Then walk through it in the order the eye would: top to bottom, left to right, panel by panel, saying where each thing is ("At the top…", "The first branch, on the left…", "In the right-hand panel…"). Name what each part shows, what the axes measure and the direction of any trend. End with the one thing the figure is there to show. Say chemistry and maths as their meaning (for example "carbon bonded to two oxygen atoms", "x squared"). No panel letters in parentheses, no markdown.`

const PROMPT = `You are turning a scientific paper (the attached PDF) into a walkthrough that will be READ ALOUD by a text-to-speech voice to a scientist listening while doing bench work.

Return ONE JSON object (no prose, no markdown, no code fences) of exactly this shape:
{"title":"","authors":"","journal":"","year":"","doi":"",
 "sections":[{"heading":"","body":"","figure":null}],
 "terms":[{"term":"","def":""}]}

Metadata:
- "title": the paper's title. "authors": first author's surname followed by "et al." (just the surname if there is one author). "journal", "year", "doi": from the paper, or "" if not shown.

Sections:
- Write 6 to 9 sections that walk through the paper in order: the question, what was already known, the approach, each main finding, and the caveats and what it means.
- Each "body" is 90 to 170 words of plain spoken prose. Separate paragraphs with a blank line.
- No parenthetical citations, no reference numbers, no markdown, no bullet points, no headings inside the body, no URLs.
- Paraphrase throughout. Do not quote the paper.
- Write for the ear: short clear sentences, spell out what an abbreviation stands for the first time it appears, avoid long parenthetical asides.
- Say chemistry and maths as their meaning, not their symbols: "carbon bonded to two oxygen atoms" rather than CO2, "a calcium ion with a positive charge of two" rather than Ca2+, "a carbon double-bonded to an oxygen" rather than C=O, "x squared" rather than x^2, "ten to the power of minus five" rather than 10^-5. Read IUPAC names by their parts ("two chloro propan one ol").
- "heading" is a short plain phrase (no numbering).

Figures:
- For a section whose point is best seen in one of the paper's figures, set "figure" to
  {"page": <1-based PDF page number>, "box_2d": [ymin, xmin, ymax, xmax], "caption": ""}
  otherwise leave it null.
- "box_2d" is the region of that page holding the figure itself (all of its panels and axis labels), normalized to 0-1000, with [0,0] the top-left of the page. Exclude the printed figure legend text and the running page header or footer.
- Use each figure at most once. Only point at real figures or tables that appear in the PDF; never invent one.
- "caption" is a spoken walkthrough of the figure for a listener who cannot see it, ${FIGURE_STYLE}

Glossary:
- "terms": 4 to 8 key terms a listener may not know, each spelled EXACTLY as it appears in your section text so it can be found there, with a one- or two-sentence plain definition in "def".`

Deno.serve(async (req) => {
 try {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!GEMINI_KEY) return json({ error: 'The AI key is not set up. Add a GEMINI_API_KEY secret, then redeploy.' }, 503)

  // verify_jwt is off (for the CORS preflight), and a whole PDF is an
  // expensive request, so only a signed-in Bloom user may make one.
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: req.headers.get('authorization') || '' } })
  if (!who.ok) return json({ error: 'Sign in first.' }, 401)

  let body: { pdf?: string; image?: string; context?: string; paperId?: string }
  try { body = await req.json() } catch { return json({ error: 'Bad JSON body' }, 400) }
  // Background mode: the PDF is already in storage and the paper row exists.
  // Answer at once and keep reading after Bloom is closed.
  if (body.paperId) return startReading(body.paperId, req.headers.get('authorization') || '')
  // Second mode: talk through one figure image (a screenshot you attached).
  if (body.image) return describeFigure(body.image, body.context || '')
  const pdf = (body.pdf || '').trim()
  if (!pdf) return json({ error: 'No PDF was sent.' }, 400)
  if (pdf.length > MAX_B64) return json({ error: 'That PDF is too large to read in one go (over about 14 MB).' }, 413)

  const result = await generateWalkthrough(pdf)
  return result.ok ? json(result.value) : json({ error: result.error, detail: result.detail }, result.status)
 } catch (e) {
  return json({ error: `Unexpected error: ${(e as Error)?.message || e}` }, 500)
 }
})

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const clamp = (n: unknown) => Math.max(0, Math.min(1000, Number(n) || 0))

// Keep only the shape the app expects, whatever the model added.
function normalize(o: any) {
  const seenFig = new Set<string>()
  return {
    title: str(o.title), authors: str(o.authors), journal: str(o.journal),
    year: str(String(o.year ?? '')), doi: str(o.doi),
    sections: o.sections.slice(0, 12).map((s: any) => {
      let figure = null
      const f = s?.figure
      if (f && Number.isFinite(Number(f.page)) && Array.isArray(f.box_2d) && f.box_2d.length === 4) {
        const [y0, x0, y1, x1] = f.box_2d.map(clamp)
        const key = `${f.page}:${Math.round(y0 / 50)}:${Math.round(x0 / 50)}`
        if (y1 - y0 > 40 && x1 - x0 > 40 && !seenFig.has(key)) {
          seenFig.add(key)
          figure = { page: Math.max(1, Math.round(Number(f.page))), box: [y0, x0, y1, x1], caption: str(f.caption) }
        }
      }
      return { heading: str(s?.heading), body: str(s?.body).replace(/\r\n/g, '\n'), figure }
    }).filter((s: any) => s.body),
    terms: (Array.isArray(o.terms) ? o.terms : [])
      .map((t: any) => ({ term: str(t?.term), def: str(t?.def) }))
      .filter((t: any) => t.term && t.def).slice(0, 10),
  }
}

// ── One figure → a spoken walkthrough ──────────────────────────
async function describeFigure(image: string, context: string) {
  if (image.length > 8_000_000) return json({ error: 'That image is too large.' }, 413)
  const prompt = `This image is a figure from a scientific paper. Write a spoken walkthrough of it for a scientist who is listening, not looking: ${FIGURE_STYLE}
${context ? `\nFor context, the part of the walkthrough this figure belongs to says:\n"""${context.slice(0, 3000)}"""\nUse it to name things correctly, but describe what the figure itself shows.\n` : ''}
Return ONE JSON object and nothing else: {"description": ""}`
  let lastStatus = 0, lastDetail = ''
  for (const model of await modelsToTry()) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`
    let r: Response
    const body = (thinking: boolean) => JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: image } }, { text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json',
        ...(thinking && !noThinking.has(model) && /gemini-(2\.5|[3-9])|latest/.test(model) ? { thinkingConfig: { thinkingBudget: 1024 } } : {}) },
    })
    try {
      r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(true) })
      if (r.status === 400 && /thinking/i.test(await r.clone().text().catch(() => ''))) {
        noThinking.add(model)
        r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(false) })
      }
    } catch (e) { return json({ error: `Couldn't reach the AI service: ${(e as Error)?.message || e}` }, 502) }
    if (!r.ok) { lastStatus = r.status; lastDetail = await r.text().catch(() => ''); if (r.status === 403) break; continue }
    lastGood = model
    const data: any = await r.json().catch(() => null)
    const raw = (data?.candidates?.[0]?.content?.parts || []).filter((p: any) => typeof p?.text === 'string' && !p.thought).map((p: any) => p.text).join('')
    let out: any = null
    try { out = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')) } catch {}
    const description = str(out?.description)
    if (description) return json({ description })
    return json({ error: 'The AI could not describe that figure. Try again.' }, 502)
  }
  if ([429, 500, 502, 503].includes(lastStatus)) return json({ error: 'The AI models are busy right now. Try again in a minute.' }, 503)
  return json({ error: `AI service error (${lastStatus}).`, detail: lastDetail.slice(0, 300) }, 502)
}

// ── One PDF → the walkthrough (both the interactive and background modes) ──
type Walk = { ok: true; value: any } | { ok: false; status: number; error: string; detail?: string }
const fail = (status: number, error: string, detail = ''): Walk => ({ ok: false, status, error, detail: detail.slice(0, 300) })

async function generateWalkthrough(pdf: string): Promise<Walk> {
  const reqBody = (model: string, thinking = true) => JSON.stringify({
    contents: [{ parts: [
      { inline_data: { mime_type: 'application/pdf', data: pdf } },
      { text: PROMPT },
    ] }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      // Keep 2.5's thinking short: the function has a wall-clock limit.
      ...(thinking && !noThinking.has(model) && /gemini-(2\.5|[3-9])|latest/.test(model) ? { thinkingConfig: { thinkingBudget: 2048 } } : {}),
    },
  })

  let data: any = null
  let lastStatus = 0
  let lastDetail = ''
  for (const model of await modelsToTry()) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`
    let r: Response
    try {
      r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody(model) })
      // A newer model may not take a thinking budget; ask it again without one.
      if (r.status === 400) {
        const detail = await r.clone().text().catch(() => '')
        if (/thinking/i.test(detail)) { noThinking.add(model); r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody(model, false) }) }
      }
    } catch (e) {
      return fail(502, `Couldn't reach the AI service: ${(e as Error)?.message || e}`)
    }
    if (r.ok) { data = await r.json().catch(() => null); lastGood = model; break }
    lastStatus = r.status
    lastDetail = await r.text().catch(() => '')
    if (r.status === 400 && /API key not valid/i.test(lastDetail)) return fail(502, 'The Gemini API key is invalid. Set a valid GEMINI_API_KEY secret and redeploy.')
    if (r.status === 403) return fail(502, 'Gemini access is blocked for this key (403).', lastDetail)
    // 404 / 429 / 5xx / a 400 for an option an older model lacks: next model.
  }
  if (!data) {
    if ([429, 500, 502, 503].includes(lastStatus)) return fail(503, 'The AI models are busy right now. Try again in a minute.', lastDetail)
    if (lastStatus === 404) return fail(502, 'None of the Gemini models this key can use were found. Check the GEMINI_API_KEY secret is a Google AI Studio key.', lastDetail)
    return fail(502, `AI service error (${lastStatus}).`, lastDetail)
  }

  const parts: any[] = data?.candidates?.[0]?.content?.parts || []
  const raw = parts.filter(p => typeof p?.text === 'string' && !p.thought).map(p => p.text).join('')
  if (!raw) {
    const blocked = data?.promptFeedback?.blockReason
    return fail(502, blocked ? `The AI declined this PDF (${blocked}).` : 'The AI returned nothing usable.')
  }
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  let out: any
  try { out = JSON.parse(cleaned) } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    try { out = m ? JSON.parse(m[0]) : null } catch { out = null }
  }
  if (!out || !Array.isArray(out.sections) || !out.sections.length) return fail(502, 'The AI did not return a walkthrough. Try again.')

  return { ok: true, value: normalize(out) }
}

// ── Background mode: read a stored PDF with nobody waiting ──────
// Bloom uploads the PDF to paper-figures/<user>/<paper>/source.pdf, creates
// the paper row (processing = 'reading'), calls this and can then be closed.
// The walkthrough is written straight to the row. Figures are left as a page
// and a box (no image yet); the narrator Action cuts them out of the stored
// PDF before narrating, and then Alba reads the paper.
const serviceHeaders = (): Record<string, string> =>
  SERVICE.startsWith('eyJ') ? { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } : { apikey: SERVICE }

async function patchPaper(id: string, fields: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/papers?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...serviceHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  })
}

async function startReading(paperId: string, auth: string) {
  if (!SERVICE) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing from the function environment.' }, 503)
  // Read the row as the caller: row-level security makes sure it's theirs.
  const r = await fetch(`${SUPABASE_URL}/rest/v1/papers?id=eq.${encodeURIComponent(paperId)}&select=id,title,source_pdf`,
    { headers: { apikey: ANON, Authorization: auth } })
  const rows = r.ok ? await r.json().catch(() => []) : []
  const row = rows[0]
  if (!row) return json({ error: 'That paper was not found.' }, 404)
  if (!row.source_pdf) return json({ error: 'That paper has no PDF to read.' }, 400)
  await patchPaper(row.id, { processing: 'reading', processing_error: null })
  const job = readInBackground(row).catch(async (e) => {
    await patchPaper(row.id, { processing: 'failed', processing_error: String((e as Error)?.message || e).slice(0, 300) })
  })
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(job)
    return json({ ok: true, started: true }, 202)
  }
  await job
  return json({ ok: true })
}

function toBase64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function readInBackground(row: { id: string; title: string; source_pdf: string }) {
  const f = await fetch(`${SUPABASE_URL}/storage/v1/object/paper-figures/${row.source_pdf.split('/').map(encodeURIComponent).join('/')}`,
    { headers: serviceHeaders() })
  if (!f.ok) throw new Error(`Could not fetch the uploaded PDF (${f.status}).`)
  const pdf = toBase64(new Uint8Array(await f.arrayBuffer()))
  if (pdf.length > MAX_B64) throw new Error('That PDF is too large to read in one go (over about 14 MB).')

  let result = await generateWalkthrough(pdf)
  // The free tier is often briefly busy when several PDFs arrive together.
  for (let tries = 0; !result.ok && result.status === 503 && tries < 2; tries++) {
    await new Promise(res => setTimeout(res, 20_000))
    result = await generateWalkthrough(pdf)
  }
  if (!result.ok) throw new Error(result.error)

  const w = result.value
  await patchPaper(row.id, {
    title: w.title || row.title, authors: w.authors, journal: w.journal, year: w.year, doi: w.doi,
    // Figures as page + box + description; the narrator crops the images.
    sections: w.sections.map((s: any) => ({ heading: s.heading, body: s.body, figure: s.figure })),
    terms: w.terms, processing: null, processing_error: null,
  })
  if (GH_TOKEN) {
    await fetch(`https://api.github.com/repos/${GH_REPO}/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'bloom-paper-walkthrough' },
      body: JSON.stringify({ event_type: 'narrate' }),
    }).catch(() => {})
  }
}
