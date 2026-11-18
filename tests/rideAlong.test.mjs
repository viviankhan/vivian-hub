// Unit test for rideAlong: a late block's own-category tasks move with it.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const { rideAlong } = await import(resolve(REPO, 'src/lib/rideAlong.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
// Work planned 9:30, arrived 10:08.
const work = { id: 'work', cat: 'career', planned: 570, start: 608 }
const at = (tag, mins) => rideAlong([work], { tag, mins })?.mins ?? null

eq('a career task at the planned start lands at the real start', at('career', 570), 608)
eq('one planned a bit later keeps its spacing', at('career', 585), 623)
eq('a career task already after the real start stays put', at('career', 630), null)
eq('a career task before the block was planned stays put', at('career', 540), null)
eq('another category is left alone', at('personal', 570), null)
eq('a block that started early moves nothing',
  rideAlong([{ id: 'w', cat: 'career', planned: 570, start: 540 }], { tag: 'career', mins: 560 }), null)
eq('a block on time moves nothing',
  rideAlong([{ id: 'w', cat: 'career', planned: 570, start: 570 }], { tag: 'career', mins: 570 }), null)
eq('says which block it rode with', rideAlong([work], { tag: 'career', mins: 570 }), { mins: 608, blockId: 'work' })
eq('a task with no time is left alone', rideAlong([work], { tag: 'career', mins: null }), null)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
