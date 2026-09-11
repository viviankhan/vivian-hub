// A reminder must arrive at its moment — or not at all.
//
// Bloom catches reminders up when it's reopened, so one whose moment passed
// while the app was closed isn't lost. That catch-up used to have no upper
// bound for an end-of-task alert: a task that ran 1:30–2:00 PM would pop
// "finishing now — time to wrap up" at 4:23 PM, whenever the app next opened.
// This pins the rule that replaced it: a reminder that names a moment already
// gone stays quiet, while one that still points at something ahead is kept.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = fileURLToPath(new URL('..', import.meta.url))

// ── Browser stand-ins ──────────────────────────────────────────
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}
// Notifications this run has actually shown, newest last.
const shown = []
function FakeNotification(title, options) { shown.push({ title, body: options?.body }) }
FakeNotification.permission = 'granted'
globalThis.Notification = FakeNotification
globalThis.window = { Notification: FakeNotification, addEventListener: () => {}, dispatchEvent: () => true }
globalThis.document = { visibilityState: 'hidden', addEventListener: () => {} }
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })

// A clock we control, and timers we hold rather than run — so a "timer" can be
// made to come back late, the way a device that slept through one does.
let NOW = 0
Date.now = () => NOW
const pending = []
globalThis.setTimeout = (fn, ms) => { pending.push({ fn, at: NOW + ms }); return pending.length }
globalThis.clearTimeout = () => {}

// notifications.js is source Vite normally transforms (import.meta.env). Rewrite
// just that, and the relative import that a file in tests/ can't resolve.
const src = readFileSync(resolve(REPO, 'src/lib/notifications.js'), 'utf8')
  .replace('import.meta.env.BASE_URL', JSON.stringify('/'))
  .replace("from './sounds.js'", `from ${JSON.stringify(resolve(REPO, 'src/lib/sounds.js'))}`)
const shimPath = resolve(here, '.notifications.shim.mjs')
writeFileSync(shimPath, src)
const N = await import(shimPath)

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name) } }

// ── Fixtures ───────────────────────────────────────────────────
const DAY = '2026-09-11'
const at = (h, m) => new Date(2026, 8, 11, h, m, 0, 0).getTime()
const MIN = 60 * 1000

// One 30-minute task, 1:30–2:00 PM, with both an hour-before lead and an
// end-of-task alert turned on.
const task = (over = {}) => ({ id: 't1', text: 'Kay and Jacob', date: DAY, time: '13:30', durationMins: 30, ...over })

function reset(leads = [60, 'end']) {
  store.clear()
  shown.length = 0
  pending.length = 0
  N.saveSettings({ enabled: true, leads })
}
const titles = () => shown.map(s => s.title)
// Run every timer that would have gone off by now, in order.
function runDueTimers() {
  const due = pending.filter(t => t.at <= NOW)
  pending.length = 0
  for (const t of due) t.fn()
}

// ── The reported bug ───────────────────────────────────────────
console.log('\n— reopening hours after a task ended —')
reset()
NOW = at(16, 23)                      // the app is opened at 4:23 PM
N.syncReminders([], [task()], [])
ok('no "finishing now" for a task that ended at 2:00', shown.length === 0)

NOW = at(16, 24)
N.syncReminders([], [task()], [])
ok('and it stays quiet on the next sync too', shown.length === 0)

console.log('\n— reopening just after it ended —')
reset()
NOW = at(14, 2)                       // two minutes past the end
N.syncReminders([], [task()], [])
ok('the end alert still catches up', titles().join('|') === 'Kay and Jacob finishing now')
ok('and it says what it is for', shown[0].body === 'Time to wrap up.')

console.log('\n— on time, through a live timer —')
reset()
NOW = at(13, 45)                      // open mid-task, end still ahead
N.syncReminders([], [task()], [])
ok('nothing fires yet', shown.length === 0)
ok('the end alert is armed for 2:00', pending.some(t => t.at === at(14, 0)))
NOW = at(14, 0)
runDueTimers()
ok('and it arrives at the end', titles().join('|') === 'Kay and Jacob finishing now')

console.log('\n— a timer the device slept through —')
reset()
NOW = at(13, 45)
N.syncReminders([], [task()], [])
NOW = at(16, 23)                      // the timer comes back hours late
runDueTimers()
ok('a drifted timer delivers nothing', shown.length === 0)

// ── What catch-up is for, and must keep doing ──────────────────
console.log('\n— a lead reminder for something still ahead —')
reset([60])
NOW = at(13, 10)                      // the 12:30 "1 hour before" moment is past
N.syncReminders([], [task()], [])
ok('it still fires, re-worded for the real gap', titles().join('|') === 'Kay and Jacob in 20 min')

console.log('\n— a lead reminder for something already started —')
reset([60])
NOW = at(13, 45)
N.syncReminders([], [task()], [])
ok('nothing, the task is underway', shown.length === 0)

// ── An item that leaves the schedule and comes back ────────────
console.log('\n— un-checking a task whose alert already fired —')
reset([60])
NOW = at(13, 10)
N.syncReminders([], [task()], [])
ok('the lead reminder fires once', shown.length === 1)
NOW = at(13, 12)
N.syncReminders([], [task({ done: true })], [])   // checked off: drops out
NOW = at(13, 14)
N.syncReminders([], [task()], [])                 // un-checked: back again
ok('it does not fire a second time on its return', shown.length === 1)

// ── Nothing fires when reminders are off ───────────────────────
console.log('\n— reminders turned off —')
reset()
N.saveSettings({ enabled: false })
NOW = at(14, 2)
N.syncReminders([], [task()], [])
ok('silent', shown.length === 0)

// ── The cloud queue only carries what is still ahead ───────────
console.log('\n— the background push queue —')
reset()
NOW = at(13, 45)
const queued = N.buildScheduledPushes([], [task()], [])
ok('the end alert is queued for its moment', queued.some(q => q.tag === 't1:end' && new Date(q.at).getTime() === at(14, 0)))
NOW = at(16, 23)
ok('and nothing past is queued at all', N.buildScheduledPushes([], [task()], []).length === 0)

unlinkSync(shimPath)
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
