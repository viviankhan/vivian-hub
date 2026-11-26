// The move to a new database, in a real browser.
//
// tests/move.test.mjs covers the logic and tests/move.live.test.mjs covers a
// real Supabase project. This covers what only a browser has: the app booting
// from a real IndexedDB mirror and a real localStorage holding the OLD
// project's session, with supabase-js doing the talking. The "new project" is
// a small stand-in served from the same origin as the app.
//
// Builds its own copy of the app (into dist-move/) pointed at that stand-in.
import { chromium } from 'playwright'
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(REPO, 'dist-move')
const PORT = 4599
const ORIGIN = `http://localhost:${PORT}`
const BASE = '/vivian-hub/'
const OLD_REF = 'oldprojectref'
const UID = '82ac6122-0000-4000-8000-000000000001'
const EMAIL = 'her@example.com'

execFileSync('npx', ['vite', 'build', '--outDir', 'dist-move', '--logLevel', 'error'], {
  cwd: REPO, stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: ORIGIN, VITE_SUPABASE_ANON_KEY: 'anon-key', VITE_MOVED_FROM_REF: OLD_REF },
})

// ── the stand-in for the new project ─────────────────────────
const db = { tables: {}, calls: [], adopt: 'ok', adoptSeen: [], sessions: 0 }
const PK = { kv_store: ['key'], task_completions: ['storage_key'] }
const DATA_TABLES = ['kv_store', 'commitments', 'events', 'vacations', 'recurring_tasks', 'categories', 'log_entries', 'task_completions']
const table = t => (db.tables[t] ||= [])
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const session = () => {
  const now = Math.floor(Date.now() / 1000)
  const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: EMAIL, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
  return {
    access_token: `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: UID, aud: 'authenticated', role: 'authenticated', email: EMAIL, iat: now, exp: now + 3600 })}.sig`,
    token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'refresh-' + (++db.sessions), user,
  }
}
const signedIn = req => /^Bearer .+\..+\.sig$/.test(req.headers.authorization || '')
function filterRows(rows, params) {
  let out = rows
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
    const m = /^(eq|in|is|gte|gt|lte|lt|not\.is)\.(.*)$/s.exec(v)
    if (!m) continue
    const [, op, raw] = m
    if (op === 'eq') out = out.filter(r => String(r[k]) === raw)
    else if (op === 'in') { const set = raw.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')); out = out.filter(r => set.includes(String(r[k]))) }
    else if (op === 'is') out = out.filter(r => (r[k] ?? null) === (raw === 'null' ? null : raw === 'true'))
    else if (op === 'not.is') out = out.filter(r => (r[k] ?? null) !== null)
  }
  return out
}
function restApi(req, res, url, body) {
  const name = url.pathname.split('/')[3]
  const send = (status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Range': '0-0/*' })
    res.end(payload === undefined ? '' : JSON.stringify(payload))
  }
  db.calls.push(`${req.method} ${name}${signedIn(req) ? '' : ' (no session)'}`)
  // Row-level security: with no session a read sees nothing, a write is refused.
  if (!signedIn(req)) return req.method === 'GET' ? send(200, []) : send(401, { code: '42501', message: 'new row violates row-level security policy' })
  const wantsObject = (req.headers.accept || '').includes('vnd.pgrst.object')
  const returns = (req.headers.prefer || '').includes('return=representation')
  const reply = (status, rows) => {
    if (!returns && req.method !== 'GET') return send(status)
    if (wantsObject) return rows.length === 1 ? send(status, rows[0]) : send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })
    return send(status, rows)
  }
  const rows = table(name)
  const pk = PK[name] || ['id']
  if (req.method === 'GET') return reply(200, filterRows(rows, url.searchParams))
  if (req.method === 'POST') {
    const list = Array.isArray(body) ? body : [body]
    const merge = (req.headers.prefer || '').includes('resolution=merge-duplicates')
    const out = []
    for (const r of list) {
      const i = rows.findIndex(x => pk.every(k => x[k] === r[k]))
      if (i >= 0 && !merge) return send(409, { code: '23505', message: 'duplicate key value violates unique constraint' })
      if (i >= 0) { rows[i] = { ...rows[i], ...r }; out.push(rows[i]) } else { rows.push({ ...r }); out.push(r) }
    }
    return reply(201, out)
  }
  if (req.method === 'PATCH') {
    const hits = filterRows(rows, url.searchParams)
    hits.forEach(r => Object.assign(r, body))
    return reply(200, hits)
  }
  if (req.method === 'DELETE') {
    const doomed = new Set(filterRows(rows, url.searchParams))
    db.tables[name] = rows.filter(r => !doomed.has(r))
    return send(204)
  }
  send(405, {})
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, ORIGIN)
  let raw = ''
  req.on('data', c => { raw += c })
  req.on('end', () => {
    let body = null
    try { body = raw ? JSON.parse(raw) : null } catch {}
    const json = (status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
    const p = url.pathname
    if (p === '/functions/v1/adopt-session') {
      db.adoptSeen.push(body?.old_access_token || '')
      if (db.adopt === 'down') return json(503, { error: 'not now' })
      if (body?.old_access_token !== 'old.access.token') return json(401, { error: 'no' })
      return json(200, { token_hash: 'one-time-hash', type: 'magiclink', email: EMAIL, user_id: UID })
    }
    if (p.startsWith('/functions/v1/')) return json(404, {})
    if (p === '/auth/v1/health') return json(200, { name: 'GoTrue' })
    if (p === '/auth/v1/verify') return body?.token_hash === 'one-time-hash' ? json(200, session()) : json(403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' })
    if (p === '/auth/v1/token') return json(200, session())
    if (p === '/auth/v1/user') return signedIn(req) ? json(200, session().user) : json(401, { msg: 'no' })
    if (p.startsWith('/auth/v1/')) return json(200, {})
    if (p.startsWith('/rest/v1/')) return restApi(req, res, url, body)
    if (p.startsWith('/storage/v1/')) return json(200, [])
    if (p === BASE + '__seed') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><title>seed</title>') }
    if (!p.startsWith(BASE)) { res.writeHead(404); return res.end() }
    const rel = decodeURIComponent(p.slice(BASE.length)) || 'index.html'
    const file = normalize(join(DIST, rel))
    if (!file.startsWith(DIST) || !existsSync(file) || !extname(file)) {
      res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(readFileSync(join(DIST, 'index.html')))
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' })
    res.end(readFileSync(file))
  })
})
await new Promise(r => server.listen(PORT, r))

let pass = 0, fail = 0
const canon = v => Array.isArray(v) ? v.map(canon)
  : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v
const eq = (name, got, want) => {
  const g = JSON.stringify(canon(got)), w = JSON.stringify(canon(want))
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', (g || '').slice(0, 500), '\n        want', (w || '').slice(0, 500)) }
}
const until = async (what, cond, ms = 20000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 150)) }
  console.log('        (timed out waiting for: ' + what + ')')
  return false
}
const dataCalls = () => db.calls.filter(c => DATA_TABLES.some(t => c.split(' ')[1] === t))
const kv = key => table('kv_store').find(r => r.key === key)?.value

// ── what the device holds from before the move ───────────────
const today = new Date().toISOString().slice(0, 10)
const tasks = [
  { id: 'st-1', text: 'CLL lab meeting', date: today, time: '16:00', durationMins: 60, done: false },
  { id: 'st-2', text: 'Rock climbing with Karis', date: today, time: '18:30', durationMins: 120, done: false },
]
const mirror = {
  'kv:notes': 'remember the chalk bag',
  'kv:scheduled_tasks': tasks,
  'kv:thoughts': [],
  'kv:never_set': null,
  'categories': [{ id: 'cat-1', label: 'Health', color: '#7BAF8E', icon: '', sortOrder: 0 }],
  'commitments': [
    { id: 'c1', text: 'Dentist', date: today, time: '14:30:00', prepMin: null, durationMins: 30, cat: 'cat-1', person: null, done: false, createdAt: '2026-11-01T00:00:00+00:00' },
    { id: 'c9', text: 'Made during the outage', date: today, cat: '', createdAt: '2026-11-22T00:00:00.000Z' },
  ],
  'events': [], 'vacations': [], 'recurring_tasks': [], 'log': [],
  'completions': { 'c1': true },
}
const outbox = [
  { seq: 1, ts: 1, uid: UID, table: 'kv_store', op: 'set', id: 'scheduled_tasks', row: { key: 'scheduled_tasks', value: tasks } },
  { seq: 2, ts: 2, uid: UID, table: 'commitments', op: 'insert', id: 'c9', row: { id: 'c9', text: 'Made during the outage', date: today, cat: '', createdAt: '2026-11-22T00:00:00.000Z' } },
  { seq: 3, ts: 3, uid: UID, table: 'task_completions', op: 'set', id: 'c1', row: { storageKey: 'c1', done: true, keep: false } },
]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ serviceWorkers: 'block' })
const page = await ctx.newPage()
const logs = []
page.on('console', m => logs.push(m.text()))
page.on('pageerror', e => logs.push('PAGEERROR ' + e))

await page.goto(ORIGIN + BASE + '__seed')
await page.evaluate(async ({ UID, EMAIL, OLD_REF, mirror, outbox }) => {
  localStorage.setItem(`sb-${OLD_REF}-auth-token`, JSON.stringify({ access_token: 'old.access.token', refresh_token: 'spent', user: { id: UID, email: EMAIL } }))
  localStorage.setItem('bloom_last_account', JSON.stringify({ id: UID, email: EMAIL, at: Date.now() }))
  const idb = await new Promise((res, rej) => {
    const r = indexedDB.open('bloom-offline', 1)
    r.onupgradeneeded = () => { r.result.createObjectStore('cache'); r.result.createObjectStore('outbox', { keyPath: 'seq' }) }
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  await new Promise((res, rej) => {
    const t = idb.transaction(['cache', 'outbox'], 'readwrite')
    for (const [k, v] of Object.entries(mirror)) t.objectStore('cache').put({ __bloom: 1, value: v }, `${UID}:${k}`)
    for (const op of outbox) t.objectStore('outbox').put(op)
    t.oncomplete = res; t.onerror = () => rej(t.error)
  })
  idb.close()
}, { UID, EMAIL, OLD_REF, mirror, outbox })
const readMirror = name => page.evaluate(async key => {
  const idb = await new Promise((res, rej) => { const r = indexedDB.open('bloom-offline', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const v = await new Promise((res, rej) => { const q = idb.transaction('cache').objectStore('cache').get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
  idb.close()
  return v ? v.value : undefined
}, `${UID}:${name}`)
const outboxSize = () => page.evaluate(async () => {
  const idb = await new Promise((res, rej) => { const r = indexedDB.open('bloom-offline', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const n = await new Promise((res, rej) => { const q = idb.transaction('outbox').objectStore('outbox').count(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
  idb.close()
  return n
})

console.log('\n— the hand-off isn’t answering: the app opens on this device’s copy and touches nothing —')
db.adopt = 'down'
await page.goto(ORIGIN + BASE)
await page.waitForSelector('#root > *')
await until('the app to leave the splash screen', async () => (await page.textContent('#root')).trim() !== 'Bloom', 20000)
await page.waitForTimeout(2500)
eq('it asked to carry the old sign-in across', db.adoptSeen[0], 'old.access.token')
eq('it did not fall back to the sign-in screen', await page.locator('input[type=password]').count(), 0)
eq('the planner is showing what this device holds', (await page.textContent('#root')).includes('Dentist'), true)
eq('no planner data was asked of, or sent to, the empty database', dataCalls(), [])
eq('the saved tasks are untouched', await readMirror('kv:scheduled_tasks'), tasks)
eq('the saved commitments are untouched', (await readMirror('commitments')).map(c => c.id), ['c1', 'c9'])
eq('the unsent edits are still waiting (plus whatever the app saved meanwhile)', (await outboxSize()) >= 3, true)

console.log('\n— the hand-off answers: signed in, and everything goes up —')
db.adopt = 'ok'; db.calls = []
await page.reload()
await page.waitForSelector('#root > *')
eq('the move marker appears', await until('marker', () => !!kv('__move')), true)
eq('the tasks arrive', await until('tasks', () => !!kv('scheduled_tasks')), true)
eq('the outbox drains', await until('outbox', async () => (await outboxSize()) === 0), true)
eq('tasks, exactly', kv('scheduled_tasks'), tasks)
eq('notes', kv('notes'), 'remember the chalk bag')
eq('a never-set key is not invented', table('kv_store').some(r => r.key === 'never_set'), false)
eq('commitments, once each', table('commitments').map(r => r.id).sort(), ['c1', 'c9'])
eq('categories', table('categories').map(r => r.id), ['cat-1'])
eq('ticks', table('task_completions').map(r => [r.storage_key, r.done]), [['c1', true]])
eq('every planner request carried the session', dataCalls().filter(c => c.includes('(no session)')), [])
eq('still no sign-in screen', await page.locator('input[type=password]').count(), 0)
eq('the planner still shows it', (await page.textContent('#root')).includes('Dentist'), true)
eq('the saved tasks are still on the device', await readMirror('kv:scheduled_tasks'), tasks)
eq('a session for the new project is stored', await page.evaluate(() => !!localStorage.getItem('sb-localhost-auth-token')), true)

console.log('\n— next launch: straight in, nothing uploaded twice —')
const adoptions = db.adoptSeen.length
const before = JSON.stringify(canon(db.tables))
db.calls = []
await page.reload()
await page.waitForSelector('#root > *')
await until('the app to read its data', () => dataCalls().some(c => c.startsWith('GET kv_store')), 15000)
await page.waitForTimeout(2000)
eq('no second hand-off was needed', db.adoptSeen.length, adoptions)
eq('rows were not inserted again', dataCalls().filter(c => /^POST (commitments|categories|events|vacations|recurring_tasks|log_entries)/.test(c)), [])
eq('the tasks in the database are unchanged', kv('scheduled_tasks'), tasks)
eq('commitments are unchanged', table('commitments').map(r => r.id).sort(), ['c1', 'c9'])
eq('the planner shows it, now read from the cloud', (await page.textContent('#root')).includes('Dentist') && (await page.textContent('#root')).includes('Made during'), true)

const serious = logs.filter(l => /PAGEERROR|discarding a write|\[move\] failed|rejected a write/.test(l))
eq('no errors, and no write was refused or dropped', serious, [])
if (process.env.MOVE_SHOT) await page.screenshot({ path: process.env.MOVE_SHOT })

await browser.close()
server.close()
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) console.log('\nbrowser console:\n' + logs.filter(l => /\[auth\]|\[move\]|\[storage\]|\[offline\]|ERROR/i.test(l)).slice(-25).join('\n'))
process.exit(fail ? 1 : 0)
