// Papers reader helpers (src/lib/paperText.js): cue lookup, paragraph layout,
// glossary marking. The cue lookup is what drives the highlight, so it is
// checked against a brute-force scan over the real prototype cue list.
import assert from 'node:assert/strict'
import { findCue, sectionStart, sectionAt, paragraphs, markTerms, formatTime, paperFromImport, sectionsFromText, estimateMinutes, quickUnits, speakable, CUE_HEADING } from '../src/lib/paperText.js'

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

test('pasted text with headings splits on them', () => {
  const t = 'Abstract\n\nWe did a thing.\nIt worked.\n\nMethods\n\nCells were grown at 37 °C.\n\nMore methods here.\n\nResults\n\nThe immuno-\nglobulin rose.'
  const s = sectionsFromText(t)
  assert.deepEqual(s.map(x => x.heading), ['Abstract', 'Methods', 'Results'])
  assert.equal(s[0].body, 'We did a thing. It worked.')
  assert.equal(s[1].body, 'Cells were grown at 37 °C.\n\nMore methods here.')
  assert.equal(s[2].body, 'The immunoglobulin rose.')
})

test('pasted text without headings is grouped into parts, paragraphs intact', () => {
  const para = (k) => Array.from({ length: 60 }, (_, i) => `w${k}_${i}`).join(' ') + '.'
  const t = [1, 2, 3, 4, 5, 6, 7].map(para).join('\n\n')
  const s = sectionsFromText(t)
  assert.ok(s.length >= 2 && s.length <= 4, String(s.length))
  assert.equal(s[0].heading, 'Part 1')
  assert.equal(s.map(x => x.body).join('\n\n'), t)      // every word kept, in order
})

test('text with single newlines only: one paragraph per line', () => {
  const s = sectionsFromText('First line here.\nSecond line here.')
  assert.equal(s.length, 1)
  assert.equal(s[0].body, 'First line here.\n\nSecond line here.')
})

test('a lone heading-like first line is not enough to split on', () => {
  const s = sectionsFromText('My notes\n\nSome text follows here.')
  assert.equal(s.length, 1)
  assert.ok(s[0].body.startsWith('My notes'))
})

test('a title line above the first heading is not a section', () => {
  const s = sectionsFromText('Lab notes\n\nBackground\n\nText one.\n\nMethods\n\nText two.')
  assert.deepEqual(s.map(x => x.heading), ['Background', 'Methods'])
})

test('empty and estimate', () => {
  assert.deepEqual(sectionsFromText('   '), [])
  assert.equal(estimateMinutes([{ heading: 'H', body: Array(299).fill('w').join(' ') }]), 2)
})

test('speakable matches voice.py on the same inputs', () => {
  // Expected strings are voice.py's own output for these inputs.
  assert.equal(speakable('CD34+ cells secreted IL-10 (p < 0.05) at 37 °C, vs. IFN-γ'),
    'C D 34 positive cells secreted interleukin 10 (p less than 0.05) at 37 degrees Celsius, versus interferon gamma')
  assert.equal(speakable('Smith et al. used ELISA and CLL cells, e.g. 5% of them.'),
    'Smith and colleagues used ELISA and C L L cells, for example 5 percent of them.')
})

test('quickUnits: headings, lines or paragraphs, captions, keyed like the reader', () => {
  const u = quickUnits({ sections: [
    { heading: 'A', body: 'P one.\n\nP two.', figure: { path: 'x', caption: 'Bars.' } },
    { heading: '', body: 'x', lines: ['S1.', 'S2.'] },
  ] })
  assert.deepEqual(u.map(x => x.key), ['0:-1', '0:p0', '0:p1', '0:-2', '1:-1', '1:0', '1:1'])
  assert.equal(u[3].text, 'Figure. Bars.')
  assert.equal(u[4].text, 'Section 2')
})

console.log(`paperText: ${passed} passed`)
