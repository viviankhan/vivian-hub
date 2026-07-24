import { useState, useMemo } from 'react'
import { Icon } from './IconPicker.jsx'
import { catIds, resolveCats } from '../data/categories.js'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
const DAY_SHORT = { monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu', friday:'Fri', saturday:'Sat', sunday:'Sun' }

// Which tabs a recurring task can surface on, in display order.
const SURFACES = [
  { id:'today',    label:'Today',    hint:'Shows in the Today timeline on matching days',       bg:'#FEF9C3', fg:'#854D0E' },
  { id:'week',     label:'Week',     hint:'Shows in the Week grid on matching days',            bg:'#E0F2FE', fg:'#0369A1' },
  { id:'calendar', label:'Calendar', hint:'Marked on the Calendar month view on matching days', bg:'#F3E8FF', fg:'#7C3AED' },
]
// Legacy rows may only have `type`; derive surfaces so old tasks still render.
function taskSurfaces(task) {
  if (Array.isArray(task?.surfaces) && task.surfaces.length) return task.surfaces
  return [task?.type === 'today' ? 'today' : 'week']
}

// Current day-of-week name. JS getDay(): 0=Sun…6=Sat → mapped to DAYS (Mon-indexed)
const JS_DAY_TO_NAME = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
function todayName() { return JS_DAY_TO_NAME[new Date().getDay()] }

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

function Tag({ label, color, icon }) {
  const c = color || '#9CA3AF'
  return <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:9, padding:'2px 6px', borderRadius:6, background:`${c}20`, color:c, fontWeight:700, letterSpacing:.8, textTransform:'uppercase' }}>{icon && <Icon value={icon} size={11} />}{label}</span>
}
function SurfaceBadges({ surfaces }) {
  return (
    <div style={{ display:'flex', gap:3, flexShrink:0 }}>
      {SURFACES.filter(s => surfaces.includes(s.id)).map(s => (
        <span key={s.id} style={{ fontSize:9, padding:'2px 6px', borderRadius:6,
          background:s.bg, color:s.fg, fontWeight:700, letterSpacing:.8, textTransform:'uppercase' }}>{s.label}</span>
      ))}
    </div>
  )
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
function TaskModal({ initial, onSave, onDelete, onClose, categories }) {
  const isNew = !initial
  const catList = (categories && categories.length) ? categories : [{ id:'other', label:'Other', color:'#8899AA' }]
  const [text,      setText]      = useState(initial?.text||initial?.label||'')
  const [note,      setNote]      = useState(initial?.note||'')
  const [surfaces,  setSurfaces]  = useState(initial ? taskSurfaces(initial) : ['today'])
  // Multiple labels allowed, stored comma-joined; parse any existing value.
  const [selCats,   setSelCats]   = useState(() => {
    const ids = catIds(initial?.cat||initial?.tag)
    return ids.length ? ids : [catList[0].id]
  })
  const toggleCat = (id) => setSelCats(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])
  const [carry,     setCarry]     = useState(initial?.carry||false)
  const [days,      setDays]      = useState(initial?.days||['monday'])
  const [startDate, setStartDate] = useState(initial?.startDate||'')
  const [endDate,   setEndDate]   = useState(initial?.endDate||'')
  const [noEnd,     setNoEnd]     = useState(!initial?.endDate)

  const toggleDay = (d) => setDays(prev => prev.includes(d) ? prev.filter(x=>x!==d) : [...prev,d])
  const toggleSurface = (s) => setSurfaces(prev => prev.includes(s) ? prev.filter(x=>x!==s) : [...prev,s])
  const showsOnWeek = surfaces.includes('week')

  const save = () => {
    if (!text.trim() || days.length===0 || surfaces.length===0 || selCats.length===0) return
    const id = initial?.id || `${days[0].slice(0,3)}-${slugify(text)}`
    const trimmed = text.trim()
    const cat = selCats.join(',')
    onSave({
      id, days, surfaces,
      cat, tag:cat,
      startDate:startDate||null, endDate:(!noEnd&&endDate)||null,
      // text + label carry the same value so every tab renders it either way.
      text:trimmed, label:trimmed, note:note.trim(),
      carry: showsOnWeek ? carry : false,
    })
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
          {/* Surfaces — where this task shows up (pick one or more) */}
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', marginBottom:6 }}>Show in</div>
          <div style={{ display:'flex', gap:6, marginBottom:6, flexWrap:'wrap' }}>
            {SURFACES.map(s=>{
              const on = surfaces.includes(s.id)
              return (
                <button key={s.id} onClick={()=>toggleSurface(s.id)} title={s.hint}
                  style={{ fontSize:12, padding:'7px 14px', borderRadius:10, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                    border:`1.5px solid ${on?'var(--forest)':'var(--border)'}`,
                    background:on?'var(--forest)':'white', color:on?'var(--green-light)':'var(--muted)' }}>
                  {on?'✓ ':''}{s.label}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:14, lineHeight:1.4 }}>
            {surfaces.length===0
              ? <span style={{ color:'#EF4444' }}>Pick at least one place for it to show.</span>
              : SURFACES.filter(s=>surfaces.includes(s.id)).map(s=>s.hint).join(' · ')}
          </div>

          {/* Text */}
          <input value={text} onChange={e=>setText(e.target.value)} autoFocus
            placeholder="Task description (e.g. 9:50 AM — Coral Reef class)…"
            style={inp} />

          {/* Note (optional sub-text) */}
          <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Note (optional sub-text)…"
            style={{ ...inp, color:'var(--muted)', fontSize:12 }} />

          {/* Labels — tick one or more */}
          <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase', marginBottom:6 }}>
            Labels {selCats.length>1 && <span style={{ textTransform:'none', letterSpacing:0, color:'var(--teal)' }}>· {selCats.length} selected</span>}
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
            {catList.map(c=>{
              const on = selCats.includes(c.id)
              return (
                <button key={c.id} onClick={()=>toggleCat(c.id)}
                  style={{ fontSize:11, padding:'4px 12px', borderRadius:20, cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:on?600:400,
                    border:on?'none':'1px solid var(--border)', background:on?(c.color||'var(--forest)'):'white', color:on?'white':'var(--muted)' }}>
                  {on?'✓ ':''}{c.label}
                </button>
              )
            })}
          </div>
          {showsOnWeek && (
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--muted)', cursor:'pointer', marginBottom:14 }}>
              <input type="checkbox" checked={carry} onChange={e=>setCarry(e.target.checked)} />
              carry forward if undone
            </label>
          )}

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
              <button onClick={save} disabled={!text.trim()||days.length===0||surfaces.length===0||selCats.length===0}
                style={{ fontSize:13, padding:'10px 20px', borderRadius:10, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, opacity:(!text.trim()||days.length===0||surfaces.length===0||selCats.length===0)?.5:1 }}>
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
function TaskListRow({ task, onEdit, today, categories }) {
  const text = task.text||task.label||''
  const cats = resolveCats(task.cat||task.tag||'other', categories)
  const hasDateRange = task.startDate || task.endDate
  const isToday = task.days?.includes(today)
  return (
    <div onClick={onEdit}
      style={{ display:'flex', gap:10, alignItems:'center', background:isToday?'#F0FDFB':'white', borderRadius:11, border:`1px solid ${isToday?'var(--teal)':'var(--border)'}`, borderLeft:isToday?'3px solid var(--teal)':'1px solid var(--border)', padding:'11px 14px', marginBottom:7, cursor:'pointer', transition:'border-color .15s' }}
      onMouseEnter={e=>e.currentTarget.style.borderColor='#52B788'}
      onMouseLeave={e=>e.currentTarget.style.borderColor=isToday?'var(--teal)':'var(--border)'}>
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
      <div style={{ display:'flex', gap:3, flexWrap:'wrap', justifyContent:'flex-end', flexShrink:0 }}>
        {cats.map(c => <Tag key={c.id} label={c.label} color={c.color} icon={c.icon} />)}
      </div>
      <SurfaceBadges surfaces={taskSurfaces(task)} />
      {/* Day labels — to the right of the title; current day highlighted in teal */}
      <div style={{ display:'flex', gap:3, flexWrap:'wrap', justifyContent:'flex-end', maxWidth:150, flexShrink:0 }}>
        {DAYS.filter(d=>task.days?.includes(d)).map(d=>(
          <span key={d} style={{ fontSize:9, padding:'2px 6px', borderRadius:6, background:d===today?'var(--teal)':'var(--forest)', color:d===today?'white':'var(--green-light)', fontWeight:700, letterSpacing:.5 }}>{DAY_SHORT[d]}</span>
        ))}
      </div>
      <span style={{ fontSize:11, color:'var(--muted)', flexShrink:0 }}>›</span>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function RecurringTasksManager({ recurringTasks, addRecurringTask, updateRecurringTask, deleteRecurringTask, clearRecurringTasks, categories, defaultWeekTasks, defaultDailyTodos }) {
  const [editing,     setEditing]     = useState(null) // null | 'new' | task object
  const [filterDay,   setFilterDay]   = useState(todayName())
  const [filterSurface, setFilterSurface] = useState('all')
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing,     setClearing]     = useState(false)
  const today = todayName()

  // Build flat tasks array — migrate legacy format if needed
  // Deduplicates tasks with the same text+type into one entry with merged days
  const flatData = useMemo(() => {
    if (Array.isArray(recurringTasks?.tasks)) return recurringTasks.tasks

    // Build raw list from defaults or legacy per-day format
    const raw = []
    const wt = recurringTasks?.weekTasks  || defaultWeekTasks
    const dt = recurringTasks?.dailyTodos || defaultDailyTodos
    DAYS.forEach(day => {
      ;(wt[day]||[]).forEach(t => raw.push({ ...t, type:'week',  days:[day], startDate:null, endDate:null }))
      ;(dt[day]||[]).forEach(t => raw.push({ ...t, type:'today', days:[day], startDate:null, endDate:null }))
    })

    // Deduplicate: group by (text|label) + surfaces + cat/tag → merge days arrays
    const map = new Map()
    raw.forEach(task => {
      const key = `${task.text||task.label}||${taskSurfaces(task).join(',')}||${task.cat||task.tag}`
      if (map.has(key)) {
        const existing = map.get(key)
        const merged = [...new Set([...existing.days, ...task.days])]
        map.set(key, { ...existing, days: merged })
      } else {
        map.set(key, { ...task })
      }
    })
    // Sort days within each task to canonical order
    const result = Array.from(map.values()).map(t => ({
      ...t, days: DAYS.filter(d => t.days.includes(d))
    }))
    return result
  }, [recurringTasks])

  // Each of these is now one atomic row operation (add/update/delete a single
  // task, or delete every row) rather than a whole-array overwrite — and
  // addRecurringTask/updateRecurringTask/etc. (in App.jsx) already surface
  // cloud-write failures via alert, so a failed save no longer looks like it
  // silently succeeded.
  const handleSave = async (task) => {
    if (editing === 'new') {
      await addRecurringTask(task)
    } else {
      await updateRecurringTask(editing.id, task)
    }
    setEditing(null)
  }
  const handleDelete = async () => {
    await deleteRecurringTask(editing.id)
    setEditing(null)
  }
  // Wait for the cloud write to finish before closing — prevents a fast refresh
  // from canceling the save and letting old data reload.
  const handleClearAll = async () => {
    setClearing(true)
    try {
      await clearRecurringTasks()
      setConfirmClear(false)
      setFilterDay(todayName())
    } finally {
      setClearing(false)
    }
  }

  // Filter
  const visible = flatData.filter(t => {
    if (filterDay     !== 'all' && !(t.days||[]).includes(filterDay))     return false
    if (filterSurface !== 'all' && !taskSurfaces(t).includes(filterSurface)) return false
    return true
  })

  // Sort: by first day, then by primary surface (today → week → calendar)
  const dayOrder = Object.fromEntries(DAYS.map((d,i)=>[d,i]))
  const surfaceRank = t => Math.min(...taskSurfaces(t).map(s => SURFACES.findIndex(x=>x.id===s)))
  const sorted = [...visible].sort((a,b)=>{
    const da = Math.min(...(a.days||[]).map(d=>dayOrder[d]??99))
    const db = Math.min(...(b.days||[]).map(d=>dayOrder[d]??99))
    if (da!==db) return da-db
    return surfaceRank(a)-surfaceRank(b)
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
      <div className="page-sub">
        {filterDay==='all'
          ? `${flatData.length} recurring tasks across the week`
          : `${sorted.length} on ${DAY_SHORT[filterDay]}${filterDay===today?' — Today':''} · ${flatData.length} total across the week`}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:8 }}>
        <button onClick={()=>setFilterDay('all')} style={filterPill(filterDay==='all')}>All days</button>
        {DAYS.map(d=>{
          const isToday = d===today
          return (
            <button key={d} onClick={()=>setFilterDay(filterDay===d?'all':d)}
              title={isToday?'Today':undefined}
              style={{ ...filterPill(filterDay===d), ...(isToday ? { borderColor:'var(--teal)', boxShadow:'0 0 0 2px rgba(74,158,181,.3)' } : {}) }}>
              {isToday?'• ':''}{DAY_SHORT[d]}
            </button>
          )
        })}
      </div>
      <div style={{ display:'flex', gap:5, marginBottom:16 }}>
        {[['all','All'],['today','Today'],['week','Week'],['calendar','Calendar']].map(([v,l])=>(
          <button key={v} onClick={()=>setFilterSurface(v)}
            style={{ fontSize:10, padding:'4px 11px', borderRadius:16, border:`1.5px solid ${filterSurface===v?'var(--teal)':'var(--border)'}`,
              background:filterSurface===v?'#F0FDFB':'white', color:filterSurface===v?'var(--teal)':'var(--muted)',
              cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, letterSpacing:.5 }}>{l}</button>
        ))}
      </div>

      {/* Task list */}
      {sorted.length===0 ? (
        <div style={{ textAlign:'center', padding:'28px 0', color:'var(--muted)', fontSize:13 }}>
          No tasks match this filter.
        </div>
      ) : sorted.map(task=>(
        <TaskListRow key={task.id+taskSurfaces(task).join('')+(task.days||[]).join('')} task={task} onEdit={()=>setEditing(task)} today={today} categories={categories} />
      ))}

      {/* Clear all */}
      <div style={{ marginTop:24, paddingTop:16, borderTop:'1px solid var(--border)' }}>
        {!confirmClear ? (
          <button onClick={()=>setConfirmClear(true)}
            style={{ fontSize:11, padding:'7px 14px', borderRadius:8, border:'1px solid #FECACA', background:'#FFF5F5', color:'#991B1B', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
            Clear all recurring events
          </button>
        ) : (
          <div style={{ background:'#FFF5F5', borderRadius:10, border:'1px solid #FECACA', padding:12 }}>
            <div style={{ fontSize:13, color:'#991B1B', marginBottom:8 }}>Remove every recurring event? This cannot be undone.</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleClearAll} disabled={clearing}
                style={{ fontSize:12, padding:'6px 14px', borderRadius:8, border:'none', background:'#EF4444', color:'white', cursor:clearing?'default':'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, opacity:clearing?.6:1 }}>{clearing ? 'Clearing…' : 'Yes, clear all'}</button>
              <button onClick={()=>setConfirmClear(false)} disabled={clearing}
                style={{ fontSize:12, padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:clearing?'default':'pointer', fontFamily:'DM Sans,sans-serif' }}>Cancel</button>
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
          onClose={()=>setEditing(null)}
          categories={categories} />
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
