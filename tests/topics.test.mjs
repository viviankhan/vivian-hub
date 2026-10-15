// Topics are read from what you wrote, not from what you called the task
// (src/lib/topics.js). A title like "Work" is a label; the description says
// what the work was. These pin the extraction: phrases come out of
// descriptions and subtasks, plurals and casing merge, pieces of a longer
// phrase fold into it, a broad word that stands on its own keeps its row,
// numbers only ride along with a word, and nothing goes missing.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const T = await import(resolve(REPO, 'src/lib/topics.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const e = (title, desc, mins = 60, extra = {}) => ({ title, desc, mins, date: '2026-10-0' + ((extra.d ?? 1) % 9 + 1), cat: extra.cat || '', subList: extra.subs || [] })
const labels = rows => rows.map(r => r.label)
const row = (rows, label) => rows.find(r => r.label.toLowerCase() === label.toLowerCase())

console.log('\n— the description is where the work is named —')
const work = [
  e('Work', 'Grant proposal, section 2 budget tables', 90, { d: 1 }),
  e('Work', 'Grant proposal references and formatting', 60, { d: 2 }),
  e('Work', 'More on the grant proposal: specific aims', 120, { d: 3 }),
  e('Work', 'Reply to emails', 20, { d: 4 }),
]
const t1 = T.computeTopics(work)
eq('the topic is the proposal, not "Work"', labels(t1)[0], 'Grant proposal')
eq('…carrying every session that wrote about it', row(t1, 'grant proposal').count, 3)
eq('…and their hours', row(t1, 'grant proposal').mins, 270)
eq('"work" is never a topic of its own', labels(t1).some(l => /^work$/i.test(l)), false)
eq('a one-off 20-minute note is not a topic on its own', t1.some(r => !r.fallback && /email/i.test(r.label)), false)
eq('…but its session still shows, under its title and note', row(t1, 'Work: Reply to emails')?.fallback, true)

console.log('\n— plurals, casing and pieces of longer phrases —')
const cars = [e('Study', 'CARS practice passages', 60, { d: 1 }), e('Study', 'cars practice passage review', 60, { d: 2 })]
eq('"passage" and "passages" are one phrase, the whole of it', labels(T.computeTopics(cars)), ['CARS practice passages'])
const mcat = [
  e('Study', 'MCAT CARS practice passages', 60, { d: 1 }),
  e('Study', 'mcat cars practice passage review', 60, { d: 2 }),
  e('Study', 'MCAT biochem, amino acids', 60, { d: 3 }),
  e('Study', 'MCAT biochem enzymes', 60, { d: 4 }),
]
const t2 = T.computeTopics(mcat)
eq('a broad topic that spans the notes keeps every session', row(t2, 'mcat')?.count, 4)
eq('a facet whose sessions all sit inside it folds in', labels(t2), ['MCAT'])
eq('…and its text still shows in the sessions', t2[0].entries.some(x => /biochem/.test(x.desc)), true)
eq('a word that only ever sits inside a longer phrase never lists alone', labels(T.computeTopics(cars)).some(l => /^cars$/i.test(l)), false)
eq('a one-word title that only labels its notes steps aside', labels(t2).some(l => /^study$/i.test(l)), false)
eq('…but a one-word title that is all we know stays', T.computeTopics([e('Gym', '', 50, { d: 1 }), e('Gym', '', 50, { d: 2 })])[0].label, 'Gym')
eq('…and gives way to the note when there is one', labels(T.computeTopics([e('Gym', 'Leg press', 50, { d: 1 }), e('Gym', 'Leg press', 50, { d: 2 })])), ['Leg press'])
eq('a generic activity word is never a topic of its own', labels(T.computeTopics([e('Study', 'Anki review', 30, { d: 1 }), e('Study', 'Review Anki', 30, { d: 2 })])), ['Anki'])
eq('…but it may sit inside a phrase', labels(T.computeTopics([e('Study', 'Anki review', 30, { d: 1 }), e('Study', 'Anki review', 30, { d: 2 })])), ['Anki review'])

