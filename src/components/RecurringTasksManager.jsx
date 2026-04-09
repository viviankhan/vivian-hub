import { useState } from 'react'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
const DAY_LABELS = { monday:'Monday', tuesday:'Tuesday', wednesday:'Wednesday', thursday:'Thursday', friday:'Friday', saturday:'Saturday', sunday:'Sunday' }
const WEEK_CATS  = ['class','lab','career','health','fitness','personal','urgent','sleep','polish']
const TODAY_TAGS = ['class','lab','career','health','fitness','personal','urgent','sleep','polish','carried']
const CAT_COLORS = {
  lab:'#059669', class:'#7C3AED', career:'#D97706', personal:'#A855F7',
  urgent:'#EF4444', health:'#E07B2E', fitness:'#3B82F6', sleep:'#52B788', polish:'#EC4899', carried:'#F59E0B',
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,30)
}
function Tag({ value }) {
  const color = CAT_COLORS[value] || '#9CA3AF'
  return <span style={{ fontSize:9, padding:'2px 6px', borderRadius:8, background:`${color}20`, color, fontWeight:700, letterSpacing:.8, textTransform:'uppercase', flexShrink:0 }}>{value}</span>
}
function TypeBadge({ type }) {
  return <span style={{ fontSize:9, padding:'2px 6px', borderRadius:8, background: type==='week'?'#E0F2FE':'#FEF9C3', color: type==='week'?'#0369A1':'#854D0E', fontWeight:700, letterSpacing:.8, textTransform:'uppercase', flexShrink:0 }}>{type==='week'?'Week':'Today'}</span>
}

