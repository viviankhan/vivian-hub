// Send it and close the app (src/lib/parseEvent.js: runAssistantJob). A
// request goes to the server as a job in one upload, is read there, and its
// answer is collected from assistant_jobs — including after the app was closed
// mid-read and opened again, without asking twice.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}

// A stand-in for the Supabase client: just enough of assistant_jobs.
const rows = new Map()
let tableMissing = false
globalThis.__jobsDb = {
  from: () => {
    const q = { id: null, del: false }
    const api = {
      select: () => api,
      delete: () => { q.del = true; return api },
      eq: (_col, v) => { q.id = v; if (q.del) { rows.delete(v); return Promise.resolve({ error: null }) } return api },
      maybeSingle: async () => tableMissing
        ? { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.assistant_jobs'" } }
        : { data: rows.has(q.id) ? { ...rows.get(q.id) } : null, error: null },
    }
    return api
  },
}
const mock = resolve(here, '.storage.jobs.mock.mjs')
writeFileSync(mock, 'export const supabase = globalThis.__jobsDb\n')
const shim = resolve(here, '.parseEvent.jobs.shim.mjs')
writeFileSync(shim, readFileSync(resolve(here, '../src/lib/parseEvent.js'), 'utf8')
  .replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, '"https://example.test"')
  .replace(/import\.meta\.env\.VITE_SUPABASE_ANON_KEY/g, '""')
  .replaceAll("import('./storage.js')", `import(${JSON.stringify(mock)})`)
  .replace('const POLL_MS = 3000', 'const POLL_MS = 1'))
const P = await import(shim)

const plan = { summary: 'Meeting', actions: [{ kind: 'create', title: 'HOD meeting', date: '2026-10-21', dateFrom: 'Oct 21', time: '14:00', durationMins: 60, categoryIds: [], description: '', subtasks: [], reminders: [] }] }
const photo = { images: [{ data: 'AAAA', mimeType: 'image/jpeg' }], today: '2026-10-18' }

// The server: takes { jobId, job } (files + answers later) or { jobId } (a nudge).
let posts = []
let answerAfterPolls = 0
let polls = 0
function server({ answer = plan, status = 200, legacy = false } = {}) {
  globalThis.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body)
    posts.push(Object.keys(body).sort().join(','))
    if (legacy) {
      if (body.jobId) return new Response(JSON.stringify({ error: 'Nothing to do' }), { status: 400 })
      return new Response(JSON.stringify(answer), { status })
    }
    if (body.job && !rows.has(body.jobId)) rows.set(body.jobId, { status: 'queued', started_at: null })
    const row = rows.get(body.jobId)
    if (row && row.status === 'queued') Object.assign(row, { status: 'running', started_at: new Date().toISOString() })
    return new Response(JSON.stringify({ status: 'running' }), { status: 202 })
  }
  // The background read finishes after a few polls.
  const orig = globalThis.__jobsDb.from
  globalThis.__jobsDb.from = () => {
    const t = orig()
    const ms = t.maybeSingle
    t.select = () => t
    t.maybeSingle = async () => {
      polls++
      for (const r of rows.values()) if (r.status === 'running' && polls > answerAfterPolls) Object.assign(r, { status: status < 300 ? 'done' : 'error', result: answer, http_status: status })
      return ms()
    }
    return t
  }
  return () => { globalThis.__jobsDb.from = orig }
}

console.log('\n— one upload, read on the server, answer collected —')
rows.clear(); posts = []; polls = 0; answerAfterPolls = 2
let saved = []
let restore = server()
let res = await P.runAssistantJob('', photo, { save: id => saved.push(id), notify: { device_id: 'd1', tag: 'assistant:x' } })
restore()
eq('an id is kept before anything is sent', saved.length === 1 && /^[0-9a-f-]{36}$/.test(saved[0]), true)
eq('the request went up once, with its job', posts, ['job,jobId,notify'])
eq('the plan came back', res.actions.map(a => a.title), ['HOD meeting'])
eq('collected answers are cleared', rows.size, 0)

console.log('\n— reopened after closing mid-read: collects, doesn’t re-send —')
rows.clear(); posts = []; polls = 0; answerAfterPolls = 0
rows.set('job-1', { status: 'done', result: plan, http_status: 200, started_at: new Date().toISOString() })
restore = server()
res = await P.runAssistantJob('', photo, { id: 'job-1' })
restore()
eq('nothing sent again', posts, [])
eq('the answer read while the app was closed', res.actions.length, 1)

console.log('\n— the upload never made it (app froze first): sent on reopen —')
rows.clear(); posts = []; polls = 0; answerAfterPolls = 1
restore = server()
res = await P.runAssistantJob('', photo, { id: 'job-2' })
restore()
eq('sent with its original id', [posts[0], rows.has('job-2')], ['job,jobId,notify', false])
eq('and answered', res.actions.length, 1)

console.log('\n— a filed job that never started is nudged —')
rows.clear(); posts = []; polls = 0; answerAfterPolls = 1
rows.set('job-3', { status: 'queued', started_at: null })
restore = server()
res = await P.runAssistantJob('', photo, { id: 'job-3' })
restore()
eq('nudged with just its id', posts, ['jobId'])

console.log('\n— the server’s error comes through as the error —')
rows.clear(); posts = []; polls = 0; answerAfterPolls = 0
restore = server({ answer: { error: 'The AI declined this photo.' }, status: 502 })
let msg = null
try { await P.runAssistantJob('', photo, {}) } catch (e) { msg = e.message }
restore()
eq('readable error', msg, 'The AI declined this photo.')

console.log('\n— a dropped connection is tagged for the queue to retry —')
rows.clear()
globalThis.fetch = async () => { throw new TypeError('Load failed') }
let err = null
try { await P.runAssistantJob('', photo, {}) } catch (e) { err = e }
eq('network error', !!(err && err.network), true)

console.log('\n— before the jobs table exists, it asks directly —')
rows.clear(); posts = []; tableMissing = true
server()
globalThis.fetch = async (_u, opts) => { posts.push(Object.keys(JSON.parse(opts.body)).sort().join(',')); return new Response(JSON.stringify(plan), { status: 200 }) }
res = await P.runAssistantJob('', photo, {})
tableMissing = false
eq('direct request', [posts.length, posts[0].includes('jobId')], [1, false])
eq('plan', res.actions.length, 1)

console.log('\n— an older function that doesn’t know jobs: asks directly —')
rows.clear(); posts = []; polls = 0
restore = server({ legacy: true })
res = await P.runAssistantJob('', photo, {})
restore()
eq('tried as a job, then directly', posts, ['job,jobId,notify', 'categories,command,images,tasks,today'])
eq('plan', res.actions.length, 1)

for (const f of [mock, shim]) { try { unlinkSync(f) } catch {} }
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
