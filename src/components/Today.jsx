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
function fmt12(t) {
  if (!t) return ''; const [h,m] = t.split(':').map(Number)
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`
}
function fmtNow(mins) {
  const h = Math.floor(mins/60), m = mins%60
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`
}
// Extract location from label or note
function extractLocation(label, note) {
  const combined = `${label} ${note||''}`
  const m = combined.match(/(?:Youngchild|Steitz|Briggs|Commons|Warch|Steitz|Lab)\s*[\d]*[^\s,·]*/i)
  return m ? m[0].trim() : null
}
// Day progress: 6am=0, 10:30pm=1
function dayProgress(nowM) {
  const start = 6*60, end = 22*60+30
  return Math.min(1, Math.max(0, (nowM - start) / (end - start)))
}

// ── Manage modal ───────────────────────────────────────────────
function ManageModal({ task, dateKey, onClose, onDelete, onReschedule }) {
  const [view, setView] = useState('main')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(dateKey)
  const [time, setTime] = useState('')
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:16, padding:22, maxWidth:380, width:'100%', boxShadow:'0 24px 64px rgba(0,0,0,.3)' }}>
        {view==='main' && <>
          <div className="serif" style={{ fontSize:17, fontWeight:600, color:'var(--text)', marginBottom:8 }}>Manage Task</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginBottom:18, padding:'9px 12px', background:'#F7F6F3', borderRadius:9, lineHeight:1.5 }}>{task.label||task.text}</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <button onClick={()=>setView('reschedule')} style={{ padding:'11px', borderRadius:10, border:'1px solid var(--border)', background:'white', cursor:'pointer', textAlign:'left', fontSize:13, color:'var(--text)', fontFamily:'DM Sans,sans-serif' }}>📅 Reschedule to a different time or date</button>
            <button onClick={()=>setView('delete')} style={{ padding:'11px', borderRadius:10, border:'1px solid #FECACA', background:'#FFF5F5', cursor:'pointer', textAlign:'left', fontSize:13, color:'#991B1B', fontFamily:'DM Sans,sans-serif' }}>🗑️ Delete and log why</button>
          </div>
          <button onClick={onClose} style={{ marginTop:12, width:'100%', padding:'9px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:'DM Sans,sans-serif' }}>Cancel</button>
        </>}
        {view==='delete' && <>
          <div className="serif" style={{ fontSize:17, fontWeight:600, color:'#991B1B', marginBottom:6 }}>Delete Task</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:12, fontStyle:'italic' }}>{task.label||task.text}</div>
          <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason (optional)…" rows={3}
            style={{ width:'100%', fontSize:13, padding:'9px 11px', borderRadius:9, border:'1px solid var(--border)', marginBottom:12, fontFamily:'DM Sans,sans-serif', resize:'none', outline:'none', lineHeight:1.5 }} />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>{ onDelete(task,reason); onClose() }} style={{ flex:1, padding:'10px', borderRadius:10, border:'none', background:'#EF4444', color:'white', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:13 }}>Delete{reason?' & Log':''}</button>
            <button onClick={()=>setView('main')} style={{ padding:'10px 14px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:'DM Sans,sans-serif' }}>Back</button>
          </div>
        </>}
        {view==='reschedule' && <>
          <div className="serif" style={{ fontSize:17, fontWeight:600, color:'var(--text)', marginBottom:6 }}>Reschedule</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14, fontStyle:'italic' }}>{task.label||task.text}</div>
          <div style={{ display:'flex', gap:8, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Date</div>
              <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{ width:'100%', fontSize:12, padding:'8px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Time</div>
              <input type="time" value={time} onChange={e=>setTime(e.target.value)} style={{ width:'100%', fontSize:12, padding:'8px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>{ onReschedule(task,date,time); onClose() }} style={{ flex:1, padding:'10px', borderRadius:10, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:13 }}>Reschedule</button>
            <button onClick={()=>setView('main')} style={{ padding:'10px 14px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:'DM Sans,sans-serif' }}>Back</button>
          </div>
        </>}
      </div>
    </div>
  )
}

// ── Task row ───────────────────────────────────────────────────
function TaskRow({ task, done, status, now, onToggle, onManage }) {
  const dot = TAG_COLORS[task.tag] || '#9CA3AF'
  const location = extractLocation(task.label, task.note)
  const isCurrent = status === 'current'
  const isOverdue = status === 'overdue'

  let bg = 'white', border = '1px solid var(--border)'
  if (isCurrent && !done) { bg = '#F0FDF4'; border = '2px solid #52B788' }
  else if (isOverdue && !done) { bg = '#FFF5F5'; border = '1px solid #FECACA' }
  else if (done) { bg = '#FAFAF7'; border = '1px solid #F0EDE8' }

  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start', background:bg, borderRadius:12, border, padding:'11px 14px', marginBottom:7, opacity:done?.4:1, transition:'all .2s' }}>
      <div onClick={onToggle} style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2, cursor:'pointer',
        border:done?'none':`2px solid ${isOverdue?'#FCA5A5':isCurrent?'#52B788':dot}`,
        background:done?'#52B788':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {done && <span style={{ color:'white', fontSize:11, fontWeight:700 }}>✓</span>}
      </div>
      <div style={{ flex:1, cursor:'pointer' }} onClick={onToggle}>
        <div style={{ fontSize:13, fontWeight:isCurrent&&!done?600:500, color:done?'var(--muted)':'var(--text)', textDecoration:done?'line-through':'none' }}>
          {task.label}
        </div>
        {task.note && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, lineHeight:1.4 }}>{task.note}</div>}
        <div style={{ display:'flex', gap:5, marginTop:4, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:9, padding:'2px 7px', borderRadius:10, background:`${dot}18`, color:dot, fontWeight:600, letterSpacing:1, textTransform:'uppercase' }}>{task.tag}</span>
          {location && !done && <span style={{ fontSize:9, padding:'2px 7px', borderRadius:10, background:'#EFF6FF', color:'#1E3A8A', fontWeight:500, letterSpacing:.5 }}>📍 {location}</span>}
          {isOverdue && !done && <span style={{ fontSize:9, padding:'2px 7px', borderRadius:10, background:'#FEE2E2', color:'#991B1B', fontWeight:600, letterSpacing:1, textTransform:'uppercase' }}>overdue</span>}
          {isCurrent && !done && <span style={{ fontSize:9, padding:'2px 7px', borderRadius:10, background:'#DCFCE7', color:'#166534', fontWeight:600, letterSpacing:1, textTransform:'uppercase' }}>● now</span>}
        </div>
      </div>
      {!done && <button onClick={onManage} style={{ fontSize:12, padding:'3px 8px', borderRadius:8, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', flexShrink:0, alignSelf:'center' }}>···</button>}
    </div>
  )
}

// ── Quick add ──────────────────────────────────────────────────
function QuickAdd({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [time, setTime] = useState('')
  const [tag, setTag] = useState('personal')
  const submit = () => {
    if (!label.trim()) return
    const id = 'custom-' + Date.now()
    onAdd({ id, label: time ? `${fmt12(time)} — ${label.trim()}` : label.trim(), tag, note:'' })
    setLabel(''); setTime(''); setOpen(false)
  }
  if (!open) return (
    <button onClick={()=>setOpen(true)} style={{ width:'100%', padding:'13px', borderRadius:12, border:'2px dashed var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontSize:13, fontFamily:'DM Sans,sans-serif', marginTop:4, transition:'all .2s' }}
      onMouseEnter={e=>e.target.style.borderColor='#52B788'} onMouseLeave={e=>e.target.style.borderColor='var(--border)'}>
      + Add task to today
    </button>
  )
  return (
    <div style={{ background:'white', borderRadius:12, border:'1px solid var(--forest)', padding:'14px', marginBottom:10 }}>
      <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Task description…" autoFocus
        onKeyDown={e=>e.key==='Enter'&&submit()}
        style={{ width:'100%', fontSize:13, padding:'8px 10px', borderRadius:9, border:'1px solid var(--border)', marginBottom:8, fontFamily:'DM Sans,sans-serif', outline:'none' }} />
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <input type="time" value={time} onChange={e=>setTime(e.target.value)} style={{ fontSize:12, padding:'6px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif' }} />
        <select value={tag} onChange={e=>setTag(e.target.value)} style={{ fontSize:12, padding:'6px 10px', borderRadius:9, border:'1px solid var(--border)', fontFamily:'DM Sans,sans-serif', background:'white', cursor:'pointer' }}>
          {TAGS.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={submit} style={{ padding:'6px 16px', borderRadius:9, border:'none', background:'var(--forest)', color:'var(--green-light)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:12 }}>Add</button>
        <button onClick={()=>setOpen(false)} style={{ padding:'6px 12px', borderRadius:9, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:'DM Sans,sans-serif' }}>Cancel</button>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Today({ todos, weekState, syncToggle, commitments, appendLog, dailyTodos }) {
  const [morningOpen, setMorningOpen] = useState(false)
  const [now, setNow] = useState(nowMins())
  const [managing, setManaging] = useState(null)
  const [customTasks, setCustomTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vivian_custom_'+todayKey())||'[]') } catch { return [] }
  })
  const [deleted, setDeleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vivian_deleted_'+todayKey())||'[]') } catch { return [] }
  })

  useEffect(() => { const t = setInterval(()=>setNow(nowMins()), 30000); return ()=>clearInterval(t) }, [])

  const dateKey = todayKey()
  const templateTodos = getDailyTodos(dateKey, dailyTodos).filter(t => !deleted.includes(t.id))
  const todayCommitments = (commitments||[]).filter(c => c.date===dateKey && !c.done)

  const isDone = (id, isCommitment) => isCommitment
    ? !!(todos[id] || weekState[id])
    : !!(todos[dateKey+'_'+id] || weekState[dateKey+'_'+id])

  const allTasks = [
    ...todayCommitments.map(c => ({
      id:c.id, label:c.time?`${fmt12(c.time)} — ${c.text}`:c.text,
      note:[c.person&&`With: ${c.person}`, c.prepMin&&`Leave ${c.prepMin} min early`].filter(Boolean).join(' · '),
      tag:c.cat, isCommitment:true
    })),
    ...templateTodos,
    ...customTasks,
  ]

  // Classify each task relative to now
  function getStatus(task) {
    const mins = parseTimeMins(task.label)
    if (mins === null) return 'anytime'
    if (isDone(task.id, task.isCommitment)) return 'done'
    if (mins > now) return 'upcoming'
    // find the next task's time to determine if this one is "current"
    const sortedTimed = allTasks
      .map(t => parseTimeMins(t.label))
      .filter(m => m !== null)
      .sort((a,b) => a-b)
    const nextTime = sortedTimed.find(m => m > now)
    if (mins <= now && (!nextTime || now < nextTime)) return 'current'
    return 'overdue'
  }

  // Sort: overdue first, then by time, then anytime, then done
  const STATUS_ORDER = { overdue:0, current:1, upcoming:2, anytime:3, done:4 }
  const tasksWithStatus = allTasks
    .filter(t => !deleted.includes(t.id))
    .map(t => ({ ...t, _status: isDone(t.id, t.isCommitment) ? 'done' : getStatus(t) }))
    .sort((a,b) => {
      const so = STATUS_ORDER[a._status] - STATUS_ORDER[b._status]
      if (so !== 0) return so
      const ta = parseTimeMins(a.label) ?? 9999
      const tb = parseTimeMins(b.label) ?? 9999
      return ta - tb
    })

  const doneCount = tasksWithStatus.filter(t => t._status==='done').length
  const totalCount = tasksWithStatus.length
  const progress = dayProgress(now)

  const handleAdd = (task) => {
    const next = [...customTasks, task]
    setCustomTasks(next)
    localStorage.setItem('vivian_custom_'+dateKey, JSON.stringify(next))
  }
  const handleDelete = (task, reason) => {
    const next = [...deleted, task.id]
    setDeleted(next)
    localStorage.setItem('vivian_deleted_'+dateKey, JSON.stringify(next))
    if (appendLog && reason) appendLog({ date:dateKey, dateLabel:todayLabel(), label:`Deleted: ${task.label} — ${reason}`, tag:'deleted', ts:new Date().toISOString() })
  }
  const handleReschedule = (task, date, time) => {
    handleDelete(task, null)
    try {
      const key = 'vivian_rescheduled_'+date
      const existing = JSON.parse(localStorage.getItem(key)||'[]')
      localStorage.setItem(key, JSON.stringify([...existing, { ...task, rescheduledTime:time, rescheduledFrom:dateKey }]))
    } catch {}
    if (appendLog) appendLog({ date:dateKey, dateLabel:todayLabel(), label:`Rescheduled: ${task.label} → ${date}${time?' @ '+fmt12(time):''}`, tag:'rescheduled', ts:new Date().toISOString() })
  }

  // Find where to insert the NOW marker
  let nowMarkerIndex = -1
  for (let i = 0; i < tasksWithStatus.length; i++) {
    if (tasksWithStatus[i]._status === 'upcoming' || tasksWithStatus[i]._status === 'anytime') {
      nowMarkerIndex = i
      break
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div className="page-title">{todayLabel()}</div>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:6 }}>
          <div style={{ fontSize:12, color:'var(--muted)' }}>{doneCount}/{totalCount} done</div>
          <div style={{ flex:1, height:4, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${(doneCount/Math.max(totalCount,1))*100}%`, background:'#52B788', borderRadius:2, transition:'width .4s' }} />
          </div>
        </div>
        {/* Day progress bar */}
        <div style={{ marginTop:8, position:'relative' }}>
          <div style={{ height:2, background:'var(--border)', borderRadius:1 }}>
            <div style={{ height:'100%', width:`${progress*100}%`, background:'linear-gradient(90deg, #7ABF5E, #0E9E8E)', borderRadius:1, transition:'width 30s' }} />
          </div>
          <div style={{ position:'absolute', top:-3, left:`${progress*100}%`, transform:'translateX(-50%)', fontSize:9, color:'var(--muted)', whiteSpace:'nowrap', marginTop:4 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--teal)', margin:'0 auto 2px' }} />
            {fmtNow(now)}
          </div>
        </div>
      </div>

      {/* Morning Routine */}
      <div onClick={()=>setMorningOpen(o=>!o)}
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

      {/* Task list with NOW marker */}
      <p className="section-label">Today's Schedule</p>
      {tasksWithStatus.length === 0 ? (
        <div style={{ background:'white', borderRadius:12, border:'1px solid var(--border)', padding:20, textAlign:'center', color:'var(--muted)', fontSize:13, marginBottom:8 }}>
          No schedule yet — add tasks below or set up recurring tasks in ⚙️ Settings.
        </div>
      ) : (
        <>
          {tasksWithStatus.map((t, i) => (
            <div key={t.id}>
              {/* NOW marker */}
              {i === nowMarkerIndex && (
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, marginTop:4 }}>
                  <div style={{ flex:1, height:1, background:'linear-gradient(90deg, transparent, var(--teal))' }} />
                  <div style={{ fontSize:10, color:'var(--teal)', fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', whiteSpace:'nowrap', padding:'2px 10px', borderRadius:10, border:'1px solid var(--teal)', background:'#F0FDFB' }}>
                    ▶ {fmtNow(now)} — you are here
                  </div>
                  <div style={{ flex:1, height:1, background:'linear-gradient(90deg, var(--teal), transparent)' }} />
                </div>
              )}
              <TaskRow
                task={t} done={t._status==='done'} status={t._status} now={now}
                onToggle={()=>syncToggle(t.id, t.label||t.text, t.tag, t.isCommitment?null:dateKey)}
                onManage={()=>setManaging(t)}
              />
            </div>
          ))}
        </>
      )}

      <QuickAdd onAdd={handleAdd} />

      {managing && (
        <ManageModal task={managing} dateKey={dateKey} onClose={()=>setManaging(null)}
          onDelete={handleDelete} onReschedule={handleReschedule} />
      )}
    </div>
  )
}
