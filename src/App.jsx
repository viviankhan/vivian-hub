// src/App.jsx
import { useState, useEffect, useCallback } from 'react'
import {
  isUsingSupabase,
  getTodos, setTodos,
  getWeekState, setWeekState,
  getLog, setLog,
  getNotes, setNotes,
  getFcProgress, setFcProgress,
  getFcStudied, setFcStudied,
  getScheduledTasks, setScheduledTasks,
  getCustomDailyTodos, setCustomDailyTodos,
  getStudyExtras, setStudyExtras,
  getRoutinesCustom, setRoutinesCustom,
  getRoutinesDone, setRoutinesDone,
  getRoutinesTodayOverride, setRoutinesTodayOverride,
  dbGet, dbSet,
} from './lib/storage.js'
import { FIXED_BLOCKS } from './data/schedule.js'

import Today       from './components/Today.jsx'
import ThisWeek    from './components/ThisWeek.jsx'
import Commitments from './components/Commitments.jsx'
import Calendar    from './components/Calendar.jsx'
import Study       from './components/Study.jsx'
import Scheduler   from './components/Scheduler.jsx'
import Routines    from './components/Routines.jsx'
import Notes       from './components/Notes.jsx'
import Log         from './components/Log.jsx'
import Info        from './components/Info.jsx'
import Edits       from './components/Edits.jsx'

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

function checkOverlap(date, time, prepMin, fixedBlocks) {
  if (!date || !time) return null
  const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date+'T12:00:00').getDay()]
  const blocks = fixedBlocks[dayName] || []
  const [h, m] = time.split(':').map(Number)
  const startMin = h * 60 + m
  const prepStart = prepMin ? startMin - prepMin : startMin
  const endMin = startMin + 60

  for (const block of blocks) {
    const [bh, bm] = block.start.split(':').map(Number)
    const [eh, em] = block.end.split(':').map(Number)
    const blockStart = bh * 60 + bm
    const blockEnd   = eh * 60 + em
    if (prepStart < blockEnd && endMin > blockStart) return block.label
  }
  return null
}

