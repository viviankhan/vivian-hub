// Papers reader helpers (src/lib/paperText.js): cue lookup, paragraph layout,
// glossary marking. The cue lookup is what drives the highlight, so it is
// checked against a brute-force scan over the real prototype cue list.
import assert from 'node:assert/strict'
import { findCue, sectionStart, sectionAt, paragraphs, markTerms, formatTime, paperFromImport, CUE_HEADING } from '../src/lib/paperText.js'

let passed = 0
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name) }

const cues = [
  { s: 0, i: -1, t: 0 }, { s: 0, i: 0, t: 2.264 }, { s: 0, i: 1, t: 8.337 },
  { s: 1, i: -1, t: 31.033 }, { s: 1, i: 0, t: 32.948 }, { s: 1, i: 1, t: 36.56 },
  { s: 1, i: -2, t: 47.1 }, { s: 2, i: -1, t: 60.532 },
]

test('findCue matches a linear scan everywhere', () => {
  const linear = t => { let k = -1; cues.forEach((c, i) => { if (c.t <= t) k = i }); return k }
  for (let t = -1; t < 70; t += 0.137) assert.equal(findCue(cues, t), linear(t), 't=' + t)
  for (const c of cues) assert.equal(findCue(cues, c.t), cues.indexOf(c))
})

test('findCue edge cases', () => {
  assert.equal(findCue([], 3), -1)
  assert.equal(findCue(null, 3), -1)
  assert.equal(findCue(cues, NaN), -1)
  assert.equal(findCue([{ s: 0, i: -1, t: 1 }], 0.5), -1)
  assert.equal(findCue([{ s: 0, i: -1, t: 1 }], 9), 0)
})

test('sectionStart and sectionAt', () => {
  assert.equal(sectionStart(cues, 1), 31.033)
  assert.equal(sectionStart(cues, 9), null)
  assert.equal(sectionAt(cues, 40), 1)
  assert.equal(sectionAt(cues, 0), 0)
  assert.equal(cues[findCue(cues, 31.5)].i, CUE_HEADING)
})

test('paragraphs uses the narrator paragraph sizes', () => {
  const p = paragraphs({ lines: ['a.', 'b.', 'c.'], paras: [2, 1] })
  assert.deepEqual(p.map(x => x.map(y => y.i)), [[0, 1], [2]])
})

test('paragraphs falls back to matching the body, keeping lines verbatim', () => {
  // The prototype's split merged two sentences here; the layout must not
  // "fix" that by re-splitting — it only places the paragraph break.
  const sec = {
    body: 'One here. Two fungal. Three there.\n\nFour now. Five.',
    lines: ['One here.', 'Two fungal. Three there.', 'Four now.', 'Five.'],
  }
  const p = paragraphs(sec)
  assert.deepEqual(p.map(x => x.map(y => y.text)), [['One here.', 'Two fungal. Three there.'], ['Four now.', 'Five.']])
})

test('paragraphs ignores bad sizes', () => {
  const p = paragraphs({ body: 'A. B.', lines: ['A.', 'B.'], paras: [5] })
  assert.equal(p.length, 1)
  assert.equal(p[0].length, 2)
})

test('markTerms: whole words, case-insensitive, longest first', () => {
  const terms = [{ term: 'exhaustion', def: 'x' }, { term: 'T-cell exhaustion', def: 'y' }, { term: 'B10', def: 'z' }]
  const seg = markTerms('Signs of T-cell exhaustion, not Exhaustion alone; B10 but not B100.', terms)
  assert.deepEqual(seg.filter(s => s.term).map(s => [s.text, s.term.def]), [['T-cell exhaustion', 'y'], ['Exhaustion', 'x'], ['B10', 'z']])
  assert.equal(seg.map(s => s.text).join(''), 'Signs of T-cell exhaustion, not Exhaustion alone; B10 but not B100.')
})

test('markTerms with no terms', () => {
  assert.deepEqual(markTerms('plain', []), [{ text: 'plain' }])
})

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00')
  assert.equal(formatTime(498.57), '8:18')
  assert.equal(formatTime(3725), '1:02:05')
})

test('paperFromImport drops audio and keeps text', () => {
  const p = paperFromImport({ title: 'T', year: 2015, sections: [{ heading: 'H', body: 'B.', lines: ['B.'] }, { heading: 'empty', body: '' }], cues: [1], dur: 3, audio_path: 'x', terms: [{ term: 'a', def: 'b' }, { term: 'no def' }] })
  assert.equal(p.year, '2015')
  assert.equal(p.sections.length, 1)
  assert.deepEqual(p.sections[0].lines, ['B.'])
  assert.equal(p.terms.length, 1)
  assert.ok(!('cues' in p) && !('dur' in p) && !('audio_path' in p))
  assert.equal(paperFromImport({ sections: [] }), null)
})

console.log(`paperText: ${passed} passed`)
