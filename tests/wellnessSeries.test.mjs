// Looking back over a window — the shapes the Insights tab and the wellness
// journal both read (src/lib/wellness.js). A chart and a stat tile that drew
// from different arithmetic could disagree on the same screen; these pin the
// one set of numbers they share: the day-by-day series and its summary, how a
// condition's time is clipped to a window, the calendar grid the journal lays
// clouds on, and how far "all time" reaches back.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const W = await import(resolve(REPO, 'src/lib/wellness.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}

const today = W.dayKey()
const back = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d }
const key = (n) => W.dayKey(back(n))
const ci = (n, mood, energy, emotions = []) => ({ id: `c${n}-${mood}`, date: key(n), mood, energy, emotions, ts: back(n).toISOString() })

console.log('\n— the day series: one row per day, gaps kept honest —')
const checkins = [ci(0, 4, 3, ['hope']), ci(0, 2, 2, ['anxiety']), ci(2, 5, 5, ['hope']), ci(6, 1, 1)]
const s7 = W.moodSeries(checkins, 7)
eq('seven rows, oldest first', s7.map(d => d.date), [6, 5, 4, 3, 2, 1, 0].map(key))
eq('two moments on one day average out', s7[6].mood, 3)
eq('…and both their feelings are kept', s7[6].emotions.sort(), ['anxiety', 'hope'])
eq('a day with nothing logged stays null', s7[5].mood, null)
eq('the count is moments, not days', s7.map(d => d.count), [1, 0, 0, 0, 1, 0, 2])

console.log('\n— the summary —')
const sum = W.moodSummary(s7)
eq('days with anything logged', sum.days, 3)
eq('moments across them', sum.moments, 4)
eq('average mood over logged days', sum.avg, 3)
eq('average energy over logged days', sum.energy, 2.8)
eq('the best day is the 5', sum.best.date, key(2))
eq('the hardest day is the 1', sum.worst.date, key(6))
eq('later half vs earlier half moves up', sum.direction > 0, true)
eq('an empty series summarizes to nothing', W.moodSummary([]).days, 0)

console.log('\n— feelings tallied by the days they came up —')
eq('hope on two days, anxiety on one', W.emotionTally(s7), [{ id: 'hope', days: 2 }, { id: 'anxiety', days: 1 }])

console.log('\n— condition time clipped to the window —')
const now = Date.now()
const hoursAgo = (h) => new Date(now - h * 3600000).toISOString()
const episodes = [
  { id: 'a', effectId: 'fx-migraine', start: hoursAgo(5), end: hoursAgo(2), intensity: 7 },        // 3h, fully inside a 7-day window
  { id: 'b', effectId: 'fx-migraine', start: hoursAgo(24 * 20), end: hoursAgo(24 * 19), intensity: 3 }, // 1 day, outside a 7-day window
  { id: 'c', effectId: 'fx-calm', start: hoursAgo(24 * 30), end: null },                           // open, straddles the window edge
]
const week = W.effectTotalsWithin(episodes, 7, now)
eq('a span inside the window counts whole', week.get('fx-migraine').mins, 180)
eq('a span before the window does not count at all', week.get('fx-migraine').count, 1)
eq('the worst rating inside the window is carried', week.get('fx-migraine').peak, 7)
const windowStart = W.keyToDate(W.recentDayKeys(7)[0]).getTime()
eq('an open span straddling the edge counts from the window\'s first morning', week.get('fx-calm').mins, Math.round((now - windowStart) / 60000))
const all = W.effectTotalsWithin(episodes, 60, now)
eq('a wider window picks the older span back up', all.get('fx-migraine').count, 2)

console.log('\n— how far "all time" reaches back —')
eq('a week is a week', W.windowForRange('week'), 7)
eq('a month is thirty days', W.windowForRange('month'), 30)
eq('all time with no history is floored at a month', W.windowForRange('all', { checkins: [] }), 30)
eq('all time reaches the oldest check-in', W.windowForRange('all', { checkins: [ci(100, 3, 3)] }), 101)
eq('…and the oldest condition', W.windowForRange('all', { episodes: [{ start: back(45).toISOString() }] }), 46)
eq('…but never past a year', W.windowForRange('all', { checkins: [ci(900, 3, 3)] }), 365)

console.log('\n— the journal calendar —')
const weeks = W.calendarWeeks(6)
eq('six rows of seven', weeks.map(r => r.length), [7, 7, 7, 7, 7, 7])
eq('today sits in the last row', weeks[5].some(d => d.key === today), true)
eq('rows start on a Monday', weeks.every(r => W.keyToDate(r[0].key).getDay() === 1), true)
eq('days after today are flagged', weeks[5].filter(d => d.future).every(d => d.key > today), true)
eq('nothing before today is', weeks.flat().filter(d => d.key <= today).some(d => d.future), false)
eq('the grid is contiguous', weeks.flat().every((d, i, a) => i === 0 || W.daysBetween(a[i - 1].key, d.key) === 1), true)
eq('the first of a month is marked', weeks.flat().filter(d => d.first).every(d => d.day === 1), true)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
