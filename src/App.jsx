import { useState, useEffect, useCallback } from 'react'
import { isUsingSupabase, getTodos, setTodos, getWeekState, setWeekState, getLog, setLog, getNotes, setNotes, getFcProgress, setFcProgress, getFcStudied, setFcStudied, getScheduledTasks, setScheduledTasks, dbGet, dbSet } from './lib/storage.js'
import { FIXED_BLOCKS } from './data/schedule.js'

import Today from './components/Today.jsx'
import ThisWeek from './components/ThisWeek.jsx'
import Commitments from './components/Commitments.jsx'
import Calendar from './components/Calendar.jsx'
import Study from './components/Study.jsx'
import Scheduler from './components/Scheduler.jsx'
import Routines from './components/Routines.jsx'
import Notes from './components/Notes.jsx'
import Log from './components/Log.jsx'
import Info from './components/Info.jsx'
import Edits from './components/Edits.jsx'

const TABS = [
  { id:'today',       label:'Today'       },
  { id:'week',        label:'Week'        },
  { id:'commitments', label:'Commitments' },
  { id:'calendar',    label:'Calendar'    },
  { id:'study',       label:'Study'       },
  { id:'scheduler',   label:'Scheduler'   },
  { id:'routines',    label:'Routines'    },
  { id:'notes',       label:'Notes'       },
  { id:'log',         label:'Log'         },
  { id:'info',        label:'Info'        },
  { id:'edits',       label:'Edits'       },
]

// ── Helpers ────────────────────────────────────────────────────
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// Check if a commitment's date falls within the current week plan dates
function getWeekDates() {
  const today = new Date()
  const dates = []
  // Get Mon-Sun of current week
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)
  }
  return dates
}

// Check for time overlap with fixed blocks
function checkOverlap(date, time, prepMin, fixedBlocks) {
  if (!date || !time) return null
  const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date+'T12:00:00').getDay()]
  const blocks = fixedBlocks[dayName] || []
  const [h, m] = time.split(':').map(Number)
  const startMin = h * 60 + m
  const prepStart = prepMin ? startMin - prepMin : startMin
  const endMin = startMin + 60 // assume 1hr commitment

  for (const block of blocks) {
    const [bh, bm] = block.start.split(':').map(Number)
    const [eh, em] = block.end.split(':').map(Number)
    const blockStart = bh * 60 + bm
    const blockEnd   = eh * 60 + em
    if (prepStart < blockEnd && endMin > blockStart) {
      return block.label
    }
  }
  return null
}

