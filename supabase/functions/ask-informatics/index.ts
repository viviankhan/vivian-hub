// supabase/functions/ask-informatics/index.ts
// ─────────────────────────────────────────────────────────────
// The AI half of the Informatics page. The app posts a free-typed question
// ("what lab skills do I have?") plus the user's finished tasks for the chosen
// range — each with its title, category, description, subtasks, how many times
// it was done and any tracked minutes. Gemini answers from that data only and
// returns a short answer plus specific highlights, each tied back to the tasks
// it came from, so the page can show what the answer rests on.
//
// Reuses the SAME server-side key as parse-event:
//     supabase secrets set GEMINI_API_KEY=your_key_here
//     supabase functions deploy ask-informatics
//
// Runs on Supabase Edge Functions (Deno). verify_jwt is off (see config.toml)
// so the browser's CORS preflight isn't rejected before the function runs. It
// never touches the database.
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-1.5-flash']
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') || ''
let cachedModel = ''

type Task = { title?: string; cat?: string; desc?: string; subs?: string; count?: number; mins?: number; first?: string; last?: string }

const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

Deno.serve(async (req) => {
 try {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!GEMINI_KEY) return json({ error: 'The AI key is not set up. Add a GEMINI_API_KEY secret, then redeploy.' }, 503)

  let body: { question?: string; today?: string; range?: string; tasks?: Task[] }
  try { body = await req.json() } catch { return json({ error: 'Bad JSON body' }, 400) }

  const question = clip(body.question, 500)
  if (!question) return json({ error: 'Ask a question first.' }, 400)
  const today = clip(body.today || new Date().toISOString().slice(0, 10), 10)
  const range = clip(body.range || 'all time', 40)
  const tasks = (Array.isArray(body.tasks) ? body.tasks : []).slice(0, 400)
  if (!tasks.length) return json({ answer: `There's nothing finished in ${range} to answer from yet.`, highlights: [] })

  // One compact line per task keeps the prompt small and easy for the model to cite.
  const lines = tasks.map((t, i) => {
    const parts = [`#${i + 1} "${clip(t.title, 140)}"`]
    if (t.cat) parts.push(`area: ${clip(t.cat, 60)}`)
    parts.push(`done ${Math.max(1, Number(t.count) || 1)}x`)
    if (Number(t.mins) > 0) parts.push(`${Math.round(Number(t.mins))} min tracked`)
    if (t.first || t.last) parts.push(`dates: ${clip(t.first, 10)}${t.last && t.last !== t.first ? ` to ${clip(t.last, 10)}` : ''}`)
    if (t.desc) parts.push(`description: ${clip(t.desc, 700)}`)
    if (t.subs) parts.push(`subtasks: ${clip(t.subs, 500)}`)
    return parts.join(' | ')
  }).join('\n')

  const prompt =
`You help one person understand their own work history from their planner. Below is every task they finished in ${range} (today is ${today}). Descriptions and subtasks are where they write what they actually did — read them closely; they matter more than titles.

TASKS:
${lines}

QUESTION: ${question}

Answer as a single JSON object (no prose around it, no markdown, no code fences) of exactly this shape:
{"answer":"","highlights":[{"label":"","detail":"","tasks":[1]}]}

Rules:
- "answer": 1–3 plain sentences that directly answer the question, speaking to them as "you".
- "highlights": up to 10 specific items that answer the question — e.g. for a skills question, each concrete skill or technique (like "Western blotting", "Cell passaging", "Serial dilutions"), not broad buckets. "label" is the short name; "detail" is one sentence on what they did, drawn from their own descriptions/subtasks, with how often if known.
- "tasks": the #numbers of the tasks each highlight comes from.
- For time questions, add up the tracked minutes of the relevant tasks and say that only some tasks have time tracked when that's so.
- Use ONLY what's in the tasks. Never invent skills, tasks, numbers or dates. If the data can't answer the question, say so in "answer" and return [] highlights.`

  const reqBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
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
        .filter(n => /gemini/i.test(n) && /flash|pro/i.test(n) && !/embedding|aqa|tts|audio|image/i.test(n))
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
  try { data = await (resp as Response).json() } catch { return json({ error: 'AI returned a malformed response.' }, 502) }
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!raw) {
    const blocked = data?.promptFeedback?.blockReason
    return json({ error: blocked ? `The AI declined this question (${blocked}).` : 'The AI returned nothing usable.' }, 502)
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

  // Normalize, and turn task #numbers back into titles (dropping any the model
  // made up) so the page can show exactly which tasks each point rests on.
  const highlights = (Array.isArray(parsed.highlights) ? parsed.highlights : [])
    .map((h: any) => ({
      label: clip(h?.label, 80),
      detail: clip(h?.detail, 300),
      tasks: [...new Set((Array.isArray(h?.tasks) ? h.tasks : [])
        .map((n: any) => tasks[Number(n) - 1]?.title)
        .filter(Boolean)
        .map((t: any) => clip(t, 140)))].slice(0, 5),
    }))
    .filter((h: any) => h.label)
    .slice(0, 10)

  return json({ answer: clip(parsed.answer, 800), highlights })
 } catch (e) {
  return json({ error: `Informatics AI hit an unexpected error: ${(e as Error)?.message || e}` }, 500)
 }
})
