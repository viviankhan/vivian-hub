// Real-browser smoke test: does the service worker cache enough of the app that
// it opens again with the network completely cut?
import { chromium } from 'playwright'
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = fileURLToPath(new URL('../dist', import.meta.url)).replace(/\/$/, '')
const BASE = '/vivian-hub/'
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json' }

let serverOffline = false
const server = http.createServer((req, res) => {
  if (serverOffline) { req.socket.destroy(); return }
  let p = decodeURIComponent(req.url.split('?')[0])
  if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); return }
  p = p.slice(BASE.length) || 'index.html'
  const file = normalize(join(DIST, p))
  if (!file.startsWith(DIST) || !existsSync(file) || !extname(file)) {
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(readFileSync(join(DIST, 'index.html'))); return
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise(r => server.listen(4173, r))
const URL_ = `http://localhost:4173${BASE}`

let pass = 0, fail = 0
const eq = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', JSON.stringify(got), '\n        want', JSON.stringify(want)) }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext()
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

console.log('\n— first visit, online —')
await page.goto(URL_, { waitUntil: 'networkidle' })
await page.waitForSelector('#root > *', { timeout: 15000 })
const rootText = await page.textContent('#root')
eq('the app rendered', rootText.trim().length > 20, true)
eq('no uncaught errors', errors.filter(e => !/favicon|fonts\.g|manifest|ERR_|net::|Failed to load resource/i.test(e)), [])

// Wait for the worker to install and finish precaching.
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 })
const cached = await page.evaluate(async () => {
  const keys = await caches.keys()
  const shell = keys.find(k => k.startsWith('bloom-shell-'))
  if (!shell) return { shell: null }
  const c = await caches.open(shell)
  const urls = (await c.keys()).map(r => new URL(r.url).pathname)
  return { shell, urls }
})
eq('a versioned shell cache exists', !!cached.shell, true)
eq('index.html is cached', cached.urls.some(u => u.endsWith('/index.html') || u.endsWith('/vivian-hub/')), true)
eq('the JS bundle is cached', cached.urls.some(u => /\/assets\/.*\.js$/.test(u)), true)
eq('the stylesheet is cached', cached.urls.some(u => /\/assets\/.*\.css$/.test(u)), true)

console.log('\n— now with the network genuinely gone —')
serverOffline = true
await ctx.setOffline(true)
errors.length = 0
await page.goto(URL_, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#root > *', { timeout: 15000 })
const offlineText = await page.textContent('#root')
eq('the app still opens with no server', offlineText.length > 50, true)
eq('it is the app, not the cannot-load fallback', await page.locator('#bloom-reload').count(), 0)
console.log('    online  :', JSON.stringify(rootText.trim().slice(0, 90)))
console.log('    offline :', JSON.stringify(offlineText.trim().slice(0, 90)))
// The real question isn't identical text (the app renders live dates and state)
// but whether the actual UI came up: its navigation is present either way.
eq('the app UI is present offline', await page.locator('nav, .content, main').count() > 0, true)
eq('navigator reports offline', await page.evaluate(() => !navigator.onLine), true)
eq('no uncaught errors offline', errors.filter(e => !/favicon|fonts\.g|manifest|Failed to fetch|ERR_|net::/i.test(e)), [])

await browser.close()
server.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
