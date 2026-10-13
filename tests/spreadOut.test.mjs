// Spreading a class's pile-up of same-day items across the days before it.
import assert from 'node:assert/strict'
import { courseOf, spreadGroupKey, spreadDates, planSpread } from '../src/lib/importedTasks.js'

let n = 0
const t = (name, fn) => { fn(); n++; console.log('  ✓ ' + name) }
console.log('\n— spread out imported tasks —')

t('reads the Canvas course tag off the end of a title', () => {
  assert.equal(courseOf({ label: 'Problem Set 4 [CHEM 2420 Organic Chemistry II]' }), 'CHEM 2420 Organic Chemistry II')
  assert.equal(courseOf({ label: 'Quiz 2 [sec 1] [BIOL 1010]' }), 'BIOL 1010')
  assert.equal(courseOf({ label: 'Dentist' }), '')
})

t('groups by calendar and course, so other classes due the same day stay put', () => {
  const a = { calendarId: 'canvas', label: 'PS 1 [Orgo II]' }
  const b = { calendarId: 'canvas', label: 'PS 2 [Orgo II]' }
  const c = { calendarId: 'canvas', label: 'Essay [English]' }
  assert.equal(spreadGroupKey(a), spreadGroupKey(b))
  assert.notEqual(spreadGroupKey(a), spreadGroupKey(c))
})

t('ends on the due date and spaces the rest out before it', () => {
  assert.deepEqual(spreadDates('2026-10-13', '2026-10-23', 5),
    ['2026-10-15', '2026-10-17', '2026-10-19', '2026-10-21', '2026-10-23'])
})

t('never places anything before the start or after the due date', () => {
  for (let count = 1; count <= 12; count++) {
    const out = spreadDates('2026-10-13', '2026-10-17', count)
    assert.equal(out.length, count)
    assert.equal(out[out.length - 1], '2026-10-17')
    for (const d of out) assert.ok(d >= '2026-10-13' && d <= '2026-10-17', d)
    if (count <= 4) assert.ok(out[0] > '2026-10-13', 'start day stays free when there is room')
    assert.deepEqual(out, out.slice().sort())
  }
})

t('more items than days doubles some days up instead of overflowing', () => {
  const out = spreadDates('2026-10-13', '2026-10-15', 4)
  assert.deepEqual(out, ['2026-10-13', '2026-10-13', '2026-10-14', '2026-10-15'])
})

t('a start on or after the due date leaves everything on the due date', () => {
  assert.deepEqual(spreadDates('2026-10-20', '2026-10-20', 3), ['2026-10-20', '2026-10-20', '2026-10-20'])
  assert.deepEqual(spreadDates('2026-10-25', '2026-10-20', 2), ['2026-10-20', '2026-10-20'])
})

t('crosses month ends correctly', () => {
  assert.deepEqual(spreadDates('2026-10-29', '2026-11-02', 2), ['2026-10-31', '2026-11-02'])
})

t('keeps the feed order, by time then title', () => {
  const plan = planSpread([
    { label: 'B', startTime: '23:59' }, { label: 'A', startTime: '23:59' }, { label: 'C', startTime: '09:00' },
  ], '2026-10-13', '2026-10-16')
  assert.deepEqual(plan.map(p => p.span.label), ['C', 'A', 'B'])
  assert.deepEqual(plan.map(p => p.date), ['2026-10-14', '2026-10-15', '2026-10-16'])
})

console.log(`  ${n} passed`)
