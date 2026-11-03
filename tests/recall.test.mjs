// "How did jogging feel?" / "Did I take my meds?" / "How was my mood at work?"
//
// Pins the on-device recall the ✨ assistant answers questions from: which
// texts are questions, and what each kind of question finds.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const R = await import(resolve(REPO, 'src/lib/recall.js'))
const L = await import(resolve(REPO, 'src/lib/lifelogPure.js'))

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, extra) }
}
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const iso = (...a) => new Date(at(...a)).toISOString()
const NOW = at(2026, 11, 3, 20, 0)   // Tue Nov 3, 8pm

console.log('\n— questions vs. things to plan —')
ok('how did jogging feel? is a question', R.isRecallQuestion('How did jogging feel?'))
ok('did I take my meds this week is a question', R.isRecallQuestion('did I take my meds this week'))
ok('"Dentist next Tue 3pm" is not', !R.isRecallQuestion('Dentist next Tue 3pm, bring insurance card'))
ok('"Add a task: what to buy?" is not', !R.isRecallQuestion('Add a task: what to buy for the party?'))
ok('a backlog ending in “?” is something to log, not a question',
  !R.isRecallQuestion('I worked from 10-7 pm , 9-11 pm, and 10-9 most days last week. Can you accurately reflect that?'))
ok('so is a plain account of last week',
  !R.isRecallQuestion('I pulled late nights all week last week by designing the experiment, making comps, staining cells, and running flow each of those was its own day Tues-Fri. Hours were 10-9, 9-9, 10-11, 9-8'))
ok('“can you…” is a request', !R.isRecallQuestion('Can you add my work hours from last week?'))
ok('those read as things already done', R.isLogOfPast('I worked from 10-7 pm last week') && R.isLogOfPast('I pulled late nights all week last week'))
ok('a plan for later does not', !R.isLogOfPast('Dentist next Tue 3pm, bring insurance card') && !R.isLogOfPast('I need to stain cells Friday'))
ok('stems: jogging → jog', R.stem('jogging') === 'jog' && R.stem('jogged') === 'jog' && R.stem('jogs') === 'jog')

const WORK = { id: 'w', name: 'Work', lat: 47.6, lng: -122.33 }
const data = {
  medIds: { med1: true },
  recurring: [
    { id: 'med1', label: '8:00 AM — Lexapro', days: [], startDate: '2026-10-01', freq: 'daily', interval: 1 },
    { id: 'jog', label: '7:00 AM — Jog', days: [], startDate: '2026-10-01', freq: 'daily', interval: 1 },
  ],
  commitments: [],
  completions: { '2026-11-01_med1': false },
  dayNotes: {
    '2026-11-01_med1': { taskId: 'med1', date: '2026-11-01', title: 'Lexapro', skipped: true, mood: 2, text: 'Ran out of Lexapro, pharmacy closed', at: iso(2026, 11, 1, 9), updatedAt: iso(2026, 11, 1, 9) },
    '2026-11-02_jog': { taskId: 'jog', date: '2026-11-02', title: 'Jog', time: '07:00', durationMins: 40, text: 'Legs felt heavy but the lake was beautiful', mood: 4, photos: ['wp-1'], at: iso(2026, 11, 2, 7, 45), place: 'Green Lake' },
    '2026-11-03_jog': { taskId: 'jog', date: '2026-11-03', title: 'Jog', time: '07:00', durationMins: 30, text: 'Short one, knee twinged', mood: 3, at: iso(2026, 11, 3, 7, 35) },
  },
  journal: [
    { id: 'j1', at: iso(2026, 11, 3, 18, 30), text: 'Stayed late again, so tired of this project', mood: 2, place: 'Work' },
  ],
  checkins: [{ date: '2026-11-03', mood: 2, note: '', ts: iso(2026, 11, 3, 17, 0) }],
  effects: [{ id: 'fx-migraine', name: 'Migraine' }],
  episodes: [
    { id: 'e1', effectId: 'fx-migraine', start: iso(2026, 10, 20, 14), end: iso(2026, 10, 20, 18), note: 'after screen day' },
    { id: 'e2', effectId: 'fx-migraine', start: iso(2026, 11, 2, 15), end: iso(2026, 11, 2, 17), note: '' },
  ],
  stays: [{ id: 's1', placeId: 'work', name: 'Work', lat: 47.6, lng: -122.33, start: at(2026, 11, 3, 9), end: at(2026, 11, 3, 19, 30), fixes: 9 }],
  places: [WORK],
  cleared: {},
}
const A = (q) => R.answerRecall(q, data, NOW)

console.log('\n— a topic: how did jogging feel? —')
{
  const a = A('How did jogging feel?')
  ok('finds both jog notes', /2 times/.test(a.text), a.text)
  ok('quotes the latest', /knee twinged/.test(a.text), a.text)
  ok('items carry duration and place', a.items?.some(i => /40 min/.test(i.meta) && /Green Lake/.test(i.meta)), JSON.stringify(a.items))
  ok('and photos', a.items?.some(i => i.photos.includes('wp-1')))
  const y = A('how did my jog go yesterday?')
  ok('yesterday narrows it to one', /1 time yesterday/.test(y.text), y.text)
}

console.log('\n— medications —')
{
  ok('this week starts Monday, so Sunday’s skip is last week', /taken every day this week/.test(A('Did I take my meds this week?').text), A('Did I take my meds this week?').text)
  const a = A('Did I take my meds?')
  ok('counts the skipped day', /Lexapro: taken 6 of 7 days in the last 7 days; skipped Sunday/.test(a.text), a.text)
  ok('lists the skip with its mood', a.items?.some(i => /Skipped Lexapro/.test(i.title) && /Low/.test(i.meta)), JSON.stringify(a.items))
  const r = A('when did I run out of Lexapro?')
  ok('ran out → the note', /Ran out of Lexapro/.test(r.text) || r.items?.some(i => /Ran out/.test(i.text)), r.text)
  ok('the med name alone routes to meds', /Lexapro/.test(A('how has lexapro been going').text))
  ok('alerts pick up the ran-out note', L.medAlerts({ dayNotes: data.dayNotes, journal: data.journal, medIds: data.medIds }).length === 1)
  ok('a cleared alert goes away', L.medAlerts({ dayNotes: data.dayNotes, journal: [], medIds: data.medIds, cleared: { '2026-11-01_med1': 'x' } }).length === 0)
  ok('"ran out of coffee" in the journal is not a med alert', L.medAlerts({ journal: [{ id: 'x', at: iso(2026, 11, 3), text: 'ran out of coffee' }] }).length === 0)
}

console.log('\n— conditions —')
{
  const a = A('When did I last have a migraine?')
  ok('last migraine is yesterday, 2h', /Migraine: 2 times logged; the last one started yesterday at 3:00 PM and lasted 2h/.test(a.text), a.text)
}

console.log('\n— mood, and places —')
{
  ok('how have I been feeling → overall mood', /Your mood averaged/.test(A('How have I been feeling?').text), A('How have I been feeling?').text)
  const a = A('How was my mood at work?')
  ok('mood at work uses moods logged during the stay', /at Work/.test(a.text) && /Low/.test(a.text), a.text)
  const w = A('what did I write at work today?')
  ok('what I wrote at work finds the journal entry', w.items?.some(i => /Stayed late/.test(i.text)), JSON.stringify(w))
  const h = A('How long was I at work today?')
  ok('time at a place still works', /10h 30m today/.test(h.text), h.text)
}

console.log('\n— nothing found —')
ok('says so plainly', /couldn’t find anything about “kayak”/.test(A('how did kayaking feel?').text), A('how did kayaking feel?').text)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
