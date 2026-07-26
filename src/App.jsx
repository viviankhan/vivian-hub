import { useState, useEffect, useCallback } from 'react'
import {
  isUsingSupabase,
  getCompletions, setCompletion,
  getLogEntries, addLogEntry, deleteLogEntry,
  getNotes, setNotes, getFcProgress, setFcProgress, getFcStudied, setFcStudied,
  getScheduledTasks, setScheduledTasks,
  getCommitmentMeta, setCommitmentMeta,
  getCommitments, addCommitment as dbAddCommitment, updateCommitment as dbUpdateCommitment, deleteCommitment as dbDeleteCommitment,
  getVacations, addVacation as dbAddVacation, deleteVacation as dbDeleteVacation,
  getEvents, addEvent as dbAddEvent, deleteEvent as dbDeleteEvent,
  getRecurringTasks, addRecurringTask, updateRecurringTask, deleteRecurringTask, clearRecurringTasks,
  addCategory as dbAddCategory, updateCategory as dbUpdateCategory, deleteCategory as dbDeleteCategory,
} from './lib/storage.js'
import { runMigrationIfNeeded, seedCategoriesIfNeeded } from './lib/migrate.js'
import { DEFAULT_RECURRING_TASKS, DEFAULT_DAILY_TODOS, buildWeekPlanFromTasks } from './data/schedule.js'

import Today       from './components/Today.jsx'
import ThisWeek    from './components/ThisWeek.jsx'
import Commitments from './components/Commitments.jsx'
import Calendar    from './components/Calendar.jsx'
import Notes       from './components/Notes.jsx'
import Edits       from './components/Edits.jsx'
import RecurringTasksManager, { flatToPerDay } from './components/RecurringTasksManager.jsx'
import Routines from './components/Routines.jsx'
import CategoriesManager from './components/CategoriesManager.jsx'
import EventsManager from './components/EventsManager.jsx'
import ThoughtsBoard from './components/ThoughtsBoard.jsx'
import NotificationsSettings from './components/NotificationsSettings.jsx'
import SearchOverlay, { SearchIcon } from './components/SearchOverlay.jsx'
import { registerServiceWorker, syncReminders } from './lib/notifications.js'

