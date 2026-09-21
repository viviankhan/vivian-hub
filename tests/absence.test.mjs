// Sleep is not absence.
//
// The blob asks about the stretches you disappear into — but a mood tracker
// that counts a normal night as "eight hours away" would ask every single
// morning, and a nudge you swipe away every morning is worth nothing on the
// morning it matters. So the rule is measured in *waking* hours, and this pins
// that: the arithmetic of the night window, the threshold either side of it,
// how a multi-day stretch is cut into the per-day check-ins every chart reads,
// and the promise that an absence answered or declined is never asked twice.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const A = await import(resolve(REPO, 'src/lib/absence.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}

// Local wall-clock helper: these rules are all about the clock on the wall, so
// every fixture is built in local time exactly as the app builds them.
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime()
const RULE = { ...A.DEFAULT_ABSENCE_RULE }          // 8 waking hours, night 22:00–08:00

console.log('\n— waking minutes: the night does not count against you —')
eq('a plain evening hour is an hour',
  A.wakingMinutes(at(2026, 3, 10, 18), at(2026, 3, 10, 19), RULE), 60)
eq('a full night away is barely any waking time',
  A.wakingMinutes(at(2026, 3, 10, 22, 30), at(2026, 3, 11, 7, 30), RULE), 0)
eq('closing at 10pm and opening at 10am is two waking hours, not twelve',
  A.wakingMinutes(at(2026, 3, 10, 22), at(2026, 3, 11, 10), RULE), 120)
eq('an evening, a night and a morning add up to only their waking ends',
  A.wakingMinutes(at(2026, 3, 10, 20), at(2026, 3, 11, 12), RULE), 2 * 60 + 4 * 60)
eq('two whole days away is two waking days',
  A.wakingMinutes(at(2026, 3, 10, 9), at(2026, 3, 12, 9), RULE), 2 * 14 * 60)
eq('with the night switched off, elapsed time is the whole story',
  A.wakingMinutes(at(2026, 3, 10, 22), at(2026, 3, 11, 10), { ...RULE, skipSleep: false }), 12 * 60)
eq('a night window set to nothing leaves every hour waking',
  A.wakingMinutes(at(2026, 3, 10, 22), at(2026, 3, 11, 10), { ...RULE, sleepStart: '00:00', sleepEnd: '00:00' }), 12 * 60)
eq('a daytime nap window (13:00–15:00) is subtracted too',
  A.wakingMinutes(at(2026, 3, 10, 12), at(2026, 3, 10, 16), { ...RULE, sleepStart: '13:00', sleepEnd: '15:00' }), 120)

console.log('\n— the threshold: when the blob speaks up —')
const ask = (fromMs, toMs, rule = RULE, handledId = null) =>
  A.evaluateAbsence({ lastSeenMs: fromMs, nowMs: toMs, rule, handledId })
eq('a normal night, then morning, is not an absence',
  !!ask(at(2026, 3, 10, 23), at(2026, 3, 11, 8, 30)), false)
eq('a whole day of silence is',
  !!ask(at(2026, 3, 10, 9), at(2026, 3, 11, 9)), true)
eq('so are two working days in a row',
  !!ask(at(2026, 3, 10, 14), at(2026, 3, 12, 10)), true)
eq('an afternoon out is not, at the default eight hours',
  !!ask(at(2026, 3, 10, 12), at(2026, 3, 10, 17)), false)
eq('…but it is, once the rule is set to four',
  !!ask(at(2026, 3, 10, 12), at(2026, 3, 10, 17), { ...RULE, hours: 4 }), true)
eq('a rule switched off never asks',
  !!ask(at(2026, 3, 1, 9), at(2026, 3, 12, 9), { ...RULE, enabled: false }), false)
eq('no record of a last visit means no absence to claim',
  !!ask(0, at(2026, 3, 12, 9)), false)
eq('a clock that ran backwards is ignored rather than believed',
  !!ask(at(2026, 3, 12, 9), at(2026, 3, 10, 9)), false)

console.log('\n— asked once, and only once —')
const gap = ask(at(2026, 3, 10, 9), at(2026, 3, 11, 9))
eq('the absence is named by when it started, not by now',
  gap.id, A.absenceId(at(2026, 3, 10, 9)))
eq('that name holds as the gap keeps growing',
  ask(at(2026, 3, 10, 9), at(2026, 3, 11, 20)).id, gap.id)
eq('answering or declining it silences it for good',
  !!ask(at(2026, 3, 10, 9), at(2026, 3, 11, 20), RULE, gap.id), false)

console.log('\n— a gap of months is a fresh start, not a form —')
const old = ask(at(2026, 1, 1, 9), at(2026, 3, 12, 9))
eq('only the recent end of it is offered', old.clipped, true)
eq('and it covers the rule’s window, no more', old.days.length, RULE.maxDays + 1)
eq('while still being named by the real last visit',
  old.id, A.absenceId(at(2026, 1, 1, 9)))

console.log('\n— cutting a stretch into the days it crossed —')
const days = A.splitByDay(at(2026, 3, 10, 14), at(2026, 3, 12, 9))
eq('one piece per calendar day', days.map(d => d.key), ['2026-03-10', '2026-03-11', '2026-03-12'])
eq('the first piece runs to midnight', days[0].endMs, at(2026, 3, 11, 0))
eq('the middle piece is the whole day', days[1].endMs - days[1].startMs, 86400000)
eq('the last piece stops at now', days[2].endMs, at(2026, 3, 12, 9))
eq('a stretch inside one day stays one piece', A.splitByDay(at(2026, 3, 10, 9), at(2026, 3, 10, 17)).length, 1)

console.log('\n— what an answered catch-up writes down —')
const built = A.buildCatchUp(ask(at(2026, 3, 10, 14), at(2026, 3, 12, 9)),
  { mood: 2, emotions: ['sadness'], note: 'lost the week', conditionIds: ['fx-low'], intensity: 7, now: 1 })
eq('a mood check-in for every day it touched', built.checkins.map(c => c.date), ['2026-03-10', '2026-03-11', '2026-03-12'])
eq('each one covering only its own hours',
  [built.checkins[0].ts, built.checkins[0].endTs].map(t => new Date(t).getHours()), [14, 0])
eq('each carries the mood and its emotions',
  built.checkins.every(c => c.mood === 2 && c.emotions[0] === 'sadness'), true)
eq('the words ride the first day only, not copied onto every one',
  built.checkins.map(c => c.note), ['lost the week', '', ''])
eq('the check-ins are marked as filled in after the fact',
  built.checkins.every(c => c.via === 'absence'), true)
eq('the condition is ONE span across the whole stretch, not daily fragments',
  built.episodes.length, 1)
eq('running start to end, at the intensity given',
  [built.episodes[0].start, built.episodes[0].end, built.episodes[0].intensity],
  [new Date(at(2026, 3, 10, 14)).toISOString(), new Date(at(2026, 3, 12, 9)).toISOString(), 7])
eq('declining to name a mood writes no check-ins',
  A.buildCatchUp(gap, { mood: null, conditionIds: ['fx-low'] }).checkins.length, 0)

console.log('\n— a rule read back from storage is never trusted blindly —')
eq('nonsense falls back to the defaults',
  A.normalizeRule({ hours: 'lots', sleepStart: 'bedtime' }).hours, A.DEFAULT_ABSENCE_RULE.hours)
eq('an absurd threshold is clamped, not honoured', A.normalizeRule({ hours: 9999 }).hours, 168)
eq('an empty rule is the default rule', A.normalizeRule(null), A.DEFAULT_ABSENCE_RULE)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
