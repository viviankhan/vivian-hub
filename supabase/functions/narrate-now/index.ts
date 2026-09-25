// supabase/functions/narrate-now/index.ts
// ─────────────────────────────────────────────────────────────
// Wakes the "Narrate papers" GitHub Action right away, so a paper you just
// added gets its audio in a couple of minutes instead of waiting for the next
// scheduled sweep. Optional: without it the schedule still picks papers up.
//
// Only a signed-in Bloom user can trigger it. It does nothing but send a
// repository_dispatch; the Action decides what (if anything) needs narrating.
//
//     supabase secrets set GH_DISPATCH_TOKEN=github_pat_...   (see PAPERS.md)
//     supabase secrets set GH_REPO=viviankhan/vivian-hub
//     supabase functions deploy narrate-now
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const TOKEN = Deno.env.get('GH_DISPATCH_TOKEN') || ''
const REPO = Deno.env.get('GH_REPO') || 'viviankhan/vivian-hub'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!TOKEN) return json({ error: 'GH_DISPATCH_TOKEN is not set; the schedule will narrate it instead.' }, 503)

  // verify_jwt is off (for the CORS preflight), so check the caller here.
  const auth = req.headers.get('authorization') || ''
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } })
  if (!who.ok) return json({ error: 'Sign in first.' }, 401)

  const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bloom-narrate-now',
    },
    body: JSON.stringify({ event_type: 'narrate' }),
  })
  if (!r.ok) return json({ error: `GitHub refused the dispatch (${r.status}).`, detail: (await r.text()).slice(0, 300) }, 502)
  return json({ ok: true })
})
