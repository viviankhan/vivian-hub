# FIXES

A review pass over Bloom wearing three hats — UX engineer, front-end engineer,
and performance reviewer. Each entry says where the problem is, what's actually
wrong, and what was changed.

Baseline before any of this: `npm test` 27+8 passing, `npm run test:browser`
11+12+45 passing, `npm run build` clean. Everything below keeps that green.

---

## 1. The geolocation watch was torn down and re-armed on every render

**File:** `src/App.jsx` (~line 888)

`recurringTasksEnriched` was a plain expression in the component body:

```js
const recurringTasksEnriched = recurringTaskRows.map(t => ({ ...t, ...(recurringMeta[t.id] || {}) }))
```

so it got a fresh array identity on *every* render. It is also a dependency of
the location-arrival effect:

```js
}, [loading, commitments, commitmentMeta, recurringTasksEnriched, recurringExceptions, completions, occStarted])
```

The effect therefore re-ran on every render of `App` — and its cleanup stops the
`watchPosition` subscription. So any state change anywhere in the app (including
the 30-second timeline tick and every keystroke that touches app state) killed
and restarted the GPS watch. That burns battery on exactly the devices that can
least afford it, and each restart drops the accumulated position fix, so a real
arrival can be missed.

The same array was passed to `Informatics` and `RecurringTasksManager`, defeating
any memoization in those subtrees too.

**Fix:** wrapped it in `useMemo` keyed on `[recurringTaskRows, recurringMeta]`.
Also revived `recurringTasksWrapped` — it was computed and then never used (dead
code), while the render site built the identical object inline as
`{ tasks: recurringTasksEnriched }`; it is now the memoized value and is what the
Recurring tab receives.

## 2. Checking off two tasks in the same tick silently lost one

**File:** `src/App.jsx`, `syncToggle`

```js
const nextCompletions = { ...completions, [storageKey]: nowDone }
twins.forEach(k => { nextCompletions[k] = nowDone })
setCompletions_(nextCompletions)
```

This builds the next map from `completions` captured in the callback's closure,
not from the current state. `syncToggle` is `async` and is bound to every
checkbox on the timeline. Tick two tasks quickly and both invocations read the
same stale `completions`, so the second write lands *without* the first task's
tick — the first checkbox visibly un-ticks itself a moment after being tapped.

**Fix:** functional update — `setCompletions_(prev => ...)` — so each write
builds on whatever landed before it.

## 3. `commitmentsView` rebuilt on every render, defeating memoization app-wide

**File:** `src/App.jsx`

`commitmentsView` is the task list every view renders from, and it was rebuilt
unmemoized on each render — new array, and a new object for every task. It goes
into `sharedProps`, so this propagated new identities through the whole tree on
every render.

**Fix:** `useMemo` on `[commitments, commitmentMeta]`, plus a shared `EMPTY_ARRAY`
constant for the `subtasks`/`cats` empty cases so a task without subtasks keeps a
stable reference instead of getting a fresh `[]` each time.

Note: this required moving the computation *above* the `if (loading) return`
early-return — a `useMemo` after a conditional return breaks the Rules of Hooks
(React throws "rendered more hooks than during the previous render" on the
loading → loaded transition). Reordered accordingly.

## 4. No way to dismiss the drawers and menus with the keyboard

**Files:** `src/App.jsx` — `SettingsDrawer`, `MobileNav`, the desktop "More" menu

