// src/components/Edits.jsx
// Claude adds a new entry here every session where changes are made.
// Format: { date, summary, changes: [] }

const EDIT_LOG = [
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
