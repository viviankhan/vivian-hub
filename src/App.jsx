import { useState, useEffect, useCallback } from 'react'
import {
  isUsingSupabase,
  getCompletions, setCompletion,
  getLogEntries, addLogEntry, deleteLogEntry,
  getNotes, setNotes, getFcProgress, setFcProgress, getFcStudied, setFcStudied,
  getScheduledTasks, setScheduledTasks,
  getCommitments, addCommitment as dbAddCommitment, updateCommitment as dbUpdateCommitment, deleteCommitment as dbDeleteCommitment,
  getVacations, addVacation as dbAddVacation, deleteVacation as dbDeleteVacation,
  getRecurringTasks, addRecurringTask, updateRecurringTask, deleteRecurringTask, clearRecurringTasks,
  addCategory as dbAddCategory, updateCategory as dbUpdateCategory, deleteCategory as dbDeleteCategory,
} from './lib/storage.js'
import { runMigrationIfNeeded, seedCategoriesIfNeeded } from './lib/migrate.js'
import { FIXED_BLOCKS, DEFAULT_RECURRING_TASKS, DEFAULT_DAILY_TODOS, buildWeekPlanFromTasks } from './data/schedule.js'

import Today       from './components/Today.jsx'
import ThisWeek    from './components/ThisWeek.jsx'
import Commitments from './components/Commitments.jsx'
import Calendar    from './components/Calendar.jsx'
import Notes       from './components/Notes.jsx'
import Edits       from './components/Edits.jsx'
import RecurringTasksManager, { flatToPerDay } from './components/RecurringTasksManager.jsx'
import Routines from './components/Routines.jsx'
import CategoriesManager from './components/CategoriesManager.jsx'

const TABS = [
  { id:'today',       label:'Today'       },
  { id:'week',        label:'Week'        },
  { id:'commitments', label:'Commitments' },
  { id:'calendar',    label:'Calendar'    },
  { id:'recurring',   label:'Recurring'   },
]

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function checkOverlap(date, time, prepMin, fixedBlocks) {
  if (!date || !time) return null
  const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date+'T12:00:00').getDay()]
  const blocks = fixedBlocks[dayName] || []
  const [h, m] = time.split(':').map(Number)
  const startMin = h*60+m, prepStart = prepMin ? startMin-prepMin : startMin, endMin = startMin+60
  for (const block of blocks) {
    const [bh,bm]=block.start.split(':').map(Number), [eh,em]=block.end.split(':').map(Number)
    if (prepStart < eh*60+em && endMin > bh*60+bm) return block.label
  }
  return null
}

