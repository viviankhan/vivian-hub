// src/components/Edits.jsx
// Claude adds a new entry here every session where changes are made.
// Format: { date, summary, changes: [] }

const EDIT_LOG = [
  {
    date: '2026-08-11',
    summary: 'Shift a whole routine earlier/later, and a cleaner Recurring tab',
    changes: [
      'In Recurring → Routines, each routine now has a start-time control: set a new start time (or nudge ±5/±15 min) and every task inside it moves together, keeping its spacing — no more hand-editing each downstream step to fit a slower or earlier morning',
      'Shifting a routine keeps each task\'s category, days and routine tag intact; editing a single task\'s time also keeps its routine tag',
      'The Recurring tab now opens on Routines first (instead of the Schedule list)',
      'Fixed the confusing schedule layout: a daily task no longer shows under every weekday — the list is grouped into "Every day", "Weekly", and "Monthly", with matching Daily / Monthly filter chips, so a monthly task only appears under Monthly',
    ]
  },
  {
    date: '2026-07-28',
    summary: 'Polished filled icon set (Material Design Icons)',
    changes: [
      'Task icons are now filled, solid Material Design Icons — a big, consistent, professional set (like Structured) instead of the thin hand-drawn lines',
      'Auto-pick and search run on the new set, so “walk” gives a filled walking figure, “dentist” a tooth, “dress” a hanger, and so on',
      'Icons you\'d already chosen keep working; the app\'s nav/menu chrome is unchanged',
    ]
  },
  {
    date: '2026-07-28',
    summary: 'Icons auto-pick intuitively — “walk” finds a walking icon',
    changes: [
      'Fixed two icons that were showing up blank (walk/run and hourglass were referenced but never drawn) — now they render',
      'Rebuilt the auto-icon guess around a direct word→icon map: typing “walk” gives a walking figure, “dentist” a tooth, “budget” a dollar, “groceries” a cart, and ~140 other everyday words map straight to a sensible icon',
    ]
  },
  {
    date: '2026-07-28',
    summary: 'Pale-yellow morning film + a cleaner minimalist icon set',
    changes: [
      'The morning routine film is now a soft pale yellow (an existing morning routine still on the old pink gets upgraded automatically)',
      'Switched back to a single minimalist line-icon set to match Structured — no more colour emoji — and added clothing & beauty icons, so searching “dress” finds one (258 icons total)',
    ]
  },
  {
    date: '2026-07-28',
    summary: 'Emoji picker, beach-peach themes, and auto-completing routines',
    changes: [
      'The Color & Icon picker now has real emoji (dress, clothes, food, animals and more) — searchable alongside the line icons — and the sheet keeps a steady height instead of shrinking when you search',
      'Themes are now a beach-peach family (Peach, Coral, Apricot, Shell, Sand, Sunset, Seafoam, Lagoon, Bloom), each with its own glimmer — a soft shimmer on the + button and the theme tiles',
      'Pick any color and it derives a matching glimmer too',
      'Routine tasks auto-check as their time passes (unless you uncheck them), and once done they collapse into “First thing in the morning” / “Last of the evening” — tap to expand and undo one',
    ]
  },
  {
    date: '2026-07-28',
    summary: 'Recurring tasks send reminders now',
    changes: [
      'Timed recurring tasks fire notifications just like commitments and events — using your reminder lead times from Settings',
      'Each day\'s instance reminds independently, and a task you\'ve already checked off that day is skipped',
    ]
  },
  {
    date: '2026-07-28',
    summary: '178 new icons + smarter icon auto-pick',
    changes: [
      'Added 178 new line icons in the Structured style — food & drink, sport, health, nature & weather, travel, home, tech, money, hobbies, animals, symbols and time (240 total now)',
      'The auto-icon guess is smarter: richer keywords, common abbreviations (appt, mtg, dr, meds…), and a bias toward the most on-the-nose match',
    ]
  },
  {
    date: '2026-07-28',
    summary: 'Routine film fixes + saved colors + the "now" marker stays put',
    changes: [
      'Consecutive tasks in the same routine now share one continuous color film — the wash runs right through the gap between them instead of breaking into separate boxes',
      'Recurring tasks keep the icon and color you pick — they were being dropped on save before',
      'The "now" indicator no longer jumps onto an unfinished morning task at night: a task only counts as happening now while now is actually inside its time window',
      'Color & Icon picker: save custom colors to reuse, delete saved ones, and a Bloom-default swatch that matches your current theme',
    ]
  },
  {
    date: '2026-07-28',
    summary: 'Routine groups, a Bloom theme family, and one-color theming',
    changes: [
      'New routine groups: file recurring tasks under Morning / Night (or your own) routines — set from the same add/edit sheet, in its Repeat section',
      'Tasks in a routine get a soft color film behind them on the timeline (pink morning, blue night by default — every routine\'s color is yours to change)',
      'Recurring tab has a new Routines sub-tab that groups tasks by routine; add new routine groups, rename them, recolor their film, or delete them (deleting keeps the tasks, just un-grouped)',
      'Themes are now a Bloom family — Bloom, Blush, Lilac, Meadow, Sky, Apricot and the rest — plus a Custom color that derives every surface from one color you pick',
      'Settings no longer has a Routines section (routines live in the Recurring tab now), and opens on Look',
      'Icons are only auto-suggested when the title clearly implies one — no more confidently-wrong guesses on vague tasks',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Tap a recurring task to edit it like any other; whole spine blends colors',
    changes: [
      'Tapping a recurring task on the timeline now opens the exact same full editor as a normal task — pre-filled with its time, duration, category, note and repeat rule — instead of the stripped-down Manage sheet (that\'s still on the ⋯ button for per-day skip / reschedule)',
      'Calendar\'s recurring rows got an edit (✎) button that opens the same editor',
      'Every connector on the timeline — not just the dashed gaps — now blends from one task\'s color into the next, so the whole spine flows through your day\'s colors',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Connector line blends between task colors',
    changes: [
      'The dashed line in a gap now fades from the last task\'s color at the top into the next task\'s color at the bottom — so the spine visibly bridges the two',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Turn an existing task into a recurring one',
    changes: [
      'Editing any task now shows the Repeat section — pick Daily / Weekly / Monthly (with every-N interval, weekdays and an end date) to convert a one-off into a series right from the edit sheet',
      'When you convert, the original single task is removed so it isn\'t duplicated next to the new recurring one',
      'Works from Today, Calendar and the Inbox edit sheets',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Settings feels native + editing a recurring task uses the real add sheet',
    changes: [
      'Settings no longer closes from a lone ✕ up top — it now has a themed bottom selection bar (Look / Routines / Reminders / Categories / Notes / Edits) with a big "Done" button, matching the rest of the app',
      'The active section name shows in the Settings header so you always know where you are',
      'Editing a recurring task now opens the same add sheet as everywhere else, pre-filled with its time, duration, category, note, and full repeat rule (frequency, every-N interval, weekdays, end date) — no more stripped-down editor',
      'You can delete a recurring task from that same sheet via its ⋯ menu',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'The "now" line lands inside the task you\'re in',
    changes: [
      'When a task is in progress, the current-time dot now sits inside that task\'s pill at the right point — instead of floating in the gap after it',
      'Day progress reads off the vertical spine: the pill fills like a gradient as time passes, with the current time on its right; the old full-width line is gone',
      'When nothing is running, a small dot + time still marks now in the gap',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Pills scale with duration + one add sheet for recurring tasks',
    changes: [
      'Timeline pills now grow with a task\'s duration — a 30-min task is clearly shorter than a 1-hour one (they were all clamped to the same size before)',
      'Recurring tasks can carry a duration too, so their pills scale as well',
      'The Recurring tab\'s “New Task” now opens the exact same add sheet as the rest of the app, straight into its Repeat section — so adding is identical from Today, Week, Calendar or the Recurring page',
      'Daily and monthly recurring tasks no longer hide under the weekday filter, and show a DAILY / MONTHLY chip',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Prettier day-progress bar; bigger pills; keep the done-fade',
    changes: [
      'Redesigned the day-progress bar: a taller rounded track, a soft green gradient fill, a "% through today" label, and a ringed handle that rides along the day',
      'Timeline pills are bigger with larger icons, and auto-suggest an icon from the title so a pill almost never shows a bare letter',
      'Completed tasks still fade out (kept as-is by request)',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'The + button follows your theme color',
    changes: [
      'The Today + button now uses your chosen accent theme (Settings → Look → App Icon) instead of a fixed dark, so it changes with your mood',
      'Its "+" auto-switches to dark or light so it stays readable on any accent',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Check subtasks off right on the Today timeline',
    changes: [
      'Tap a task\'s ☑ 1/1 pill to expand its subtasks and check them off in place — no need to open the task',
      'Ticking the last one auto-completes the parent, same as in the editor; all synced to the cloud',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Timeline detail polish to match Structured',
    changes: [
      'The progress fill now lives only on the Today timeline pill (and the task sheet), not as bars on the Week and Calendar rows',
      'The pill fill adapts to the task color — a light overlay on dark colors, a dark overlay on light ones — so it always reads',
      'Timeline times match Structured: "7:50 – 8:11 AM (21 min)" with the meridiem shown once, and a ↻ icon marks recurring tasks',
      'Subtask counts show as a ☑ 1/1 pill; the done-check and pill icons stay legible on any task color',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Smarter icon suggestions + readable icons on any color',
    changes: [
      'The auto-suggested task icon is much better: far richer keywords, plural/verb-aware matching (e.g. "budgeting"→money, "meetings"→calendar), and new bus, car and wifi glyphs',
      'Icons and header text now pick dark-on-light or light-on-dark automatically, so they stay legible whatever task color you choose — across the timeline, the task sheet, Focus mode, the calendar bands and the icon picker',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Progress highlight tracks both subtasks done and time elapsed',
    changes: [
      'A task now highlights by how far along it is — the fill reflects the share of its subtasks that are checked off as well as time elapsed, whichever is further',
      'Subtask progress shows any time (not only while the event is happening), across the Today timeline, Week rows, Calendar day detail, and the task editor',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Progress shade on Week & Calendar + consistent Add button',
    changes: [
      'The "happening now" elapsed shade now also fills the Week rows and the Calendar day detail, with an "Xm left" label — matching the Today timeline',
      'The + button on Today now opens the same add sheet as the Calendar\'s: the date is pre-filled to the day you\'re on but is editable, instead of being locked',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Live "happening now" progress shade + Focus Now timer',
    changes: [
      'A task that\'s happening right now fills up: the timeline pill shades from the bottom as it elapses, and its editor shows "Xm remaining" with a matching shade on the icon',
      'Focus Now — a full-screen focus timer with a draining ring and live countdown, launchable from the current task on Today or from its editor',
      'From Focus you can mark the task done or exit back',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Full repeat rules (daily/weekly/monthly + every-N) & streak summary',
    changes: [
      'Repeat now offers Once, Daily, Weekly and Monthly — with an “every N days/weeks/months” interval stepper',
      'Weekly repeats keep the weekday picker; Monthly repeats on the start date’s day each month',
      'Add an optional end date to any repeat, or leave it to repeat indefinitely',
      'Today, Week and Calendar honor all of these when placing recurring instances',
      'Settings → Look adds Summary Display: the week strip shows category dots, or a streak flame on days you fully completed',
      'Repeat rules ride in a synced side-store, so no database changes are needed',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Task menu (Duplicate / Move to Inbox / Delete) + more Look options',
    changes: [
      'Editing a task now has a ⋯ menu in the top corner: Duplicate it, Move to Inbox (unschedule — strips its date/time so it returns to Commitments), or Delete',
      'Available wherever you open a task’s editor — Today, the Calendar, and Commitments',
      'Settings → Look adds a Layout control: Full, Simplified (hides routine cards) or Minimal (also hides the free-time gaps on the timeline)',
      'Settings → Look adds an In-App Sound toggle to silence Bloom’s reminder chimes and sound previews',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'Customization — reading font + accent themes (Settings → Look)',
    changes: [
      'New Look tab in Settings: choose a font and an accent theme, Structured-style',
      'Font: switch the whole app to OpenDyslexic (a dyslexia-friendly typeface) or back to the System font',
      'App Icon themes: Bloom, Day, Night, Nature, Classic, Pride, Trans, Ocean and Amber — each recolors Bloom\'s accent everywhere at once',
      'Your choices are remembered on the device and applied before the app paints, so there\'s no flash of the old look on load',
    ]
  },
  {
    date: '2026-07-27',
    summary: 'One unified scheduling system across Today, Week & Calendar',
    changes: [
      'Today, Week and the Calendar month view now read the exact same schedule — a day\'s items are its commitments plus its active recurring instances — so the three screens can no longer disagree',
      'Recurring tasks finally show on the Calendar month view (and in each day\'s detail), matching what Today and Week already showed',
      'Add a recurring task from anywhere: the add sheet on Today, Week and Calendar has a new Repeat option (pick the weekdays) that creates a recurring task instead of a one-off',
      'Recurring tasks are still fully viewable and editable in the Recurring tab',
      'Skip or delete a single recurring occurrence from Today, Week or Calendar and it hides on all three — skips are now stored in one cloud-synced place instead of per-device, per-view lists',
      'Manage a recurring item on Today to either skip just that day or delete the whole series',
    ]
  },
  {
    date: '2026-07-22',
    summary: 'Per-row cloud storage, custom categories, tab cleanup',
    changes: [
      'Fixed the recurring "deleted item comes back after refresh" bug at the root — every collection (commitments, vacations, recurring tasks, done-state, log) now lives in its own database table with one row per item, so deletes/edits are atomic and can no longer be clobbered by a competing save from another tab or device',
      'Automatic one-time migration moves existing data into the new tables; nothing lost, no manual data entry',
      'Custom categories — add / rename / recolor / delete your own task categories in Settings → Categories; used everywhere you pick a category (commitments + recurring tasks)',
      'Removed the Log and Info tabs; Notes moved into Settings',
      'Reloading now returns you to the tab you were on instead of jumping to Today',
    ]
  },
  {
    date: '2026-04-09',
    summary: 'UX overhaul — Today timeline, Log analytics, nav restructure',
    changes: [
      'Today: live timeline with "you are here" marker at current time, tasks sorted overdue → now → upcoming → done',
      'Today: current active task highlighted green, overdue float to top with red border',
      'Today: location badge extracted from task text (e.g. Youngchild 316), day progress bar',
      'Log: analytics dashboard — streak, avg/day, best day, category breakdown bars, 35-day heatmap',
      'Log: day-of-week completions chart, tag filter on history view',
      'Log + Notes merged into one tab with Stats / History / Notes sub-views',
      'Nav: 11 tabs → 7 tabs — Routines/Scheduler/Recurring/Edits moved to Settings drawer',
      'Settings drawer: slide-in panel (⚙️) with Recurring Tasks, Scheduler, Edits sections',
    ]
  },
  {
    date: '2026-04-09',
    summary: 'Recurring Tasks manager + date-scoped toggle state',
    changes: [
      'New Recurring tab — view, add, edit, delete recurring tasks per day of week',
      'Separate panels for Week Panel tasks (brief summaries) and Today Schedule items (hourly)',
      'Changes save to cloud immediately; Reset to defaults button to restore originals',
      'Task done-state now scoped by date (2026-04-09_thu-lab) — no more cross-week bleed',
      'WEEK_PLAN is now dynamic (today → today+6) — week view never goes blank again',
      'getDailyTodos now accepts live override from DB instead of only reading schedule.js',
    ]
  },
  {
    date: '2026-03-30',
    summary: 'Initial hub created (HTML file)',
    changes: [
      'Built morning, night, weekly, monthly, calendar tabs',
      'Added Coral Reef BIOL 505 deadlines to calendar',
      'Added Capstone BIOL 651 week-by-week schedule',
      'Added today checklist with localStorage persistence',
    ]
  },
  {
    date: '2026-03-31',
    summary: 'Major HTML restructure + new features',
    changes: [
      'Added This Week tab with carry-forward logic',
      'Added auto-log on task completion',
      'Fixed calendar to scroll on mobile',
      'Added Notes tab, Edits tab, Info tab, Study tab',
      'Added Export/Import state buttons',
      'Fixed duplicate function definitions that broke the app',
      'Added self-instruction comment block',
      'Added Sheppard chapter labels to all readings',
    ]
  },
  {
    date: '2026-03-31',
    summary: 'Migrated to React + Vite app with Supabase',
    changes: [
      'Full rebuild as proper React app — no more single HTML file',
      'Data separated into schedule.js and flashcards.js — Claude only edits these files for updates',
      'Supabase integration for persistent cloud storage — progress never disappears',
      'Falls back to localStorage automatically if Supabase not configured',
      'Smart Scheduler tab — type a task + duration, app finds best open windows',
      'Flashcard modal — full flip-card experience with learned/unlearned tracking',
      'Study progress persists in cloud — last studied date + learned count per set',
      'GitHub Actions auto-deploy — every push to main deploys to GitHub Pages',
      'Today tab auto-detects date — no more hardcoded dates',
      'This Week auto-highlights current day based on real date',
      'Carry-forward only applies to carry:true tasks, only to next day',
      '35 coral reef ID flashcards added to BIOL 505 Week 1',
    ]
  },
]

export default function Edits() {
  return (
    <div>
      <div className="page-title">Edits Log</div>
      <div className="page-sub">Every change Claude makes is documented here</div>

      {[...EDIT_LOG].reverse().map((entry, i) => (
        <div key={i} className="edit-entry">
          <div className="edit-header">
            <span className="serif" style={{ fontSize:16, color:'var(--green-light)', fontWeight:600 }}>{entry.summary}</span>
            <span style={{ fontSize:11, color:'var(--green-mid)', letterSpacing:1 }}>{entry.date}</span>
          </div>
          <div style={{ padding:'10px 18px 14px' }}>
            {entry.changes.map((c, j) => (
              <div key={j} className="edit-change">
                <span style={{ color:'#52B788', flexShrink:0 }}>✓</span>
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