// ── Inline add/edit form ───────────────────────────────────────
function TaskForm({ initial, dayName, onSave, onCancel }) {
  const [type,  setType]  = useState(initial?.type  || (initial?.label ? 'today' : 'week'))
  const [text,  setText]  = useState(initial?.text  || initial?.label || '')
  const [cat,   setCat]   = useState(initial?.cat   || initial?.tag   || 'lab')
  const [note,  setNote]  = useState(initial?.note  || '')
  const [carry, setCarry] = useState(initial?.carry || false)
  const [id,    setId]    = useState(initial?.id    || '')

  const save = () => {
    if (!text.trim()) return
    const finalId = id.trim() || `${dayName.slice(0,3)}-${slugify(text)}`
    if (type === 'week') onSave({ type:'week',  id:finalId, text:text.trim(), cat, carry })
    else                 onSave({ type:'today', id:finalId, label:text.trim(), note:note.trim(), tag:cat })
  }

  return (
    <div style={{ background:'#F7F6F3', borderRadius:10, border:'1px solid var(--border)', padding:12, margin:'6px 0' }}>
      {/* Type toggle */}
      <div style={{ display:'flex', gap:0, marginBottom:10, borderRadius:8, overflow:'hidden', border:'1px solid var(--border)', width:'fit-content' }}>
        {[['week','Week Panel'],['today','Today Schedule']].map(([v,l]) => (
          <button key={v} onClick={()=>setType(v)}
            style={{ fontSize:11, padding:'5px 12px', border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600,
              background:type===v?'var(--forest)':'white', color:type===v?'var(--green-light)':'var(--muted)' }}>
            {l}
          </button>
        ))}
      </div>

      <input value={text} onChange={e=>setText(e.target.value)} autoFocus
        placeholder={type==='today' ? 'Label (e.g. 9:50 AM — Coral Reef class)…' : 'Task text…'}
        onKeyDown={e=>e.key==='Enter'&&save()}
        style={{ width:'100%', fontSize:13, padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', marginBottom:6, boxSizing:'border-box' }} />

      {type==='today' && (
        <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Note (optional)…"
          style={{ width:'100%', fontSize:12, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', outline:'none', marginBottom:6, boxSizing:'border-box', color:'var(--muted)' }} />
      )}

      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <select value={cat} onChange={e=>setCat(e.target.value)}
          style={{ fontSize:12, padding:'5px 8px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', background:'white', cursor:'pointer' }}>
          {(type==='week'?WEEK_CATS:TODAY_TAGS).map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        {type==='week' && (
          <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:'var(--muted)', cursor:'pointer' }}>
            <input type="checkbox" checked={carry} onChange={e=>setCarry(e.target.checked)} />
            carry forward
          </label>
        )}
        <input value={id} onChange={e=>setId(e.target.value)} placeholder="custom id (optional)"
          style={{ fontSize:11, padding:'5px 8px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'monospace', color:'var(--muted)', width:150, outline:'none' }} />
        <button onClick={save} style={{ fontSize:12, padding:'6px 14px', borderRadius:8, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>Save</button>
        <button onClick={onCancel} style={{ fontSize:12, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>Cancel</button>
      </div>
    </div>
  )
}

// ── Task row ───────────────────────────────────────────────────
function TaskRow({ task, type, onEdit, onDelete }) {
  const text = task.text || task.label || ''
  const cat  = task.cat  || task.tag  || 'lab'
  return (
    <div style={{ display:'flex', gap:8, alignItems:'center', padding:'7px 0', borderBottom:'1px solid #F5F3EF' }}>
      <TypeBadge type={type} />
      <div style={{ flex:1, fontSize:13, color:'var(--text)', lineHeight:1.3 }}>
        {text}
        {task.note && <span style={{ fontSize:11, color:'var(--muted)', marginLeft:6 }}>· {task.note}</span>}
      </div>
      <Tag value={cat} />
      {type==='week' && task.carry && <span style={{ fontSize:9, color:'#F59E0B', fontWeight:700 }}>↩</span>}
      <button onClick={onEdit}   style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1px solid var(--border)', background:'white', color:'var(--text)', cursor:'pointer', flexShrink:0 }}>Edit</button>
      <button onClick={onDelete} style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1px solid #FECACA', background:'white', color:'#EF4444', cursor:'pointer', flexShrink:0 }}>✕</button>
    </div>
  )
}

// ── Day accordion ──────────────────────────────────────────────
function DayAccordion({ dayName, weekTasks, dailyTodos, onSaveTask, onDeleteTask }) {
  const [open,    setOpen]    = useState(false)
  const [adding,  setAdding]  = useState(false)
  const [editing, setEditing] = useState(null) // task id being edited

  const allTasks = [
    ...(weekTasks  || []).map(t => ({ ...t, _type:'week'  })),
    ...(dailyTodos || []).map(t => ({ ...t, _type:'today' })),
  ]
  const total = allTasks.length
  const wCount = (weekTasks||[]).length
  const tCount = (dailyTodos||[]).length

  const handleSave = (task) => {
    onSaveTask(dayName, task, editing)
    setAdding(false)
    setEditing(null)
  }

  return (
    <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', marginBottom:8, overflow:'hidden' }}>
      {/* Header row */}
      <div onClick={()=>setOpen(o=>!o)}
        style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', cursor:'pointer', userSelect:'none' }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)', flex:1 }}>{DAY_LABELS[dayName]}</span>
        {total > 0 ? (
          <div style={{ display:'flex', gap:5 }}>
            {wCount > 0 && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'#E0F2FE', color:'#0369A1', fontWeight:600 }}>{wCount} week</span>}
            {tCount > 0 && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'#FEF9C3', color:'#854D0E', fontWeight:600 }}>{tCount} today</span>}
          </div>
        ) : (
          <span style={{ fontSize:11, color:'var(--muted)' }}>no tasks</span>
        )}
        <span style={{ color:'var(--muted)', fontSize:12, transform:open?'rotate(180deg)':'', transition:'transform .2s' }}>▾</span>
      </div>

      {/* Body */}
      {open && (
        <div style={{ borderTop:'1px solid var(--border)', padding:'8px 16px 12px' }}>
          {allTasks.length === 0 && !adding && (
            <div style={{ fontSize:12, color:'var(--muted)', padding:'6px 0 8px' }}>No recurring tasks for {DAY_LABELS[dayName]}.</div>
          )}

          {allTasks.map(task => (
            editing === task.id
              ? <TaskForm key={task.id} initial={{ ...task, type:task._type }} dayName={dayName}
                  onSave={handleSave} onCancel={()=>setEditing(null)} />
              : <TaskRow key={task.id} task={task} type={task._type}
                  onEdit={()=>setEditing(task.id)}
                  onDelete={()=>onDeleteTask(dayName, task.id, task._type)} />
          ))}

          {adding
            ? <TaskForm dayName={dayName} onSave={handleSave} onCancel={()=>setAdding(false)} />
            : <button onClick={()=>setAdding(true)}
                style={{ marginTop:6, fontSize:12, padding:'6px 14px', borderRadius:8, border:'1px dashed var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', width:'100%' }}>
                + Add task for {DAY_LABELS[dayName]}
              </button>
          }
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function RecurringTasksManager({ recurringTasks, updateRecurringTasks, defaultWeekTasks, defaultDailyTodos }) {
  const [confirmReset, setConfirmReset] = useState(false)

  const weekTasks  = recurringTasks?.weekTasks  ?? defaultWeekTasks
  const dailyTodos = recurringTasks?.dailyTodos ?? defaultDailyTodos

  function save(wt, dt) {
    updateRecurringTasks({ weekTasks:wt, dailyTodos:dt })
  }

  const handleSaveTask = (day, task, editingId) => {
    if (task.type === 'week') {
      const { type:_, _type:__, ...clean } = task
      const current = weekTasks[day] || []
      const next = editingId
        ? current.map(t => t.id===editingId ? clean : t)
        : [...current, clean]
      save({ ...weekTasks, [day]:next }, dailyTodos)
    } else {
      const { type:_, _type:__, ...clean } = task
      const current = dailyTodos[day] || []
      const next = editingId
        ? current.map(t => t.id===editingId ? clean : t)
        : [...current, clean]
      save(weekTasks, { ...dailyTodos, [day]:next })
    }
  }

  const handleDeleteTask = (day, id, type) => {
    if (type === 'week') {
      save({ ...weekTasks, [day]:(weekTasks[day]||[]).filter(t=>t.id!==id) }, dailyTodos)
    } else {
      save(weekTasks, { ...dailyTodos, [day]:(dailyTodos[day]||[]).filter(t=>t.id!==id) })
    }
  }

  return (
    <div>
      <div className="page-title">Recurring Schedule</div>
      <div className="page-sub">
        Tasks marked <strong>Week</strong> appear in the Week tab. Tasks marked <strong>Today</strong> appear in Today's hour-by-hour schedule. Both repeat every week automatically.
      </div>

      {DAYS.map(day => (
        <DayAccordion key={day} dayName={day}
          weekTasks={weekTasks[day]}
          dailyTodos={dailyTodos[day]}
          onSaveTask={handleSaveTask}
          onDeleteTask={handleDeleteTask} />
      ))}

      {/* Reset */}
      <div style={{ marginTop:20, paddingTop:16, borderTop:'1px solid var(--border)' }}>
        {!confirmReset ? (
          <button onClick={()=>setConfirmReset(true)}
            style={{ fontSize:12, padding:'7px 14px', borderRadius:8, border:'1px solid #FECACA', background:'#FFF5F5', color:'#991B1B', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
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
    </div>
  )
}
