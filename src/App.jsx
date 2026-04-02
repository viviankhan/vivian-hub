import { useState, useEffect, useCallback } from 'react'
import { isUsingSupabase, getTodos, setTodos, getWeekState, setWeekState, getLog, setLog, getNotes, setNotes, getFcProgress, setFcProgress, getFcStudied, setFcStudied, getScheduledTasks, setScheduledTasks } from './lib/storage.js'

import Today from './components/Today.jsx'
import ThisWeek from './components/ThisWeek.jsx'
import Calendar from './components/Calendar.jsx'
import Study from './components/Study.jsx'
import Scheduler from './components/Scheduler.jsx'
import Routines from './components/Routines.jsx'
import Notes from './components/Notes.jsx'
import Log from './components/Log.jsx'
import Info from './components/Info.jsx'
import Commitments from './components/Commitments.jsx'

const TABS = [
  { id:'today',       label:'✅ Today' },
  { id:'week',        label:'📋 Week' },
  { id:'commitments', label:'🤝 Commitments' },
  { id:'calendar',    label:'📅 Calendar' },
  { id:'study',       label:'📚 Study' },
  { id:'scheduler',   label:'🧠 Scheduler' },
  { id:'routines',    label:'🌙 Routines' },
  { id:'notes',       label:'📝 Notes' },
  { id:'log',         label:'📓 Log' },
  { id:'info',        label:'ℹ️ Info' },
  { id:'edits',       label:'🔧 Edits' },
]

export default function App() {
  const [tab, setTab] = useState('today')

  // ── Shared state (persisted) ───────────────────────────────
  const [todos,      setTodosState]      = useState({})
  const [weekState,  setWeekStateLocal]  = useState({})
  const [log,        setLogState]        = useState([])
  const [notes,      setNotesState]      = useState('')
  const [fcProgress, setFcProgressState] = useState({})
  const [fcStudied,  setFcStudiedState]  = useState({})
  const [scheduled,  setScheduledState]  = useState([])
  const [loading,    setLoading]         = useState(true)

  // ── Load from storage on mount ─────────────────────────────
  useEffect(() => {
    async function load() {
      const [t, w, l, n, fcp, fcs, sch] = await Promise.all([
        getTodos(), getWeekState(), getLog(), getNotes(),
        getFcProgress(), getFcStudied(), getScheduledTasks(),
      ])
      setTodosState(t)
      setWeekStateLocal(w)
      setLogState(l)
      setNotesState(n)
      setFcProgressState(fcp)
      setFcStudiedState(fcs)
      setScheduledState(sch)
      setLoading(false)
    }
    load()
  }, [])

  // ── Persist helpers ────────────────────────────────────────
  const updateTodos = useCallback(async (newState) => {
    setTodosState(newState)
    await setTodos(newState)
  }, [])

  const updateWeekState = useCallback(async (newState) => {
    setWeekStateLocal(newState)
    await setWeekState(newState)
  }, [])

  const appendLog = useCallback(async (entry) => {
    setLogState(prev => {
      const next = [...prev, { ...entry, ts: new Date().toISOString() }]
      setLog(next)
      return next
    })
  }, [])

  const updateNotes = useCallback(async (val) => {
    setNotesState(val)
    await setNotes(val)
  }, [])

  const updateFcProgress = useCallback(async (val) => {
    setFcProgressState(val)
    await setFcProgress(val)
  }, [])

  const updateFcStudied = useCallback(async (val) => {
    setFcStudiedState(val)
    await setFcStudied(val)
  }, [])

  const addScheduledTask = useCallback(async (task) => {
    setScheduledState(prev => {
      const next = [...prev, task]
      setScheduledTasks(next)
      return next
    })
  }, [])

  // ── Unified toggle: syncs Today ↔ This Week ↔ Log ──────────
  // Call this from both Today and ThisWeek so state always matches.
  const syncToggle = useCallback(async (id, label, tag) => {
    const currentlyDone = !!(todosState[id] || weekState[id])
    const nowDone = !currentlyDone

    // Update both stores simultaneously
    const nextTodos = { ...todosState, [id]: nowDone }
    const nextWeek  = { ...weekState,  [id]: nowDone }
    setTodosState(nextTodos)
    setWeekStateLocal(nextWeek)
    await Promise.all([setTodos(nextTodos), setWeekState(nextWeek)])

    // Log on check-off only
    if (nowDone) {
      const d = new Date()
      const dateKey   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      const dateLabel = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
      setLogState(prev => {
        const next = [...prev, { date: dateKey, dateLabel, label, tag, ts: d.toISOString() }]
        setLog(next)
        return next
      })
    }
  }, [todosState, weekState])

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#FAFAF7', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'Cormorant Garamond, serif', fontSize:28, color:'#1C2B1A', marginBottom:8 }}>Loading…</div>
        <div style={{ fontSize:12, color:'#9B8E7E' }}>{isUsingSupabase ? 'Connecting to cloud storage' : 'Using local storage'}</div>
      </div>
    </div>
  )

  const sharedProps = { todos: todosState, updateTodos, weekState, updateWeekState, syncToggle, log, appendLog, notes, updateNotes, fcProgress, updateFcProgress, fcStudied, updateFcStudied, scheduled, addScheduledTask }

  return (
    <div>
      {/* Header */}
      <header className="header">
        <div className="header-top">
          <div>
            <p className="header-eyebrow">Vivian Khan — Spring 2026</p>
            <h1 className="header-title">Your Becoming</h1>
          </div>
          <div className="header-badges">
            🎓 Lawrence University<br/>
            🔬 Biology + YeastScreen<br/>
            🎯 MD-PhD Immunology<br/>
            <span className={`storage-badge ${isUsingSupabase ? 'cloud' : 'local'}`}>
              {isUsingSupabase ? '☁️ Cloud sync on' : '💾 Local storage'}
            </span>
          </div>
        </div>
        <nav className="nav">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`nav-btn ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className="content">
        {tab === 'today'       && <Today       {...sharedProps} />}
        {tab === 'week'        && <ThisWeek    {...sharedProps} />}
        {tab === 'commitments' && <Commitments />}
        {tab === 'calendar'    && <Calendar  />}
        {tab === 'study'     && <Study     {...sharedProps} />}
        {tab === 'scheduler' && <Scheduler {...sharedProps} />}
        {tab === 'routines'  && <Routines  />}
        {tab === 'notes'     && <Notes     notes={notes} updateNotes={updateNotes} />}
        {tab === 'log'       && <Log       log={log} />}
        {tab === 'info'      && <Info      />}
        {tab === 'edits'     && <Edits     />}
      </main>
    </div>
  )
}
