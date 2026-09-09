// The tab views are code-split (see the lazy() imports in src/App.jsx), so the
// app's chunks are no longer all fetched at launch. That is only safe because
// the service worker precaches everything Vite emits into dist/assets — see
// stampServiceWorker in vite.config.js, which reads that directory at build
// time and stamps the list into the worker.
//
// This test holds that guarantee: install the worker online, cut the network,
// then open a tab whose chunk was never requested. If someone narrows the
// precache list (or code-splits something the worker doesn't know about), a
// user who goes offline and taps an unvisited tab gets a blank screen — and
// this test goes red instead of them finding out.
import { chromium } from 'playwright'
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
const DIST='/home/user/vivian-hub/dist', BASE='/vivian-hub/'
const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}
let offline=false
const server=http.createServer((req,res)=>{
  if(offline){req.socket.destroy();return}
  let p=decodeURIComponent(req.url.split('?')[0])
  if(!p.startsWith(BASE)){res.writeHead(404);res.end();return}
  p=p.slice(BASE.length)||'index.html'; const file=normalize(join(DIST,p))
  if(!file.startsWith(DIST)||!existsSync(file)||!extname(file)){res.writeHead(200,{'Content-Type':'text/html'});res.end(readFileSync(join(DIST,'index.html')));return}
  res.writeHead(200,{'Content-Type':TYPES[extname(file)]||'application/octet-stream'});res.end(readFileSync(file))})
await new Promise(r=>server.listen(4197,r))
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'})
const ctx=await b.newContext(); const pg=await ctx.newPage()
let pass=0,fail=0
const ok=(n,c)=>{c?(pass++,console.log('  ok  ',n)):(fail++,console.log('  FAIL',n))}

await pg.goto(`http://localhost:4197${BASE}`,{waitUntil:'networkidle'})
await pg.waitForSelector('.nav-btn',{timeout:15000})
// Let the service worker install and finish precaching every chunk.
await pg.waitForFunction(()=>navigator.serviceWorker?.controller!=null,{timeout:20000}).catch(()=>{})
await pg.waitForTimeout(3000)
const cached = await pg.evaluate(async()=>{const ks=await caches.keys()
  let n=0,names=[]
  for(const k of ks){const c=await caches.open(k);const rs=await c.keys()
    for(const r of rs){if(r.url.includes('/assets/')){n++;names.push(r.url.split('/').pop())}}}
  return {n,names}})
ok('the worker precached the lazy tab chunks', cached.names.some(f=>f.startsWith('Insights-')) && cached.names.some(f=>f.startsWith('BloomWellness-')))
console.log('   cached asset chunks:', cached.n)

console.log('\n— now with the network genuinely gone —')
offline=true
await ctx.setOffline(true)
await pg.reload({waitUntil:'domcontentloaded'})
await pg.waitForSelector('.nav-btn',{timeout:20000})
ok('the app still opens', await pg.locator('.nav-btn').first().isVisible())
// Navigate to a lazy tab that was never opened while online.
const errs=[]; pg.on('pageerror',e=>errs.push(String(e)))
await pg.getByRole('button',{name:'Insights',exact:true}).first().click()
await pg.waitForTimeout(2500)
const body = await pg.evaluate(()=>document.querySelector('main.content')?.innerText?.slice(0,200)||'')
ok('a never-visited lazy tab still renders offline', body.trim().length>0)
console.log('   rendered:', JSON.stringify(body.split('\n').filter(Boolean).slice(0,3)))
ok('with no uncaught errors', errs.length===0)
if(errs.length) console.log('   errors:',errs)
console.log(`\n${pass} passed, ${fail} failed`)
await b.close(); server.close()
process.exit(fail?1:0)
