// supabase/functions/parse-receipt/index.ts
// ─────────────────────────────────────────────────────────────
// Receipt scanner for the B&B tracker. The app posts a downscaled receipt photo
// (base64) plus the user's known expense categories; this asks Google Gemini's
// vision model to read the receipt and return the structured fields the expense
// form pre-fills. The app shows the draft for review — nothing here writes to
// the database.
//
// Reuses the SAME server-side key as parse-event:
//     supabase secrets set GEMINI_API_KEY=your_key_here
//     supabase functions deploy parse-receipt
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

// Flash models are multimodal and free-tier; fall through the list on any
// transient error, same as parse-event.
const MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-1.5-flash']
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') || ''
let cachedModel = ''

Deno.serve(async (req) => {
 try {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!GEMINI_KEY) return json({ error: 'The AI key is not set up. Add a GEMINI_API_KEY secret, then redeploy.' }, 503)

  let body: { image?: string; today?: string; categories?: string[] }
  try { body = await req.json() } catch { return json({ error: 'Bad JSON body' }, 400) }

  const image = (body.image || '').trim()
  if (!image) return json({ error: 'No image to scan.' }, 400)
  // A downscaled JPEG is well under this; guard against a full-res upload.
  if (image.length > 8_000_000) return json({ error: 'That image is too large — try a smaller photo.' }, 413)
  const today = (body.today || new Date().toISOString().slice(0, 10)).slice(0, 10)
  const cats = Array.isArray(body.categories) ? body.categories.slice(0, 40).map(String) : []
  const catList = cats.length ? cats.join(', ') : '(none provided)'

  const prompt =
`You are reading a photo of a RECEIPT or INVOICE for a small bed-and-breakfast's expense records.
Extract the details as a single JSON object (no prose, no markdown, no code fences) of exactly this shape:
{"vendor":"","date":"YYYY-MM-DD","total":0,"currency":"USD","category":"","paidTo":"","description":"","lineItems":[{"name":"","amount":0}]}

Rules:
- "vendor" / "paidTo": the business or person paid (paidTo defaults to the vendor).
- "date": the receipt date as YYYY-MM-DD. Today is ${today} — if the year is ambiguous, prefer the most recent past date. If no date is visible, use "".
- "total": the GRAND TOTAL actually paid, as a number (no currency symbol). Prefer the amount labeled total/amount due/balance.
- "currency": ISO code if shown (USD, EUR, CAD…), else "USD".
- "category": choose the single best fit from this list if one clearly applies, otherwise a short lowercase category of your own (e.g. "supplies", "utilities", "maintenance", "food", "cleaning"): ${catList}
- "description": a short human summary of what was bought (e.g. "cleaning supplies and paper goods").
- "lineItems": up to 15 notable items with their amounts; [] if not itemized or unclear.
- Only use what is visible on the receipt. Never invent a total or a date. If the image is not a receipt, return the shape with empty strings and total 0.`

  const reqBody = JSON.stringify({
    contents: [{ parts: [
      { text: prompt },
      { inline_data: { mime_type: 'image/jpeg', data: image } },
    ] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  })

  let resp: Response | null = null
  let lastDetail = ''
  let lastStatus = 0
  let hardStop: Response | null = null

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
      if (r.status === 400 && /API key not valid/i.test(lastDetail)) { hardStop = json({ error: 'The Gemini API key is invalid. Set a valid GEMINI_API_KEY secret and redeploy.' }, 502); return false }
      if (r.status === 403) { hardStop = json({ error: 'Gemini access is blocked for this key (403). Enable the Generative Language API for the key.', detail: lastDetail.slice(0, 300) }, 502); return false }
      // 404 / 429 / 5xx — try the next model.
    }
    return false
  }

  const discoverModels = async (): Promise<string[]> => {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_KEY)}&pageSize=200`)
      if (!r.ok) return []
      const d: any = await r.json().catch(() => null)
      const all: any[] = Array.isArray(d?.models) ? d.models : []
      const usable = all
        .filter(m => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => String(m?.name || '').replace(/^models\//, ''))
        .filter(n => /gemini/i.test(n) && /flash|pro/i.test(n) && !/embedding|aqa|tts|audio/i.test(n))
      const rank = (n: string) => (/flash/i.test(n) ? 0 : 1) * 100 + (/2\.5/.test(n) ? 0 : /2\.0/.test(n) ? 1 : 2)
      return usable.sort((a, b) => rank(a) - rank(b)).filter(n => !MODELS.includes(n)).slice(0, 6)
    } catch { return [] }
  }

  if (cachedModel) await tryModels([cachedModel])
  if (!resp && !hardStop) await tryModels(MODELS.filter(m => m !== cachedModel))
  if (!resp && !hardStop && lastStatus === 404) {
    const discovered = await discoverModels()
    if (discovered.length) await tryModels(discovered)
  }
  if (hardStop) return hardStop
  if (!resp) {
    if ([429, 500, 502, 503].includes(lastStatus)) return json({ error: 'The free AI models are busy right now — please try again in a few seconds.', detail: lastDetail.slice(0, 300) }, 503)
    if (lastStatus === 404) return json({ error: 'None of the Gemini models were available for your key. Make sure your key is from Google AI Studio with the Generative Language API enabled.', detail: lastDetail.slice(0, 300) }, 502)
    return json({ error: `AI service error (${lastStatus}).`, detail: lastDetail.slice(0, 300) }, 502)
  }

  let data: any
  try { data = await resp.json() } catch { return json({ error: 'AI returned a malformed response.' }, 502) }
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!raw) {
    const blocked = data?.promptFeedback?.blockReason
    return json({ error: blocked ? `The AI declined this image (${blocked}).` : 'The AI returned nothing usable.' }, 502)
  }

  let parsed: any
  const cleaned = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    try { parsed = m ? JSON.parse(m[0]) : null } catch { parsed = null }
    if (!parsed) return json({ error: 'AI returned unparseable JSON.', detail: cleaned.slice(0, 300) }, 502)
  }

  // Normalize + clamp.
  const clampDate = (d: any): string => {
    if (!d) return ''
    const s = String(d).trim()
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
    const t = Date.parse(s)
    if (!Number.isNaN(t)) { const dt = new Date(t); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}` }
    return ''
  }
  const num = (v: any) => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0 }
  const lineItems = Array.isArray(parsed.lineItems)
    ? parsed.lineItems.map((it: any) => ({ name: String(it?.name || '').trim().slice(0, 120), amount: num(it?.amount) })).filter((it: any) => it.name).slice(0, 15)
    : []

  return json({
    vendor: String(parsed.vendor || '').trim().slice(0, 160),
    date: clampDate(parsed.date),
    total: Math.max(0, num(parsed.total)),
    currency: String(parsed.currency || 'USD').trim().slice(0, 8).toUpperCase(),
    category: String(parsed.category || '').trim().slice(0, 60),
    paidTo: String(parsed.paidTo || parsed.vendor || '').trim().slice(0, 160),
    description: String(parsed.description || '').trim().slice(0, 400),
    lineItems,
  })
 } catch (e) {
  return json({ error: `The scanner hit an unexpected error: ${(e as Error)?.message || e}`, stack: String((e as Error)?.stack || '').slice(0, 600) }, 500)
 }
})