export default function App() {
  const [tab, setTab] = useState('today')

  // ── State ──────────────────────────────────────────────────
  const [todos,       setTodos_]       = useState({})
  const [weekState,   setWeekState_]   = useState({})
  const [log,         setLog_]         = useState([])
  const [notes,       setNotes_]       = useState('')
  const [fcProgress,  setFcProgress_]  = useState({})
  const [fcStudied,   setFcStudied_]   = useState({})
  const [scheduled,   setScheduled_]   = useState([])
  const [commitments, setCommitments_] = useState([])
  const [loading,     setLoading]      = useState(true)

  useEffect(() => {
    async function load() {
      const [t, w, l, n, fcp, fcs, sch, com] = await Promise.all([
        getTodos(), getWeekState(), getLog(), getNotes(),
        getFcProgress(), getFcStudied(), getScheduledTasks(),
        dbGet('commitments').then(v => v ?? []),
      ])
      setTodos_(t); setWeekState_(w); setLog_(l); setNotes_(n)
      setFcProgress_(fcp); setFcStudied_(fcs); setScheduled_(sch)
      setCommitments_(com)
      setLoading(false)
    }
    load()
  }, [])

  // ── Persist helpers ────────────────────────────────────────
  const updateTodos     = useCallback(async (v) => { setTodos_(v);      await setTodos(v)     }, [])
  const updateWeekState = useCallback(async (v) => { setWeekState_(v);  await setWeekState(v) }, [])
  const updateNotes     = useCallback(async (v) => { setNotes_(v);      await setNotes(v)     }, [])
  const updateFcProgress = useCallback(async (v) => { setFcProgress_(v); await setFcProgress(v) }, [])
  const updateFcStudied  = useCallback(async (v) => { setFcStudied_(v);  await setFcStudied(v)  }, [])

  const appendLog = useCallback(async (entry) => {
    const newEntry = { ...entry, ts: new Date().toISOString() }
    setLog_(prev => {
      const next = [...prev, newEntry]
      setLog(next)  // fire-and-forget outside the render cycle is fine here
      return next
    })
  }, [])

  const addScheduledTask = useCallback(async (task) => {
    setScheduled_(prev => { const next = [...prev, task]; setScheduledTasks(next); return next })
  }, [])

  // ── Commitments CRUD ───────────────────────────────────────
  const saveCommitments = useCallback(async (next) => {
    setCommitments_(next)
    await dbSet('commitments', next)
  }, [])

  const addCommitment = useCallback(async (c) => {
    // Check for overlap with fixed schedule
    const overlap = checkOverlap(c.date, c.time, c.prepMin, FIXED_BLOCKS)
    setCommitments_(prev => {
      const next = [c, ...prev]
      dbSet('commitments', next)
      return next
    })
    return overlap // return overlap warning so UI can show it
  }, [])

  const updateCommitment = useCallback(async (id, changes) => {
    setCommitments_(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...changes } : c)
      dbSet('commitments', next)
      return next
    })
  }, [])

  const deleteCommitment = useCallback(async (id) => {
    setCommitments_(prev => {
      const next = prev.filter(c => c.id !== id)
      dbSet('commitments', next)
      return next
    })
    // Also uncheck from todos/weekState
    setTodos_(prev => { const n = { ...prev }; delete n[id]; setTodos(n); return n })
    setWeekState_(prev => { const n = { ...prev }; delete n[id]; setWeekState(n); return n })
  }, [])

  // ── UNIFIED TOGGLE ─────────────────────────────────────────
  // Single function that syncs Today, This Week, Commitments, and Log.
  // date param: pass the calendar date (YYYY-MM-DD) for template tasks so
  // their done-state is scoped per day (prevents last week's checks bleeding in).
  // Omit date (or pass null) for commitments — they use their UUID directly.
  const syncToggle = useCallback(async (id, label, tag, date) => {
    const storageKey = date ? `${date}_${id}` : id
    // Determine current state across all sources
    const isCommitment = commitments.some(c => c.id === id)
    const currentDone = isCommitment
      ? commitments.find(c => c.id === id)?.done
      : !!(todos[storageKey] || weekState[storageKey])
    const nowDone = !currentDone

    // Update commitments if this is a commitment
    if (isCommitment) {
      setCommitments_(prev => {
        const next = prev.map(c => c.id === id ? { ...c, done: nowDone } : c)
        dbSet('commitments', next)
        return next
      })
    }

    // Always update todos + weekState (commitments also tracked here for cross-tab sync)
    const nextTodos = { ...todos,     [storageKey]: nowDone }
    const nextWeek  = { ...weekState, [storageKey]: nowDone }
    setTodos_(nextTodos)
    setWeekState_(nextWeek)
    await Promise.all([setTodos(nextTodos), setWeekState(nextWeek)])

    // Log on check-off only
    if (nowDone) {
      const d = new Date()
      const dateKey   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      const dateLabel = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
      const newEntry  = { date: dateKey, dateLabel, label, tag, ts: d.toISOString() }
      setLog_(prev => {
        const next = [...prev, newEntry]
        setLog(next)
        return next
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
    todos, updateTodos,
    weekState, updateWeekState,
    syncToggle,
    log, appendLog,
    notes, updateNotes,
    fcProgress, updateFcProgress,
    fcStudied, updateFcStudied,
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
            <button key={t.id} className={`nav-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {tab === 'today'       && <Today       {...sharedProps} appendLog={appendLog} />}
        {tab === 'week'        && <ThisWeek    {...sharedProps} />}
        {tab === 'commitments' && <Commitments {...sharedProps} />}
        {tab === 'calendar'    && <Calendar    {...sharedProps} />}
        {tab === 'study'       && <Study       {...sharedProps} />}
        {tab === 'scheduler'   && <Scheduler   {...sharedProps} />}
        {tab === 'routines'    && <Routines />}
        {tab === 'notes'       && <Notes notes={notes} updateNotes={updateNotes} />}
        {tab === 'log'         && <Log log={log} />}
        {tab === 'info'        && <Info />}
        {tab === 'edits'       && <Edits />}
      </main>
    </div>
  )
}
