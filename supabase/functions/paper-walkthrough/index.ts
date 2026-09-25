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
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || ''
// Gemini's inline-data ceiling is ~20MB per request, and base64 adds a third.
const MAX_B64 = 19_000_000

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
- "heading" is a short plain phrase (no numbering).

Figures:
- For a section whose point is best seen in one of the paper's figures, set "figure" to
  {"page": <1-based PDF page number>, "box_2d": [ymin, xmin, ymax, xmax], "caption": ""}
  otherwise leave it null.
- "box_2d" is the region of that page holding the figure itself (all of its panels and axis labels), normalized to 0-1000, with [0,0] the top-left of the page. Exclude the printed figure legend text and the running page header or footer.
- Use each figure at most once. Only point at real figures or tables that appear in the PDF; never invent one.
- "caption" is 1 to 3 spoken sentences in your own words saying what the figure shows and what to look for. No panel letters in parentheses.

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

  let body: { pdf?: string }
  try { body = await req.json() } catch { return json({ error: 'Bad JSON body' }, 400) }
  const pdf = (body.pdf || '').trim()
  if (!pdf) return json({ error: 'No PDF was sent.' }, 400)
  if (pdf.length > MAX_B64) return json({ error: 'That PDF is too large to read in one go (over about 14 MB).' }, 413)

  const reqBody = (model: string) => JSON.stringify({
    contents: [{ parts: [
      { inline_data: { mime_type: 'application/pdf', data: pdf } },
      { text: PROMPT },
    ] }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      // Keep 2.5's thinking short: the function has a wall-clock limit.
      ...(/2\.5|latest/.test(model) ? { thinkingConfig: { thinkingBudget: 2048 } } : {}),
    },
  })

  let data: any = null
  let lastStatus = 0
  let lastDetail = ''
  for (const model of MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`
    let r: Response
    try {
      r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody(model) })
    } catch (e) {
      return json({ error: `Couldn't reach the AI service: ${(e as Error)?.message || e}` }, 502)
    }
    if (r.ok) { data = await r.json().catch(() => null); break }
    lastStatus = r.status
    lastDetail = await r.text().catch(() => '')
    if (r.status === 400 && /API key not valid/i.test(lastDetail)) return json({ error: 'The Gemini API key is invalid. Set a valid GEMINI_API_KEY secret and redeploy.' }, 502)
    if (r.status === 403) return json({ error: 'Gemini access is blocked for this key (403).', detail: lastDetail.slice(0, 300) }, 502)
    // 404 / 429 / 5xx / a 400 for an option an older model lacks: next model.
  }
  if (!data) {
    if ([429, 500, 502, 503].includes(lastStatus)) return json({ error: 'The AI models are busy right now. Try again in a minute.', detail: lastDetail.slice(0, 300) }, 503)
    return json({ error: `AI service error (${lastStatus}).`, detail: lastDetail.slice(0, 300) }, 502)
  }

  const parts: any[] = data?.candidates?.[0]?.content?.parts || []
  const raw = parts.filter(p => typeof p?.text === 'string' && !p.thought).map(p => p.text).join('')
  if (!raw) {
    const blocked = data?.promptFeedback?.blockReason
    return json({ error: blocked ? `The AI declined this PDF (${blocked}).` : 'The AI returned nothing usable.' }, 502)
  }
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  let out: any
  try { out = JSON.parse(cleaned) } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    try { out = m ? JSON.parse(m[0]) : null } catch { out = null }
  }
  if (!out || !Array.isArray(out.sections) || !out.sections.length) return json({ error: 'The AI did not return a walkthrough. Try again.' }, 502)

  return json(normalize(out))
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
