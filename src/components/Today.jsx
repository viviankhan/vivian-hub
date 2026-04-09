import { useState, useEffect } from 'react'
import { getDailyTodos, MORNING_ROUTINE } from '../data/schedule.js'

const TAG_COLORS = {
  health:'#E07B2E', class:'#7C3AED', lab:'#059669', career:'#D97706',
  fitness:'#3B82F6', personal:'#A855F7', sleep:'#52B788', urgent:'#EF4444',
  carried:'#F59E0B', polish:'#EC4899', meeting:'#3B82F6', deadline:'#EF4444',
}
const TAGS = ['class','lab','career','health','fitness','personal','urgent','sleep','polish']

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function todayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
}
function nowMins() { const d = new Date(); return d.getHours()*60 + d.getMinutes() }
function parseTimeMins(label) {
  const m = label.match(/~?(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  let h = parseInt(m[1]); const min = parseInt(m[2]); const ap = m[3].toUpperCase()
  if (ap==='PM' && h!==12) h+=12; if (ap==='AM' && h===12) h=0
  return h*60+min
}
function timeToMins(t) {
  if (!t) return null; const [h,m] = t.split(':').map(Number); return h*60+m
}
function fmt12(t) {
  if (!t) return ''; const [h,m] = t.split(':').map(Number)
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`
}

// ── Delete/Reschedule modal ────────────────────────────────────
function ManageModal({ task, dateKey, onClose, onDelete, onReschedule }) {
  const [view, setView]   = useState('main')
  const [reason, setReason] = useState('')
  const [date, setDate]   = useState(dateKey)
  const [time, setTime]   = useState('')

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:16, padding:22, maxWidth:380, width:'100%', boxShadow:'0 24px 64px rgba(0,0,0,.3)' }}>
        {view === 'main' && (
          <>
            <div className="serif" style={{ fontSize:17, fontWeight:600, color:'var(--text)', marginBottom:8 }}>Manage Task</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:18, padding:'9px 12px', background:'#F7F6F3', borderRadius:9, lineHeight:1.5 }}>{task.label || task.text}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <button onClick={() => setView('reschedule')} style={{ padding:'11px', borderRadius:10, border:'1px solid var(--border)', background:'white', cursor:'pointer', textAlign:'left', fontSize:13, color:'var(--text)', fontFamily:'DM Sans,sans-serif' }}>
                📅 Reschedule to a different time or date
              </button>
              <button onClick={() => setView('delete')} style={{ padding:'11px', borderRadius:10, border:'1px solid #FECACA', background:'#FFF5F5', cursor:'pointer', textAlign:'left', fontSize:13, color:'#991B1B', fontFamily:'DM Sans,sans-serif' }}>
                🗑️ Delete and log why
              </button>
            </div>
            <button onClick={onClose} style={{ marginTop:12, width:'100%', padding:'9px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:'DM Sans,sans-serif' }}>Cancel</button>
          </>
        )}
        {view === 'delete' && (
          <>
            <div className="serif" style={{ fontSize:17, fontWeight:600, color:'#991B1B', marginBottom:6 }}>Delete Task</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:12, fontStyle:'italic' }}>{task.label || task.text}</div>
            <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:5 }}>Reason (optional — appears in log)</div>
            <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. ran out of time, not needed today…" rows={3}
              style={{ width:'100%', fontSize:13, padding:'9px 11px', borderRadius:9, border:'1px solid var(--border)', marginBottom:12, fontFamily:'DM Sans,sans-serif', resize:'none', outline:'none', lineHeight:1.5 }} />
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => { onDelete(task, reason); onClose() }}
                style={{ flex:1, padding:'10px', borderRadius:10, border:'none', background:'#EF4444', color:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:13 }}>
                Delete{reason ? ' & Log' : ''}
              </button>
              <button onClick={() => setView('main')} style={{ padding:'10px 14px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:'DM Sans,sans-serif' }}>Back</button>
            </div>
          </>
        )}
        {view === 'reschedule' && (
          <>
            <div className="serif" style={{ fontSize:17, fontWeight:600, color:'var(--text)', marginBottom:6 }}>Reschedule</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14, fontStyle:'italic' }}>{task.label || task.text}</div>
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Date</div>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  style={{ width:'100%', fontSize:12, padding:'8px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Time</div>
                <input type="time" value={time} onChange={e => setTime(e.target.value)}
                  style={{ width:'100%', fontSize:12, padding:'8px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => { onReschedule(task, date, time); onClose() }}
                style={{ flex:1, padding:'10px', borderRadius:10, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:13 }}>
                Reschedule
              </button>
              <button onClick={() => setView('main')} style={{ padding:'10px 14px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:'DM Sans,sans-serif' }}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Task row ───────────────────────────────────────────────────
function TaskRow({ id, label, note, tag, done, overdue, onToggle, onManage }) {
  const dot = TAG_COLORS[tag] || '#9CA3AF'
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start', background:overdue?'#FFF5F5':'white', borderRadius:12, border:`1px solid ${overdue?'#FECACA':'var(--border)'}`, padding:'11px 14px', marginBottom:7, opacity:done?.45:1 }}>
      <div onClick={onToggle} style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2, cursor:'pointer', border:done?'none':`2px solid ${overdue?'#FCA5A5':dot}`, background:done?'#52B788':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {done && <span style={{ color:'white', fontSize:11, fontWeight:700 }}>✓</span>}
      </div>
      <div style={{ flex:1, cursor:'pointer' }} onClick={onToggle}>
        <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', textDecoration:done?'line-through':'none' }}>{label}</div>
        {note && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, lineHeight:1.4 }}>{note}</div>}
        <div style={{ display:'flex', gap:5, marginTop:4, flexWrap:'wrap' }}>
          <span style={{ fontSize:9, padding:'2px 7px', borderRadius:10, background:`${dot}18`, color:dot, fontWeight:600, letterSpacing:1, textTransform:'uppercase' }}>{tag}</span>
          {overdue && !done && <span style={{ fontSize:9, padding:'2px 7px', borderRadius:10, background:'#FEE2E2', color:'#991B1B', fontWeight:600, letterSpacing:1, textTransform:'uppercase' }}>overdue</span>}
        </div>
      </div>
      {!done && <button onClick={onManage} style={{ fontSize:12, padding:'3px 8px', borderRadius:8, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', flexShrink:0, alignSelf:'center' }}>···</button>}
    </div>
  )
}

// ── Quick-add task ─────────────────────────────────────────────
function QuickAdd({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [time,  setTime]  = useState('')
  const [tag,   setTag]   = useState('personal')

  const submit = () => {
    if (!label.trim()) return
    const display = time ? `${fmt12(time)} — ${label.trim()}` : label.trim()
    onAdd({ id:'custom-'+Date.now(), label:display, note:'', tag, custom:true })
    setLabel(''); setTime(''); setTag('personal'); setOpen(false)
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      style={{ width:'100%', padding:'10px', borderRadius:12, border:'1px dashed var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:'DM Sans,sans-serif', marginBottom:8 }}>
      + Add task to today
    </button>
  )

  return (
    <div style={{ background:'white', borderRadius:12, border:'1px solid var(--forest)', padding:'14px', marginBottom:10 }}>
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Task description…" autoFocus
        onKeyDown={e => e.key==='Enter' && submit()}
        style={{ width:'100%', fontSize:13, padding:'8px 10px', borderRadius:9, border:'1px solid var(--border)', marginBottom:8, fontFamily:'DM Sans,sans-serif', outline:'none' }} />
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <input type="time" value={time} onChange={e => setTime(e.target.value)}
          style={{ fontSize:12, padding:'6px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
        <select value={tag} onChange={e => setTag(e.target.value)}
          style={{ fontSize:12, padding:'6px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', background:'white', cursor:'pointer' }}>
          {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={submit} style={{ padding:'6px 16px', borderRadius:9, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:12 }}>Add</button>
        <button onClick={() => setOpen(false)} style={{ padding:'6px 12px', borderRadius:9, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:'DM Sans,sans-serif' }}>Cancel</button>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Today({ todos, weekState, syncToggle, commitments, appendLog }) {
  const [morningOpen, setMorningOpen] = useState(false)
  const [now, setNow] = useState(nowMins())
  const [managing, setManaging] = useState(null)
  const [customTasks, setCustomTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vivian_custom_'+todayKey()) || '[]') } catch { return [] }
  })
  const [deleted, setDeleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vivian_deleted_'+todayKey()) || '[]') } catch { return [] }
  })

  useEffect(() => { const t = setInterval(() => setNow(nowMins()), 60000); return () => clearInterval(t) }, [])

  const dateKey = todayKey()
  const templateTodos = getDailyTodos(dateKey).filter(t => !deleted.includes(t.id))
  const todayCommitments = (commitments||[]).filter(c => c.date===dateKey && !c.done)
  const isDone = id => !!(todos[id] || weekState[id])

  const allTasks = [...todayCommitments.map(c => ({
    id:c.id, label: c.time?`${fmt12(c.time)} — ${c.text}`:c.text,
    note:[c.person&&`With: ${c.person}`, c.prepMin&&`Leave ${c.prepMin} min early`].filter(Boolean).join(' · '),
    tag:c.cat, isCommitment:true
  })), ...templateTodos, ...customTasks]

  const doneCount = allTasks.filter(t => isDone(t.id)).length

  const handleAdd = (task) => {
    const next = [...customTasks, task]
    setCustomTasks(next)
    localStorage.setItem('vivian_custom_'+dateKey, JSON.stringify(next))
  }

  const handleDelete = (task, reason) => {
    const next = [...deleted, task.id]
    setDeleted(next)
    localStorage.setItem('vivian_deleted_'+dateKey, JSON.stringify(next))
    if (appendLog && reason) {
      appendLog({ date:dateKey, dateLabel:todayLabel(), label:`Deleted: ${task.label} — ${reason}`, tag:'deleted', ts:new Date().toISOString() })
    }
  }

  const handleReschedule = (task, date, time) => {
    handleDelete(task, null)
    try {
      const key = 'vivian_rescheduled_'+date
      const existing = JSON.parse(localStorage.getItem(key)||'[]')
      localStorage.setItem(key, JSON.stringify([...existing, { ...task, rescheduledTime:time, rescheduledFrom:dateKey }]))
    } catch {}
    if (appendLog) {
      appendLog({ date:dateKey, dateLabel:todayLabel(), label:`Rescheduled: ${task.label} → ${date}${time?' @ '+fmt12(time):''}`, tag:'rescheduled', ts:new Date().toISOString() })
    }
  }

  return (
    <div>
      <div className="page-title">{todayLabel()}</div>
      <div className="page-sub">{doneCount}/{allTasks.length} tasks done today</div>

      {/* Morning routine */}
      <div onClick={() => setMorningOpen(o=>!o)}
        style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:'12px 16px', marginBottom:12, cursor:'pointer', userSelect:'none' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>☀️</span>
            <div>
              <div className="serif" style={{ fontSize:15, fontWeight:600 }}>Morning Routine</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>6:00 – 7:50 AM · {morningOpen?'collapse':'expand'}</div>
            </div>
          </div>
          <span style={{ color:'var(--muted)', fontSize:14, transform:morningOpen?'rotate(180deg)':'', transition:'transform .2s' }}>▾</span>
        </div>
        {morningOpen && (
          <div onClick={e=>e.stopPropagation()} style={{ marginTop:14, borderTop:'1px solid var(--border)', paddingTop:12 }}>
            {MORNING_ROUTINE.map(item => (
              <div key={item.habit} className="routine-item">
                <div className="routine-time">{item.time}</div>
                <div className="routine-icon">{item.icon}</div>
                <div><div className="routine-habit">{item.habit}</div><div className="routine-detail">{item.detail}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All tasks */}
      <p className="section-label">Today's Schedule</p>
      {allTasks.length === 0 ? (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:20, textAlign:'center', color:'var(--muted)', fontSize:13, marginBottom:8 }}>
          No schedule for {dateKey} yet.
        </div>
      ) : allTasks.filter(t => !deleted.includes(t.id)).map(t => {
        const done = isDone(t.id)
        const mins = parseTimeMins(t.label)
        const overdue = !done && mins!==null && now>mins+10
        return (
          <TaskRow key={t.id} id={t.id} label={t.label} note={t.note}
            tag={t.tag} done={done} overdue={overdue}
            onToggle={() => syncToggle(t.id, t.label, t.tag)}
            onManage={() => setManaging(t)} />
        )
      })}

      <QuickAdd onAdd={handleAdd} />

      {managing && (
        <ManageModal task={managing} dateKey={dateKey} onClose={() => setManaging(null)}
          onDelete={handleDelete} onReschedule={handleReschedule} />
      )}
    </div>
  )
}
