// Unit test for autoBlockIds: an event that holds a shorter event becomes a
// time block, so the one inside nests in it.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const { autoBlockIds } = await import(resolve(REPO, 'src/lib/autoBlocks.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const ids = (items) => [...autoBlockIds(items)].sort()
const ev = (id, start, dur, block = false) => ({ id, start, dur, block })

eq('lunch inside study makes study a block',
  ids([ev('study', 720, 120), ev('lunch', 750, 45)]), ['study'])
eq('Russian dolls: every container becomes a block, the innermost stays an event',
  ids([ev('work', 540, 480), ev('study', 720, 120), ev('lunch', 750, 45)]), ['study', 'work'])
eq('a task with no duration inside an event still counts',
  ids([ev('class', 600, 90), ev('quiz', 630, 0)]), ['class'])
eq('a point-in-time task right at the end does not',
  ids([ev('class', 600, 90), ev('bell', 690, 0)]), [])
eq('a partial overlap is left alone',
  ids([ev('a', 540, 120), ev('b', 600, 120)]), [])
eq('two events in the same window, same length, stay events',
  ids([ev('a', 540, 60), ev('b', 540, 60)]), [])
eq('sharing a start, the longer one holds the shorter',
  ids([ev('long', 540, 120), ev('short', 540, 30)]), ['long'])
eq('something already a block is not reported again',
  ids([ev('work', 540, 480, true), ev('meeting', 600, 30)]), [])
eq('an event inside a real block does not change',
  ids([ev('work', 540, 480, true), ev('study', 720, 120)]), [])
eq('an event with no duration never becomes a block',
  ids([ev('a', 540, 0), ev('b', 540, 0)]), [])
eq('untimed items are ignored',
  ids([ev('a', 540, 60), { id:'b', start:null, dur:0 }]), [])

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
