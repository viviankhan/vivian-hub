// src/components/Edits.jsx
// Claude adds a new entry here every session where changes are made.
// Format: { date, summary, changes: [] }

const EDIT_LOG = [
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