const TABS = [
  { id:'today',       label:'Today',       icon:'☀️' },
  { id:'week',        label:'Week',        icon:'🗓️' },
  { id:'commitments', label:'Commitments', icon:'🎯' },
  { id:'calendar',    label:'Calendar',    icon:'📅' },
  { id:'thoughts',    label:'Thoughts',    icon:'💭' },
  { id:'events',      label:'Events',      icon:'🎈' },
  { id:'recurring',   label:'Recurring',   icon:'🔁' },
]
// The four primary destinations pinned to the mobile bottom bar; everything
// else (plus these) lives in the slide-out side menu behind "More".
const BOTTOM_TABS = ['today', 'week', 'commitments', 'calendar']

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
// ── Settings Drawer ────────────────────────────────────────────
function SettingsDrawer({ open, onClose, settingsTab, setSettingsTab, notes, updateNotes, categories, addCategory, updateCategory, deleteCategory, events, commitments }) {
  if (!open) return null
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:400 }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:Math.min(520, window.innerWidth), background:'var(--cream)', zIndex:500, overflowY:'auto', boxShadow:'-8px 0 40px rgba(0,0,0,.2)' }}>
        <div style={{ background:'var(--forest)', padding:'max(18px, calc(env(safe-area-inset-top) + 12px)) 18px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:10 }}>
          <div className="serif" style={{ color:'var(--green-light)', fontSize:20, fontWeight:600 }}>⚙️ Settings</div>
          <button onClick={onClose} aria-label="Close settings" style={{ background:'rgba(255,255,255,.18)', border:'none', color:'var(--green-light)', borderRadius:10, width:40, height:40, flexShrink:0, cursor:'pointer', fontSize:18, fontFamily:'DM Sans,sans-serif', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'white' }}>
          {[['routines','Routines'],['reminders','Reminders'],['categories','Categories'],['notes','Notes'],['edits','Edits']].map(([id,label]) => (
            <button key={id} onClick={()=>setSettingsTab(id)}
              style={{ flex:1, padding:'11px 6px', border:'none', borderBottom:`2px solid ${settingsTab===id?'var(--teal)':'transparent'}`,
                background:'transparent', color:settingsTab===id?'var(--teal)':'var(--muted)', cursor:'pointer',
                fontFamily:'DM Sans,sans-serif', fontSize:10, fontWeight:600, letterSpacing:.5, textTransform:'uppercase', transition:'all .2s' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ padding:'20px 24px' }}>
          {settingsTab==='routines'   && <Routines />}
          {settingsTab==='reminders'  && <NotificationsSettings events={events} commitments={commitments} />}
          {settingsTab==='categories' && <CategoriesManager categories={categories} addCategory={addCategory} updateCategory={updateCategory} deleteCategory={deleteCategory} />}
          {settingsTab==='notes'      && <Notes notes={notes} updateNotes={updateNotes} />}
          {settingsTab==='edits'      && <Edits />}
        </div>
      </div>
    </>
  )
}

// A simple 3-line "menu" icon for the mobile header hamburger.
function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="7"  x2="20" y2="7"  />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  )
}

// ── Mobile side-nav drawer ─────────────────────────────────────
// Slides in from the left on phones. Full section list as rounded rows with
// icons; the active section is highlighted. Always rendered so it can animate;
// the `.open` class drives the slide + scrim fade, and it's display:none on
// desktop (where the horizontal tab bar is used instead).
function MobileNav({ open, onClose, tab, setTab, onOpenSettings }) {
  const go = (id) => { setTab(id); onClose() }
  return (
    <>
      <div className={`mobile-nav-scrim ${open ? 'open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`mobile-nav ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="mobile-nav-head">
          <div className="serif mobile-nav-brand">Bloom</div>
          <button className="mobile-nav-close" onClick={onClose} aria-label="Close menu">✕</button>
        </div>
        <nav className="mobile-nav-list">
          {TABS.map(t => (
            <button key={t.id} className={`mobile-nav-item ${tab===t.id ? 'active' : ''}`} onClick={() => go(t.id)}>
              <span className="mobile-nav-icon">{t.icon}</span>
              <span className="mobile-nav-label">{t.label}</span>
              {tab===t.id && <span className="mobile-nav-active-dot" aria-hidden="true" />}
            </button>
          ))}
        </nav>
        <button className="mobile-nav-settings" onClick={() => { onClose(); onOpenSettings() }}>
          <span className="mobile-nav-icon">⚙️</span>
          <span className="mobile-nav-label">Settings</span>
        </button>
      </aside>
    </>
  )
}

export default function App() {
  // Remember the last tab you were on across reloads — purely a local UI
  // preference, not synced data, so plain localStorage is enough.
  const [tab, setTab] = useState(() => {
    try {
      const saved = localStorage.getItem('vivian_last_tab')
      return TABS.some(t => t.id === saved) ? saved : 'today'
    } catch { return 'today' }
  })
  useEffect(() => {
    try { localStorage.setItem('vivian_last_tab', tab) } catch {}
  }, [tab])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab,  setSettingsTab]  = useState('routines')
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [navOpen,      setNavOpen]      = useState(false)  // mobile side-nav drawer
  // Set when a search suggestion is picked → Calendar navigates to this date.
  // The nonce lets re-picking the same date re-trigger the jump.
  const [jumpTo,       setJumpTo]       = useState(null)

  // "completions" replaces the old separate todos/weekState blobs — every
  // consumer already reads todos[k] || weekState[k], which were confirmed to
  // always hold the identical value, so both props below point at this one
  // object rather than keeping two copies in sync.
  const [completions,     setCompletions_]     = useState({})
  const [log,              setLog_]             = useState([])
  const [notes,            setNotes_]           = useState('')
  const [fcProgress,       setFcProgress_]      = useState({})
  const [fcStudied,        setFcStudied_]       = useState({})
  const [scheduled,        setScheduled_]       = useState([])
  const [commitments,      setCommitments_]     = useState([])
  const [commitmentMeta,   setCommitmentMeta_]  = useState({})
  const [recurringTaskRows,setRecurringTaskRows]= useState([])
  const [vacations,        setVacations_]       = useState([])
  const [events,           setEvents_]          = useState([])
  const [categories,       setCategories_]      = useState([])
  const [loading,          setLoading]          = useState(true)

  useEffect(() => {
    async function load() {
      await runMigrationIfNeeded()
      const [comp, l, n, fcp, fcs, sch, com, rt, vac, evs, cats, cmeta] = await Promise.all([
        getCompletions(), getLogEntries(), getNotes(),
        getFcProgress(), getFcStudied(), getScheduledTasks(),
        getCommitments(), getRecurringTasks(), getVacations(), getEvents(),
        seedCategoriesIfNeeded(), getCommitmentMeta(),
      ])
      setCompletions_(comp); setLog_(l); setNotes_(n)
      setFcProgress_(fcp); setFcStudied_(fcs); setScheduled_(sch)
      setCommitments_(com); setRecurringTaskRows(rt); setVacations_(vac); setEvents_(evs)
      setCategories_(cats); setCommitmentMeta_(cmeta)
      setLoading(false)
    }
    load()
  }, [])

  // ── Reminders / PWA ──────────────────────────────────────────
  // Register the service worker once (enables installability + lets reminders
  // show even when the tab is backgrounded).
  useEffect(() => { registerServiceWorker() }, [])

  // Recompute reminders whenever the data that drives them changes, and again
  // each time the app is brought back to the foreground (so it "catches up" on
  // anything that came due while it was closed). No-ops unless the user has
  // turned reminders on in Settings.
  useEffect(() => {
    if (loading) return
    syncReminders(events, commitments)
    const onVis = () => { if (!document.hidden) syncReminders(events, commitments) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [loading, events, commitments])

  // ── Derived schedule ─────────────────────────────────────────
  // recurring_tasks is now a real table (one row per task) — always the flat
  // format, so this just wraps the rows the way flatToPerDay expects. An
  // empty table (nothing ever added, or everything cleared) means an empty
  // schedule either way, consistent with how "Clear all recurring events"
  // already worked — no defaults resurrecting themselves.
  const recurringTasksWrapped = { tasks: recurringTaskRows }
  const perDay = flatToPerDay(recurringTasksWrapped, todayStr())
  const activeWeekTasks  = perDay?.weekTasks  ?? DEFAULT_RECURRING_TASKS
  const activeDailyTodos = perDay?.dailyTodos ?? DEFAULT_DAILY_TODOS
  const weekPlan = buildWeekPlanFromTasks(activeWeekTasks)

  // ── Persist helpers ──────────────────────────────────────────
  // Cloud write failures are surfaced instead of swallowed — otherwise a delete
  // looks like it worked (local state updates) but silently reverts on next load.
  // (In-flight kv_store writes are tracked centrally in storage.js's dbSet,
  // which warns before the tab closes/reloads while a save is still pending.)
  const reportSaveError = err => { console.error(err); alert(`⚠️ ${err.message || err}\n\nThis change was NOT saved to the cloud and may revert. Check your connection and try again.`) }

  const updateNotes      = useCallback(async v => { setNotes_(v);      try { await setNotes(v) }      catch (e) { reportSaveError(e) } }, [])
  const updateFcProgress = useCallback(async v => { setFcProgress_(v); try { await setFcProgress(v) } catch (e) { reportSaveError(e) } }, [])
  const updateFcStudied  = useCallback(async v => { setFcStudied_(v);  try { await setFcStudied(v) }  catch (e) { reportSaveError(e) } }, [])

  const appendLog = useCallback(async entry => {
    const newEntry = { ...entry, ts: new Date().toISOString() }
    setLog_(prev => [...prev, newEntry])
    try { await addLogEntry(newEntry) } catch (e) { reportSaveError(e) }
  }, [])

  // ── Recurring tasks CRUD (real per-row table) ────────────────
  const addRecurringTaskFn = useCallback(async task => {
    try {
      const created = await addRecurringTask(task)
      setRecurringTaskRows(prev => [...prev, created])
    } catch (e) { reportSaveError(e) }
  }, [])
  const updateRecurringTaskFn = useCallback(async (id, task) => {
    try {
      const updated = await updateRecurringTask(id, task)
      setRecurringTaskRows(prev => prev.map(t => t.id===id ? updated : t))
    } catch (e) { reportSaveError(e) }
  }, [])
  const deleteRecurringTaskFn = useCallback(async id => {
    setRecurringTaskRows(prev => prev.filter(t => t.id !== id))
    try { await deleteRecurringTask(id) } catch (e) { reportSaveError(e) }
  }, [])
  const clearRecurringTasksFn = useCallback(async () => {
    setRecurringTaskRows([])
    try { await clearRecurringTasks() } catch (e) { reportSaveError(e) }
  }, [])

  // ── Categories CRUD (shared, real per-row table) ─────────────
  const addCategoryFn = useCallback(async cat => {
    try {
      const created = await dbAddCategory(cat)
      setCategories_(prev => [...prev, created])
    } catch (e) { reportSaveError(e) }
  }, [])
  const updateCategoryFn = useCallback(async (id, changes) => {
    try {
      const updated = await dbUpdateCategory(id, changes)
      setCategories_(prev => prev.map(c => c.id===id ? updated : c))
    } catch (e) { reportSaveError(e) }
  }, [])
  const deleteCategoryFn = useCallback(async id => {
    setCategories_(prev => prev.filter(c => c.id !== id))
    try { await dbDeleteCategory(id) } catch (e) { reportSaveError(e) }
  }, [])

  const addScheduledTask = useCallback(async task => {
    setScheduled_(prev => { const next = [...prev, task]; setScheduledTasks(next); return next })
  }, [])

  // ── Commitments CRUD — each is one atomic row operation now, never a
  // whole-array overwrite, so two edits in flight at once can't clobber
  // each other the way they used to. ──────────────────────────
  // description + subtasks live in the kv_store meta blob (no commitments-table
  // columns), so they're split off from the core row write here.
  // Extra category labels beyond the primary live in the meta blob too (the
  // commitments table has a single `cat` column). Only stored when there's more
  // than one — a single label is fully covered by the `cat` column.
  const addCommitment = useCallback(async c => {
    const { description, subtasks, cats, color, ...core } = c
    try {
      const created = await dbAddCommitment(core)
      setCommitments_(prev => [created, ...prev])
      const hasCats = Array.isArray(cats) && cats.length > 1
      const extra = { ...(hasCats ? { cats } : {}), ...(color ? { color } : {}) }
      if ((description && description.trim()) || (subtasks && subtasks.length) || hasCats || color) {
        setCommitmentMeta_(prev => {
          const next = { ...prev, [created.id]: { description: description || '', subtasks: subtasks || [], ...extra } }
          setCommitmentMeta(next).catch(reportSaveError)
          return next
        })
      }
    } catch (e) { reportSaveError(e) }
  }, [])
  const updateCommitment = useCallback(async (id, changes) => {
    const { description, subtasks, cats, color, ...core } = changes
    try {
      if (Object.keys(core).length) {
        const updated = await dbUpdateCommitment(id, core)
        setCommitments_(prev => prev.map(c => c.id===id ? updated : c))
      }
      if (description !== undefined || subtasks !== undefined || cats !== undefined || color !== undefined) {
        setCommitmentMeta_(prev => {
          const merged = { ...(prev[id] || {}) }
          if (description !== undefined) merged.description = description
          if (subtasks !== undefined) merged.subtasks = subtasks
          if (cats !== undefined) {
            if (Array.isArray(cats) && cats.length > 1) merged.cats = cats
            else delete merged.cats
          }
          if (color !== undefined) {
            if (color) merged.color = color
            else delete merged.color
          }
          const next = { ...prev, [id]: merged }
          setCommitmentMeta(next).catch(reportSaveError)
          return next
        })
      }
      // Auto-complete the parent when all its subtasks are checked (and
      // un-complete it if one gets unchecked). Only kicks in when the item
      // actually has subtasks — a plain task is never forced done.
      if (Array.isArray(subtasks) && subtasks.length > 0) {
        const allDone = subtasks.every(s => s.done)
        setCommitments_(prev => {
          const cur = prev.find(x => x.id === id)
          if (!cur || !!cur.done === allDone) return prev
          dbUpdateCommitment(id, { done: allDone }).catch(reportSaveError)
          setCompletions_(cp => { const n = { ...cp, [id]: allDone }; setCompletion(id, allDone).catch(reportSaveError); return n })
          return prev.map(x => x.id === id ? { ...x, done: allDone } : x)
        })
      }
    } catch (e) { reportSaveError(e) }
  }, [])
  const deleteCommitment = useCallback(async id => {
    setCommitments_(prev => prev.filter(c => c.id !== id))
    setCompletions_(prev => { const n = {...prev}; delete n[id]; return n })
    setCommitmentMeta_(prev => {
      if (!(id in prev)) return prev
      const n = { ...prev }; delete n[id]
      setCommitmentMeta(n).catch(reportSaveError)
      return n
    })
    try { await Promise.all([dbDeleteCommitment(id), setCompletion(id, false)]) }
    catch (e) { reportSaveError(e) }
  }, [])

  // ── Vacations CRUD ──────────────────────────────────────────
  const addVacation = useCallback(async v => {
    try {
      const created = await dbAddVacation(v)
      setVacations_(prev => [...prev, created])
    } catch (e) { reportSaveError(e) }
  }, [])
  const deleteVacation = useCallback(async id => {
    setVacations_(prev => prev.filter(v => v.id !== id))
    try { await dbDeleteVacation(id) } catch (e) { reportSaveError(e) }
  }, [])

  // ── Events CRUD (multi-day spans, non-blocking) ─────────────
  const addEvent = useCallback(async e => {
    try {
      const created = await dbAddEvent(e)
      setEvents_(prev => [...prev, created])
    } catch (err) { reportSaveError(err) }
  }, [])
  const deleteEvent = useCallback(async id => {
    setEvents_(prev => prev.filter(e => e.id !== id))
    try { await dbDeleteEvent(id) } catch (e) { reportSaveError(e) }
  }, [])

  // ── Unified toggle ───────────────────────────────────────────
  const syncToggle = useCallback(async (id, label, tag, date) => {
    const storageKey = date ? `${date}_${id}` : id
    const isCommitment = commitments.some(c => c.id===id)
    const currentDone = isCommitment
      ? commitments.find(c => c.id===id)?.done
      : !!completions[storageKey]
    const nowDone = !currentDone

    if (isCommitment) {
      setCommitments_(prev => prev.map(c => c.id===id ? {...c, done:nowDone} : c))
      dbUpdateCommitment(id, { done: nowDone }).catch(reportSaveError)
    }
    const nextCompletions = { ...completions, [storageKey]: nowDone }
    setCompletions_(nextCompletions)
    try {
      await setCompletion(storageKey, nowDone)
    } catch (e) { reportSaveError(e) }

    if (nowDone) {
      // Add log entry on check
      const d = new Date()
      const dateKey   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      const dateLabel = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
      const entry = { date:dateKey, dateLabel, label, tag, ts:d.toISOString(), storageKey }
      setLog_(prev => [...prev, entry])
      addLogEntry(entry).catch(reportSaveError)
    } else {
      // Remove log entry on uncheck — match by label + storageKey
      setLog_(prev => {
        const next = prev.filter(e => !(e.label === label && e.storageKey === storageKey))
        // Also try matching just by label (older entries may not have storageKey)
        const next2 = next.length < prev.length ? next : prev.filter((e, i) => {
          if (e.label !== label) return true
          // Remove only the most recent matching entry
          const laterIdx = prev.findIndex((e2, i2) => i2 > i && e2.label === label)
          return laterIdx !== -1
        })
        return next2
      })
      deleteLogEntry(label, storageKey).catch(reportSaveError)
    }
  }, [completions, commitments])

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#FAFAF7', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'Cormorant Garamond, serif', fontSize:28, color:'#1C2B1A', marginBottom:8 }}>Loading…</div>
        <div style={{ fontSize:12, color:'#9B8E7E' }}>{isUsingSupabase ? 'Connecting to cloud storage' : 'Using local storage'}</div>
      </div>
    </div>
  )

  // Commitments as the UI sees them: core rows merged with their description +
  // subtasks from the meta blob. Internal logic (syncToggle, reminders) keeps
  // using the raw `commitments` state; only children get this enriched view.
  const commitmentsView = commitments.map(c => ({
    ...c,
    description: commitmentMeta[c.id]?.description ?? '',
    subtasks: commitmentMeta[c.id]?.subtasks ?? [],
    cats: commitmentMeta[c.id]?.cats ?? (c.cat ? [c.cat] : []),
    color: commitmentMeta[c.id]?.color ?? null,
  }))

  const sharedProps = {
    // Every consumer reads todos[k] || weekState[k] — both point at the same
    // completions object rather than keeping two copies in sync.
    todos: completions, weekState: completions, syncToggle,
    log, appendLog, notes, updateNotes,
    fcProgress, updateFcProgress, fcStudied, updateFcStudied,
    scheduled, addScheduledTask,
    commitments: commitmentsView, addCommitment, updateCommitment, deleteCommitment,
    vacations, addVacation, deleteVacation,
    events, addEvent, deleteEvent,
    categories,
  }

  return (
    <div>
      <div className="shimmer-bg" aria-hidden="true" />
      <header className="header">
        <div className="header-top">
          <div className="header-left">
            <button className="hamburger-btn" onClick={() => setNavOpen(true)}
              title="Menu" aria-label="Open menu">
              <MenuIcon />
            </button>
            <h1 className="header-title">Bloom</h1>
          </div>
          <div className="header-actions">
            <span className={`storage-badge ${isUsingSupabase ? 'cloud' : 'local'}`}>
              {isUsingSupabase ? 'Cloud sync on' : 'Local storage'}
            </span>
            <button className="icon-btn" onClick={() => setSearchOpen(true)}
              title="Search" aria-label="Search">
              <SearchIcon />
            </button>
            <button className="icon-btn" onClick={() => setSettingsOpen(true)}
              title="Settings" aria-label="Settings" style={{ fontSize:17 }}>
              ⚙️
            </button>
          </div>
        </div>
        <nav className="nav">
          {TABS.map(t => (
            <button key={t.id} className={`nav-btn ${tab===t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {tab==='today'       && <Today       {...sharedProps} appendLog={appendLog} weekPlan={weekPlan} dailyTodos={activeDailyTodos} scheduled={scheduled} deleteCommitment={deleteCommitment} />}
        {tab==='week'        && <ThisWeek    {...sharedProps} weekTasks={activeWeekTasks} deleteCommitment={deleteCommitment} />}
        {tab==='commitments' && <Commitments {...sharedProps} />}
        {tab==='calendar'    && <Calendar    {...sharedProps} jumpTo={jumpTo} />}
        {tab==='thoughts'    && <ThoughtsBoard addCommitment={addCommitment} categories={categories} />}
        {tab==='events'      && <EventsManager events={events} addEvent={addEvent} deleteEvent={deleteEvent}
          vacations={vacations} addVacation={addVacation} deleteVacation={deleteVacation} />}
        {tab==='recurring'   && <RecurringTasksManager recurringTasks={recurringTasksWrapped}
          addRecurringTask={addRecurringTaskFn} updateRecurringTask={updateRecurringTaskFn}
          deleteRecurringTask={deleteRecurringTaskFn} clearRecurringTasks={clearRecurringTasksFn}
          categories={categories}
          defaultWeekTasks={DEFAULT_RECURRING_TASKS} defaultDailyTodos={DEFAULT_DAILY_TODOS} />}
      </main>

      <SettingsDrawer
        open={settingsOpen} onClose={() => setSettingsOpen(false)}
        settingsTab={settingsTab} setSettingsTab={setSettingsTab}
        notes={notes} updateNotes={updateNotes}
        categories={categories} addCategory={addCategoryFn}
        updateCategory={updateCategoryFn} deleteCategory={deleteCategoryFn}
        events={events} commitments={commitments} />

      <SearchOverlay
        open={searchOpen} onClose={() => setSearchOpen(false)}
        commitments={commitments} events={events} log={log}
        onJump={date => { setTab('calendar'); setJumpTo({ date, nonce: Date.now() }) }} />

      {/* Mobile side-nav drawer (phones only; CSS hides it on desktop) */}
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)}
        tab={tab} setTab={setTab} onOpenSettings={() => setSettingsOpen(true)} />

      {/* Mobile bottom tab bar (phones only) */}
      <nav className="bottom-nav">
        {BOTTOM_TABS.map(id => {
          const t = TABS.find(x => x.id === id)
          return (
            <button key={id} className={`bottom-nav-btn ${tab===id ? 'active' : ''}`} onClick={() => setTab(id)}>
              <span className="bottom-nav-icon">{t.icon}</span>
              <span className="bottom-nav-label">{t.label}</span>
            </button>
          )
        })}
        <button className={`bottom-nav-btn ${navOpen ? 'active' : ''}`} onClick={() => setNavOpen(true)}>
          <span className="bottom-nav-icon">☰</span>
          <span className="bottom-nav-label">More</span>
        </button>
      </nav>
    </div>
  )
}