export default function App() {
  const [tab, setTab] = useState('today')

  // ── Core state ─────────────────────────────────────────────
  const [todos,         setTodos_]         = useState({})
  const [weekState,     setWeekState_]     = useState({})
  const [log,           setLog_]           = useState([])
  const [notes,         setNotes_]         = useState('')
  const [fcProgress,    setFcProgress_]    = useState({})
  const [fcStudied,     setFcStudied_]     = useState({})
  const [scheduled,     setScheduled_]     = useState([])
  const [commitments,   setCommitments_]   = useState([])

  // ── New state ───────────────────────────────────────────────
  const [customDailyTodos, setCustomDailyTodos_] = useState({})
  const [studyExtras,      setStudyExtras_]       = useState(null)
  const [routinesCustom,       setRoutinesCustom_]       = useState(null)
  const [routinesDone,         setRoutinesDone_]         = useState({})
  const [routinesTodayOverride, setRoutinesTodayOverride_] = useState({})

  const [loading, setLoading] = useState(true)

  // ── Load all state on mount ────────────────────────────────
  useEffect(() => {
    async function load() {
      const [t, w, l, n, fcp, fcs, sch, com, cdt, se, rc, rd, rto] = await Promise.all([
        getTodos(),
        getWeekState(),
        getLog(),
        getNotes(),
        getFcProgress(),
        getFcStudied(),
        getScheduledTasks(),
        dbGet('commitments').then(v => v ?? []),
        getCustomDailyTodos(),
        getStudyExtras(),
        getRoutinesCustom(),
        getRoutinesDone(),
        getRoutinesTodayOverride(),
      ])
      setTodos_(t)
      setWeekState_(w)
      setLog_(l)
      setNotes_(n)
      setFcProgress_(fcp)
      setFcStudied_(fcs)
      setScheduled_(sch)
      setCommitments_(com)
      setCustomDailyTodos_(cdt)
      setStudyExtras_(se)
      setRoutinesCustom_(rc)
      setRoutinesDone_(rd)
      setRoutinesTodayOverride_(rto)
      setLoading(false)
    }
    load()
  }, [])

  // ── Core persist helpers ───────────────────────────────────
  const updateTodos     = useCallback(async v => { setTodos_(v);     await setTodos(v)     }, [])
  const updateWeekState = useCallback(async v => { setWeekState_(v); await setWeekState(v) }, [])
  const updateNotes     = useCallback(async v => { setNotes_(v);     await setNotes(v)     }, [])
  const updateFcProgress = useCallback(async v => { setFcProgress_(v); await setFcProgress(v) }, [])
  const updateFcStudied  = useCallback(async v => { setFcStudied_(v);  await setFcStudied(v)  }, [])

  const appendLog = useCallback(async entry => {
    setLog_(prev => {
      const next = [...prev, { ...entry, ts: new Date().toISOString() }]
      setLog(next)
      return next
    })
  }, [])

  const addScheduledTask = useCallback(async task => {
    setScheduled_(prev => { const next = [...prev, task]; setScheduledTasks(next); return next })
  }, [])

  // ── New persist helpers ────────────────────────────────────
  const updateCustomDailyTodos = useCallback(async v => {
    setCustomDailyTodos_(v)
    await setCustomDailyTodos(v)
  }, [])

  // Called when a custom todo is deleted — cleans up from todos/weekState
  const deleteCustomTodo = useCallback(async id => {
    setTodos_(prev => { const n = { ...prev }; delete n[id]; setTodos(n); return n })
    setWeekState_(prev => { const n = { ...prev }; delete n[id]; setWeekState(n); return n })
  }, [])

  const updateStudyExtras = useCallback(async v => {
    setStudyExtras_(v)
    await setStudyExtras(v)
  }, [])

  const updateRoutinesCustom = useCallback(async v => {
    setRoutinesCustom_(v)
    await setRoutinesCustom(v)
  }, [])

  const updateRoutinesDone = useCallback(async v => {
    setRoutinesDone_(v)
    await setRoutinesDone(v)
  }, [])

  const updateRoutinesTodayOverride = useCallback(async v => {
    setRoutinesTodayOverride_(v)
    await setRoutinesTodayOverride(v)
  }, [])

  // ── Commitments CRUD ───────────────────────────────────────
  const addCommitment = useCallback(async c => {
    const overlap = checkOverlap(c.date, c.time, c.prepMin, FIXED_BLOCKS)
    setCommitments_(prev => { const next = [c, ...prev]; dbSet('commitments', next); return next })
    return overlap
  }, [])

  const updateCommitment = useCallback(async (id, changes) => {
    setCommitments_(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...changes } : c)
      dbSet('commitments', next)
      return next
    })
  }, [])

  const deleteCommitment = useCallback(async id => {
    setCommitments_(prev => { const next = prev.filter(c => c.id !== id); dbSet('commitments', next); return next })
    setTodos_(prev => { const n = { ...prev }; delete n[id]; setTodos(n); return n })
    setWeekState_(prev => { const n = { ...prev }; delete n[id]; setWeekState(n); return n })
  }, [])

  // ── Unified toggle ─────────────────────────────────────────
  const syncToggle = useCallback(async (id, label, tag) => {
    const isCommitment = commitments.some(c => c.id === id)
    const currentDone = isCommitment
      ? commitments.find(c => c.id === id)?.done
      : !!(todos[id] || weekState[id])
    const nowDone = !currentDone

    if (isCommitment) {
      setCommitments_(prev => {
        const next = prev.map(c => c.id === id ? { ...c, done: nowDone } : c)
        dbSet('commitments', next)
        return next
      })
    }

    const nextTodos = { ...todos,     [id]: nowDone }
    const nextWeek  = { ...weekState, [id]: nowDone }
    setTodos_(nextTodos)
    setWeekState_(nextWeek)
    await Promise.all([setTodos(nextTodos), setWeekState(nextWeek)])

    if (nowDone) {
      const d = new Date()
      const dateKey   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      const dateLabel = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
      setLog_(prev => {
        const next = [...prev, { date:dateKey, dateLabel, label, tag, ts:d.toISOString() }]
        setLog(next)
        return next
      })
    }
  }, [todos, weekState, commitments])

  // ── Loading screen ─────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#FAFAF7', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'Cormorant Garamond, serif', fontSize:28, color:'#1C2B1A', marginBottom:8 }}>Loading…</div>
        <div style={{ fontSize:12, color:'#9B8E7E' }}>{isUsingSupabase ? 'Connecting to cloud storage' : 'Using local storage'}</div>
      </div>
    </div>
  )

  // ── Props bundles ──────────────────────────────────────────
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
    customDailyTodos, updateCustomDailyTodos, deleteCustomTodo,
    studyExtras, updateStudyExtras,
    routinesCustom, updateRoutinesCustom,
    routinesDone, updateRoutinesDone,
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
        {tab === 'today' && (
          <Today
            todos={todos} weekState={weekState} syncToggle={syncToggle}
            commitments={commitments}
            customDailyTodos={customDailyTodos}
            updateCustomDailyTodos={updateCustomDailyTodos}
            deleteCustomTodo={deleteCustomTodo}
          />
        )}
        {tab === 'week' && (
          <ThisWeek
            todos={todos} weekState={weekState} syncToggle={syncToggle}
            commitments={commitments}
          />
        )}
        {tab === 'commitments' && (
          <Commitments
            commitments={commitments}
            addCommitment={addCommitment}
            updateCommitment={updateCommitment}
            deleteCommitment={deleteCommitment}
            todos={todos} weekState={weekState} syncToggle={syncToggle}
            scheduled={scheduled}
          />
        )}
        {tab === 'calendar' && (
          <Calendar commitments={commitments} />
        )}
        {tab === 'study' && (
          <Study
            fcProgress={fcProgress} updateFcProgress={updateFcProgress}
            fcStudied={fcStudied}   updateFcStudied={updateFcStudied}
            studyExtras={studyExtras} updateStudyExtras={updateStudyExtras}
          />
        )}
        {tab === 'scheduler' && (
          <Scheduler
            scheduled={scheduled} addScheduledTask={addScheduledTask}
            todos={todos} updateTodos={updateTodos}
          />
        )}
        {tab === 'routines' && (
          <Routines
            routinesCustom={routinesCustom}                 updateRoutinesCustom={updateRoutinesCustom}
            routinesTodayOverride={routinesTodayOverride}   updateRoutinesTodayOverride={updateRoutinesTodayOverride}
            routinesDone={routinesDone}                     updateRoutinesDone={updateRoutinesDone}
          />
        )}
        {tab === 'notes'  && <Notes notes={notes} updateNotes={updateNotes} />}
        {tab === 'log'    && <Log log={log} />}
        {tab === 'info'   && <Info />}
        {tab === 'edits'  && <Edits />}
      </main>
    </div>
  )
}
