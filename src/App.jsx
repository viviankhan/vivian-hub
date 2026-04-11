import { useState, useEffect, useCallback } from 'react'
import { isUsingSupabase, getTodos, setTodos, getWeekState, setWeekState, getLog, setLog, getNotes, setNotes, getFcProgress, setFcProgress, getFcStudied, setFcStudied, getScheduledTasks, setScheduledTasks, getRecurringTasks, setRecurringTasks, dbGet, dbSet } from './lib/storage.js'
import { FIXED_BLOCKS, DEFAULT_RECURRING_TASKS, DEFAULT_DAILY_TODOS, buildWeekPlanFromTasks } from './data/schedule.js'

import Today       from './components/Today.jsx'
import ThisWeek    from './components/ThisWeek.jsx'
import Commitments from './components/Commitments.jsx'
import Calendar    from './components/Calendar.jsx'
import Study       from './components/Study.jsx'
import Log         from './components/Log.jsx'
import Info        from './components/Info.jsx'
import Edits       from './components/Edits.jsx'
import Scheduler   from './components/Scheduler.jsx'
import RecurringTasksManager, { flatToPerDay } from './components/RecurringTasksManager.jsx'
import Routines from './components/Routines.jsx'

const TABS = [
  { id:'today',       label:'Today'       },
  { id:'week',        label:'Week'        },
  { id:'commitments', label:'Commitments' },
  { id:'calendar',    label:'Calendar'    },
  { id:'study',       label:'Study'       },
  { id:'log',         label:'Log'         },
  { id:'info',        label:'Info'        },
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

// ── localStorage cache helpers (backup for Supabase) ──────────
function lsCache(key, value) {
  try { localStorage.setItem('vivian_cache_'+key, JSON.stringify(value)) } catch {}
}
function lsCacheGet(key) {
  try { const v = localStorage.getItem('vivian_cache_'+key); return v ? JSON.parse(v) : null } catch { return null }
}

// ── Settings Drawer ────────────────────────────────────────────
function SettingsDrawer({ open, onClose, settingsTab, setSettingsTab, scheduled, addScheduledTask, commitments }) {
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
          {[['routines','Routines'],['scheduler','Scheduler'],['edits','Edits']].map(([id,label]) => (
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
          {settingsTab==='scheduler'  && <Scheduler scheduled={scheduled} addScheduledTask={addScheduledTask} commitments={commitments} />}
          {settingsTab==='edits'      && <Edits />}
        </div>
      </div>
    </>
  )
}

export default function App() {
  const [tab, setTab] = useState('today')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab,  setSettingsTab]  = useState('routines')

  const [todos,          setTodos_]          = useState({})
  const [weekState,      setWeekState_]      = useState({})
  const [log,            setLog_]            = useState([])
  const [notes,          setNotes_]          = useState('')
  const [fcProgress,     setFcProgress_]     = useState({})
  const [fcStudied,      setFcStudied_]      = useState({})
  const [scheduled,      setScheduled_]      = useState([])
  const [commitments,    setCommitments_]    = useState([])
  const [recurringTasks, setRecurringTasks_] = useState(null)
  const [loading,        setLoading]         = useState(true)

  useEffect(() => {
    async function load() {
      const [t_raw, w_raw, l, n, fcp, fcs, sch, com, rt] = await Promise.all([
        getTodos(), getWeekState(), getLog(), getNotes(),
        getFcProgress(), getFcStudied(), getScheduledTasks(),
        dbGet('commitments').then(v => v ?? []),
        getRecurringTasks(),
      ])
      // Use localStorage cache as fallback if cloud returns empty
      const t = (t_raw && Object.keys(t_raw).length > 0) ? t_raw : (lsCacheGet('todos') ?? {})
      const w = (w_raw && Object.keys(w_raw).length > 0) ? w_raw : (lsCacheGet('weekstate') ?? {})
      setTodos_(t); setWeekState_(w); setLog_(l); setNotes_(n)
      setFcProgress_(fcp); setFcStudied_(fcs); setScheduled_(sch)
      setCommitments_(com); setRecurringTasks_(rt)
      setLoading(false)
    }
    load()
  }, [])

  // ── Derived schedule — handle both flat and legacy formats ──
  const getPerDay = () => {
    if (!recurringTasks) return null
    if (Array.isArray(recurringTasks.tasks)) {
      // New flat format — convert via flatToPerDay
      return flatToPerDay(recurringTasks, todayStr())
    }
    if (recurringTasks.weekTasks) {
      // Legacy per-day format — use directly (but only day-name keys, not date-specific)
      return recurringTasks
    }
    return null
  }
  const perDay = getPerDay()
  const activeWeekTasks  = perDay?.weekTasks  ?? DEFAULT_RECURRING_TASKS
  const activeDailyTodos = perDay?.dailyTodos ?? DEFAULT_DAILY_TODOS
  const weekPlan = buildWeekPlanFromTasks(activeWeekTasks)

  // ── Persist helpers — dual write: cloud + localStorage cache ─
  const updateTodos      = useCallback(async v => { setTodos_(v);      lsCache('todos', v);      await setTodos(v)      }, [])
  const updateWeekState  = useCallback(async v => { setWeekState_(v);  lsCache('weekstate', v);  await setWeekState(v)  }, [])
  const updateNotes      = useCallback(async v => { setNotes_(v);      await setNotes(v)      }, [])
  const updateFcProgress = useCallback(async v => { setFcProgress_(v); await setFcProgress(v) }, [])
  const updateFcStudied  = useCallback(async v => { setFcStudied_(v);  await setFcStudied(v)  }, [])
  const updateRecurringTasks = useCallback(async v => { setRecurringTasks_(v); await setRecurringTasks(v) }, [])

  const appendLog = useCallback(async entry => {
    const newEntry = { ...entry, ts: new Date().toISOString() }
    setLog_(prev => { const next = [...prev, newEntry]; setLog(next); return next })
  }, [])

  const addScheduledTask = useCallback(async task => {
    setScheduled_(prev => { const next = [...prev, task]; setScheduledTasks(next); return next })
  }, [])

  // ── Commitments CRUD ───────────────────────────────────────
  const addCommitment = useCallback(async c => {
    const overlap = checkOverlap(c.date, c.time, c.prepMin, FIXED_BLOCKS)
    setCommitments_(prev => { const next = [c, ...prev]; dbSet('commitments', next); return next })
    return overlap
  }, [])
  const updateCommitment = useCallback(async (id, changes) => {
    setCommitments_(prev => { const next = prev.map(c => c.id===id ? {...c,...changes} : c); dbSet('commitments', next); return next })
  }, [])
  const deleteCommitment = useCallback(async id => {
    setCommitments_(prev => { const next = prev.filter(c => c.id!==id); dbSet('commitments', next); return next })
    setTodos_(prev    => { const n = {...prev}; delete n[id]; setTodos(n); return n })
    setWeekState_(prev => { const n = {...prev}; delete n[id]; setWeekState(n); return n })
  }, [])

  // ── Unified toggle — dual write ────────────────────────────
  const syncToggle = useCallback(async (id, label, tag, date) => {
    const storageKey = date ? `${date}_${id}` : id
    const isCommitment = commitments.some(c => c.id===id)
    const currentDone = isCommitment
      ? commitments.find(c => c.id===id)?.done
      : !!(todos[storageKey] || weekState[storageKey])
    const nowDone = !currentDone

    if (isCommitment) {
      setCommitments_(prev => { const next = prev.map(c => c.id===id ? {...c, done:nowDone} : c); dbSet('commitments', next); return next })
    }
    const nextTodos = { ...todos, [storageKey]: nowDone }
    const nextWeek  = { ...weekState, [storageKey]: nowDone }
    setTodos_(nextTodos)
    setWeekState_(nextWeek)
    // Dual write — localStorage cache + cloud
    lsCache('todos', nextTodos)
    lsCache('weekstate', nextWeek)
    await Promise.all([setTodos(nextTodos), setWeekState(nextWeek)])

    if (nowDone) {
      // Add log entry on check
      const d = new Date()
      const dateKey   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      const dateLabel = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
      setLog_(prev => { const next = [...prev, { date:dateKey, dateLabel, label, tag, ts:d.toISOString(), storageKey }]; setLog(next); return next })
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
        setLog(next2)
        return next2
      })
    }
  }, [todos, weekState, commitments])

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#FAFAF7', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'Cormorant Garamond, serif', fontSize:28, color:'#1C2B1A', marginBottom:8 }}>Loading…</div>
        <div style={{ fontSize:12, color:'#9B8E7E' }}>{isUsingSupabase ? 'Connecting to cloud storage' : 'Using local storage'}</div>
      </div>
    </div>
  )

  const sharedProps = {
    todos, updateTodos, weekState, updateWeekState, syncToggle,
    log, appendLog, notes, updateNotes,
    fcProgress, updateFcProgress, fcStudied, updateFcStudied,
    scheduled, addScheduledTask,
    commitments, addCommitment, updateCommitment, deleteCommitment,
  }

  return (
    <div>
      <header className="header">
        <div className="header-top">
          <div>
            <p className="header-eyebrow">Vivian Khan — Spring 2026</p>
            <h1 className="header-title">Your Becoming</h1>
          </div>
          <div className="header-badges">
            Lawrence University<br/>
            Biology + YeastScreen<br/>
            MD-PhD Immunology<br/>
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
        {tab==='study'       && <Study       {...sharedProps} />}
        {tab==='log'         && <Log log={log} notes={notes} updateNotes={updateNotes} />}
        {tab==='info'        && <Info />}
        {tab==='recurring'   && <RecurringTasksManager recurringTasks={recurringTasks} updateRecurringTasks={updateRecurringTasks} defaultWeekTasks={DEFAULT_RECURRING_TASKS} defaultDailyTodos={DEFAULT_DAILY_TODOS} />}
      </main>

      <SettingsDrawer
        open={settingsOpen} onClose={() => setSettingsOpen(false)}
        settingsTab={settingsTab} setSettingsTab={setSettingsTab}
        scheduled={scheduled} addScheduledTask={addScheduledTask}
        commitments={commitments} />
    </div>
  )
}