console.log('\n— subtasks and numbers —')
const lab = [
  e('Lab', '', 120, { d: 1, subs: ['Prep master mix', 'Load 96-well plate', 'Analyze gel bands'] }),
  e('Lab', 'Re-run the PCR', 60, { d: 2, subs: ['Prep master mix', 'Analyze gel bands'] }),
  e('Reading', 'Alberts chapter 12', 45, { d: 3 }),
  e('Reading', 'Alberts chapter 12, second half', 45, { d: 4 }),
  e('Reading', 'Finished 12 pages', 30, { d: 5 }),
]
const t3 = T.computeTopics(lab)
eq('subtasks that always come together are one topic, named by the task and its parts', row(t3, 'Lab: Prep master mix, Analyze gel bands')?.count, 2)
eq('a cluster keeps its strongest parts, not every fragment', T.computeTopics([e('Work', 'Debug the analysis script (python plotting bug in the pipeline)', 60, { d: 1, subs: ['Reproduce bug', 'Fix and rerun'] }), e('Work', 'Debug the analysis script (python plotting bug in the pipeline)', 60, { d: 2, subs: ['Reproduce bug', 'Fix and rerun'] })])[0].label, 'Python plotting bug, analysis script')
eq('…counting those hours once', t3.filter(r => /master mix|gel bands/i.test(r.label)).length, 1)
eq('a chapter number rides along with its word', row(t3, 'alberts chapter 12')?.count, 2)
eq('a bare number is never a topic', labels(t3).some(l => /^\d+$/.test(l)), false)
eq('nothing starts on a bare number', labels(t3).every(l => !/^\d+(\s|$)/.test(l)), true)
eq('a subtask list does not run into the next subtask', labels(t3).some(l => /plate analyze|mix load/i.test(l)), false)

console.log('\n— support and ordering —')
const long = [e('Deep work', 'Wrote the whole discussion section of the thesis', 180, { d: 1 }), e('Admin', 'Printer', 10, { d: 2 })]
const t4 = T.computeTopics(long)
eq('a session nothing recurs in is listed by its title and note', t4[0].label, 'Deep work: Wrote the whole discussion section of the thesis')
eq('…flagged as a fallback with a note', [t4[0].fallback, t4[0].gist], [true, true])
eq('a long note is trimmed on a word', T.computeTopics([e('Work', 'A very long description that goes on and on about the specific aims of the whole proposal', 30)])[0].label.endsWith('…'), true)
eq('topics rank by hours', T.computeTopics(work).map(r => r.mins).every((m, i, a) => i === 0 || a[i - 1] >= m), true)
eq('a topic takes the area most of its sessions were filed under',
  T.computeTopics([e('Work', 'grant proposal', 60, { d: 1, cat: 'career' }), e('Lab', 'grant proposal', 60, { d: 2, cat: 'career' }), e('Lab', 'grant proposal', 60, { d: 3, cat: 'lab' })])[0].cat, 'career')
eq('the label is the form written most', T.computeTopics([e('Work', 'grant proposal', 60, { d: 1 }), e('Work', 'Grant Proposal', 60, { d: 2 }), e('Work', 'Grant Proposal', 60, { d: 3 })])[0].label, 'Grant Proposal')
eq('empty input is an empty list', T.computeTopics([]), [])
eq('an entry with nothing written at all still lands somewhere', T.computeTopics([{ title: '', desc: '', mins: 30 }, { title: '', desc: '', mins: 30 }])[0].label, 'Untitled')

console.log('\n— a recurring place or person never swallows the projects beside it —')
const lib = T.computeTopics([e('Work', 'Grant proposal at the library', 60, { d: 1 }), e('Work', 'Grant proposal at the library', 60, { d: 2 }),
  e('Work', 'MCAT CARS at the library', 60, { d: 3 }), e('Work', 'MCAT CARS at the library', 60, { d: 4 }),
  e('Work', 'Thesis at the library', 60, { d: 5 }), e('Work', 'Thesis at the library', 60, { d: 6 }), e('Work', 'Thesis', 60, { d: 7 })])
eq('every project keeps its row', ['Grant proposal', 'MCAT CARS', 'Thesis'].every(l => row(lib, l)), true)
const lee = T.computeTopics([e('Work', 'Grant proposal, send to Dr. Lee', 60, { d: 1 }), e('Work', 'Grant proposal edits from Lee', 60, { d: 2 }),
  e('Work', 'Western blot, show Lee', 60, { d: 3 }), e('Work', 'Western blot repeat for Lee', 60, { d: 4 }), e('Work', 'Lee 1:1', 60, { d: 5 })])
eq('…a person included', [!!row(lee, 'Grant proposal'), !!row(lee, 'Western blot')], [true, true])
eq('a two-word labelling title steps aside for its notes',
  labels(T.computeTopics([e('Study time', 'MCAT CARS practice', 60, { d: 1 }), e('Study time', 'MCAT CARS practice', 60, { d: 2 }), e('Focus block', 'Anki review', 60, { d: 3 }), e('Focus block', 'Anki review', 60, { d: 4 })])).sort(),
  ['Anki review', 'MCAT CARS practice'])
eq('a labelling title whose notes split across topics steps aside',
  labels(T.computeTopics([e('Lab', 'Western blot', 60, { d: 1 }), e('Lab', 'Western blot', 60, { d: 2 }), e('Lab', 'PCR optimization', 60, { d: 3 }), e('Lab', 'PCR optimization', 60, { d: 4 }), e('Lab', 'Mouse colony records', 60, { d: 5 }), e('Lab', 'Mouse colony records', 60, { d: 6 })])).includes('Lab'),
  false)

