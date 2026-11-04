// "How long was I at work?"
//
// Pins the visit log the ✨ assistant answers place questions from: how fixes
// become stays, how a question is read, and what the answer says.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const V = await import(resolve(REPO, 'src/lib/visits.js'))

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, extra) }
}
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`)

const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime()
const MIN = 60000

const WORK = { id: 'w', name: 'Work', lat: 47.6000, lng: -122.3300 }
const HOME = { id: 'h', name: 'Home', lat: 47.6500, lng: -122.3500 }
const PLACES = [WORK, HOME]
const near = (p, dLat = 0.0003) => ({ lat: p.lat + dLat, lng: p.lng, accuracy: 20 })
const ROCA = { lat: 47.6620, lng: -122.3700, accuracy: 15 }

// Build a log by replaying fixes.
const replay = (fixes, places = PLACES) => {
  let s = []
  for (const [fix, t] of fixes) s = V.recordFix(s, fix, places, t)
  return s
}

console.log('\n— fixes become stays —')
{
  const s = replay([[near(WORK), at(2026, 11, 2, 9, 0)], [near(WORK), at(2026, 11, 2, 12, 30)], [near(WORK), at(2026, 11, 2, 17, 15)]])
  eq('three sightings of work in a day are one stay', s.length, 1)
  eq('it runs first-to-last sighting', [s[0].start, s[0].end], [at(2026, 11, 2, 9, 0), at(2026, 11, 2, 17, 15)])
  eq('and is filed under the place name', s[0].name, 'Work')
}
{
  const s = replay([[near(WORK), at(2026, 11, 2, 9)], [near(HOME), at(2026, 11, 2, 18)], [near(WORK), at(2026, 11, 3, 9)]])
  eq('going somewhere else splits stays', s.map(x => x.name), ['Work', 'Home', 'Work'])
}
{
  const s = replay([[near(WORK), at(2026, 11, 2, 9)], [near(WORK), at(2026, 11, 3, 9)]])
  eq('a sighting the next morning is a new visit, not one 24h stay', s.length, 2)
}
{
  const s = replay([[{ ...near(WORK), accuracy: 900 }, at(2026, 11, 2, 9)]])
  eq('a vague fix is ignored', s.length, 0)
}
{
  const s = replay([[ROCA, at(2026, 11, 2, 18)], [{ ...ROCA, lat: ROCA.lat + 0.0002 }, at(2026, 11, 2, 19, 40)]])
  eq('an unnamed spot still makes a stay', [s.length, s[0].name, s[0].placeId], [1, '', null])
}

console.log('\n— reading questions —')
const NOW = at(2026, 11, 3, 15, 0)   // Tue Nov 3, 3pm
const P = (t) => V.parsePlaceQuestion(t, NOW)
eq('how long was I at work?', P('How long was I at work?')?.target, 'work')
eq('how long have I been at this current location', P('how long have I been at this current location')?.target, 'HERE')
eq('how long have I been here', P('How long have I been here?')?.target, 'HERE')
eq('roca climbing gym', P('how long was I at roca climbing gym')?.target, 'roca climbing gym')
eq('yesterday is a scope, not part of the place', [P('how long was I at Roca yesterday?')?.target, P('how long was I at Roca yesterday?')?.scope?.label], ['roca', 'yesterday'])
eq('how much time did I spend at the gym this week', [P('How much time did I spend at the gym this week')?.target, P('How much time did I spend at the gym this week')?.scope?.label], ['gym', 'this week'])
eq('in total is filler', P('how long was I at work in total')?.target, 'work')
eq('when did I get to work', [P('when did I get to work?')?.ask, P('when did I get to work?')?.target], ['arrived', 'work'])
eq('when did I leave home', [P('When did I leave home')?.ask, P('When did I leave home')?.target], ['left', 'home'])
eq('a task request is not a place question', P('Dentist next Tue 3pm'), null)
eq('nor is a drive time', P('how long is the drive to work'), null)

console.log('\n— matching names —')
ok('"work" finds Office', V.nameScore('Office', 'work') > 0)
ok('"roca climbing gym" finds the geocoded name', V.nameScore('Roca Climbing Gym, Seattle', 'roca climbing gym') > 0)
ok('"roca" finds it too', V.nameScore('Roca Climbing Gym, Seattle', 'roca') > 0)
ok('"work" does not find Home', V.nameScore('Home', 'work') === 0)

console.log('\n— answers —')
{
  const stays = replay([
    [near(HOME), at(2026, 11, 2, 7)],
    [near(WORK), at(2026, 11, 2, 9, 5)], [near(WORK), at(2026, 11, 2, 17, 20)],
    [ROCA, at(2026, 11, 2, 18, 10)], [ROCA, at(2026, 11, 2, 19, 55)],
    [near(HOME), at(2026, 11, 2, 21)],
    [near(WORK), at(2026, 11, 3, 9, 0)], [near(WORK), at(2026, 11, 3, 14, 55)],
  ])
  stays[2].name = 'Roca Climbing Gym, Seattle'   // what the reverse geocode fills in
  const A = (t) => V.answerPlaceQuestion(t, { stays, places: PLACES, now: NOW })
  const here = A('how long have I been at this current location?')
  ok('here → still at work, 6h so far', /Work/.test(here.text) && /6h so far/.test(here.text), here.text)
  const work = A('How long was I at work?')
  ok('work (still there) → so far', /6h so far/.test(work.text), work.text)
  const yest = A('how long was I at work yesterday')
  ok('work yesterday → 8h 15m', /8h 15m yesterday/.test(yest.text), yest.text)
  const roca = A('how long was I at roca climbing gym')
  ok('roca → 1h 45m', /Roca Climbing Gym for 1h 45m/.test(roca.text), roca.text)
  const week = A('how long was I at work this week')
  ok('work this week → both visits', /14h 15m this week across 2 visits/.test(week.text), week.text)
  const arrived = A('when did I get to work')
  ok('arrived → 9:00', /9:00/.test(arrived.text), arrived.text)
  const none = A('how long was I at the dentist')
  ok('unknown place says so', /don’t have a place called “dentist”/.test(none.text), none.text)
  const offAns = V.answerPlaceQuestion('how long have I been here', { stays: [], places: PLACES, now: NOW, tracking: false })
  ok('tracking off → offers to turn it on', offAns.needsTracking === true, JSON.stringify(offAns))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
