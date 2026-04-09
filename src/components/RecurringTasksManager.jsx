import { useState, useMemo } from 'react'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
const DAY_SHORT = { monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu', friday:'Fri', saturday:'Sat', sunday:'Sun' }
const CATS = ['class','lab','career','health','fitness','personal','urgent','sleep','polish','carried']
const CAT_COLORS = {
  lab:'#059669', class:'#7C3AED', career:'#D97706', personal:'#A855F7',
  urgent:'#EF4444', health:'#E07B2E', fitness:'#3B82F6', sleep:'#52B788', polish:'#EC4899', carried:'#F59E0B',
}

// ── Convert old per-day format → flat array ────────────────────
export function migrateLegacyTasks(recurringTasks) {
  if (!recurringTasks) return null
  // Already migrated
  if (Array.isArray(recurringTasks.tasks)) return recurringTasks
  const tasks = []
  const wt = recurringTasks.weekTasks  || {}
  const dt = recurringTasks.dailyTodos || {}
  DAYS.forEach(day => {
    ;(wt[day]||[]).forEach(t => {
      tasks.push({ ...t, type:'week',  days:[day], startDate:null, endDate:null })
    })
    ;(dt[day]||[]).forEach(t => {
      tasks.push({ ...t, type:'today', days:[day], startDate:null, endDate:null })
    })
  })
  return { tasks }
}

// ── Convert flat array → per-day (for schedule engine) ─────────
export function flatToPerDay(flat, dateStr) {
  if (!flat?.tasks) return null
  const today = dateStr ? new Date(dateStr+'T12:00:00') : new Date()
  const weekTasks  = {}
  const dailyTodos = {}
  DAYS.forEach(d => { weekTasks[d] = []; dailyTodos[d] = [] })
  flat.tasks.forEach(task => {
    // Check date range
    if (task.startDate) {
      const start = new Date(task.startDate+'T00:00:00')
      if (today < start) return
    }
    if (task.endDate) {
      const end = new Date(task.endDate+'T23:59:59')
      if (today > end) return
    }
    ;(task.days||[]).forEach(day => {
      const { type, days, startDate, endDate, ...rest } = task
      if (type === 'week')  weekTasks[day]  = [...(weekTasks[day]||[]),  rest]
      else                  dailyTodos[day] = [...(dailyTodos[day]||[]), rest]
    })
  })
  return { weekTasks, dailyTodos }
}

// ── Helpers ────────────────────────────────────────────────────
function slugify(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,28) }
function fmtDate(d) { if (!d) return ''; const [y,m,day]=d.split('-'); return `${m}/${day}/${y}` }