console.log('\n— a title that names the work stays on the row —')
eq('"Anki" with notes about cards', labels(T.computeTopics([e('Anki', '50 new cards', 30, { d: 1 }), e('Anki', '120 cards reviewed', 30, { d: 2 }), e('Anki', 'cards on glycolysis', 30, { d: 3 })])), ['Anki: cards'])
eq('"Thesis" with notes about pages', labels(T.computeTopics([e('Thesis', 'Wrote 2 pages of discussion', 120, { d: 1 }), e('Thesis', 'Wrote the intro pages', 120, { d: 2 }), e('Thesis', 'Edited pages 4-9', 60, { d: 3 })])), ['Thesis: pages'])

console.log('\n— the longest shared stretch, not a pile of windows —')
eq('two notes that share five words', labels(T.computeTopics([e('Work', 'Grant proposal section 2 budget tables', 90, { d: 1 }), e('Work', 'Grant proposal section 2 budget revisions', 60, { d: 2 })])), ['Grant proposal section 2 budget'])
eq('a nine-word note that recurs is one row', T.computeTopics(Array.from({ length: 5 }, (_, i) => e('Study', 'MCAT CARS practice passages timed section review error log', 60, { d: i + 1 }))).length, 1)

console.log('\n— links, contractions, clock times and accents —')
const links = T.computeTopics([e('Work', 'Edit the draft at https://docs.google.com/document/d/abc123/edit', 60, { d: 1 }), e('Work', 'Comments on https://docs.google.com/document/d/xyz789/edit', 60, { d: 2 }),
  e('Work', 'Grant proposal https://www.nsf.gov/pubs/2026/nsf26001/nsf26001.htm', 60, { d: 3 }), e('Work', 'Grant proposal https://www.nsf.gov/pubs/2026/nsf26002/nsf26002.htm', 60, { d: 4 })])
eq('a pasted link is never a topic', links.some(r => /https?|www|docs|google|\.htm/i.test(r.label) && !r.fallback), false)
eq('…and reads as its site in a one-off', links.some(r => r.label === 'Work: Comments on docs.google.com'), true)
eq('contractions and filler verbs are never topics', labels(T.computeTopics([e('Work', "Don't forget the grant proposal budget. I'm behind on it", 60, { d: 1 }), e('Work', "Don't forget to email Dr. Lee; I'm still waiting", 60, { d: 2 }), e('Work', "I'm reviewing the grant proposal again", 60, { d: 3 })])).filter(l => !l.startsWith('Work:')), ['Grant proposal'])
eq('a clock time cuts the phrase', labels(T.computeTopics([e('Standup 9:30', '', 15, { d: 1 }), e('Standup 9:30', '', 15, { d: 2 })])), ['Standup'])
eq('…in a note too', T.computeTopics([e('Lab', 'Lab meeting 2:00 PM, present western blot data', 60, { d: 1 }), e('Lab', 'Lab meeting 2:00 PM, discuss western blot results', 60, { d: 2 })]).some(r => /\d/.test(r.label)), false)
eq('accented words stay whole', labels(T.computeTopics([e('Career', 'Résumé review with mentor', 60, { d: 1 }), e('Career', 'Résumé edits, cover letter', 60, { d: 2 })])), ['Career: Résumé'])
eq('…in any phrase', labels(T.computeTopics([e('Café', 'Café con leche con María', 30, { d: 1 }), e('Café', 'Café con leche con María', 30, { d: 2 })])), ['Café con leche con María'])
eq('a year is not a topic', T.computeTopics([e('Taxes', 'Taxes 2026 paperwork', 60, { d: 1 }), e('Taxes', 'Taxes 2026 paperwork', 60, { d: 2 })]).some(r => /2026/.test(r.label)), false)

console.log('\n— fast enough for a year —')
{
  let s = 11
  const rnd = n => (s = (s * 1103515245 + 12345) % 2147483648) % n
  const syll = ['ka', 'lo', 'mi', 'ra', 'te', 'su', 'vo', 'pe', 'ni', 'da', 'zu', 'fe', 'gro', 'bli', 'tra', 'ste']
  const vocab = Array.from({ length: 2400 }, () => Array.from({ length: 2 + rnd(3) }, () => syll[rnd(syll.length)]).join(''))
  const note = len => Array.from({ length: len }, (_, i) => i % 3 === 2 ? 'and' : vocab[rnd(vocab.length)]).join(' ')
  const year = Array.from({ length: 2900 }, (_, i) => e(['Work', 'Lab', 'Study'][i % 3], note(6 + rnd(8)), 30 + rnd(60), { d: i }))
  const t0 = Date.now(); T.computeTopics(year, { max: Infinity }); const ms = Date.now() - t0
  eq(`2,900 varied sessions in under 2s (${ms}ms)`, ms < 2000, true)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
