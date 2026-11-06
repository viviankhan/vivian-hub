// A day's stops told plainly (src/lib/dayPath.js), with Vivian's Nov 6 morning.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

process.env.TZ = 'America/Chicago'
const REPO = fileURLToPath(new URL('..', import.meta.url))
const { dayPath } = await import(resolve(REPO, 'src/lib/dayPath.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const ms = (s) => Date.parse(s)
const from = ms('2026-11-06T00:00'), to = ms('2026-11-07T00:00'), now = ms('2026-11-06T09:25')
const names = { '44.05222': 'Parking off W Frontage Rd NW', '44.06663': 'Parking off W Frontage Rd NW', '44.06538': 'Five Guys' }
const nameOf = (lat) => names[lat.toFixed(5)] || ''
const morning = [
  { key: 'home', name: 'Home', lat: 44.0488, lng: -92.4927, start: ms('2026-11-05T22:12'), end: ms('2026-11-06T08:06') },
  { key: null, name: '', lat: 44.05222, lng: -92.4935, start: ms('2026-11-06T08:06'), end: ms('2026-11-06T08:08') },
  { key: null, name: '', lat: 44.06663, lng: -92.50665, start: ms('2026-11-06T08:08'), end: ms('2026-11-06T08:19') },
  { key: null, name: '', lat: 44.06538, lng: -92.50369, start: ms('2026-11-06T08:19'), end: ms('2026-11-06T08:30') },
  { key: 'gugg', name: 'Guggenheim Building, Rochester', lat: 44.0207, lng: -92.4669, start: ms('2026-11-06T08:30'), end: null },
]
const brief = (rows) => rows.map(r => [r.kind, r.label, r.mins, r.via, r.ongoing])

console.log('\n— Nov 6 morning —')
eq('home, on the way, work', brief(dayPath(morning, { from, to, now, nameOf })), [
  ['stay', 'Home', 486, [], false],
  ['travel', 'On the way', 24, ['Parking off W Frontage Rd NW', 'Five Guys'], false],
  ['stay', 'Guggenheim Building', 55, [], true],
])
eq('home started yesterday', dayPath(morning, { from, to, now, nameOf })[0].fromBefore, true)
eq('three stops on the way', dayPath(morning, { from, to, now, nameOf })[1].stops, 3)

console.log('\n— merging and keeping —')
const lunch = [
  { key: 'gugg', name: 'Guggenheim Building', lat: 1, lng: 1, start: ms('2026-11-06T08:30'), end: ms('2026-11-06T12:00') },
  { key: null, name: '', lat: 44.06538, lng: -92.50369, start: ms('2026-11-06T12:05'), end: ms('2026-11-06T12:50') },
  { key: 'gugg', name: 'Guggenheim Building', lat: 1, lng: 1, start: ms('2026-11-06T12:55'), end: null },
]
eq('a long unnamed stop is its own row, by its looked-up name', brief(dayPath(lunch, { from, to, now: ms('2026-11-06T14:00'), nameOf })).map(r => r.slice(0, 3)),
  [['stay', 'Guggenheim Building', 210], ['stay', 'Five Guys', 45], ['stay', 'Guggenheim Building', 65]])
const twice = [
  { key: 'gugg', name: 'Guggenheim Building', lat: 1, lng: 1, start: ms('2026-11-06T08:30'), end: ms('2026-11-06T12:00') },
  { key: 'gugg', name: 'Guggenheim Building', lat: 1, lng: 1, start: ms('2026-11-06T12:00'), end: null },
]
eq('the same place twice in a row is one stay', brief(dayPath(twice, { from, to, now: ms('2026-11-06T14:00'), nameOf })).map(r => r.slice(0, 3)), [['stay', 'Guggenheim Building', 330]])
eq('just arrived somewhere unnamed: a stay, not travel', brief(dayPath([{ key: null, lat: 44.06538, lng: -92.50369, start: ms('2026-11-06T09:20'), end: null }], { from, to, now, nameOf })),
  [['stay', 'Five Guys', 5, [], true]])
eq('no name found: Unnamed spot', dayPath([{ key: null, lat: 9, lng: 9, start: ms('2026-11-06T07:00'), end: null }], { from, to, now, nameOf })[0].label, 'Unnamed spot')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