The app dismisses its other sheets with Escape (`PhotoAttach`, `SearchOverlay`,
`Today`'s band menu all do), but the three navigation surfaces did not. Settings
in particular could only be left by locating the "Done" button.

**Fix:** Escape now closes all three. The "More" menu also returns focus to the
button that opened it rather than dropping focus at the top of the document. Gave
the Settings drawer `role="dialog"` / `aria-modal` / `aria-label`.

## 5. The closed mobile drawer was still in the tab order

**File:** `src/App.jsx:321`

```jsx
<aside className={`mobile-nav ${open ? 'open' : ''}`} aria-hidden={!open}>
```

The drawer is always mounted so it can animate. `aria-hidden` hides it from the
accessibility tree but does **not** remove its buttons from the tab order — so a
keyboard user tabbing across the app fell into an off-screen menu with no visible
focus. It is also an ARIA violation in its own right: focusable elements inside
an `aria-hidden` subtree.

**Fix:** added `inert` alongside `aria-hidden`, which removes the subtree from
focus, hit-testing and the a11y tree together.

## 6. Smaller a11y gaps in the shell

**File:** `src/App.jsx`

- Nav tabs (desktop and the mobile bottom bar) carried no `aria-current`, so
  nothing conveyed which view you were on non-visually. Added `aria-current="page"`.
- The undo toast — the app's only confirmation that a destructive action
  happened, and the only way to reverse one on a phone — was silent to a screen
  reader. Added `role="status"` / `aria-live="polite"`.
- The bottom-bar buttons got an explicit `aria-label`.

## 7. Settings drawer width was measured once and never again

**File:** `src/App.jsx`, `SettingsDrawer`

`width: Math.min(520, window.innerWidth)` was read during render with nothing
listening for resize, so rotating a phone or resizing a window left the drawer at
its mount-time width.

**Fix:** the width now comes from state that tracks `resize` while the drawer is
open.

## 8. The timeline's per-day localStorage grew forever, and its writes could abort a click handler

**Files:** `src/components/Today.jsx`, new `src/lib/dayStore.js`, new `tests/dayStore.test.mjs`

The timeline keeps three scratch stores keyed by date — `vivian_custom_<date>`,
`vivian_deleted_<date>`, `vivian_timeshift_<date>`. Two problems:

1. **Unbounded.** One key per store per day, never pruned. A couple of years of
   use is a few thousand keys against a ~5MB cap. (`bloom_focus_pauses` right
   next to it *does* prune itself — these never did.)
2. **Unguarded writes.** 14 of the 15 call sites wrote through a bare
   `localStorage.setItem`. When the quota is full — or in Safari private
   browsing, where `setItem` always throws — that throws *inside a click
   handler*, aborting it partway. React state was already updated but nothing
   persisted, and the statements after the write never ran. In
   `applyDayShift` that means the day silently rearranged and the result toast
   never appeared; on undo, the restore half-applied.

**Fix:** extracted `writeDayStore` / `pruneDayStores` into `src/lib/dayStore.js`
(matching the repo's `src/lib/` convention, and testable). All 15 call sites now
go through `writeDayStore`, which is non-fatal and, on a quota error, prunes and
retries once — stale days being exactly what filled it. `pruneDayStores` runs
once per mount with a 60-day retention window.

Covered by `tests/dayStore.test.mjs` (17 assertions, wired into `npm test`):
retention boundaries, that lookalike keys (`vivian_collapsed_blocks`,
`vivian_last_tab`, a malformed date suffix) are left alone, the prune-and-retry
path, and a browser that denies storage outright.

## 9. `bloom_occ_started` had the same unbounded-growth problem

**File:** `src/App.jsx`

Arrival-started recurring occurrences are keyed `<recurringId>@<YYYY-MM-DD>` and
were never pruned — one entry per located occurrence, forever, re-serialized to
localStorage on every arrival. Only a *current* occurrence's start time means
anything.

**Fix:** entries for past days are dropped when the map loads, and the trimmed
map is written back.

## 10. The timeline clock ran on days where it meant nothing

**File:** `src/components/Today.jsx`

```js
useEffect(()=>{ const t=setInterval(()=>setNow(nowMins()),30000); return ()=>clearInterval(t) },[])
```

`now` drives the "now" marker, current/overdue states and the live progress
pills — all of which only apply when you're looking at *today* (`isToday` gates
every one of them). But the interval ran unconditionally, so paging back through
the week strip kept re-rendering the whole timeline every 30 seconds to move a
marker that wasn't drawn.

**Fix:** the interval is only armed while `viewDate` is today. It also ticks
immediately on `visibilitychange`, so a phone coming out of sleep shows the
correct time at once instead of up to 30 seconds stale — previously the first
post-wake frame drew a stale marker.

(Kept keyed off `viewDate` rather than the `isToday` binding, which is derived
further down the component — using it in the dep array would read it before
initialization during render.)

## 11. Nothing in the app showed a usable keyboard focus indicator

**File:** `src/styles/index.css`

Two separate holes, verified in a real Chromium:

- `input, select, textarea { … outline: none; … }` (line 530) removes the focus
  ring from **every** text field in the app. Confirmed: before this change,
  focusing the search input by keyboard computed `outline: none`.
- Nearly every other control is a `<button>` styled inline with `border:'none'`
  and no focus style, so it fell back to Chromium's UA default —
  `rgb(16,16,16) auto 1px`. A near-black hairline is effectively invisible on the
  app's own surfaces: the header buttons sit on the deep forest/teal gradient,
  and the bottom bar and Settings nav are similar.

Tabbing through Bloom therefore moved an invisible cursor — unusable by keyboard,
and a WCAG 2.4.7 (Focus Visible) failure.

**Fix:** one global `:focus-visible` rule near the top of the stylesheet — a 2px
`--teal` outline with a 2px offset and a translucent white halo so it reads
against dark surfaces too. `:focus-visible` (not `:focus`) means it only appears
for keyboard/AT focus, never around a tapped or clicked button, so the visual
design is untouched for mouse and touch users.

Specificity was chosen deliberately: the `:where(...)` wrapper contributes
nothing, leaving the rules at 0,1,0 from the `:focus-visible` pseudo-class alone.
That is enough to beat the bare `input, select, textarea { outline: none }`
element rule (0,0,1), while components that already paint their own focus
treatment — `.gh-micro`, `.tw-mood`, `.wl-note`, `.wl-input`, all class-based at
0,2,0 — keep overriding it exactly as they do today.

Verified after the change: `outline: rgb(74,158,181) solid 2px` with the halo on
a header button, and `solid 2px` on the search input.

(Measuring this needs care — `.icon-btn` carries `transition: all .2s`, so a
reading taken immediately after focus catches the ring mid-animation and reports
fractional widths. The values above are after the transition settles.)

## 12. The whole app shipped as one 1MB chunk

**Files:** `vite.config.js`, `src/App.jsx`, new `tests/offline-chunks.browser.test.mjs`

`vite build` warned about this on every build and nothing had been done about
it: a single `index.js` of 1,015 kB (306 kB gzipped) that had to be downloaded
and parsed in full before anything rendered — including the Art Studio, which is
admin-only and which no ordinary user can even open.

Two changes:

**Vendor split** (`manualChunks`). React/React DOM and the Supabase client are
now their own chunks. They almost never change, so a normal deploy no longer
invalidates them. That matters more here than in most apps: the service worker
precaches every file in `dist/assets` on install, so a deploy that invalidates
one 1MB chunk re-downloads 1MB before the update completes — over a phone
connection, on every release.

**Lazy tab views.** Every tab except Today (the default) is now `lazy()` +
`Suspense`, as is the admin-only Art Studio.

Initial payload, measured:

| | before | after |
|---|---|---|
| initial JS (raw) | 1,015 kB | 779 kB (`index` 637 + `vendor-react` 142) |
| initial JS (gzip) | 306 kB | 245 kB |
| deferred into tab chunks | — | 242 kB across 9 chunks |

(An unconfigured build tree-shakes Supabase away entirely, so
`vendor-supabase` is empty there. Verified against a build with
`VITE_SUPABASE_*` set, where it is a real 210 kB chunk — that is the split doing
its job in an actual deployment.)

The `Suspense` fallback is deliberately a blank held space rather than a
spinner: the worker precaches every chunk and serves `/assets/` cache-first, so
the gap is imperceptible, and a spinner that flashes for 20ms reads as a glitch.

**This needed proving, not assuming.** Code-splitting an offline-first PWA is
only safe because the worker precaches the new chunks. `tests/offline-chunks.browser.test.mjs`
now holds that guarantee: it installs the worker online, cuts the network, and
opens a tab whose chunk was never requested. It passes — but if someone later
narrows the precache list, that test goes red instead of a user finding a blank
screen on a plane.

## 13. The sign-in form's labels weren't attached to its fields

**File:** `src/components/Auth.jsx`

```jsx
<label style={{…}}>Email</label>
<input type="email" autoComplete="email" … />
```

No `htmlFor`, no `id`. The `<label>` is just styled text: a screen reader
announces the field as unlabelled, tapping the word "Email" doesn't focus the
input, and password managers have less to match on. This is the gate to the
whole app — the one form every user has to complete.

The validation errors had the same problem from the other side: `err` rendered
into a plain `<div>`, so submitting with an empty email painted a message that
was never announced. A screen-reader user got silence and a form that appeared
to do nothing.

**Fix:** `htmlFor`/`id` pairs on both fields (plus `name`, which helps password
managers), `role="alert"` on the error and `role="status"` on the success note,
and `aria-describedby` linking the fields to the error while one is showing.

Verified in Chromium against a Supabase-configured build: both fields now report
an accessible name, and submitting empty exposes `role=alert` reading
"Enter your email."

**One thing I deliberately did *not* do:** my first pass also added `required`
and `minLength={6}` to the inputs. That was wrong and I reverted it. The
component already does its own validation with better copy ("Password must be at
least 6 characters."), and native constraint validation fires *first* — so the
browser's generic bubble would have replaced the app's wording and quietly made
that existing code unreachable. The accessibility fix shouldn't change the
form's behaviour, and now it doesn't.

### Related, not fixed: the same pattern is app-wide

Across `src/components/` there are 39 `<label>` elements and only 2 use
`htmlFor`. The rest have the same disconnect, mostly in the add-task sheet and
the tracker forms. I fixed the sign-in gate because it is the highest-traffic
form and the one nobody can skip; sweeping the other 37 is a mechanical but
wide change (several are wrapping labels, several are styled as headings rather
than true labels) and belongs in its own pass with its own review, rather than
riding along unexamined in this one.
