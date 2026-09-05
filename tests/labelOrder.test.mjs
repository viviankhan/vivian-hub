// Unit test for the label-chain ordering: sorting the chain, moving one label
// up or down it, and working out the smallest set of rows to save.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const L = await import(resolve(REPO, 'src/lib/labelOrder.js'))
const R = await import(resolve(REPO, 'src/lib/reorder.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const ids = list => list.map(c => c.id)

const cats = [
  { id: 'lab',   label: 'Lab',   sortOrder: 0 },
  { id: 'class', label: 'Class', sortOrder: 1 },
  { id: 'study', label: 'Study', sortOrder: 2 },
  { id: 'other', label: 'Other', sortOrder: 3 },
]

console.log('\n— the chain, in order —')
eq('sorts by the saved place', ids(L.sortLabels([cats[2], cats[0], cats[3], cats[1]])), ['lab', 'class', 'study', 'other'])
eq('a label with no place yet goes last, in arrival order',
  ids(L.sortLabels([{ id: 'new' }, cats[1], { id: 'newer' }, cats[0]])), ['lab', 'class', 'new', 'newer'])
eq('two labels sharing a number keep the order they came in',
  ids(L.sortLabels([{ id: 'a', sortOrder: 1 }, { id: 'b', sortOrder: 1 }])), ['a', 'b'])
eq('the next new label lands at the end', L.nextSortOrder(cats), 4)
eq('the first label of all starts at 0', L.nextSortOrder([]), 0)

console.log('\n— dragging one label onto another —')
eq('dragging down takes the slot dropped on', R.moveOver(['a', 'b', 'c', 'd'], 'a', 'c'), ['b', 'c', 'a', 'd'])
eq('dragging up takes the slot dropped on', R.moveOver(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c'])
eq('dropping on itself changes nothing', R.moveOver(['a', 'b', 'c'], 'b', 'b'), ['a', 'b', 'c'])
eq('an id that is not there changes nothing', R.moveOver(['a', 'b', 'c'], 'b', 'zz'), ['a', 'b', 'c'])
eq('arrow-key move up', R.moveToIndex(['a', 'b', 'c'], 'c', 1), ['a', 'c', 'b'])
eq('a move past the end clamps', R.moveToIndex(['a', 'b', 'c'], 'a', 99), ['b', 'c', 'a'])
eq('sameOrder', [R.sameOrder(['a', 'b'], ['a', 'b']), R.sameOrder(['a', 'b'], ['b', 'a'])], [true, false])

console.log('\n— what the drop saves —')
const dropped = ['study', 'lab', 'class', 'other']
eq('the list is renumbered into the new order', L.applyOrder(cats, dropped).map(c => [c.id, c.sortOrder]),
  [['study', 0], ['lab', 1], ['class', 2], ['other', 3]])
eq('only the rows that actually moved are written', L.orderChanges(cats, dropped),
  [{ id: 'study', sortOrder: 0 }, { id: 'lab', sortOrder: 1 }, { id: 'class', sortOrder: 2 }])
eq('an order that changes nothing writes nothing', L.orderChanges(cats, ids(cats)), [])
eq('a label the drag never mentioned is kept, on the end',
  L.applyOrder(cats, ['other', 'study']).map(c => c.id), ['other', 'study', 'lab', 'class'])
eq('an id that no longer exists is ignored',
  L.applyOrder(cats, ['ghost', 'other']).map(c => c.id), ['other', 'lab', 'class', 'study'])
eq('a duplicated id is only placed once',
  L.applyOrder(cats, ['other', 'other', 'lab']).map(c => c.id), ['other', 'lab', 'class', 'study'])
eq('unchanged rows keep their identity', L.applyOrder(cats, ids(cats))[0] === cats[0], true)

console.log('\n— the register —')
eq('nothing registered, nothing draggable', L.canReorderLabels(), false)
let saved = null
L.registerLabelReorder(next => { saved = next })
L.reorderLabels(dropped)
eq('a registered save is what the chain calls', [L.canReorderLabels(), saved], [true, dropped])
L.registerLabelReorder(null)
eq('and it can be taken away again', L.canReorderLabels(), false)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
