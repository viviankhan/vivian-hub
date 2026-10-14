// The timeframe every number is read over (src/lib/timeframe.js). Nothing is
// cumulative: a preset is a number of days ending today, a custom range is two
// dates you set — and a stored choice can never resolve to something that runs
// into the future, backwards, or further back than a year.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const T = await import(resolve(REPO, 'src/lib/timeframe.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const TODAY = '2026-10-14'
const r = (tf) => T.resolveTimeframe(tf, TODAY)

console.log('\n— presets end today —')
eq('the default is the past seven days', r(null).id, 'week')
eq('…ending today', r(null).to, TODAY)
eq('…starting six days back', r(null).from, '2026-10-08')
eq('…seven days long', r(null).days, 7)
eq('thirty days reaches back a month', r({ id: 'month' }), { id: 'month', from: '2026-09-15', to: TODAY, days: 30, label: 'past 30 days', phrase: 'in the past 30 days' })
eq('ninety days crosses the year boundary cleanly', r({ id: 'quarter' }).from, '2026-07-17')
eq('an unknown id falls back to the week', r({ id: 'all' }).id, 'week')
eq('every preset is on offer', T.PRESETS.map(p => p.days), [7, 14, 30, 90])

console.log('\n— a custom range is two dates you set —')
eq('kept as given', r({ id: 'custom', from: '2026-10-01', to: '2026-10-10' }), { id: 'custom', from: '2026-10-01', to: '2026-10-10', days: 10, label: 'Oct 1 – Oct 10', phrase: 'between Oct 1 and Oct 10' })
eq('an end in the future is pulled back to today', r({ id: 'custom', from: '2026-10-01', to: '2026-12-01' }).to, TODAY)
eq('a start after its end collapses to one day', r({ id: 'custom', from: '2026-10-12', to: '2026-10-05' }), { id: 'custom', from: '2026-10-05', to: '2026-10-05', days: 1, label: 'Oct 5', phrase: 'on Oct 5' })
eq('a range longer than a year is cut to a year', r({ id: 'custom', from: '2020-01-01', to: TODAY }).days, T.MAX_DAYS)
eq('half-typed dates fall back to the default', r({ id: 'custom', from: '2026-1', to: TODAY }).id, 'week')

console.log('\n— the store —')
eq('with no storage the choice is the default', T.getTimeframe(), T.DEFAULT_TIMEFRAME)
let heard = 0
const off = T.subscribeTimeframe(() => heard++)
T.setTimeframe({ id: 'month' })
eq('setting it tells every listener', heard, 1)
eq('…and is what reads back', T.getTimeframe(), { id: 'month' })
T.setTimeframe(null)
eq('nothing at all means the default again', T.getTimeframe(), T.DEFAULT_TIMEFRAME)
off(); T.setTimeframe({ id: 'week' })
eq('an unsubscribed listener stays quiet', heard, 2)
eq('shifting a key crosses month ends', T.shiftKey('2026-10-01', -1), '2026-09-30')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