function Tag({ value }) {
  const c = CAT_COLORS[value]||'#9CA3AF'
  return <span style={{ fontSize:9, padding:'2px 6px', borderRadius:6, background:`${c}20`, color:c, fontWeight:700, letterSpacing:.8, textTransform:'uppercase' }}>{value}</span>
}
function TypeBadge({ type }) {
  return <span style={{ fontSize:9, padding:'2px 6px', borderRadius:6,
    background:type==='week'?'#E0F2FE':'#FEF9C3', color:type==='week'?'#0369A1':'#854D0E',
    fontWeight:700, letterSpacing:.8, textTransform:'uppercase' }}>{type==='week'?'Week':'Today'}</span>
}
function DayPill({ day, active, onClick }) {
  return (
    <button onClick={onClick} style={{ fontSize:10, padding:'4px 9px', borderRadius:16,
      border:`1.5px solid ${active?'var(--forest)':'var(--border)'}`,
      background:active?'var(--forest)':'white', color:active?'var(--green-light)':'var(--muted)',
      cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
      {DAY_SHORT[day]}
    </button>
  )
}

// ── Task editor modal ──────────────────────────────────────────
function TaskModal({ initial, onSave, onDelete, onClose }) {
  const isNew = !initial
  const [text,      setText]      = useState(initial?.text||initial?.label||'')
  const [note,      setNote]      = useState(initial?.note||'')
  const [type,      setType]      = useState(initial?.type||'week')
  const [cat,       setCat]       = useState(initial?.cat||initial?.tag||'lab')
  const [carry,     setCarry]     = useState(initial?.carry||false)
  const [days,      setDays]      = useState(initial?.days||['monday'])
  const [startDate, setStartDate] = useState(initial?.startDate||'')
  const [endDate,   setEndDate]   = useState(initial?.endDate||'')
  const [noEnd,     setNoEnd]     = useState(!initial?.endDate)

  const toggleDay = (d) => setDays(prev => prev.includes(d) ? prev.filter(x=>x!==d) : [...prev,d])

  const save = () => {
    if (!text.trim() || days.length===0) return
    const id = initial?.id || `${days[0].slice(0,3)}-${slugify(text)}`
    const base = { id, days, type, cat, startDate:startDate||null, endDate:(!noEnd&&endDate)||null }
    if (type==='week')  onSave({ ...base, text:text.trim(), carry })
    else                onSave({ ...base, label:text.trim(), note:note.trim(), tag:cat })
  }

  const inp = { width:'100%', fontSize:13, padding:'9px 12px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box', marginBottom:10, background:'white', color:'var(--text)' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:18, maxWidth:420, width:'100%', boxShadow:'0 24px 64px rgba(0,0,0,.25)', overflow:'hidden' }}>

        {/* Modal header */}
        <div style={{ background:'var(--forest)', padding:'18px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div className="serif" style={{ color:'var(--green-light)', fontSize:18, fontWeight:600 }}>{isNew ? 'New Recurring Task' : 'Edit Task'}</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,.1)', border:'none', color:'var(--green-light)', borderRadius:8, width:30, height:30, cursor:'pointer', fontSize:16 }}>✕</button>
        </div>

        <div style={{ padding:'18px 20px' }}>
          {/* Type toggle */}
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', marginBottom:6 }}>Appears in</div>
          <div style={{ display:'flex', gap:0, marginBottom:14, borderRadius:10, overflow:'hidden', border:'1px solid var(--border)', width:'fit-content' }}>
            {[['week','Week tab'],['today','Today tab']].map(([v,l])=>(
              <button key={v} onClick={()=>setType(v)}
                style={{ fontSize:12, padding:'7px 16px', border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                  background:type===v?'var(--forest)':'white', color:type===v?'var(--green-light)':'var(--muted)' }}>{l}</button>
            ))}
          </div>

          {/* Text */}
          <input value={text} onChange={e=>setText(e.target.value)} autoFocus
            placeholder={type==='today'?'Label (e.g. 9:50 AM — Coral Reef class)…':'Task description…'}
            style={inp} />

          {/* Note (Today only) */}
          {type==='today' && (
            <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Note (optional sub-text)…"
              style={{ ...inp, color:'var(--muted)', fontSize:12 }} />
          )}

          {/* Category */}
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
            <select value={cat} onChange={e=>setCat(e.target.value)}
              style={{ fontSize:12, padding:'7px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', background:'white', cursor:'pointer' }}>
              {CATS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            {type==='week' && (
              <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--muted)', cursor:'pointer' }}>
                <input type="checkbox" checked={carry} onChange={e=>setCarry(e.target.checked)} />
                carry forward if undone
              </label>
            )}
          </div>

          {/* Days */}
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', marginBottom:8 }}>Repeats on</div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:14 }}>
            {DAYS.map(d=>(
              <DayPill key={d} day={d} active={days.includes(d)} onClick={()=>toggleDay(d)} />
            ))}
          </div>
          {days.length===0 && <div style={{ fontSize:11, color:'#EF4444', marginBottom:10 }}>Select at least one day.</div>}

          {/* Date range */}
          <div style={{ display:'flex', gap:8, marginBottom:4 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Start date</div>
              <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}
                style={{ ...inp, marginBottom:0, fontSize:12 }} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>End date</div>
              <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} disabled={noEnd}
                style={{ ...inp, marginBottom:0, fontSize:12, opacity:noEnd?.45:1 }} />
            </div>
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--muted)', cursor:'pointer', marginBottom:16 }}>
            <input type="checkbox" checked={noEnd} onChange={e=>setNoEnd(e.target.checked)} />
            No end date — repeats indefinitely
          </label>

          {/* Actions */}
          <div style={{ display:'flex', gap:8, justifyContent:'space-between' }}>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={save} disabled={!text.trim()||days.length===0}
                style={{ fontSize:13, padding:'10px 20px', borderRadius:10, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, opacity:(!text.trim()||days.length===0)?.5:1 }}>
                {isNew ? 'Add Task' : 'Save Changes'}
              </button>
              <button onClick={onClose}
                style={{ fontSize:13, padding:'10px 14px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
                Cancel
              </button>
            </div>
            {!isNew && (
              <button onClick={onDelete}
                style={{ fontSize:12, padding:'8px 12px', borderRadius:10, border:'1px solid #FECACA', background:'white', color:'#EF4444', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Task list row ──────────────────────────────────────────────
function TaskListRow({ task, onEdit }) {
  const text = task.text||task.label||''
  const cat  = task.cat||task.tag||'lab'
  const hasDateRange = task.startDate || task.endDate
  return (
    <div onClick={onEdit}
      style={{ display:'flex', gap:10, alignItems:'center', background:'white', borderRadius:11, border:'1px solid var(--border)', padding:'11px 14px', marginBottom:7, cursor:'pointer', transition:'border-color .15s' }}
      onMouseEnter={e=>e.currentTarget.style.borderColor='#52B788'}
      onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
      {/* Day pills */}
      <div style={{ display:'flex', gap:3, flexWrap:'wrap', minWidth:140 }}>
        {DAYS.filter(d=>task.days?.includes(d)).map(d=>(
          <span key={d} style={{ fontSize:9, padding:'2px 6px', borderRadius:6, background:'var(--forest)', color:'var(--green-light)', fontWeight:700, letterSpacing:.5 }}>{DAY_SHORT[d]}</span>
        ))}
      </div>
      {/* Text */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, color:'var(--text)', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{text}</div>
        {task.note && <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{task.note}</div>}
        {hasDateRange && (
          <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
            {task.startDate && `From ${fmtDate(task.startDate)}`}
            {task.startDate && task.endDate && ' · '}
            {task.endDate ? `Until ${fmtDate(task.endDate)}` : 'No end date'}
          </div>
        )}
      </div>
      <Tag value={cat} />
      <TypeBadge type={task.type} />
      <span style={{ fontSize:11, color:'var(--muted)', flexShrink:0 }}>›</span>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function RecurringTasksManager({ recurringTasks, updateRecurringTasks, defaultWeekTasks, defaultDailyTodos }) {
  const [editing,     setEditing]     = useState(null) // null | 'new' | task object
  const [filterDay,   setFilterDay]   = useState('all')
  const [filterType,  setFilterType]  = useState('all')
  const [confirmReset, setConfirmReset] = useState(false)

  // Build flat tasks array — migrate legacy format if needed
  const flatData = useMemo(() => {
    if (!recurringTasks) {
      // Build from defaults
      const tasks = []
      DAYS.forEach(day => {
        ;(defaultWeekTasks[day]||[]).forEach(t => tasks.push({ ...t, type:'week',  days:[day], startDate:null, endDate:null }))
        ;(defaultDailyTodos[day]||[]).forEach(t => tasks.push({ ...t, type:'today', days:[day], startDate:null, endDate:null }))
      })
      return tasks
    }
    if (Array.isArray(recurringTasks.tasks)) return recurringTasks.tasks
    // Migrate legacy per-day format
    const tasks = []
    const wt = recurringTasks.weekTasks  || {}
    const dt = recurringTasks.dailyTodos || {}
    DAYS.forEach(day => {
      ;(wt[day]||[]).forEach(t => tasks.push({ ...t, type:'week',  days:[day], startDate:null, endDate:null }))
      ;(dt[day]||[]).forEach(t => tasks.push({ ...t, type:'today', days:[day], startDate:null, endDate:null }))
    })
    return tasks
  }, [recurringTasks])

  // Save helpers
  const saveTasks = (tasks) => updateRecurringTasks({ tasks })

  const handleSave = (task) => {
    if (editing === 'new') {
      saveTasks([...flatData, task])
    } else {
      saveTasks(flatData.map(t => t.id===editing.id ? task : t))
    }
    setEditing(null)
  }
  const handleDelete = () => {
    saveTasks(flatData.filter(t => t.id !== editing.id))
    setEditing(null)
  }

  // Filter
  const visible = flatData.filter(t => {
    if (filterDay  !== 'all' && !(t.days||[]).includes(filterDay))  return false
    if (filterType !== 'all' && t.type !== filterType)               return false
    return true
  })

  // Sort: by first day, then type
  const dayOrder = Object.fromEntries(DAYS.map((d,i)=>[d,i]))
  const sorted = [...visible].sort((a,b)=>{
    const da = Math.min(...(a.days||[]).map(d=>dayOrder[d]??99))
    const db = Math.min(...(b.days||[]).map(d=>dayOrder[d]??99))
    if (da!==db) return da-db
    return (a.type==='week'?0:1)-(b.type==='week'?0:1)
  })

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
        <div className="page-title" style={{ marginBottom:0 }}>Recurring Schedule</div>
        <button onClick={()=>setEditing('new')}
          style={{ fontSize:12, padding:'8px 16px', borderRadius:10, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, flexShrink:0 }}>
          + New Task
        </button>
      </div>
      <div className="page-sub">{flatData.length} recurring tasks across the week</div>

      {/* Filters */}
      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:8 }}>
        <button onClick={()=>setFilterDay('all')} style={filterPill(filterDay==='all')}>All days</button>
        {DAYS.map(d=>(
          <button key={d} onClick={()=>setFilterDay(filterDay===d?'all':d)} style={filterPill(filterDay===d)}>{DAY_SHORT[d]}</button>
        ))}
      </div>
      <div style={{ display:'flex', gap:5, marginBottom:16 }}>
        {[['all','All types'],['week','Week only'],['today','Today only']].map(([v,l])=>(
          <button key={v} onClick={()=>setFilterType(v)}
            style={{ fontSize:10, padding:'4px 11px', borderRadius:16, border:`1.5px solid ${filterType===v?'var(--teal)':'var(--border)'}`,
              background:filterType===v?'#F0FDFB':'white', color:filterType===v?'var(--teal)':'var(--muted)',
              cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, letterSpacing:.5 }}>{l}</button>
        ))}
      </div>

      {/* Task list */}
      {sorted.length===0 ? (
        <div style={{ textAlign:'center', padding:'28px 0', color:'var(--muted)', fontSize:13 }}>
          No tasks match this filter.
        </div>
      ) : sorted.map(task=>(
        <TaskListRow key={task.id+task.type+(task.days||[]).join('')} task={task} onEdit={()=>setEditing(task)} />
      ))}

      {/* Reset */}
      <div style={{ marginTop:24, paddingTop:16, borderTop:'1px solid var(--border)' }}>
        {!confirmReset ? (
          <button onClick={()=>setConfirmReset(true)}
            style={{ fontSize:11, padding:'7px 14px', borderRadius:8, border:'1px solid #FECACA', background:'#FFF5F5', color:'#991B1B', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
            Reset to built-in defaults
          </button>
        ) : (
          <div style={{ background:'#FFF5F5', borderRadius:10, border:'1px solid #FECACA', padding:12 }}>
            <div style={{ fontSize:13, color:'#991B1B', marginBottom:8 }}>Discard all custom tasks and restore defaults?</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>{ updateRecurringTasks(null); setConfirmReset(false) }}
                style={{ fontSize:12, padding:'6px 14px', borderRadius:8, border:'none', background:'#EF4444', color:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>Yes, reset</button>
              <button onClick={()=>setConfirmReset(false)}
                style={{ fontSize:12, padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {editing && (
        <TaskModal
          initial={editing==='new' ? null : editing}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={()=>setEditing(null)} />
      )}
    </div>
  )
}

function filterPill(active) {
  return { fontSize:10, padding:'4px 11px', borderRadius:16,
    border:`1.5px solid ${active?'var(--forest)':'var(--border)'}`,
    background:active?'var(--forest)':'white', color:active?'var(--green-light)':'var(--muted)',
    cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, letterSpacing:.5 }
}
