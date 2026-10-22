// supabase/functions/ics-proxy/index.ts
// ─────────────────────────────────────────────────────────────
// A tiny CORS-safe fetcher for subscribed calendars. The browser can't fetch a
// published iCloud / Apple Family .ics directly — those feeds don't send CORS
// headers — so Bloom calls this function with ?url=<the feed> and it fetches the
// calendar server-side and hands back the raw .ics with permissive CORS.
//
// It only ever GETs a calendar feed and returns text; it never touches the
// database. Deploy it alongside send-reminders:
//     supabase functions deploy ics-proxy
// (see CALENDAR_SYNC.md). If you deploy with JWT verification on, the app
// already sends the anon key, so no extra config is needed.
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}

// Block obvious SSRF targets — link-local, loopback, and private ranges — so
// this can't be turned into a probe of the Supabase project's own network.
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  // IPv6 literals ([::1], [fd00::…], IPv4-mapped…) and bare-number hosts
  // (http://2130706433 is 127.0.0.1) — no calendar lives at one of those.
  if (h.startsWith('[') || h.includes(':') || /^[\d.]+$/.test(h) && !/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true
  if (/^0x|\.0x/.test(h)) return true                                              // hex octets
  if (h.startsWith('0.') || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true  // 0/8, CGNAT 100.64/10
  if (h === 'localhost' || h === '0.0.0.0' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === '169.254.169.254' || h.startsWith('169.254.')) return true            // cloud metadata / link-local
  if (h === '127.0.0.1' || h.startsWith('127.')) return true
  if (h.startsWith('10.') || h.startsWith('192.168.')) return true
  const m = h.match(/^172\.(\d+)\./)
  if (m && +m[1] >= 16 && +m[1] <= 31) return true                                 // 172.16.0.0/12
  return false
}

const MAX_REDIRECTS = 5
const MAX_BYTES = 10 * 1024 * 1024   // far beyond any real calendar feed

// The body as text, or null once it passes `max` bytes — so the proxy can't be
// used to pull arbitrarily large files through the project.
async function readCapped(res: Response, max: number): Promise<string | null> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > max) { await reader.cancel().catch(() => {}); return null }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) { all.set(c, at); at += c.length }
  return new TextDecoder().decode(all)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: CORS })

  const raw = new URL(req.url).searchParams.get('url')
  if (!raw) return new Response(JSON.stringify({ error: 'Missing ?url' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })

  // webcal:// → https://, and only allow http(s).
  let target = raw.trim()
  if (/^webcal:\/\//i.test(target)) target = target.replace(/^webcal:\/\//i, 'https://')

  let parsed: URL
  try { parsed = new URL(target) } catch { return new Response(JSON.stringify({ error: 'Bad url' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }) }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return new Response(JSON.stringify({ error: 'Only http(s) URLs are allowed' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
  if (isBlockedHost(parsed.hostname)) {
    return new Response(JSON.stringify({ error: 'That host is not allowed' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  try {
    // Follow redirects by hand so every hop gets the same host check — with
    // redirect: 'follow' a public URL could bounce the request to a private one.
    let upstream: Response | null = null
    let url = parsed
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      upstream = await fetch(url.toString(), {
        redirect: 'manual',
        headers: { 'User-Agent': 'Bloom-Calendar-Sync/1.0', 'Accept': 'text/calendar, text/plain, */*' },
      })
      const loc = upstream.status >= 300 && upstream.status < 400 ? upstream.headers.get('location') : null
      if (!loc) break
      url = new URL(loc, url)
      if ((url.protocol !== 'https:' && url.protocol !== 'http:') || isBlockedHost(url.hostname)) {
        return new Response(JSON.stringify({ error: 'The calendar redirected to a host that is not allowed' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
      }
      upstream = null
    }
    if (!upstream) return new Response(JSON.stringify({ error: 'Too many redirects' }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } })
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: `Calendar feed responded ${upstream.status}` }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    const text = await readCapped(upstream, MAX_BYTES)
    if (text == null) return new Response(JSON.stringify({ error: 'That calendar is too large' }), { status: 413, headers: { ...CORS, 'Content-Type': 'application/json' } })
    return new Response(text, { status: 200, headers: { ...CORS, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error)?.message || 'Fetch failed' }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
