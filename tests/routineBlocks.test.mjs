// Unit test for the one-time fold of routine groups into time blocks
// (src/lib/routineBlocks.js): each routine becomes a block spanning its timed
// tasks, split by schedule, and every task loses its routine key.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const { foldRoutinesIntoBlocks, needsRoutineFold } = await import(resolve(REPO, 'src/lib/routineBlocks.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}

const morning = { id: 'morning', name: 'Morning routine', tint: '#FBE79E' }
const night = { id: 'night', name: 'Night routine', tint: '#BBD5F0' }

console.log('\n— a daily routine —')
{
  const out = foldRoutinesIntoBlocks({
    routines: [morning],
    recurringRows: [
      { id: 'r1', label: '7:00 AM — Stretch', days: [], startDate: null, endDate: null, cat: 'health' },
      { id: 'r2', label: '7:30 AM — Breakfast', days: [], startDate: null, endDate: null, cat: 'health' },
      { id: 'r3', label: 'Vitamins', days: [], startDate: null, endDate: null, cat: 'health' },
    ],
    recurringMeta: {
      r1: { routine: 'morning', freq: 'daily', durationMins: 15 },
      r2: { routine: 'morning', freq: 'daily', durationMins: 20, icon: 'glyph:coffee' },
      r3: { routine: 'morning', freq: 'daily' },
    },
  })
  eq('one block for the routine', out.recurringBlocks.map(r => r.id), ['r-blk-morning-0'])
  eq('named after it, starting at the first step', out.recurringBlocks[0].label, '07:00 — Morning routine')
  eq('carrying the steps’ label', out.recurringBlocks[0].cat, 'health')
  eq('its meta: a block from the first start to the last end, in the routine’s tint',
    out.recurringMeta['r-blk-morning-0'], { block: true, durationMins: 50, freq: 'daily', color: '#FBE79E', icon: 'glyph:sun' })
  eq('the steps lose their routine, keep everything else', [out.recurringMeta.r1, out.recurringMeta.r2, out.recurringMeta.r3],
    [{ freq: 'daily', durationMins: 15 }, { freq: 'daily', durationMins: 20, icon: 'glyph:coffee' }, { freq: 'daily' }])
  eq('no one-off blocks', out.commitmentBlocks, [])
  eq('and the commitment meta needs no write', out.commitmentMeta, null)
}

console.log('\n— steps on different schedules —')
{
  const out = foldRoutinesIntoBlocks({
    routines: [night],
    recurringRows: [
      { id: 'a', label: '21:00 — Read', days: ['monday', 'wednesday'], startDate: null, endDate: null },
      { id: 'b', label: '21:30 — Floss', days: ['wednesday', 'monday'], startDate: null, endDate: null },
      { id: 'c', label: '22:00 — Long bath', days: ['sunday'], startDate: null, endDate: null },
    ],
    recurringMeta: { a: { routine: 'night', durationMins: 30 }, b: { routine: 'night', durationMins: 10 }, c: { routine: 'night', durationMins: 45 } },
  })
  eq('one block per schedule', out.recurringBlocks.map(r => [r.label, r.days]),
    [['21:00 — Night routine', ['monday', 'wednesday']], ['22:00 — Night routine', ['sunday']]])
  eq('each sized to its own steps', out.recurringBlocks.map(r => out.recurringMeta[r.id].durationMins), [40, 45])
  eq('a night routine wears the moon', out.recurringMeta['r-blk-night-0'].icon, 'glyph:moon')
  eq('a weekly block carries no freq', 'freq' in out.recurringMeta['r-blk-night-0'], false)
}

console.log('\n— one-off tasks —')
{
  const out = foldRoutinesIntoBlocks({
    routines: [morning],
    commitments: [
      { id: 'c1', text: 'Pack', date: '2026-10-05', time: '08:00', durationMins: 10, cat: 'personal' },
      { id: 'c2', text: 'Water plants', date: '2026-10-05', time: '08:20', durationMins: 10, cat: 'personal' },
      { id: 'c3', text: 'Pack', date: '2026-10-06', time: '06:45', durationMins: null, cat: 'personal' },
      { id: 'c4', text: 'Unrelated', date: '2026-10-05', time: '09:00', durationMins: 10, cat: 'personal' },
    ],
    commitmentMeta: { c1: { routine: 'morning' }, c2: { routine: 'morning', color: '#123456' }, c3: { routine: 'morning' }, c4: { color: '#abcdef' } },
  })
  eq('a block per date', out.commitmentBlocks.map(c => [c.id, c.date, c.time, c.durationMins, c.text]), [
    ['c-blk-morning-2026-10-05', '2026-10-05', '08:00', 30, 'Morning routine'],
    ['c-blk-morning-2026-10-06', '2026-10-06', '06:45', 15, 'Morning routine'],
  ])
  eq('each marked a block in the routine’s tint', out.commitmentMeta['c-blk-morning-2026-10-05'], { block: true, color: '#FBE79E', icon: 'glyph:sun' })
  eq('a meta entry left empty is dropped', 'c1' in out.commitmentMeta, false)
  eq('other meta is untouched', [out.commitmentMeta.c2, out.commitmentMeta.c4], [{ color: '#123456' }, { color: '#abcdef' }])
}

console.log('\n— running it twice —')
{
  const input = {
    routines: [morning],
    recurringRows: [
      { id: 'r1', label: '07:00 — Stretch', days: [], startDate: null, endDate: null },
      { id: 'r-blk-morning-0', label: '07:00 — Morning routine', days: [], startDate: null, endDate: null },
    ],
    recurringMeta: { r1: { routine: 'morning', freq: 'daily', durationMins: 15 }, 'r-blk-morning-0': { block: true, durationMins: 15 } },
  }
  const out = foldRoutinesIntoBlocks(input)
  eq('a block already made is not made again', out.recurringBlocks, [])
  eq('but the step is still unfiled', out.recurringMeta.r1, { freq: 'daily', durationMins: 15 })
}

console.log('\n— when it has anything to do —')
eq('nothing saved', needsRoutineFold({ routines: null, recurringMeta: {}, commitmentMeta: {} }), false)
eq('an empty group list, nothing filed', needsRoutineFold({ routines: [], recurringMeta: { a: { freq: 'daily' } }, commitmentMeta: {} }), false)
eq('a group left over', needsRoutineFold({ routines: [morning], recurringMeta: {}, commitmentMeta: {} }), true)
eq('a task still filed under a gone group', needsRoutineFold({ routines: [], recurringMeta: {}, commitmentMeta: { c: { routine: 'x' } } }), true)
{
  const out = foldRoutinesIntoBlocks({ routines: [], recurringMeta: { a: { routine: 'ghost', freq: 'daily' } } })
  eq('a ghost filing is just unfiled', [out.recurringBlocks, out.recurringMeta], [[], { a: { freq: 'daily' } }])
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
