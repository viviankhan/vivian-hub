// Photo attachments on the wellness trackers (src/lib/photos.js + the episode
// helpers in src/lib/wellness.js).
//
// The point of this test is the property the whole design exists for: a photo
// must NEVER end up inside wellness_checkins or wellness_episodes. Those two
// rows are rewritten in full on every log, so an inlined image would be
// re-uploaded forever. Here we attach images, then assert those two rows stayed
// tiny and that the pictures landed in rows of their own.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = fileURLToPath(new URL('..', import.meta.url))

// Browser globals the modules expect, installed before either is loaded.
const store = new Map()
globalThis.localStorage = {
  get length() { return store.size },
  key: i => [...store.keys()][i],
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}
globalThis.window = { addEventListener: () => {}, dispatchEvent: () => true }
globalThis.document = { hidden: false, addEventListener: () => {} }
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o) } }

// storage.js is source Vite normally transforms; rewrite just the bare import
// and the two env lookups so Node can load the real file otherwise unmodified.
const storageSrc = readFileSync(resolve(REPO, 'src/lib/storage.js'), 'utf8')
  .replace("from '@supabase/supabase-js'", `from ${JSON.stringify(resolve(here, 'mock-supabase.mjs'))}`)
  .replace("from './offline.js'", `from ${JSON.stringify(resolve(REPO, 'src/lib/offline.js'))}`)
  .replace('import.meta.env.VITE_SUPABASE_URL', JSON.stringify('https://proj.supabase.co'))
  .replace('import.meta.env.VITE_SUPABASE_ANON_KEY', JSON.stringify('anon-key'))
const storageShim = resolve(here, '.photos-storage.shim.mjs')
writeFileSync(storageShim, storageSrc)

// photos.js is plain ES it can load as-is, once its storage import points here.
const photosShim = resolve(here, '.photos.shim.mjs')
writeFileSync(photosShim, readFileSync(resolve(REPO, 'src/lib/photos.js'), 'utf8')
  .replace("from './storage.js'", `from ${JSON.stringify(storageShim)}`))

const mock = await import(resolve(here, 'mock-supabase.mjs'))
const off = await import(resolve(REPO, 'src/lib/offline.js'))
const S = await import(storageShim)
const P = await import(photosShim)
const W = await import(resolve(REPO, 'src/lib/wellness.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, detail ? '\n        ' + detail : '') }
}
// Let the fire-and-forget writes inside savePhoto settle.
const settle = () => new Promise(r => setTimeout(r, 0))
const kvRow = key => (mock.state.tables.kv_store || []).find(r => r.key === key)

// A stand-in for a real downscaled photo — a data URL of a believable size.
const fakePhoto = (n) => 'data:image/jpeg;base64,' + String(n).repeat(60000)

await off.ready()
S.setStorageUser('user-1')

console.log('\n— a photo lands in its own row, not in the tracker blob —')
const id1 = P.savePhoto(fakePhoto(1))
const id2 = P.savePhoto(fakePhoto(2))
await settle()
ok('savePhoto hands back an id straight away', typeof id1 === 'string' && id1.startsWith('wp-'), id1)
ok('two photos get two different ids', id1 !== id2)
ok('each photo has its own kv row', !!kvRow(`wellness_photo_${id1}`) && !!kvRow(`wellness_photo_${id2}`))
eq('the row carries the image', kvRow(`wellness_photo_${id1}`).value.data, fakePhoto(1))

console.log('\n— the check-in blob only ever carries ids —')
const checkin = {
  id: 'ci-1', date: '2026-09-08', mood: 4, energy: 3,
  emotions: ['hope'], note: 'sunset on the walk home', photos: [id1, id2],
  ts: '2026-09-08T19:46:00.000Z',
}
await S.setWellnessCheckins([checkin])
const checkinsRow = JSON.stringify(kvRow('wellness_checkins').value)
ok('no image data reached wellness_checkins', !checkinsRow.includes('data:image'))
ok('wellness_checkins is still tiny', checkinsRow.length < 400, `${checkinsRow.length} bytes`)
eq('the ids are what got stored', kvRow('wellness_checkins').value[0].photos, [id1, id2])

console.log('\n— and the episode blob behaves the same —')
const id3 = P.savePhoto(fakePhoto(3))
await settle()
let episodes = W.startEpisode([], 'fx-pain', new Date('2026-09-08T08:00:00Z'), 'left knee', [id3])
await S.setWellnessEpisodes(episodes)
const epRow = JSON.stringify(kvRow('wellness_episodes').value)
ok('no image data reached wellness_episodes', !epRow.includes('data:image'))
ok('wellness_episodes is still tiny', epRow.length < 400, `${epRow.length} bytes`)
eq('startEpisode kept the note and the photo ids', [episodes[0].note, episodes[0].photos], ['left knee', [id3]])
eq('setEpisodePhotos replaces them on the open span',
  W.setEpisodePhotos(episodes, 'fx-pain', [id1])[0].photos, [id1])
eq('an episode logged before photos existed reads as none', P.photoIds({ id: 'ep-old', note: 'x' }), [])

console.log('\n— photos read back, and read back from cache —')
P.clearPhotoCache()
eq('a photo loads by id', await P.loadPhoto(id1), fakePhoto(1))
eq('several load at once', [...(await P.loadPhotos([id1, id2])).values()], [fakePhoto(1), fakePhoto(2)])
const before = (mock.state.calls || []).length
await P.loadPhoto(id1)
eq('a second look costs no query', (mock.state.calls || []).length, before)
eq('peek reports what the cache holds', P.peekPhoto(id1), fakePhoto(1))
eq('peek on an unknown id is undefined', P.peekPhoto('wp-nope'), undefined)

console.log('\n— removing a photo clears its row and nothing else —')
const rowsBefore = mock.state.tables.kv_store.length
P.deletePhoto(id2)
await settle()
eq('the row is emptied, not orphaned with data', kvRow(`wellness_photo_${id2}`).value, null)
eq('no other row was touched', mock.state.tables.kv_store.length, rowsBefore)
eq('the other photo is untouched', kvRow(`wellness_photo_${id1}`).value.data, fakePhoto(1))
P.clearPhotoCache()
eq('a removed photo reads back as absent', await P.loadPhoto(id2), null)

console.log('\n— attaching a photo works with no connection —')
mock.state.offline = true; globalThis.navigator.onLine = false
const queuedBefore = off.pendingCount()
const id4 = P.savePhoto(fakePhoto(4))
await settle()
eq('it is readable on this device immediately', P.peekPhoto(id4), fakePhoto(4))
eq('and it is queued for upload', off.pendingCount(), queuedBefore + 1)
mock.state.offline = false; globalThis.navigator.onLine = true
await off.flush()
eq('reconnecting uploads it', kvRow(`wellness_photo_${id4}`).value.data, fakePhoto(4))

console.log('\n— patch helpers take a photo back off a logged entry —')
eq('patchCheckin drops one id', W.patchCheckin([checkin], 'ci-1', { photos: [id1] })[0].photos, [id1])
eq('patchCheckin leaves other check-ins alone', W.patchCheckin([checkin], 'ci-other', { photos: [] })[0].photos, [id1, id2])
eq('patchEpisode drops one id', W.patchEpisode(episodes, episodes[0].id, { photos: [] })[0].photos, [])

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