// ── Settings Drawer ────────────────────────────────────────────
function SettingsDrawer({ open, onClose, settingsTab, setSettingsTab, notes, updateNotes, categories, addCategory, updateCategory, deleteCategory }) {
  if (!open) return null
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:400 }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:Math.min(520, window.innerWidth), background:'var(--cream)', zIndex:500, overflowY:'auto', boxShadow:'-8px 0 40px rgba(0,0,0,.2)' }}>
        <div style={{ background:'var(--forest)', padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:10 }}>
          <div className="serif" style={{ color:'var(--green-light)', fontSize:20, fontWeight:600 }}>⚙️ Settings</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,.1)', border:'none', color:'var(--green-light)', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:18, fontFamily:'DM Sans,sans-serif' }}>✕</button>
        </div>
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'white' }}>
          {[['routines','Routines'],['categories','Categories'],['notes','Notes'],['edits','Edits']].map(([id,label]) => (
            <button key={id} onClick={()=>setSettingsTab(id)}
              style={{ flex:1, padding:'11px 8px', border:'none', borderBottom:`2px solid ${settingsTab===id?'var(--teal)':'transparent'}`,
                background:'transparent', color:settingsTab===id?'var(--teal)':'var(--muted)', cursor:'pointer',
                fontFamily:'DM Sans,sans-serif', fontSize:11, fontWeight:600, letterSpacing:1, textTransform:'uppercase', transition:'all .2s' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ padding:'20px 24px' }}>
          {settingsTab==='routines'   && <Routines />}
          {settingsTab==='categories' && <CategoriesManager categories={categories} addCategory={addCategory} updateCategory={updateCategory} deleteCategory={deleteCategory} />}
          {settingsTab==='notes'      && <Notes notes={notes} updateNotes={updateNotes} />}
          {settingsTab==='edits'      && <Edits />}
        </div>
      </div>
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
  const [recurringTaskRows,setRecurringTaskRows]= useState([])
  const [vacations,        setVacations_]       = useState([])
  const [categories,       setCategories_]      = useState([])
  const [loading,          setLoading]          = useState(true)

  useEffect(() => {
    async function load() {
      await runMigrationIfNeeded()
      const [comp, l, n, fcp, fcs, sch, com, rt, vac, cats] = await Promise.all([
        getCompletions(), getLogEntries(), getNotes(),
        getFcProgress(), getFcStudied(), getScheduledTasks(),
        getCommitments(), getRecurringTasks(), getVacations(),
        seedCategoriesIfNeeded(),
      ])
      setCompletions_(comp); setLog_(l); setNotes_(n)
      setFcProgress_(fcp); setFcStudied_(fcs); setScheduled_(sch)
      setCommitments_(com); setRecurringTaskRows(rt); setVacations_(vac)
      setCategories_(cats)
      setLoading(false)
    }
    load()
  }, [])

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
  const addCommitment = useCallback(async c => {
    const overlap = checkOverlap(c.date, c.time, c.prepMin, FIXED_BLOCKS)
    try {
      const created = await dbAddCommitment(c)
      setCommitments_(prev => [created, ...prev])
    } catch (e) { reportSaveError(e) }
    return overlap
  }, [])
  const updateCommitment = useCallback(async (id, changes) => {
    try {
      const updated = await dbUpdateCommitment(id, changes)
      setCommitments_(prev => prev.map(c => c.id===id ? updated : c))
    } catch (e) { reportSaveError(e) }
  }, [])
  const deleteCommitment = useCallback(async id => {
    setCommitments_(prev => prev.filter(c => c.id !== id))
    setCompletions_(prev => { const n = {...prev}; delete n[id]; return n })
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

  const sharedProps = {
    // Every consumer reads todos[k] || weekState[k] — both point at the same
    // completions object rather than keeping two copies in sync.
    todos: completions, weekState: completions, syncToggle,
    log, appendLog, notes, updateNotes,
    fcProgress, updateFcProgress, fcStudied, updateFcStudied,
    scheduled, addScheduledTask,
    commitments, addCommitment, updateCommitment, deleteCommitment,
    vacations, addVacation, deleteVacation,
    categories,
  }

  return (
    <div>
      <header className="header">
        <div className="header-top">
          <div>
            <h1 className="header-title">Bloom</h1>
          </div>
          <div className="header-badges">
            <span className={`storage-badge ${isUsingSupabase ? 'cloud' : 'local'}`}>
              {isUsingSupabase ? 'Cloud sync on' : 'Local storage'}
            </span>
          </div>
        </div>
        <nav className="nav">
          {TABS.map(t => (
            <button key={t.id} className={`nav-btn ${tab===t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
          <button className="nav-btn" onClick={() => setSettingsOpen(true)}
            style={{ marginLeft:'auto', fontSize:16, paddingLeft:14, paddingRight:14, letterSpacing:0 }}
            title="Settings">
            ⚙️
          </button>
        </nav>
      </header>

      <main className="content">
        {tab==='today'       && <Today       {...sharedProps} appendLog={appendLog} weekPlan={weekPlan} dailyTodos={activeDailyTodos} scheduled={scheduled} deleteCommitment={deleteCommitment} />}
        {tab==='week'        && <ThisWeek    {...sharedProps} weekPlan={weekPlan} deleteCommitment={deleteCommitment} />}
        {tab==='commitments' && <Commitments {...sharedProps} />}
        {tab==='calendar'    && <Calendar    {...sharedProps} />}
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
        updateCategory={updateCategoryFn} deleteCategory={deleteCategoryFn} />
    </div>
  )
}
