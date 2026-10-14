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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
